from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, require_college_member

router = APIRouter()


class MarkSoldRequest(BaseModel):
    listing_id: str
    buyer_id: str
    final_price_cents: int
    pickup_location: str | None = None


@router.post("/mark-sold")
async def mark_sold(
    body: MarkSoldRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    """Seller marks a listing as sold. Writes a transactions row and
    flips the listing status in one server-side step."""
    if body.final_price_cents < 0:
        raise HTTPException(status_code=400, detail="Price must be non-negative")

    supabase = get_supabase()
    listing = (
        supabase.table("listings")
        .select("id, seller_id, status")
        .eq("id", body.listing_id)
        .single()
        .execute()
    )
    if not listing.data:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.data["seller_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your listing")
    if listing.data["status"] == "sold":
        raise HTTPException(status_code=400, detail="Already marked as sold")

    supabase.table("transactions").insert({
        "listing_id": body.listing_id,
        "buyer_id": body.buyer_id,
        "seller_id": current_user.id,
        "final_price_cents": body.final_price_cents,
        "pickup_location": (body.pickup_location or None),
    }).execute()

    supabase.table("listings").update({"status": "sold"}).eq("id", body.listing_id).execute()
    return {"success": True}


@router.get("/me")
async def my_transactions(current_user: CurrentUser = Depends(require_college_member)):
    supabase = get_supabase()
    result = (
        supabase.table("transactions")
        .select(
            "*, listings!listing_id(id, title, photos), "
            "buyer:students!buyer_id(id, display_name, pfp_path), "
            "seller:students!seller_id(id, display_name, pfp_path)"
        )
        .or_(f"buyer_id.eq.{current_user.id},seller_id.eq.{current_user.id}")
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": result.data}
