import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, get_current_user, require_college_member
from app.constants import CATEGORIES, CONDITIONS, LISTING_STATUSES
from app.rate_limit import limiter
from app.services.ai_populate import auto_populate_from_image, auto_populate_from_images
from app.services.moderation import moderate_image, moderate_text
from app.services.storage import delete_files, extract_photo_paths

router = APIRouter()

STATUSES_THAT_REMOVE_PHOTOS = {"removed", "expired"}


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
    current_user: CurrentUser = Depends(require_college_member),
    search: str | None = None,
    category: str | None = None,
    condition: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    sort: str = "newest",
    cursor: str | None = None,
    limit: int = Query(default=20, le=50),
):
    """Hybrid search: delegates to the listings_search RPC which combines
    tsvector ranking with pg_trgm similarity for typo tolerance. Also
    filters blocked sellers and deactivated sellers at the RPC level."""
    supabase = get_supabase()

    categories = [c.strip() for c in category.split(",")] if category else None

    result = supabase.rpc(
        "listings_search",
        {
            "p_college_id": current_user.college_id,
            "p_query": search,
            "p_categories": categories,
            "p_condition": condition,
            "p_min_price": min_price,
            "p_max_price": max_price,
            "p_sort": sort,
            "p_cursor": cursor,
            "p_limit": limit,
            "p_viewer_id": current_user.id,
        },
    ).execute()

    rows = []
    for r in (result.data or []):
        r["students"] = {
            "display_name": r.pop("seller_display_name", None),
            "pfp_path": r.pop("seller_pfp_path", None),
        }
        r.pop("relevance", None)
        rows.append(r)

    return {"data": rows, "count": len(rows)}


@router.get("/suggest")
async def suggest_listings(
    q: str = Query(..., min_length=1, max_length=40),
    current_user: CurrentUser = Depends(require_college_member),
):
    supabase = get_supabase()
    result = supabase.rpc(
        "listings_suggest",
        {"p_college_id": current_user.college_id, "p_query": q, "p_limit": 8},
    ).execute()
    return {"data": result.data or []}


@router.get("/facets")
async def listing_facets(
    current_user: CurrentUser = Depends(require_college_member),
    search: str | None = None,
    category: str | None = None,
    condition: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
):
    supabase = get_supabase()
    categories = [c.strip() for c in category.split(",")] if category else None
    result = supabase.rpc(
        "listings_facets",
        {
            "p_college_id": current_user.college_id,
            "p_query": search,
            "p_categories": categories,
            "p_condition": condition,
            "p_min_price": min_price,
            "p_max_price": max_price,
            "p_viewer_id": current_user.id,
        },
    ).execute()
    return {"data": result.data or []}


@router.get("/{listing_id}")
async def get_listing(
    listing_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()
    result = (
        supabase.table("listings")
        .select("*, students!seller_id(id, display_name, pfp_path, venmo_handle, is_active)")
        .eq("id", listing_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Listing not found")

    if current_user.college_id and result.data["college_id"] != current_user.college_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this listing")

    seller = result.data.get("students") or {}
    if isinstance(seller, list):
        seller = seller[0] if seller else {}
    if seller and seller.get("is_active") is False and result.data["seller_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Listing not found")

    return result.data


@router.post("")
@limiter.limit("10/hour")
async def create_listing(
    request: Request,
    body: CreateListingRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
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

    # Parallel image moderation — 8 photos used to be 8 sequential OpenAI calls.
    mod_results = await asyncio.gather(
        *[moderate_image(photo.path) for photo in body.photos],
        return_exceptions=True,
    )
    for photo, mod in zip(body.photos, mod_results):
        if isinstance(mod, Exception):
            raise HTTPException(status_code=502, detail=f"Image moderation failed: {mod}")
        if mod.get("flagged"):
            flagged = ", ".join(mod["categories"].keys())
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
        .select("seller_id, photos, status")
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

    # Re-moderate text edits.
    if "title" in updates or "description" in updates:
        text_blob = f"{updates.get('title', '')}\n{updates.get('description', '')}"
        mod = await moderate_text(text_blob)
        if mod["flagged"]:
            flagged = ", ".join(mod["categories"].keys())
            raise HTTPException(
                status_code=422,
                detail=f"Edit was flagged for: {flagged}. Please revise.",
            )

    result = supabase.table("listings").update(updates).eq("id", listing_id).execute()

    # Photo lifecycle: if the listing transitioned to a terminal status,
    # drop the photos from storage so we don't keep private content around.
    new_status = updates.get("status")
    prev_status = existing.data.get("status")
    if (
        new_status in STATUSES_THAT_REMOVE_PHOTOS
        and prev_status not in STATUSES_THAT_REMOVE_PHOTOS
    ):
        paths = extract_photo_paths(existing.data.get("photos"))
        if paths:
            delete_files("listing_photos", paths)

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


class RecordViewRequest(BaseModel):
    listing_id: str


@router.post("/views")
@limiter.limit("120/hour")
async def record_view(
    request: Request,
    body: RecordViewRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    """Idempotent per-viewer-per-day view counter for listing analytics."""
    supabase = get_supabase()
    supabase.rpc(
        "record_listing_view",
        {"p_listing_id": body.listing_id, "p_viewer_id": current_user.id},
    ).execute()
    return {"success": True}


@router.get("/similar/{listing_id}")
async def similar(
    listing_id: str,
    current_user: CurrentUser = Depends(require_college_member),
    limit: int = Query(default=8, le=20),
):
    supabase = get_supabase()
    result = supabase.rpc(
        "similar_listings", {"p_listing_id": listing_id, "p_limit": limit}
    ).execute()
    return {"data": result.data or []}


@router.get("/trending")
async def trending(
    current_user: CurrentUser = Depends(require_college_member),
    limit: int = Query(default=12, le=30),
):
    supabase = get_supabase()
    result = supabase.rpc(
        "trending_listings",
        {"p_college_id": current_user.college_id, "p_limit": limit},
    ).execute()
    return {"data": result.data or []}


@router.get("/price-guidance")
async def price_guidance(
    category: str,
    condition: str,
    current_user: CurrentUser = Depends(require_college_member),
):
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    if condition not in CONDITIONS:
        raise HTTPException(status_code=400, detail="Invalid condition")
    supabase = get_supabase()
    result = supabase.rpc(
        "price_guidance",
        {
            "p_college_id": current_user.college_id,
            "p_category": category,
            "p_condition": condition,
        },
    ).execute()
    return {"data": (result.data or [{}])[0]}


@router.get("/insights/me")
async def my_insights(current_user: CurrentUser = Depends(require_college_member)):
    supabase = get_supabase()
    result = supabase.rpc(
        "seller_insights", {"p_seller_id": current_user.id}
    ).execute()
    return {"data": result.data or []}


@router.post("/{listing_id}/relist")
async def relist(
    listing_id: str,
    current_user: CurrentUser = Depends(require_college_member),
):
    """Clone an expired/removed listing into a fresh active listing."""
    supabase = get_supabase()
    old = (
        supabase.table("listings")
        .select("*")
        .eq("id", listing_id)
        .single()
        .execute()
    )
    if not old.data:
        raise HTTPException(status_code=404, detail="Listing not found")
    if old.data["seller_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your listing")

    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    result = supabase.table("listings").insert({
        "seller_id": current_user.id,
        "college_id": old.data["college_id"],
        "title": old.data["title"],
        "description": old.data["description"],
        "category": old.data["category"],
        "condition": old.data["condition"],
        "price_cents": old.data["price_cents"],
        "is_negotiable": old.data["is_negotiable"],
        "photos": old.data["photos"],
        "pickup_location": old.data.get("pickup_location"),
        "expires_at": expires_at,
    }).execute()
    return result.data[0]


class BulkExtendRequest(BaseModel):
    days_until_expiry: int = 7


@router.post("/bulk-extend")
async def bulk_extend(
    body: BulkExtendRequest,
    current_user: CurrentUser = Depends(require_college_member),
):
    """Extend every active listing of mine that expires within N days by 30 days."""
    supabase = get_supabase()
    cutoff = (
        datetime.now(timezone.utc) + timedelta(days=body.days_until_expiry)
    ).isoformat()
    existing = (
        supabase.table("listings")
        .select("id")
        .eq("seller_id", current_user.id)
        .eq("status", "active")
        .lte("expires_at", cutoff)
        .execute()
    )
    ids = [row["id"] for row in (existing.data or [])]
    if not ids:
        return {"success": True, "extended": 0}
    new_expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    supabase.table("listings").update({"expires_at": new_expiry}).in_("id", ids).execute()
    return {"success": True, "extended": len(ids)}


class ModerateImageRequest(BaseModel):
    storage_path: str


@router.post("/moderate-image")
@limiter.limit("30/hour")
async def moderate_image_endpoint(
    request: Request,
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
    storage_path: str | None = None
    storage_paths: list[str] | None = None


@router.post("/ai-populate")
@limiter.limit("10/hour")
async def ai_populate(
    request: Request,
    body: AiPopulateRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    paths = body.storage_paths or ([body.storage_path] if body.storage_path else [])
    if not paths:
        raise HTTPException(status_code=400, detail="storage_path(s) required")
    if len(paths) > 8:
        raise HTTPException(status_code=400, detail="Up to 8 photos per request")
    try:
        if len(paths) == 1 and body.storage_path and not body.storage_paths:
            return await auto_populate_from_image(paths[0])
        return await auto_populate_from_images(paths)
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
        .select("seller_id, photos")
        .eq("id", listing_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Listing not found")
    if existing.data["seller_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your listing")

    supabase.table("listings").update({"status": "removed"}).eq("id", listing_id).execute()

    # Drop storage objects so removed listings don't keep photos around.
    paths = extract_photo_paths(existing.data.get("photos"))
    if paths:
        delete_files("listing_photos", paths)

    return {"success": True}
