# DormDrop

Peer-to-peer student marketplace for reselling goods. Built for Gonzaga University, designed for multi-school expansion.

## Stack

- **Client**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS v4
- **Server**: Python, FastAPI
- **Database & Auth**: Supabase (Postgres + Auth + Realtime + Storage)
- **AI**: OpenAI (content moderation + auto-populate listings from photos)

## Project Structure

```
DormDrop/
├── client/          Next.js frontend
└── server/          FastAPI backend + Supabase migrations
```

## Setup

### Prerequisites

- Node.js 18+
- Python 3.11+
- A Supabase project

### Environment Variables

**Client** (`client/.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLIC_KEY=your-public-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Server** (`server/.env`):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
SUPABASE_JWT_SECRET=your-jwt-secret
OPENAI_API_KEY=your-openai-key
```

### Running Locally

**Client:**
```bash
cd client
npm install
npm run dev
```

**Server:**
```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Database

Run the migration in `server/supabase/migrations/` against your Supabase project via the Supabase dashboard SQL editor or CLI.
