from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, require_college_member

router = APIRouter()


class SavedSearchPayload(BaseModel):
    label: str | None = None
    query: dict
    notify: bool = True


@router.get("")
async def list_saved_searches(current_user: CurrentUser = Depends(require_college_member)):
    supabase = get_supabase()
    result = (
        supabase.table("saved_searches")
        .select("*")
        .eq("student_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": result.data}


@router.post("")
async def create_saved_search(
    body: SavedSearchPayload,
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()
    if not isinstance(body.query, dict) or not body.query:
        raise HTTPException(status_code=400, detail="query must be a non-empty object")

    result = supabase.table("saved_searches").insert({
        "student_id": current_user.id,
        "label": (body.label or None),
        "query": body.query,
        "notify": bool(body.notify),
    }).execute()
    return result.data[0]


@router.delete("/{search_id}")
async def delete_saved_search(
    search_id: str,
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()
    supabase.table("saved_searches").delete().eq(
        "id", search_id
    ).eq("student_id", current_user.id).execute()
    return {"success": True}


@router.get("/{search_id}/new-matches")
async def new_matches(
    search_id: str,
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()
    result = supabase.rpc("new_saved_search_matches", {"p_search_id": search_id}).execute()
    return {"data": result.data or []}
