from fastapi import APIRouter, HTTPException, Header

from app.config import get_settings
from app.dependencies import get_supabase

router = APIRouter()


@router.post("/expire-listings")
async def expire_listings(
    x_internal_secret: str | None = Header(None),
):
    settings = get_settings()

    expected = getattr(settings, "internal_secret", None)
    if expected and x_internal_secret != expected:
        raise HTTPException(status_code=403, detail="Forbidden")

    supabase = get_supabase()

    result = supabase.rpc("expire_stale_listings").execute()

    return {"success": True, "data": result.data}
