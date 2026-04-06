from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, get_current_user

router = APIRouter()


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
        .select("id, display_name, pfp_path, bio, venmo_handle, college_id, created_at")
        .eq("id", student_id)
        .single()
        .execute()
    )
    if not result.data:
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
