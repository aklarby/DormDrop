from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, get_current_user
from app.constants import CATEGORIES, CONDITIONS, LISTING_STATUSES
from app.services.ai_populate import auto_populate_from_image
from app.services.moderation import moderate_image, moderate_text
from app.services.storage import move_from_staging, delete_file

router = APIRouter()


class PhotoEntry(BaseModel):
    order: int
    path: str


class CreateListingRequest(BaseModel):
    title: str
    description: str | None = None
    category: str
    condition: str
    price_cents: int
    is_negotiable: bool = False
    photos: list[PhotoEntry]


class UpdateListingRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    condition: str | None = None
    price_cents: int | None = None
    is_negotiable: bool | None = None
    status: str | None = None


@router.get("")
async def list_listings(
    current_user: CurrentUser = Depends(get_current_user),
    search: str | None = None,
    category: str | None = None,
    condition: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    sort: str = "newest",
    cursor: str | None = None,
    limit: int = Query(default=20, le=50),
):
    if not current_user.college_id:
        raise HTTPException(status_code=403, detail="Complete your profile first")

    supabase = get_supabase()
    query = (
        supabase.table("listings")
        .select("*, students!seller_id(display_name, pfp_path)")
        .eq("college_id", current_user.college_id)
        .eq("status", "active")
    )

    if search:
        query = query.text_search("search_vector", search, config="english")
    if category:
        cats = [c.strip() for c in category.split(",")]
        query = query.in_("category", cats)
    if condition:
        query = query.eq("condition", condition)
    if min_price is not None:
        query = query.gte("price_cents", min_price)
    if max_price is not None:
        query = query.lte("price_cents", max_price)

    if sort == "price_asc":
        query = query.order("price_cents", desc=False)
    elif sort == "price_desc":
        query = query.order("price_cents", desc=True)
    else:
        query = query.order("created_at", desc=True)

    if cursor:
        query = query.lt("created_at", cursor)

    query = query.limit(limit)
    result = query.execute()
    return {"data": result.data, "count": len(result.data)}


@router.get("/{listing_id}")
async def get_listing(
    listing_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("listings")
        .select("*, students!seller_id(id, display_name, pfp_path, venmo_handle)")
        .eq("id", listing_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Listing not found")

    if current_user.college_id and result.data["college_id"] != current_user.college_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this listing")

    return result.data


@router.post("")
async def create_listing(
    body: CreateListingRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    if not current_user.college_id:
        raise HTTPException(status_code=403, detail="Complete your profile first")

    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {body.category}")
    if body.condition not in CONDITIONS:
        raise HTTPException(status_code=400, detail=f"Invalid condition: {body.condition}")
    if body.price_cents < 0:
        raise HTTPException(status_code=400, detail="Price cannot be negative")
    if len(body.photos) == 0 or len(body.photos) > 8:
        raise HTTPException(status_code=400, detail="Must include 1-8 photos")

    text_mod = await moderate_text(f"{body.title}\n{body.description or ''}")
    if text_mod["flagged"]:
        flagged = ", ".join(text_mod["categories"].keys())
        raise HTTPException(
            status_code=422,
            detail=f"Your listing text was flagged for: {flagged}. Please revise and try again.",
        )

    for photo in body.photos:
        img_mod = await moderate_image(photo.path)
        if img_mod["flagged"]:
            flagged = ", ".join(img_mod["categories"].keys())
            raise HTTPException(
                status_code=422,
                detail=f"A photo was flagged for: {flagged}. Please remove it and try again.",
            )

    supabase = get_supabase()
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    result = supabase.table("listings").insert({
        "seller_id": current_user.id,
        "college_id": current_user.college_id,
        "title": body.title,
        "description": body.description,
        "category": body.category,
        "condition": body.condition,
        "price_cents": body.price_cents,
        "is_negotiable": body.is_negotiable,
        "photos": [p.model_dump() for p in body.photos],
        "expires_at": expires_at,
    }).execute()

    return result.data[0]


@router.patch("/{listing_id}")
async def update_listing(
    listing_id: str,
    body: UpdateListingRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()

    existing = (
        supabase.table("listings")
        .select("seller_id")
        .eq("id", listing_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Listing not found")
    if existing.data["seller_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your listing")

    updates = body.model_dump(exclude_none=True)

    if "category" in updates and updates["category"] not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category")
    if "condition" in updates and updates["condition"] not in CONDITIONS:
        raise HTTPException(status_code=400, detail=f"Invalid condition")
    if "status" in updates and updates["status"] not in LISTING_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status")

    result = supabase.table("listings").update(updates).eq("id", listing_id).execute()
    return result.data[0]


@router.post("/{listing_id}/extend")
async def extend_listing(
    listing_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()

    existing = (
        supabase.table("listings")
        .select("seller_id")
        .eq("id", listing_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Listing not found")
    if existing.data["seller_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your listing")

    new_expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    result = (
        supabase.table("listings")
        .update({"expires_at": new_expiry, "status": "active"})
        .eq("id", listing_id)
        .execute()
    )
    return result.data[0]


class ModerateImageRequest(BaseModel):
    storage_path: str


@router.post("/moderate-image")
async def moderate_image_endpoint(
    body: ModerateImageRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Check a single uploaded image for policy violations before listing."""
    result = await moderate_image(body.storage_path)
    if result["flagged"]:
        flagged = ", ".join(result["categories"].keys())
        raise HTTPException(
            status_code=422,
            detail=f"This image was flagged for: {flagged}. Please use a different photo.",
        )
    return {"ok": True}


class AiPopulateRequest(BaseModel):
    storage_path: str


@router.post("/ai-populate")
async def ai_populate(
    body: AiPopulateRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    try:
        result = await auto_populate_from_image(body.storage_path)
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")


@router.delete("/{listing_id}")
async def remove_listing(
    listing_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()

    existing = (
        supabase.table("listings")
        .select("seller_id")
        .eq("id", listing_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Listing not found")
    if existing.data["seller_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your listing")

    supabase.table("listings").update({"status": "removed"}).eq("id", listing_id).execute()
    return {"success": True}
