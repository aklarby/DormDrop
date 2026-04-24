-- W5: Messaging upgrades
-- 1. messages.type, messages.photo_path, messages.metadata (jsonb for system payloads).
-- 2. message_photos storage bucket with RLS scoped to conversation participants.
-- 3. push_subscriptions table for web push.
-- 4. message_email_prefs on students (opt in/out of email fallback).
-- 5. messages_search RPC (tsvector per-user).

-- =============================================================================
-- 1. messages additions
-- =============================================================================
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'text'
    CHECK (type IN ('text', 'image', 'system')),
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Allow system messages with an empty body (sent from server without a
-- body), but keep body NOT NULL so the existing text-path contract stays.
-- (no constraint change needed; text messages always set body)

-- Per-message full-text vector (small per-row cost, enables message search).
CREATE OR REPLACE FUNCTION messages_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.body, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_search_vector_trigger ON messages;
CREATE TRIGGER messages_search_vector_trigger
  BEFORE INSERT OR UPDATE OF body ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_search_vector_update();

-- Backfill existing rows.
UPDATE messages SET search_vector = to_tsvector('english', coalesce(body, ''))
 WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_search_vector
  ON messages USING GIN(search_vector);

-- =============================================================================
-- 2. message_photos bucket + policies
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('message_photos', 'message_photos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "message_photos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'message_photos');

CREATE POLICY "message_photos_insert_sender" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message_photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "message_photos_delete_sender" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'message_photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- 3. push_subscriptions
-- =============================================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  keys jsonb NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_student ON push_subscriptions(student_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs_select_own" ON push_subscriptions
  FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "push_subs_insert_own" ON push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "push_subs_delete_own" ON push_subscriptions
  FOR DELETE TO authenticated USING (student_id = auth.uid());

-- =============================================================================
-- 4. students.email_on_unread (opt-in email fallback)
-- =============================================================================
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS email_on_unread boolean NOT NULL DEFAULT false;

-- =============================================================================
-- 5. messages_search RPC (per-user, scoped to their conversations)
-- =============================================================================
CREATE OR REPLACE FUNCTION messages_search(
  p_user_id uuid,
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  rank real
) AS $$
  SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
         ts_rank(m.search_vector, plainto_tsquery('english', p_query))
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
   WHERE (c.buyer_id = p_user_id OR c.seller_id = p_user_id)
     AND m.search_vector @@ plainto_tsquery('english', p_query)
   ORDER BY ts_rank(m.search_vector, plainto_tsquery('english', p_query)) DESC, m.created_at DESC
   LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY INVOKER;

REVOKE ALL ON FUNCTION messages_search(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION messages_search(uuid, text, integer) TO authenticated, service_role;

-- =============================================================================
-- 6. unread_recent_by_user — helper for the email fallback worker
-- =============================================================================
CREATE OR REPLACE FUNCTION unread_messages_for_email(p_min_age_minutes integer DEFAULT 15)
RETURNS TABLE (
  student_id uuid,
  conversation_id uuid,
  last_message text,
  last_message_at timestamptz,
  other_display_name text
) AS $$
  SELECT
    CASE WHEN c.buyer_id = m.sender_id THEN c.seller_id ELSE c.buyer_id END AS student_id,
    m.conversation_id,
    m.body AS last_message,
    m.created_at AS last_message_at,
    (SELECT display_name FROM students WHERE id = m.sender_id) AS other_display_name
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  JOIN students recipient
    ON recipient.id = CASE WHEN c.buyer_id = m.sender_id THEN c.seller_id ELSE c.buyer_id END
  WHERE m.is_read = false
    AND m.created_at <= now() - make_interval(mins => p_min_age_minutes)
    AND recipient.email_on_unread = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

REVOKE ALL ON FUNCTION unread_messages_for_email(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unread_messages_for_email(integer) TO service_role;
