-- Fix: advisor flagged student_review_stats (from W4) as SECURITY DEFINER.
-- Views default to the creator's privileges, which would bypass RLS on
-- `reviews`. Force it to evaluate with the caller's privileges.
--
-- The original migration file was also updated so a fresh db creation
-- produces the invoker-scoped view directly; this file exists so the
-- applied migration log on existing databases matches source control.
ALTER VIEW IF EXISTS student_review_stats SET (security_invoker = on);
