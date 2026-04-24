from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, require_college_member
from app.rate_limit import limiter

router = APIRouter()


class CreateOfferRequest(BaseModel):
    conversation_id: str
    amount_cents: int
    note: str | None = None


class UpdateOfferRequest(BaseModel):
    status: str  # accepted | declined | withdrawn


@router.post("")
@limiter.limit("20/hour")
async def create_offer(
    request: Request,
    body: CreateOfferRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    if body.amount_cents < 0:
        raise HTTPException(status_code=400, detail="Amount must be non-negative")

    supabase = get_supabase()
    conv = (
        supabase.table("conversations")
        .select("id, buyer_id, seller_id, listing_id, status, listings(is_negotiable, price_cents, status)")
        .eq("id", body.conversation_id)
        .single()
        .execute()
    )
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if current_user.id != conv.data["buyer_id"]:
        raise HTTPException(status_code=403, detail="Only the buyer can make an offer")
    listing = conv.data.get("listings") or {}
    if isinstance(listing, list):
        listing = listing[0] if listing else {}
    if listing.get("status") != "active":
        raise HTTPException(status_code=400, detail="Listing is not available")

    result = supabase.table("offers").insert({
        "conversation_id": body.conversation_id,
        "listing_id": conv.data["listing_id"],
        "buyer_id": current_user.id,
        "seller_id": conv.data["seller_id"],
        "amount_cents": body.amount_cents,
        "note": (body.note or None),
    }).execute()

    offer = result.data[0]

    # Drop a system message so the client can render the accept/decline card
    # inline. `type='system'` + a JSON metadata payload means the messages
    # list can switch on kind without string-parsing the body.
    supabase.table("messages").insert({
        "conversation_id": body.conversation_id,
        "sender_id": current_user.id,
        "body": f"Offer: ${body.amount_cents / 100:.2f}",
        "type": "system",
        "metadata": {
            "kind": "offer",
            "offer_id": offer["id"],
            "amount_cents": body.amount_cents,
            "note": body.note or None,
            "buyer_id": current_user.id,
            "seller_id": conv.data["seller_id"],
        },
    }).execute()

    return offer


@router.get("/conversation/{conversation_id}")
async def list_offers(
    conversation_id: str,
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()
    result = (
        supabase.table("offers")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": result.data}


@router.patch("/{offer_id}")
async def update_offer(
    offer_id: str,
    body: UpdateOfferRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    if body.status not in ("accepted", "declined", "withdrawn"):
        raise HTTPException(status_code=400, detail="Invalid status")

    supabase = get_supabase()
    offer = (
        supabase.table("offers")
        .select("*")
        .eq("id", offer_id)
        .single()
        .execute()
    )
    if not offer.data:
        raise HTTPException(status_code=404, detail="Offer not found")

    o = offer.data
    if body.status == "withdrawn" and o["buyer_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Only the buyer can withdraw")
    if body.status in ("accepted", "declined") and o["seller_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Only the seller can accept/decline")
    if o["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Offer already {o['status']}")

    now = datetime.now(timezone.utc).isoformat()
    updated = (
        supabase.table("offers")
        .update({"status": body.status, "resolved_at": now})
        .eq("id", offer_id)
        .execute()
    ).data[0]

    supabase.table("messages").insert({
        "conversation_id": o["conversation_id"],
        "sender_id": current_user.id,
        "body": f"Offer {body.status}: ${o['amount_cents'] / 100:.2f}",
        "type": "system",
        "metadata": {
            "kind": "offer_update",
            "offer_id": offer_id,
            "amount_cents": o["amount_cents"],
            "status": body.status,
        },
    }).execute()

    return updated
