# DormDrop

A peer-to-peer student marketplace for reselling goods within college communities. Students sign up with a verified school email, list items with photos and descriptions, browse and search listings at their campus, message sellers, save favorites, and complete transactions via Venmo. Built for Gonzaga University, designed for multi-school expansion.

## ERD

![ERD](erd.png)

## Table Descriptions

### colleges
Stores supported schools. Each college has a unique `email_domain` used to gate registration — only students with a matching email suffix can sign up. Seeded with Gonzaga University.

### students
User profiles tied 1:1 to Supabase Auth accounts. Contains display name, optional bio, profile picture path, Venmo handle, and active status. Scoped to a single college via `college_id`.

### listings
Items for sale. Each listing belongs to a seller (student) and a college. Tracks title, description, category (20 options), condition (5 levels), price in cents, negotiability, up to 8 photos (stored as JSONB), and status lifecycle (active → sold/reserved/expired/removed). Includes a `tsvector` column maintained by trigger for full-text search, and a 30-day expiration timestamp. AI-generated suggestions and moderation results are stored as JSONB for auditability.

### conversations
One conversation per buyer per listing (enforced by a UNIQUE constraint). Links a buyer and seller to a specific listing. Status is `open` or `closed`.

### messages
Individual messages within a conversation. Each message has a sender, body text, and read status. Supabase Realtime delivers new messages to open chat windows instantly.

### saved_listings
Junction table implementing the many-to-many relationship between students and listings. Composite primary key on (`student_id`, `listing_id`).

### reports
User-submitted flags for policy violations. Uses a polymorphic design — `target_type` indicates whether the report targets a `listing`, `student`, or `message`, and `target_id` holds the UUID of the flagged record.

## Stack

- **Client**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS v4
- **Server**: Python, FastAPI
- **Database & Auth**: Supabase (Postgres + Auth + Realtime + Storage)
- **AI**: OpenAI (content moderation + auto-populate listings from photos)

## Project Structure

```
DormDrop/
├── client/          Next.js frontend
├── server/          FastAPI backend + Supabase migrations
├── DESIGN.md        Systems analysis & design documentation
├── erd.dbml         ERD source (paste into dbdiagram.io)
└── erd.png          ERD image
```

## How to Run Locally

### Prerequisites

- Node.js 18+
- Python 3.11+
- A [Supabase](https://supabase.com) project

### 1. Clone the repo

```bash
git clone https://github.com/your-username/DormDrop.git
cd DormDrop
```

### 2. Set up the database

Run the migration file `server/supabase/migrations/20260406000000_initial_schema.sql` against your Supabase project using the Supabase Dashboard SQL Editor or the Supabase CLI.

### 3. Configure environment variables

**Client** — create `client/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLIC_KEY=your-anon-public-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Server** — create `server/.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-role-secret-key
OPENAI_API_KEY=your-openai-api-key
```

### 4. Start the client

```bash
cd client
npm install
npm run dev
```

The frontend runs at `http://localhost:3000`.

### 5. Start the server

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API runs at `http://localhost:8000`.

## Live App URL

<!-- Replace with your deployed URL -->
[DormDrop on Vercel](https://your-deployed-url.vercel.app)

## Design Documentation

Full systems analysis and design documentation (system description, entity list, relationships, page-by-page plan, validation rules, and ERD) is in [`DESIGN.md`](DESIGN.md).
