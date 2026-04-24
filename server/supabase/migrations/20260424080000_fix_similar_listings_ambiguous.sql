-- Fix: similar_listings threw "column reference 'id' is ambiguous" because
-- the RETURNS TABLE declares an `id` column that PL/pgSQL treats as a
-- visible variable inside the function body — `WHERE id = p_listing_id`
-- then can't decide between the table column and the out parameter.
-- Use #variable_conflict use_column and qualify the inner WHERE explicitly.

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
#variable_conflict use_column
DECLARE
  src listings;
BEGIN
  SELECT * INTO src FROM listings l WHERE l.id = p_listing_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT l.id, l.title, l.price_cents, l.condition, l.photos, l.created_at,
         s.display_name, s.pfp_path,
         (
           CASE WHEN l.category = src.category THEN 0.4 ELSE 0 END +
           CASE WHEN l.condition = src.condition THEN 0.2 ELSE 0 END +
           COALESCE(public.similarity(l.title, src.title), 0) * 0.4
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

GRANT EXECUTE ON FUNCTION similar_listings(uuid, integer) TO authenticated, service_role;
