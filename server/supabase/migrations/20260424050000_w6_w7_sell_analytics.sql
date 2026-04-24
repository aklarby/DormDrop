-- W6: Seller UX additions
--   - drafts (listings.status gains 'draft')
--   - listings.save_count and listings.view_count counters
--   - price_guidance(category, condition) RPC
-- W7: Analytics and recommendations
--   - listing_views(listing_id, viewer_id, viewed_on date)
--   - saved_listings trigger that maintains listings.save_count
--   - similar_listings(listing_id) RPC
--   - trending_listings(college) RPC

-- =============================================================================
-- Listing status gains 'draft'
-- =============================================================================
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE listings
  ADD CONSTRAINT listings_status_check
  CHECK (status IN ('active', 'sold', 'reserved', 'expired', 'removed', 'draft'));

-- Drafts are not publicly listed; narrow existing policy.
DROP POLICY IF EXISTS "listings_select" ON listings;
CREATE POLICY "listings_select" ON listings
  FOR SELECT TO authenticated
  USING (
    college_id IN (SELECT college_id FROM students WHERE id = auth.uid())
    AND (
      seller_id = auth.uid()
      OR (
        status <> 'draft'
        AND EXISTS (SELECT 1 FROM students s WHERE s.id = listings.seller_id AND s.is_active = true)
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
           WHERE (b.blocker_id = auth.uid() AND b.blocked_id = listings.seller_id)
              OR (b.blocker_id = listings.seller_id AND b.blocked_id = auth.uid())
        )
      )
    )
  );

-- =============================================================================
-- Counters on listings
-- =============================================================================
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS save_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

-- Backfill save_count to current saved_listings totals.
UPDATE listings l SET save_count = (
  SELECT COUNT(*) FROM saved_listings sl WHERE sl.listing_id = l.id
) WHERE save_count = 0;

CREATE OR REPLACE FUNCTION tick_save_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE listings SET save_count = save_count + 1 WHERE id = NEW.listing_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE listings SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.listing_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS saved_listings_tick_counter ON saved_listings;
CREATE TRIGGER saved_listings_tick_counter
  AFTER INSERT OR DELETE ON saved_listings
  FOR EACH ROW EXECUTE FUNCTION tick_save_count();

-- =============================================================================
-- Views
-- =============================================================================
CREATE TABLE IF NOT EXISTS listing_views (
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  viewed_on date NOT NULL DEFAULT (now()::date),
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, viewer_id, viewed_on)
);

ALTER TABLE listing_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listing_views_insert_own" ON listing_views
  FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid());

CREATE POLICY "listing_views_select_owner" ON listing_views
  FOR SELECT TO authenticated
  USING (
    listing_id IN (SELECT id FROM listings WHERE seller_id = auth.uid())
    OR is_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_listing_views_listing ON listing_views(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_views_viewed_on ON listing_views(viewed_on);

-- record_listing_view: idempotent per viewer+day, also bumps view_count
-- (rate-limit counter — duplicate views in the same day don't inflate).
CREATE OR REPLACE FUNCTION record_listing_view(p_listing_id uuid, p_viewer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  ins_count integer;
BEGIN
  INSERT INTO listing_views (listing_id, viewer_id)
    VALUES (p_listing_id, p_viewer_id)
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS ins_count = ROW_COUNT;
  IF ins_count > 0 THEN
    UPDATE listings SET view_count = view_count + 1 WHERE id = p_listing_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION record_listing_view(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_listing_view(uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- Price guidance
-- =============================================================================
CREATE OR REPLACE FUNCTION price_guidance(
  p_college_id uuid,
  p_category text,
  p_condition text
)
RETURNS TABLE (
  avg_cents numeric,
  median_cents numeric,
  sample_size integer
) AS $$
  SELECT
    AVG(price_cents)::numeric,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents)::numeric,
    COUNT(*)::integer
  FROM listings
 WHERE college_id = p_college_id
   AND category = p_category
   AND condition = p_condition
   AND status IN ('active','sold','reserved');
$$ LANGUAGE sql STABLE SECURITY INVOKER;

REVOKE ALL ON FUNCTION price_guidance(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION price_guidance(uuid, text, text) TO authenticated, service_role;

-- =============================================================================
-- similar_listings
-- =============================================================================
CREATE OR REPLACE FUNCTION similar_listings(p_listing_id uuid, p_limit integer DEFAULT 8)
RETURNS TABLE (
  id uuid,
  title text,
  price_cents integer,
  condition text,
  photos jsonb,
  created_at timestamptz,
  seller_display_name text,
  seller_pfp_path text,
  similarity real
) AS $$
DECLARE
  src listings;
BEGIN
  SELECT * INTO src FROM listings WHERE id = p_listing_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT l.id, l.title, l.price_cents, l.condition, l.photos, l.created_at,
         s.display_name, s.pfp_path,
         (
           CASE WHEN l.category = src.category THEN 0.4 ELSE 0 END +
           CASE WHEN l.condition = src.condition THEN 0.2 ELSE 0 END +
           COALESCE(similarity(l.title, src.title), 0) * 0.4
         )::real AS similarity
  FROM listings l
  JOIN students s ON s.id = l.seller_id
  WHERE l.id <> src.id
    AND l.college_id = src.college_id
    AND l.status = 'active'
    AND s.is_active = true
  ORDER BY similarity DESC, l.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

REVOKE ALL ON FUNCTION similar_listings(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION similar_listings(uuid, integer) TO authenticated, service_role;

-- =============================================================================
-- trending_listings (7-day rolling window: views+saves*3)
-- =============================================================================
CREATE OR REPLACE FUNCTION trending_listings(p_college_id uuid, p_limit integer DEFAULT 12)
RETURNS TABLE (
  id uuid,
  title text,
  price_cents integer,
  condition text,
  photos jsonb,
  created_at timestamptz,
  view_count integer,
  save_count integer,
  trend_score real
) AS $$
  SELECT l.id, l.title, l.price_cents, l.condition, l.photos, l.created_at,
         l.view_count, l.save_count,
         (
           COALESCE(v.vcount, 0) + COALESCE(l.save_count, 0) * 3
         )::real AS trend_score
    FROM listings l
    LEFT JOIN (
      SELECT listing_id, COUNT(*)::integer AS vcount
        FROM listing_views
       WHERE viewed_on >= (now()::date - interval '7 days')
       GROUP BY listing_id
    ) v ON v.listing_id = l.id
   WHERE l.college_id = p_college_id
     AND l.status = 'active'
   ORDER BY trend_score DESC, l.created_at DESC
   LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY INVOKER;

REVOKE ALL ON FUNCTION trending_listings(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trending_listings(uuid, integer) TO authenticated, service_role;

-- =============================================================================
-- seller_insights: per-listing counts for the seller's dashboard
-- =============================================================================
CREATE OR REPLACE FUNCTION seller_insights(p_seller_id uuid)
RETURNS TABLE (
  listing_id uuid,
  title text,
  status text,
  view_count integer,
  save_count integer,
  message_count integer
) AS $$
  SELECT l.id, l.title, l.status, l.view_count, l.save_count,
         COALESCE(m.cnt, 0)::integer
    FROM listings l
    LEFT JOIN (
      SELECT c.listing_id, COUNT(*) AS cnt
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
       GROUP BY c.listing_id
    ) m ON m.listing_id = l.id
   WHERE l.seller_id = p_seller_id
   ORDER BY l.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY INVOKER;

REVOKE ALL ON FUNCTION seller_insights(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seller_insights(uuid) TO authenticated, service_role;
