-- W2: Security and abuse prevention
-- 1. students.role (student | admin) for admin gating.
-- 2. blocks table + RLS + listing/conversation visibility hooks.
-- 3. reports: status/resolution columns + resolve_report RPC + admin read policy.
-- 4. waitlists table for the W9 unsupported-domain flow (created now so both
--    W2 and W9 migrations don't collide on the same timestamp).

-- =============================================================================
-- 1. students.role
-- =============================================================================
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student'
    CHECK (role IN ('student', 'moderator', 'admin'));

CREATE INDEX IF NOT EXISTS idx_students_role ON students(role) WHERE role <> 'student';

-- Helper: is_admin(uid) — used by RLS policies across admin-only tables.
CREATE OR REPLACE FUNCTION is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM students WHERE id = p_user_id AND role IN ('admin', 'moderator')
  );
$$;

REVOKE ALL ON FUNCTION is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin(uuid) TO authenticated, service_role;

-- =============================================================================
-- 2. blocks (blocker_id blocks blocked_id)
-- =============================================================================
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocks_select_own" ON blocks
  FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());

CREATE POLICY "blocks_insert_own" ON blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "blocks_delete_own" ON blocks
  FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id ON blocks(blocked_id);

-- Hide listings from sellers the caller has blocked (or who have blocked the caller).
DROP POLICY IF EXISTS "listings_select" ON listings;
CREATE POLICY "listings_select" ON listings
  FOR SELECT TO authenticated
  USING (
    college_id IN (SELECT college_id FROM students WHERE id = auth.uid())
    AND (
      seller_id = auth.uid()
      OR (
        EXISTS (SELECT 1 FROM students s WHERE s.id = listings.seller_id AND s.is_active = true)
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
           WHERE (b.blocker_id = auth.uid() AND b.blocked_id = listings.seller_id)
              OR (b.blocker_id = listings.seller_id AND b.blocked_id = auth.uid())
        )
      )
    )
  );

-- Hide conversations with blocked counterparties.
DROP POLICY IF EXISTS "conversations_select" ON conversations;
CREATE POLICY "conversations_select" ON conversations
  FOR SELECT TO authenticated
  USING (
    (buyer_id = auth.uid() OR seller_id = auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
       WHERE (b.blocker_id = auth.uid() AND b.blocked_id = CASE
                WHEN conversations.buyer_id = auth.uid() THEN conversations.seller_id
                ELSE conversations.buyer_id END)
          OR (b.blocked_id = auth.uid() AND b.blocker_id = CASE
                WHEN conversations.buyer_id = auth.uid() THEN conversations.seller_id
                ELSE conversations.buyer_id END)
    )
  );

-- Prevent creating a new conversation with someone you've blocked (or who blocked you).
DROP POLICY IF EXISTS "conversations_insert" ON conversations;
CREATE POLICY "conversations_insert" ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
       WHERE (b.blocker_id = auth.uid() AND b.blocked_id = conversations.seller_id)
          OR (b.blocker_id = conversations.seller_id AND b.blocked_id = auth.uid())
    )
  );

-- =============================================================================
-- 3. reports: resolution columns + admin visibility + resolve_report RPC
-- =============================================================================
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES students(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_notes text,
  ADD COLUMN IF NOT EXISTS resolution_action text
    CHECK (resolution_action IN ('dismiss', 'remove_listing', 'ban_user', 'warn'));

DROP POLICY IF EXISTS "reports_select" ON reports;
CREATE POLICY "reports_select" ON reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY "reports_update_admin" ON reports
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- resolve_report(report_id, action, notes) — applies the side effect
-- and records who resolved it.
CREATE OR REPLACE FUNCTION resolve_report(
  p_report_id uuid,
  p_action text,
  p_notes text DEFAULT NULL
)
RETURNS reports
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  acting uuid := auth.uid();
  r reports;
BEGIN
  IF NOT is_admin(acting) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_action NOT IN ('dismiss', 'remove_listing', 'ban_user', 'warn') THEN
    RAISE EXCEPTION 'Invalid action %', p_action;
  END IF;

  SELECT * INTO r FROM reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  IF p_action = 'remove_listing' AND r.target_type = 'listing' THEN
    UPDATE listings SET status = 'removed' WHERE id = r.target_id;
  ELSIF p_action = 'ban_user' THEN
    IF r.target_type = 'student' THEN
      UPDATE students SET is_active = false WHERE id = r.target_id;
    ELSIF r.target_type = 'listing' THEN
      UPDATE students SET is_active = false
        WHERE id = (SELECT seller_id FROM listings WHERE id = r.target_id);
    ELSIF r.target_type = 'message' THEN
      UPDATE students SET is_active = false
        WHERE id = (SELECT sender_id FROM messages WHERE id = r.target_id);
    END IF;
  END IF;

  UPDATE reports
     SET status = 'resolved',
         resolution_action = p_action,
         resolution_notes = p_notes,
         resolved_by = acting,
         resolved_at = now()
   WHERE id = p_report_id
   RETURNING * INTO r;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION resolve_report(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_report(uuid, text, text) TO authenticated, service_role;

-- =============================================================================
-- 4. waitlists (for unsupported-domain signups — wired up in W9)
-- =============================================================================
CREATE TABLE IF NOT EXISTS waitlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  domain text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

ALTER TABLE waitlists ENABLE ROW LEVEL SECURITY;

-- Public insert (anyone can join the waitlist), admin-only read.
CREATE POLICY "waitlists_insert_public" ON waitlists
  FOR INSERT WITH CHECK (true);

CREATE POLICY "waitlists_select_admin" ON waitlists
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));
