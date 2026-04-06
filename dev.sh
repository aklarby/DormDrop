#!/bin/bash
# Start both client and server for local development

trap 'kill 0' EXIT

echo "Starting DormDrop development servers..."

# Start the FastAPI server
(cd server && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000) &

# Start the Next.js dev server
(cd client && npm run dev) &

wait
