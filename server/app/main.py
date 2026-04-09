from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, listings, conversations, students, reports, saved, internal

settings = get_settings()

app = FastAPI(title="DormDrop API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://10.0.0.54:3000",
        "https://dormdrop.app",
        "https://www.dormdrop.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(listings.router, prefix="/listings", tags=["listings"])
app.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
app.include_router(students.router, prefix="/students", tags=["students"])
app.include_router(reports.router, prefix="/reports", tags=["reports"])
app.include_router(saved.router, prefix="/saved", tags=["saved"])
app.include_router(internal.router, prefix="/internal", tags=["internal"])


@app.get("/health")
async def health():
    return {"status": "ok"}
