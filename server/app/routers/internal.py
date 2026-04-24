from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Header

from app.config import get_settings
from app.dependencies import get_supabase
from app.services.storage import delete_files, extract_photo_paths


router = APIRouter()


def _require_internal_secret(x_internal_secret: str | None):
    settings = get_settings()
    expected = getattr(settings, "internal_secret", None)
    if expected and x_internal_secret != expected:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/expire-listings")
async def expire_listings(
    x_internal_secret: str | None = Header(None),
):
    _require_internal_secret(x_internal_secret)

    supabase = get_supabase()
    result = supabase.rpc("expire_stale_listings").execute()
    return {"success": True, "data": result.data}


@router.post("/sweep-orphan-photos")
async def sweep_orphan_photos(
    x_internal_secret: str | None = Header(None),
    older_than_days: int = 7,
):
    """Remove listing_photos storage objects for listings that are in a terminal
    status (removed/expired) for at least `older_than_days`. Best-effort and
    idempotent — safe to run on a schedule."""
    _require_internal_secret(x_internal_secret)

    supabase = get_supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=older_than_days)).isoformat()

    result = (
        supabase.table("listings")
        .select("id, photos, status, updated_at")
        .in_("status", ["removed", "expired"])
        .lte("updated_at", cutoff)
        .limit(500)
        .execute()
    )

    total_deleted = 0
    for row in result.data or []:
        paths = extract_photo_paths(row.get("photos"))
        if not paths:
            continue
        delete_files("listing_photos", paths)
        total_deleted += len(paths)

    return {"success": True, "photos_deleted": total_deleted, "listings_scanned": len(result.data or [])}
