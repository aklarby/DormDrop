"""Admin-only endpoints: report queue, listing force-remove, user ban/unban, metrics."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, require_admin
from app.services.storage import delete_files, extract_photo_paths

router = APIRouter()


RESOLUTION_ACTIONS = {"dismiss", "remove_listing", "ban_user", "warn"}


class ResolveReportRequest(BaseModel):
    action: str
    notes: str | None = None


@router.get("/reports")
async def list_reports(
    current_user: CurrentUser = Depends(require_admin),
    status: str = Query(default="pending"),
    limit: int = Query(default=50, le=200),
):
    supabase = get_supabase()
    q = (
        supabase.table("reports")
        .select("*, reporter:students!reporter_id(id, display_name, pfp_path)")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if status != "all":
        q = q.eq("status", status)
    result = q.execute()
    return {"data": result.data}


@router.post("/reports/{report_id}/resolve")
async def resolve_report(
    report_id: str,
    body: ResolveReportRequest,
    current_user: CurrentUser = Depends(require_admin),
):
    if body.action not in RESOLUTION_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid action: {body.action}")

    supabase = get_supabase()
    result = supabase.rpc(
        "resolve_report",
        {"p_report_id": report_id, "p_action": body.action, "p_notes": body.notes},
    ).execute()
    return result.data


@router.post("/listings/{listing_id}/remove")
async def admin_remove_listing(
    listing_id: str,
    current_user: CurrentUser = Depends(require_admin),
):
    supabase = get_supabase()
    existing = (
        supabase.table("listings")
        .select("photos")
        .eq("id", listing_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        raise HTTPException(status_code=404, detail="Listing not found")

    supabase.table("listings").update({"status": "removed"}).eq("id", listing_id).execute()

    paths = extract_photo_paths(existing.data.get("photos"))
    if paths:
        delete_files("listing_photos", paths)
    return {"success": True}


class BanRequest(BaseModel):
    reason: str | None = None


@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: str,
    body: BanRequest,
    current_user: CurrentUser = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot ban yourself")
    supabase = get_supabase()
    supabase.table("students").update({"is_active": False}).eq("id", user_id).execute()
    return {"success": True}


@router.post("/users/{user_id}/unban")
async def unban_user(
    user_id: str,
    current_user: CurrentUser = Depends(require_admin),
):
    supabase = get_supabase()
    supabase.table("students").update({"is_active": True}).eq("id", user_id).execute()
    return {"success": True}


@router.get("/metrics")
async def admin_metrics(current_user: CurrentUser = Depends(require_admin)):
    """Simple SQL-driven metrics (DAU-by-messages, listings/day, reports/day)."""
    supabase = get_supabase()
    since_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    listings_7d = (
        supabase.table("listings")
        .select("id", count="exact")
        .gte("created_at", since_7d)
        .execute()
    )
    reports_7d = (
        supabase.table("reports")
        .select("id", count="exact")
        .gte("created_at", since_7d)
        .execute()
    )
    messages_7d = (
        supabase.table("messages")
        .select("id", count="exact")
        .gte("created_at", since_7d)
        .execute()
    )
    pending_reports = (
        supabase.table("reports")
        .select("id", count="exact")
        .eq("status", "pending")
        .execute()
    )

    return {
        "window_days": 7,
        "listings_created": listings_7d.count or 0,
        "messages_sent": messages_7d.count or 0,
        "reports_filed": reports_7d.count or 0,
        "pending_reports": pending_reports.count or 0,
    }
