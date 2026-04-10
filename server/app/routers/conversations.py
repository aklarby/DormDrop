from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, get_current_user

router = APIRouter()


class CreateConversationRequest(BaseModel):
    listing_id: str


class SendMessageRequest(BaseModel):
    body: str


@router.post("")
async def create_conversation(
    req: CreateConversationRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()

    listing = (
        supabase.table("listings")
        .select("id, seller_id, college_id")
        .eq("id", req.listing_id)
        .single()
        .execute()
    )
    if not listing.data:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.data["seller_id"] == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    if listing.data["college_id"] != current_user.college_id:
        raise HTTPException(status_code=403, detail="Listing is not at your college")

    existing = (
        supabase.table("conversations")
        .select("*")
        .eq("listing_id", req.listing_id)
        .eq("buyer_id", current_user.id)
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        return existing.data

    result = supabase.table("conversations").insert({
        "listing_id": req.listing_id,
        "buyer_id": current_user.id,
        "seller_id": listing.data["seller_id"],
    }).execute()

    return result.data[0]


@router.get("")
async def list_conversations(
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()

    result = (
        supabase.table("conversations")
        .select(
            "*, "
            "listings!listing_id(id, title, photos, price_cents), "
            "buyer:students!buyer_id(id, display_name, pfp_path), "
            "seller:students!seller_id(id, display_name, pfp_path, venmo_handle)"
        )
        .or_(f"buyer_id.eq.{current_user.id},seller_id.eq.{current_user.id}")
        .eq("status", "open")
        .order("updated_at", desc=True)
        .execute()
    )

    return {"data": result.data}


@router.get("/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    cursor: str | None = None,
    limit: int = Query(default=50, le=100),
):
    supabase = get_supabase()

    conv = (
        supabase.table("conversations")
        .select("buyer_id, seller_id")
        .eq("id", conversation_id)
        .single()
        .execute()
    )
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if current_user.id not in (conv.data["buyer_id"], conv.data["seller_id"]):
        raise HTTPException(status_code=403, detail="Not your conversation")

    query = (
        supabase.table("messages")
        .select("*, students!sender_id(display_name, pfp_path)")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
    )

    if cursor:
        query = query.lt("created_at", cursor)

    result = query.limit(limit).execute()
    return {"data": result.data}


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    req: SendMessageRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()

    conv = (
        supabase.table("conversations")
        .select("buyer_id, seller_id")
        .eq("id", conversation_id)
        .single()
        .execute()
    )
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if current_user.id not in (conv.data["buyer_id"], conv.data["seller_id"]):
        raise HTTPException(status_code=403, detail="Not your conversation")

    result = supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "sender_id": current_user.id,
        "body": req.body,
    }).execute()

    supabase.table("conversations").update({}).eq("id", conversation_id).execute()

    return result.data[0]


@router.patch("/messages/read")
async def mark_messages_read(
    conversation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()

    supabase.table("messages").update({"is_read": True}).eq(
        "conversation_id", conversation_id
    ).neq("sender_id", current_user.id).eq("is_read", False).execute()

    return {"success": True}
