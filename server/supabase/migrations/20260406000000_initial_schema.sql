-- DormDrop initial schema migration
-- Creates all tables, RLS policies, storage buckets, indexes, triggers, and seeds

-- =============================================================================
-- 1. updated_at trigger function
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. Tables
-- =============================================================================

-- colleges
CREATE TABLE colleges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email_domain text UNIQUE NOT NULL,
  logo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER colleges_updated_at
  BEFORE UPDATE ON colleges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- students
CREATE TABLE students (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  college_id uuid NOT NULL REFERENCES colleges(id),
  display_name text NOT NULL,
  pfp_path text,
  bio text,
  venmo_handle text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- listings
CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  college_id uuid NOT NULL REFERENCES colleges(id),
  title text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN (
    'furniture','textbooks','electronics','appliances','kitchenware',
    'bedding_linens','lighting','storage_organization','desk_accessories',
    'clothing','shoes','sports_equipment','bikes_scooters','musical_instruments',
    'school_supplies','dorm_decor','mini_fridge','tv_monitor','gaming','free'
  )),
  condition text NOT NULL CHECK (condition IN ('new','like_new','good','fair','poor')),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  is_negotiable boolean NOT NULL DEFAULT false,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','reserved','expired','removed')),
  ai_generated jsonb,
  moderation_result jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  search_vector tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Full-text search trigger
CREATE OR REPLACE FUNCTION listings_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description ON listings
  FOR EACH ROW EXECUTE FUNCTION listings_search_vector_update();

-- conversations
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- messages
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- reports
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('listing','student','message')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- saved_listings
CREATE TABLE saved_listings (
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, listing_id)
);

-- =============================================================================
-- 3. Indexes
-- =============================================================================
CREATE INDEX idx_listings_college_id ON listings(college_id);
CREATE INDEX idx_listings_seller_id ON listings(seller_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_category ON listings(category);
CREATE INDEX idx_listings_expires_at ON listings(expires_at);
CREATE INDEX idx_listings_search_vector ON listings USING GIN(search_vector);
CREATE INDEX idx_conversations_listing_id ON conversations(listing_id);
CREATE INDEX idx_conversations_buyer_id ON conversations(buyer_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- =============================================================================
-- 4. Row Level Security
-- =============================================================================
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;

-- colleges: all authenticated users can read
CREATE POLICY "colleges_select" ON colleges
  FOR SELECT TO authenticated USING (true);

-- students: read own college, write own
CREATE POLICY "students_select" ON students
  FOR SELECT TO authenticated
  USING (
    college_id IN (SELECT college_id FROM students WHERE id = auth.uid())
    OR id = auth.uid()
  );

CREATE POLICY "students_insert" ON students
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "students_update" ON students
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- listings: read own college, write own
CREATE POLICY "listings_select" ON listings
  FOR SELECT TO authenticated
  USING (
    college_id IN (SELECT college_id FROM students WHERE id = auth.uid())
  );

CREATE POLICY "listings_insert" ON listings
  FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "listings_update" ON listings
  FOR UPDATE TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

-- conversations: participants only
CREATE POLICY "conversations_select" ON conversations
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY "conversations_insert" ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "conversations_update" ON conversations
  FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- messages: conversation participants only
CREATE POLICY "messages_select" ON messages
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

CREATE POLICY "messages_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "messages_update" ON messages
  FOR UPDATE TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
    )
  );

-- reports: own reports only
CREATE POLICY "reports_insert" ON reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "reports_select" ON reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- saved_listings: own saves only
CREATE POLICY "saved_select" ON saved_listings
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "saved_insert" ON saved_listings
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "saved_delete" ON saved_listings
  FOR DELETE TO authenticated
  USING (student_id = auth.uid());

-- =============================================================================
-- 5. Storage buckets
-- =============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('profile_pictures', 'profile_pictures', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('listing_photos', 'listing_photos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('college_assets', 'college_assets', true);

-- profile_pictures: authenticated read, owner write
CREATE POLICY "profile_pictures_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'profile_pictures');

CREATE POLICY "profile_pictures_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile_pictures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_pictures_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile_pictures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- listing_photos: authenticated read, owner write
CREATE POLICY "listing_photos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'listing_photos');

CREATE POLICY "listing_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'listing_photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "listing_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'listing_photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "listing_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'listing_photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- college_assets: public read
CREATE POLICY "college_assets_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'college_assets');

-- =============================================================================
-- 6. Seed data
-- =============================================================================
INSERT INTO colleges (name, email_domain)
VALUES ('Gonzaga University', 'zagmail.gonzaga.edu');
