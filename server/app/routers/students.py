import re

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, get_current_user

router = APIRouter()


# Venmo usernames: 5-30 chars, letters/numbers/dashes/underscores. Based on
# Venmo's published rules — we strip a leading "@" before validating.
VENMO_RE = re.compile(r"^[A-Za-z0-9_-]{5,30}$")


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    bio: str | None = None
    venmo_handle: str | None = None


@router.get("/me")
async def get_my_profile(current_user: CurrentUser = Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("students")
        .select("*, colleges(name, logo_path)")
        .eq("id", current_user.id)
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data


@router.get("/{student_id}")
async def get_student_profile(
    student_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("students")
        .select("id, display_name, pfp_path, bio, venmo_handle, college_id, is_active, created_at")
        .eq("id", student_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Student not found")
    if result.data.get("is_active") is False and result.data["id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Student not found")
    return result.data


@router.patch("/me")
async def update_my_profile(
    body: UpdateProfileRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "display_name" in updates:
        name = (updates["display_name"] or "").strip()
        if not name or len(name) > 80:
            raise HTTPException(status_code=400, detail="Display name must be 1-80 characters")
        updates["display_name"] = name

    if "bio" in updates:
        bio = (updates["bio"] or "").strip()
        if len(bio) > 500:
            raise HTTPException(status_code=400, detail="Bio too long (max 500 chars)")
        updates["bio"] = bio or None

    if "venmo_handle" in updates:
        venmo = (updates["venmo_handle"] or "").strip().lstrip("@")
        if venmo == "":
            updates["venmo_handle"] = None
        elif not VENMO_RE.match(venmo):
            raise HTTPException(
                status_code=400,
                detail="Venmo handle must be 5-30 chars, letters/numbers/dashes/underscores only",
            )
        else:
            updates["venmo_handle"] = venmo

    result = (
        supabase.table("students")
        .update(updates)
        .eq("id", current_user.id)
        .execute()
    )
    return result.data[0]


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    supabase = get_supabase()
    ext = file.filename.split(".")[-1] if file.filename else "jpg"
    path = f"{current_user.id}/avatar.{ext}"

    supabase.storage.from_("profile_pictures").upload(
        path, contents, {"content-type": file.content_type, "upsert": "true"}
    )

    supabase.table("students").update({"pfp_path": path}).eq("id", current_user.id).execute()

    return {"path": path}


@router.post("/me/export")
async def export_my_data(current_user: CurrentUser = Depends(get_current_user)):
    """Plain-JSON export of the caller's data — student row, listings, conversations, messages,
    saved listings, blocks, reports filed. Called by the `/settings` data-export button."""
    supabase = get_supabase()

    def table_rows(table: str, filters: dict) -> list:
        q = supabase.table(table).select("*")
        for key, val in filters.items():
            q = q.eq(key, val)
        return (q.execute().data or [])

    return {
        "student": (
            supabase.table("students").select("*").eq("id", current_user.id).single().execute().data
        ),
        "listings": table_rows("listings", {"seller_id": current_user.id}),
        "saved_listings": table_rows("saved_listings", {"student_id": current_user.id}),
        "reports_filed": table_rows("reports", {"reporter_id": current_user.id}),
        "blocks": table_rows("blocks", {"blocker_id": current_user.id}),
        "conversations_as_buyer": table_rows("conversations", {"buyer_id": current_user.id}),
        "conversations_as_seller": table_rows("conversations", {"seller_id": current_user.id}),
        "messages": table_rows("messages", {"sender_id": current_user.id}),
    }


@router.delete("/me")
async def delete_my_account(current_user: CurrentUser = Depends(get_current_user)):
    """Soft-delete: flip is_active=false and blank out PII. Storage cleanup
    runs on a schedule via /internal/sweep-orphan-photos (listings are
    cascaded to removed via the admin ban path in a follow-up if needed)."""
    supabase = get_supabase()
    supabase.table("students").update({
        "is_active": False,
        "bio": None,
        "venmo_handle": None,
    }).eq("id", current_user.id).execute()
    return {"success": True}
