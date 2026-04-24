from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, require_college_member

router = APIRouter()


@router.get("")
async def list_saved(current_user: CurrentUser = Depends(require_college_member)):
    supabase = get_supabase()
    result = (
        supabase.table("saved_listings")
        .select(
            "listing_id, "
            "listings!listing_id(*, students!seller_id(display_name, pfp_path, is_active))"
        )
        .eq("student_id", current_user.id)
        .execute()
    )

    # Hide saves whose seller is now deactivated.
    rows = []
    for row in result.data or []:
        listing = row.get("listings") or {}
        seller = listing.get("students") or {}
        if isinstance(seller, list):
            seller = seller[0] if seller else {}
        if seller and seller.get("is_active") is False:
            continue
        rows.append(row)

    return {"data": rows}


@router.post("/{listing_id}")
async def save_listing(
    listing_id: str,
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()

    listing = (
        supabase.table("listings")
        .select("id")
        .eq("id", listing_id)
        .maybe_single()
        .execute()
    )
    if not listing or not listing.data:
        raise HTTPException(status_code=404, detail="Listing not found")

    supabase.table("saved_listings").upsert({
        "student_id": current_user.id,
        "listing_id": listing_id,
    }).execute()

    return {"success": True}


@router.delete("/{listing_id}")
async def unsave_listing(
    listing_id: str,
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()

    supabase.table("saved_listings").delete().eq(
        "student_id", current_user.id
    ).eq("listing_id", listing_id).execute()

    return {"success": True}
