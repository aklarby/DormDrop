from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, require_college_member

router = APIRouter()


class BlockRequest(BaseModel):
    blocked_id: str
    reason: str | None = None


@router.get("")
async def list_blocks(current_user: CurrentUser = Depends(require_college_member)):
    supabase = get_supabase()
    result = (
        supabase.table("blocks")
        .select(
            "blocked_id, reason, created_at, "
            "students!blocked_id(id, display_name, pfp_path)"
        )
        .eq("blocker_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": result.data}


@router.post("")
async def create_block(
    body: BlockRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    if body.blocked_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")

    supabase = get_supabase()
    exists = (
        supabase.table("students")
        .select("id")
        .eq("id", body.blocked_id)
        .maybe_single()
        .execute()
    )
    if not exists or not exists.data:
        raise HTTPException(status_code=404, detail="User not found")

    supabase.table("blocks").upsert({
        "blocker_id": current_user.id,
        "blocked_id": body.blocked_id,
        "reason": (body.reason or None),
    }).execute()
    return {"success": True}


@router.delete("/{blocked_id}")
async def delete_block(
    blocked_id: str,
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()
    supabase.table("blocks").delete().eq(
        "blocker_id", current_user.id
    ).eq("blocked_id", blocked_id).execute()
    return {"success": True}
