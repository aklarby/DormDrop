from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, get_current_user, require_college_member
from app.rate_limit import limiter
from app.services.moderation import moderate_image

router = APIRouter()


class CreateConversationRequest(BaseModel):
    listing_id: str


class SendMessageRequest(BaseModel):
    body: str | None = None
    photo_path: str | None = None


class ArchiveRequest(BaseModel):
    archived: bool


def _reshape_summary(row: dict, user_id: str) -> dict:
    """Translate the flat conversation_summaries row into the JSON shape
    the client messages page already expects (buyer/seller, listings, etc.).
    """
    is_buyer = row["buyer_id"] == user_id
    other = {
        "id": row["other_id"],
        "display_name": row["other_display_name"],
        "pfp_path": row["other_pfp_path"],
        "venmo_handle": row["other_venmo_handle"] if is_buyer else None,
        "is_active": row.get("other_is_active", True),
    }
    last_message = None
    if row.get("last_message_created_at"):
        last_message = {
            "body": row["last_message_body"],
            "sender_id": str(row["last_message_sender_id"]) if row["last_message_sender_id"] else None,
            "created_at": row["last_message_created_at"],
        }

    # Preserve the shape the client currently consumes (listings + buyer/seller).
    return {
        "id": row["id"],
        "listing_id": row["listing_id"],
        "buyer_id": row["buyer_id"],
        "seller_id": row["seller_id"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "listings": {
            "id": row["listing_id"],
            "title": row["listing_title"],
            "price_cents": row["listing_price_cents"],
            "photos": row["listing_photos"] or [],
        },
        "buyer": other if is_buyer else None,
        "seller": other if not is_buyer else None,
        "other_user": other,
        "last_message": last_message,
        "unread_count": row.get("unread_count", 0) or 0,
    }


@router.post("")
async def create_conversation(
    req: CreateConversationRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()

    listing = (
        supabase.table("listings")
        .select("id, seller_id, college_id, status, students!seller_id(is_active)")
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
    if listing.data.get("status") not in (None, "active", "reserved"):
        raise HTTPException(status_code=400, detail="Listing is no longer available")
    seller_profile = listing.data.get("students") or {}
    if isinstance(seller_profile, list):
        seller_profile = seller_profile[0] if seller_profile else {}
    if seller_profile and seller_profile.get("is_active") is False:
        raise HTTPException(status_code=403, detail="Seller is unavailable")

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
    current_user: CurrentUser = Depends(require_college_member),
):
    """Returns a flat array of conversation summaries with last_message +
    unread_count already populated. Shape is backwards-compatible with the
    client messages page mapping."""
    supabase = get_supabase()

    result = supabase.rpc(
        "conversation_summaries",
        {"p_user_id": current_user.id},
    ).execute()

    rows = result.data or []
    return {"data": [_reshape_summary(row, current_user.id) for row in rows]}


@router.get("/unread-count")
async def get_unread_count(
    current_user: CurrentUser = Depends(get_current_user),
):
    """Cheap navbar-badge endpoint. Returns 0 when the user hasn't completed
    their profile yet (college_id is null)."""
    if not current_user.college_id:
        return {"count": 0}

    supabase = get_supabase()
    result = supabase.rpc(
        "unread_message_count",
        {"p_user_id": current_user.id},
    ).execute()
    count = result.data if isinstance(result.data, int) else (result.data or 0)
    return {"count": int(count)}


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
@limiter.limit("60/hour")
async def send_message(
    request: Request,
    conversation_id: str,
    req: SendMessageRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    from app.services.moderation import moderate_text

    body = (req.body or "").strip()
    photo_path = (req.photo_path or "").strip() or None

    if not body and not photo_path:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if body and len(body) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")

    supabase = get_supabase()

    conv = (
        supabase.table("conversations")
        .select("buyer_id, seller_id, status")
        .eq("id", conversation_id)
        .single()
        .execute()
    )
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if current_user.id not in (conv.data["buyer_id"], conv.data["seller_id"]):
        raise HTTPException(status_code=403, detail="Not your conversation")
    if conv.data.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Conversation is archived")

    if body:
        mod = await moderate_text(body)
        if mod["flagged"]:
            flagged = ", ".join(mod["categories"].keys()) or "policy"
            raise HTTPException(
                status_code=422,
                detail=f"Message was flagged for: {flagged}. Please revise.",
            )

    if photo_path:
        img_mod = await moderate_image(photo_path, bucket="message_photos")
        if img_mod["flagged"]:
            flagged = ", ".join(img_mod["categories"].keys()) or "policy"
            raise HTTPException(
                status_code=422,
                detail=f"Image was flagged for: {flagged}. Please use a different photo.",
            )

    result = supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "sender_id": current_user.id,
        "body": body or "",
        "type": "image" if photo_path else "text",
        "photo_path": photo_path,
    }).execute()

    # conversations.updated_at is now bumped by the messages_bump_conversation trigger,
    # so the postgrest `.update({})` no-op is gone.
    return result.data[0]


@router.get("/search")
async def search_messages(
    q: str = Query(..., min_length=2, max_length=80),
    current_user: CurrentUser = Depends(require_college_member),
    limit: int = Query(default=20, le=50),
):
    """Full-text search over the caller's messages (both inbound and outbound)."""
    supabase = get_supabase()
    result = supabase.rpc(
        "messages_search",
        {"p_user_id": current_user.id, "p_query": q, "p_limit": limit},
    ).execute()
    return {"data": result.data or []}


@router.patch("/{conversation_id}/archive")
async def archive_conversation(
    conversation_id: str,
    body: ArchiveRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    """Flip status between open/closed for the archive toggle."""
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

    supabase.table("conversations").update({
        "status": "closed" if body.archived else "open"
    }).eq("id", conversation_id).execute()
    return {"success": True}


@router.patch("/{conversation_id}/read")
async def mark_messages_read(
    conversation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Mark every inbound message in this conversation as read.

    (Previously lived at `/conversations/messages/read?conversation_id=…`,
    but the client was calling a mismatching `/messages/read` so reads
    silently 404'd. Moved to `/conversations/:id/read` so the path lines
    up with the rest of the resource.)
    """
    supabase = get_supabase()

    supabase.table("messages").update({"is_read": True}).eq(
        "conversation_id", conversation_id
    ).neq("sender_id", current_user.id).eq("is_read", False).execute()

    return {"success": True}
