"""Web push subscription storage. The actual push sender is out of scope
here (it belongs in a background worker that reads from
unread_messages_for_email / or per-conversation triggers); this just
lets the client register/unregister subscriptions."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, require_college_member

router = APIRouter()


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: dict
    user_agent: str | None = None


@router.post("/subscribe")
async def subscribe(
    body: SubscribeRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    if not body.endpoint or not body.keys:
        raise HTTPException(status_code=400, detail="endpoint and keys are required")
    supabase = get_supabase()
    supabase.table("push_subscriptions").upsert(
        {
            "student_id": current_user.id,
            "endpoint": body.endpoint,
            "keys": body.keys,
            "user_agent": body.user_agent,
        },
        on_conflict="endpoint",
    ).execute()
    return {"success": True}


@router.post("/unsubscribe")
async def unsubscribe(
    body: SubscribeRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()
    supabase.table("push_subscriptions").delete().eq(
        "student_id", current_user.id
    ).eq("endpoint", body.endpoint).execute()
    return {"success": True}


class EmailPrefRequest(BaseModel):
    email_on_unread: bool


@router.patch("/email-pref")
async def set_email_pref(
    body: EmailPrefRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()
    supabase.table("students").update({"email_on_unread": body.email_on_unread}).eq(
        "id", current_user.id
    ).execute()
    return {"success": True}
