from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, require_college_member

router = APIRouter()


class CreateReviewRequest(BaseModel):
    listing_id: str
    reviewee_id: str
    rating: int
    body: str | None = None


@router.post("")
async def create_review(
    body: CreateReviewRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    if body.rating < 1 or body.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    if body.reviewee_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot review yourself")
    if body.body is not None and len(body.body) > 1000:
        raise HTTPException(status_code=400, detail="Review too long (max 1000 chars)")

    supabase = get_supabase()

    # Participant gate: there must be a transaction binding these two users
    # to this listing. RLS also enforces this.
    txn = (
        supabase.table("transactions")
        .select("id, buyer_id, seller_id")
        .eq("listing_id", body.listing_id)
        .maybe_single()
        .execute()
    )
    if not txn or not txn.data:
        raise HTTPException(status_code=403, detail="No transaction for this listing")
    participants = {txn.data["buyer_id"], txn.data["seller_id"]}
    if current_user.id not in participants or body.reviewee_id not in participants:
        raise HTTPException(status_code=403, detail="Only transaction participants can review")

    result = supabase.table("reviews").insert({
        "reviewer_id": current_user.id,
        "reviewee_id": body.reviewee_id,
        "listing_id": body.listing_id,
        "rating": body.rating,
        "body": (body.body or None),
    }).execute()
    return result.data[0]


@router.get("/student/{student_id}")
async def list_reviews_for(
    student_id: str,
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()
    reviews = (
        supabase.table("reviews")
        .select("*, reviewer:students!reviewer_id(id, display_name, pfp_path)")
        .eq("reviewee_id", student_id)
        .order("created_at", desc=True)
        .execute()
    )
    stats = (
        supabase.table("student_review_stats")
        .select("avg_rating, review_count")
        .eq("student_id", student_id)
        .maybe_single()
        .execute()
    )
    return {
        "data": reviews.data,
        "stats": (stats.data if stats else None) or {"avg_rating": None, "review_count": 0},
    }
