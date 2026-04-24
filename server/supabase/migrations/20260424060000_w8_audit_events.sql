-- W8: audit_events — every admin action writes a row here.
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES students(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_target
  ON audit_events(target_type, target_id);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_events_select_admin" ON audit_events
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));

-- resolve_report writes to audit_events.
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

  INSERT INTO audit_events (actor_id, action, target_type, target_id, metadata)
    VALUES (
      acting,
      'resolve_report:' || p_action,
      r.target_type,
      r.target_id,
      jsonb_build_object('report_id', r.id, 'notes', p_notes)
    );

  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_report(uuid, text, text) TO authenticated, service_role;
