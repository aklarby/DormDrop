## DormDrop — System Design Prompt (Final)

### Overview
Peer-to-peer student marketplace for reselling goods (furniture, textbooks, electronics, dorm essentials). Solves the seasonal move-in/move-out friction. Initially scoped to Gonzaga University; architecture must support multi-school expansion with tenant isolation at the college level. This is a college project — no payment processing, no admin panel. Buyers and sellers handle payment externally (Venmo, cash, etc.).

---

### Stack & Structure

**Monorepo** with two top-level directories:

- `client/` — Next.js (App Router), React, TypeScript
- `server/` — Python, FastAPI

Shared constants, types, and enums must live in a `shared/` directory or be generated from a single source of truth (e.g., DB enums exported to both TS and Python types). Do not duplicate validation logic, enums, or config between client and server.

**Database & Storage:** Supabase (Postgres + Auth + Realtime + S3-compatible storage buckets)

**Hosting:** Railway (both client and server)

---

### Authentication & Authorization

- Supabase Auth with email-only signup (no OAuth).
- On signup, extract the domain from the user's email and resolve it against `college.email_domain`. If no match, reject registration.
- Email verification is required before account activation.
- On first verified login, create the `students` record and link to `auth.users.id`.
- All API routes require a valid Supabase JWT. Server validates the JWT on every request.
- RLS policies on all tables scoped by `college_id` so students can only see listings and conversations within their own school.

---

### Database Schema

All tables use `uuid` primary keys (`gen_random_uuid()`). All tables include `created_at` (timestamptz, default `now()`) and `updated_at` (timestamptz, trigger-maintained).

**`colleges`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | e.g., "Gonzaga University" |
| email_domain | text UNIQUE NOT NULL | e.g., "zagmail.gonzaga.edu" |
| logo_path | text | Path in `college_assets` bucket |

**`students`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | FK → auth.users.id |
| college_id | uuid NOT NULL | FK → colleges.id |
| display_name | text NOT NULL | |
| pfp_path | text | Path in `profile_pictures` bucket |
| bio | text | Short seller bio |
| venmo_handle | text | Optional Venmo username for payment outside app |
| is_active | boolean DEFAULT true | Soft-disable account |

**`listings`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| seller_id | uuid NOT NULL | FK → students.id |
| college_id | uuid NOT NULL | FK → colleges.id (denormalized for RLS/query performance) |
| title | text NOT NULL | |
| description | text | |
| category | text NOT NULL | Restricted to predefined enum (see below) |
| condition | text NOT NULL | Enum: `new`, `like_new`, `good`, `fair`, `poor` |
| price_cents | integer NOT NULL | Stored in cents, rendered in dollars client-side |
| is_negotiable | boolean DEFAULT false | |
| photos | jsonb NOT NULL | Array of `{ order: int, path: string }`, max 8 entries |
| status | text NOT NULL DEFAULT 'active' | Enum: `active`, `sold`, `reserved`, `expired`, `removed` |
| ai_generated | jsonb | Raw GPT output from auto-populate for audit |
| moderation_result | jsonb | OpenAI moderation API response payload |
| expires_at | timestamptz NOT NULL | Default 30 days from creation. User can manually extend. |

**Category enum** (predefined, not user-inputtable — enforced server-side, shared as a constant to client):

`furniture`, `textbooks`, `electronics`, `appliances`, `kitchenware`, `bedding_linens`, `lighting`, `storage_organization`, `desk_accessories`, `clothing`, `shoes`, `sports_equipment`, `bikes_scooters`, `musical_instruments`, `school_supplies`, `dorm_decor`, `mini_fridge`, `tv_monitor`, `gaming`, `free`

**`conversations`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| listing_id | uuid NOT NULL | FK → listings.id |
| buyer_id | uuid NOT NULL | FK → students.id |
| seller_id | uuid NOT NULL | FK → students.id |
| status | text DEFAULT 'open' | Enum: `open`, `closed` |

Unique constraint on `(listing_id, buyer_id)` — one conversation per buyer per listing. Any authenticated student can initiate a conversation on any active listing within their college (except their own).

**`messages`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid NOT NULL | FK → conversations.id |
| sender_id | uuid NOT NULL | FK → students.id |
| body | text NOT NULL | |
| is_read | boolean DEFAULT false | |

Real-time delivery via Supabase Realtime — subscribe to inserts on `messages` filtered by `conversation_id`.

**`reports`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| reporter_id | uuid NOT NULL | FK → students.id |
| target_type | text NOT NULL | Enum: `listing`, `student`, `message` |
| target_id | uuid NOT NULL | Polymorphic FK |
| reason | text NOT NULL | |
| status | text DEFAULT 'pending' | Reviewed manually via Supabase dashboard |

**`saved_listings`**
| Column | Type | Notes |
|---|---|---|
| student_id | uuid | FK → students.id |
| listing_id | uuid | FK → listings.id |
| Composite PK on (student_id, listing_id) | | |

---

### Storage Buckets

| Bucket | Access | Notes |
|---|---|---|
| `profile_pictures` | Authenticated read, owner write | Max 5MB, image/* only |
| `listing_photos` | Authenticated read, owner write | Max 10MB per image, max 8 per listing |
| `college_assets` | Public read | Logos, branding |

---

### Listing Lifecycle

1. **Creation** — User uploads photo(s), AI auto-populates fields, user reviews and submits.
2. **Active** — Visible to all students at the same college for 30 days.
3. **Expiry** — After 30 days, status flips to `expired`. User can manually extend (resets `expires_at` to now + 30 days) with no limit on extensions.
4. **Sold/Removed** — User manually marks as sold or removes. Sold listings remain in DB for history but are not queryable in the marketplace.

Expiry can be handled by a scheduled cron job (Railway cron or Supabase pg_cron) that runs daily and sets `status = 'expired'` where `expires_at < now() AND status = 'active'`.

---

### Content Moderation Pipeline

All user-generated content (text + images) passes through OpenAI's moderation API (`omni-moderation-latest`) before being persisted.

**Flow:**
1. Client uploads image(s) to a staging path in the bucket (not publicly queryable).
2. Server sends image(s) + text fields to the OpenAI moderation endpoint.
3. If flagged → reject with the specific category reason. Delete staged images. Do not persist.
4. If clean → move from staging to final path, persist listing record.
5. Store the moderation response payload in `listings.moderation_result` for audit.

---

### AI Auto-Populate (Listing Creation)

When user uploads a photo of an item:

1. Send image to the cheapest available multimodal model (currently `gpt-4.1-nano` — verify model name and availability at build time).
2. System prompt instructs structured JSON output constrained to the listing schema:
```json
{
  "title": "string",
  "description": "string",
  "category": "one of the predefined category enums",
  "condition": "new | like_new | good | fair | poor",
  "price_cents": "integer",
  "is_negotiable": "boolean"
}
```
3. Category output must be validated against the predefined enum server-side. If the model returns an invalid category, default to `other` — wait, `other` is not in the enum. **Decision: do not include `other`.** If the model can't map it, return `null` for category and force the user to pick manually.
4. Return to client as a pre-filled form. User reviews and edits before submission.
5. Store raw AI response in `listings.ai_generated`.

---

### Messaging

- Any student can message the seller of any active listing within their college.
- Tapping "Message Seller" on a listing creates a conversation (or opens the existing one if `(listing_id, buyer_id)` already exists).
- Each conversation is scoped to a single listing. If a buyer is interested in two items from the same seller, that's two separate conversations.
- Real-time message delivery via Supabase Realtime channel subscriptions.
- Seller's Venmo handle (if set) is visible on their profile and within the conversation view so the buyer can pay externally.

---

### Payment

Handled entirely outside the app. The seller's Venmo handle is displayed on their profile and in conversations. No in-app transactions, no escrow, no payment processing. Buyers and sellers coordinate payment via Venmo, cash, Zelle, or whatever they agree on.

---

### Search & Filtering

- Full-text search on `listings.title` and `listings.description` using Postgres `tsvector`/`tsquery` (or Supabase's built-in full-text search).
- Filter by: category (multi-select), condition, price range, status (active only by default).
- Sort by: newest, price low-to-high, price high-to-low.
- All queries scoped to the student's `college_id`.

---

### Migration File Requirements

The migration file should:
1. Create all tables with constraints, foreign keys, indexes, and RLS policies.
2. Create an `updated_at` trigger function and apply it to all tables.
3. Create the three storage buckets with access policies.
4. Seed the `colleges` table with Gonzaga University (`zagmail.gonzaga.edu`).
5. Create indexes on: `listings.college_id`, `listings.seller_id`, `listings.status`, `listings.category`, `listings.expires_at`, `conversations.listing_id`, `conversations.buyer_id`, `messages.conversation_id`.

---

### What This Prompt Does Not Cover (Backlog)

- Push notifications / email notifications for new messages
- SEO / Open Graph tags for shared listing links
- Rate limiting (listing creation spam, message spam)
- Analytics (listings created, time-to-sale, messages per listing)
- Mobile app (React Native) — current scope is responsive web only
- Image compression/resizing pipeline before storage
- Block/mute users