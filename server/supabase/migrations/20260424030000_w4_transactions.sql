-- W4: Transactions and trust
-- 1. offers — price proposals inside a conversation.
-- 2. reviews — ratings gated to transaction participants.
-- 3. transactions — recorded when seller marks a listing as sold.
-- 4. listings.pickup_location / pickup_lat / pickup_lng + reservation expiration.
-- 5. Expand reports.target_type with 'transaction'.

-- =============================================================================
-- 1. offers
-- =============================================================================
CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  note text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offers_select_participant" ON offers
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY "offers_insert_buyer" ON offers
  FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
       WHERE c.id = offers.conversation_id
         AND c.buyer_id = auth.uid()
         AND c.seller_id = offers.seller_id
         AND c.listing_id = offers.listing_id
    )
  );

CREATE POLICY "offers_update_participant" ON offers
  FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_offers_conversation ON offers(conversation_id);
CREATE INDEX IF NOT EXISTS idx_offers_listing_status ON offers(listing_id, status);

-- =============================================================================
-- 2. reviews
-- =============================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reviewer_id, listing_id),
  CHECK (reviewer_id <> reviewee_id)
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_select_college" ON reviews
  FOR SELECT TO authenticated
  USING (
    reviewee_id IN (SELECT id FROM students WHERE college_id IN (
      SELECT college_id FROM students WHERE id = auth.uid()
    ))
  );

-- =============================================================================
-- 3. transactions (recorded on mark-as-sold)
-- =============================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  final_price_cents integer NOT NULL CHECK (final_price_cents >= 0),
  pickup_location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id)
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_select_participant" ON transactions
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR is_admin(auth.uid()));

-- Only the participants may insert, and only once the listing is theirs.
CREATE POLICY "transactions_insert_seller" ON transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    seller_id = auth.uid()
    AND EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.seller_id = auth.uid())
  );

-- Now that transactions exist, reviews are only writable by participants.
CREATE POLICY "reviews_insert_participant" ON reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM transactions t
       WHERE t.listing_id = reviews.listing_id
         AND (
           (t.buyer_id = auth.uid() AND t.seller_id = reviews.reviewee_id)
           OR (t.seller_id = auth.uid() AND t.buyer_id = reviews.reviewee_id)
         )
    )
  );

-- =============================================================================
-- 4. listings extras: pickup + reservation expiration
-- =============================================================================
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS pickup_location text,
  ADD COLUMN IF NOT EXISTS pickup_lat numeric,
  ADD COLUMN IF NOT EXISTS pickup_lng numeric,
  ADD COLUMN IF NOT EXISTS reserved_by uuid REFERENCES students(id),
  ADD COLUMN IF NOT EXISTS reserved_until timestamptz;

-- Reservations auto-release when the expiry passes.
CREATE OR REPLACE FUNCTION release_stale_reservations()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  cnt integer;
BEGIN
  UPDATE listings
     SET status = 'active',
         reserved_by = NULL,
         reserved_until = NULL
   WHERE status = 'reserved'
     AND reserved_until IS NOT NULL
     AND reserved_until <= now();
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END;
$$;

REVOKE ALL ON FUNCTION release_stale_reservations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION release_stale_reservations() TO service_role;

-- =============================================================================
-- 5. expand reports.target_type to include 'transaction'
-- =============================================================================
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports
  ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('listing','student','message','transaction'));

-- =============================================================================
-- 6. Average rating view
-- =============================================================================
CREATE OR REPLACE VIEW student_review_stats AS
  SELECT reviewee_id AS student_id,
         AVG(rating)::numeric(3,2) AS avg_rating,
         COUNT(*)::integer AS review_count
    FROM reviews
   GROUP BY reviewee_id;

GRANT SELECT ON student_review_stats TO authenticated, service_role;
