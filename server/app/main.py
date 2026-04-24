from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import get_settings
from app.rate_limit import limiter
from app.routers import (
    admin,
    auth,
    blocks,
    conversations,
    internal,
    listings,
    reports,
    saved,
    students,
)

settings = get_settings()

app = FastAPI(title="DormDrop API", version="0.1.0")

# slowapi wiring
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": f"Rate limit exceeded: {exc.detail}",
        },
        headers={"Retry-After": str(getattr(exc, "retry_after", 60))},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Secret"],
    max_age=600,
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(listings.router, prefix="/listings", tags=["listings"])
app.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
app.include_router(students.router, prefix="/students", tags=["students"])
app.include_router(reports.router, prefix="/reports", tags=["reports"])
app.include_router(saved.router, prefix="/saved", tags=["saved"])
app.include_router(blocks.router, prefix="/blocks", tags=["blocks"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(internal.router, prefix="/internal", tags=["internal"])


@app.get("/health")
async def health():
    return {"status": "ok"}
