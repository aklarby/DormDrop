-- W9: Multi-school readiness
-- 1. colleges.region_id for future cross-school marketplace grouping.
-- 2. regions table.
-- 3. colleges.tagline (college-branded copy on /browse).

CREATE TABLE IF NOT EXISTS regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regions_select_all" ON regions FOR SELECT TO authenticated USING (true);

ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id),
  ADD COLUMN IF NOT EXISTS tagline text;
