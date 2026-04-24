-- W1: Foundational cleanup
-- 1. expire_stale_listings() RPC (+ daily cron when pg_cron is available)
-- 2. Conversation bump trigger: on new message insert, bump conversations.updated_at
-- 3. conversation_summaries() RPC that returns last_message + unread_count per conversation
-- 4. is_active enforcement surface via a helper view (used by server)

-- =============================================================================
-- 1. expire_stale_listings
-- =============================================================================
CREATE OR REPLACE FUNCTION expire_stale_listings()
RETURNS TABLE (expired_count integer) AS $$
DECLARE
  cnt integer;
BEGIN
  UPDATE listings
     SET status = 'expired'
   WHERE status = 'active'
     AND expires_at IS NOT NULL
     AND expires_at <= now();

  GET DIAGNOSTICS cnt = ROW_COUNT;
  expired_count := cnt;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION expire_stale_listings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION expire_stale_listings() TO service_role;

-- Best-effort daily schedule via pg_cron; safe if pg_cron is not installed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.schedule(
      'dormdrop_expire_stale_listings_daily',
      '0 3 * * *',
      $cron$SELECT public.expire_stale_listings();$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron unavailable or insufficient perms: a scheduled task can call the RPC instead.
  NULL;
END $$;

-- =============================================================================
-- 2. Conversation bump trigger
--    Previously the server called `.update({})` which is a postgrest no-op.
--    Bump updated_at from the DB so it's always correct.
-- =============================================================================
CREATE OR REPLACE FUNCTION bump_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
     SET updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_bump_conversation ON messages;
CREATE TRIGGER messages_bump_conversation
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION bump_conversation_updated_at();

-- =============================================================================
-- 3. conversation_summaries RPC
--    Returns one row per conversation (for the requesting user) with
--    last_message preview, last_message sender, last_message_at, unread_count,
--    plus the joined listing + other-student fields. Uses SECURITY INVOKER so
--    conversations/messages RLS still applies.
-- =============================================================================
CREATE OR REPLACE FUNCTION conversation_summaries(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  listing_id uuid,
  buyer_id uuid,
  seller_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  listing_title text,
  listing_price_cents integer,
  listing_photos jsonb,
  other_id uuid,
  other_display_name text,
  other_pfp_path text,
  other_venmo_handle text,
  other_is_active boolean,
  last_message_body text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  unread_count integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.listing_id,
    c.buyer_id,
    c.seller_id,
    c.status,
    c.created_at,
    c.updated_at,
    l.title,
    l.price_cents,
    l.photos,
    other.id,
    other.display_name,
    other.pfp_path,
    other.venmo_handle,
    other.is_active,
    lm.body,
    lm.sender_id,
    lm.created_at,
    COALESCE(uc.cnt, 0)::integer
  FROM conversations c
  JOIN listings l ON l.id = c.listing_id
  JOIN students other
    ON other.id = CASE WHEN c.buyer_id = p_user_id THEN c.seller_id ELSE c.buyer_id END
  LEFT JOIN LATERAL (
    SELECT m.body, m.sender_id, m.created_at
      FROM messages m
     WHERE m.conversation_id = c.id
     ORDER BY m.created_at DESC
     LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
      FROM messages m
     WHERE m.conversation_id = c.id
       AND m.is_read = false
       AND m.sender_id <> p_user_id
  ) uc ON true
  WHERE (c.buyer_id = p_user_id OR c.seller_id = p_user_id)
    AND c.status = 'open'
  ORDER BY COALESCE(lm.created_at, c.updated_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

REVOKE ALL ON FUNCTION conversation_summaries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conversation_summaries(uuid) TO authenticated, service_role;

-- =============================================================================
-- 4. unread_message_count RPC (cheap navbar badge source)
-- =============================================================================
CREATE OR REPLACE FUNCTION unread_message_count(p_user_id uuid)
RETURNS integer AS $$
  SELECT COUNT(*)::integer
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
   WHERE m.is_read = false
     AND m.sender_id <> p_user_id
     AND (c.buyer_id = p_user_id OR c.seller_id = p_user_id)
     AND c.status = 'open';
$$ LANGUAGE sql STABLE SECURITY INVOKER;

REVOKE ALL ON FUNCTION unread_message_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unread_message_count(uuid) TO authenticated, service_role;

-- =============================================================================
-- 5. Helpful index to speed up last-message lookup
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_unread
  ON messages (conversation_id, is_read)
  WHERE is_read = false;

-- =============================================================================
-- 6. Tighten RLS to respect students.is_active
--    Listings: hide listings from banned sellers; prevent banned users creating new ones.
-- =============================================================================
DROP POLICY IF EXISTS "listings_select" ON listings;
CREATE POLICY "listings_select" ON listings
  FOR SELECT TO authenticated
  USING (
    college_id IN (SELECT college_id FROM students WHERE id = auth.uid())
    AND (
      seller_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM students s
         WHERE s.id = listings.seller_id AND s.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS "listings_insert" ON listings;
CREATE POLICY "listings_insert" ON listings
  FOR INSERT TO authenticated
  WITH CHECK (
    seller_id = auth.uid()
    AND EXISTS (SELECT 1 FROM students s WHERE s.id = auth.uid() AND s.is_active = true)
  );

-- Messages: prevent banned users from sending new messages.
DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM students s WHERE s.id = auth.uid() AND s.is_active = true)
    AND conversation_id IN (
      SELECT id FROM conversations
      WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );
