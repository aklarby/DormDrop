-- W3: Search and discovery
-- 1. pg_trgm extension for typo-tolerant matching.
-- 2. listings_search(query, college, category, condition, min/max price, sort, cursor)
--    — hybrid tsvector + trigram ranking.
-- 3. listings_suggest(query, college) — autocomplete.
-- 4. listings_facets(college, ...filters) — per-category/condition counts.
-- 5. saved_searches table + new_saved_search_matches(user) RPC for digests.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_listings_title_trgm
  ON listings USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_listings_description_trgm
  ON listings USING GIN (description gin_trgm_ops);

-- =============================================================================
-- listings_search: hybrid full-text + trigram ranking.
-- =============================================================================
CREATE OR REPLACE FUNCTION listings_search(
  p_college_id uuid,
  p_query text DEFAULT NULL,
  p_categories text[] DEFAULT NULL,
  p_condition text DEFAULT NULL,
  p_min_price integer DEFAULT NULL,
  p_max_price integer DEFAULT NULL,
  p_sort text DEFAULT 'newest',
  p_cursor timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_viewer_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  seller_id uuid,
  title text,
  description text,
  category text,
  condition text,
  price_cents integer,
  is_negotiable boolean,
  photos jsonb,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  seller_display_name text,
  seller_pfp_path text,
  relevance real
) AS $$
DECLARE
  q_norm text := lower(coalesce(nullif(trim(p_query), ''), ''));
BEGIN
  RETURN QUERY
  SELECT
    l.id, l.seller_id, l.title, l.description, l.category, l.condition,
    l.price_cents, l.is_negotiable, l.photos, l.status, l.expires_at, l.created_at,
    s.display_name, s.pfp_path,
    CASE
      WHEN q_norm = '' THEN 0::real
      ELSE (
        COALESCE(ts_rank(l.search_vector, plainto_tsquery('english', q_norm)), 0)
        + COALESCE(similarity(l.title, q_norm), 0) * 0.8
        + COALESCE(similarity(l.description, q_norm), 0) * 0.2
      )::real
    END AS relevance
  FROM listings l
  JOIN students s ON s.id = l.seller_id
  WHERE l.college_id = p_college_id
    AND l.status = 'active'
    AND s.is_active = true
    AND (p_viewer_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM blocks b
       WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = l.seller_id)
          OR (b.blocker_id = l.seller_id AND b.blocked_id = p_viewer_id)
    ))
    AND (p_categories IS NULL OR l.category = ANY(p_categories))
    AND (p_condition IS NULL OR l.condition = p_condition)
    AND (p_min_price IS NULL OR l.price_cents >= p_min_price)
    AND (p_max_price IS NULL OR l.price_cents <= p_max_price)
    AND (
      q_norm = ''
      OR l.search_vector @@ plainto_tsquery('english', q_norm)
      OR l.title % q_norm
      OR (l.description IS NOT NULL AND l.description % q_norm)
    )
    AND (p_cursor IS NULL OR l.created_at < p_cursor)
  ORDER BY
    CASE WHEN q_norm <> '' AND p_sort = 'newest' THEN
      -- relevance first when the caller is searching
      (ts_rank(l.search_vector, plainto_tsquery('english', q_norm))
       + similarity(l.title, q_norm) * 0.8
       + COALESCE(similarity(l.description, q_norm), 0) * 0.2) END DESC NULLS LAST,
    CASE WHEN p_sort = 'price_asc'    THEN l.price_cents END ASC,
    CASE WHEN p_sort = 'price_desc'   THEN l.price_cents END DESC,
    CASE WHEN p_sort = 'ending_soon'  THEN l.expires_at END ASC,
    l.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

REVOKE ALL ON FUNCTION listings_search(uuid, text, text[], text, integer, integer, text, timestamptz, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION listings_search(uuid, text, text[], text, integer, integer, text, timestamptz, integer, uuid) TO authenticated, service_role;

-- =============================================================================
-- listings_suggest: short autocomplete list for the navbar search.
-- =============================================================================
CREATE OR REPLACE FUNCTION listings_suggest(
  p_college_id uuid,
  p_query text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (title text, hits integer) AS $$
  SELECT l.title, COUNT(*)::integer AS hits
    FROM listings l
    JOIN students s ON s.id = l.seller_id
   WHERE l.college_id = p_college_id
     AND l.status = 'active'
     AND s.is_active = true
     AND (l.title ILIKE (p_query || '%')
          OR l.title % p_query
          OR l.search_vector @@ plainto_tsquery('english', p_query))
  GROUP BY l.title
  ORDER BY similarity(l.title, p_query) DESC NULLS LAST, hits DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY INVOKER;

REVOKE ALL ON FUNCTION listings_suggest(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION listings_suggest(uuid, text, integer) TO authenticated, service_role;

-- =============================================================================
-- listings_facets: (category, count) + (condition, count) over the current filter set.
-- =============================================================================
CREATE OR REPLACE FUNCTION listings_facets(
  p_college_id uuid,
  p_query text DEFAULT NULL,
  p_categories text[] DEFAULT NULL,
  p_condition text DEFAULT NULL,
  p_min_price integer DEFAULT NULL,
  p_max_price integer DEFAULT NULL,
  p_viewer_id uuid DEFAULT NULL
)
RETURNS TABLE (
  dimension text,
  key text,
  count integer
) AS $$
DECLARE
  q_norm text := lower(coalesce(nullif(trim(p_query), ''), ''));
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT l.category, l.condition
      FROM listings l
      JOIN students s ON s.id = l.seller_id
     WHERE l.college_id = p_college_id
       AND l.status = 'active'
       AND s.is_active = true
       AND (p_viewer_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM blocks b
          WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = l.seller_id)
             OR (b.blocker_id = l.seller_id AND b.blocked_id = p_viewer_id)
       ))
       AND (p_min_price IS NULL OR l.price_cents >= p_min_price)
       AND (p_max_price IS NULL OR l.price_cents <= p_max_price)
       AND (
         q_norm = ''
         OR l.search_vector @@ plainto_tsquery('english', q_norm)
         OR l.title % q_norm
       )
  )
  SELECT 'category' AS dimension, b.category AS key, COUNT(*)::integer
    FROM base b
   WHERE (p_condition IS NULL OR b.condition = p_condition)
   GROUP BY b.category
  UNION ALL
  SELECT 'condition', b.condition, COUNT(*)::integer
    FROM base b
   WHERE (p_categories IS NULL OR b.category = ANY(p_categories))
   GROUP BY b.condition;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

REVOKE ALL ON FUNCTION listings_facets(uuid, text, text[], text, integer, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION listings_facets(uuid, text, text[], text, integer, integer, uuid) TO authenticated, service_role;

-- =============================================================================
-- saved_searches: per-user saved queries + digest source RPC.
-- =============================================================================
CREATE TABLE IF NOT EXISTS saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  label text,
  query jsonb NOT NULL,
  notify boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_searches_select_own" ON saved_searches
  FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "saved_searches_insert_own" ON saved_searches
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "saved_searches_update_own" ON saved_searches
  FOR UPDATE TO authenticated USING (student_id = auth.uid());
CREATE POLICY "saved_searches_delete_own" ON saved_searches
  FOR DELETE TO authenticated USING (student_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_saved_searches_student_id
  ON saved_searches(student_id);

-- For the daily digest job: pull matches that post-date last_seen_at.
CREATE OR REPLACE FUNCTION new_saved_search_matches(p_search_id uuid)
RETURNS TABLE (
  listing_id uuid,
  title text,
  price_cents integer
) AS $$
DECLARE
  ss saved_searches;
  student students;
BEGIN
  SELECT * INTO ss FROM saved_searches WHERE id = p_search_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT * INTO student FROM students WHERE id = ss.student_id;

  RETURN QUERY
  SELECT l.id, l.title, l.price_cents
    FROM listings_search(
      p_college_id := student.college_id,
      p_query := ss.query->>'search',
      p_categories := CASE
        WHEN ss.query ? 'categories'
        THEN ARRAY(SELECT jsonb_array_elements_text(ss.query->'categories'))
        ELSE NULL END,
      p_condition := ss.query->>'condition',
      p_min_price := NULLIF(ss.query->>'min_price', '')::integer,
      p_max_price := NULLIF(ss.query->>'max_price', '')::integer,
      p_limit := 20,
      p_viewer_id := ss.student_id
    ) l
   WHERE l.created_at > ss.last_seen_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

REVOKE ALL ON FUNCTION new_saved_search_matches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION new_saved_search_matches(uuid) TO authenticated, service_role;
