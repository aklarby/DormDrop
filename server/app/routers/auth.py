from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, get_current_user
from app.rate_limit import limiter

router = APIRouter()


class ValidateDomainRequest(BaseModel):
    email: str


class ValidateDomainResponse(BaseModel):
    valid: bool
    college_id: str | None = None
    college_name: str | None = None


class CompleteSignupRequest(BaseModel):
    display_name: str


class WaitlistRequest(BaseModel):
    email: str
    note: str | None = None


@router.post("/validate-domain", response_model=ValidateDomainResponse)
@limiter.limit("30/minute")
async def validate_domain(request: Request, body: ValidateDomainRequest):
    domain = body.email.split("@")[-1] if "@" in body.email else ""
    if not domain:
        raise HTTPException(status_code=400, detail="Invalid email format")

    supabase = get_supabase()
    result = (
        supabase.table("colleges")
        .select("id, name")
        .eq("email_domain", domain)
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        return ValidateDomainResponse(valid=False)

    return ValidateDomainResponse(
        valid=True,
        college_id=result.data["id"],
        college_name=result.data["name"],
    )


@router.post("/waitlist")
@limiter.limit("30/minute")
async def join_waitlist(request: Request, body: WaitlistRequest):
    """Record an email + domain for a school we don't support yet."""
    if "@" not in body.email:
        raise HTTPException(status_code=400, detail="Invalid email format")

    domain = body.email.split("@")[-1].lower()
    supabase = get_supabase()
    supabase.table("waitlists").upsert({
        "email": body.email.lower(),
        "domain": domain,
        "note": (body.note or None),
    }).execute()
    return {"success": True}


@router.post("/complete-signup")
@limiter.limit("5/hour")
async def complete_signup(
    request: Request,
    body: CompleteSignupRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    supabase = get_supabase()

    existing = (
        supabase.table("students")
        .select("id")
        .eq("id", current_user.id)
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        raise HTTPException(status_code=409, detail="Student profile already exists")

    user_resp = supabase.auth.admin.get_user_by_id(current_user.id)
    email = user_resp.user.email
    domain = email.split("@")[-1]

    college_resp = (
        supabase.table("colleges")
        .select("id")
        .eq("email_domain", domain)
        .maybe_single()
        .execute()
    )
    if not college_resp or not college_resp.data:
        raise HTTPException(status_code=400, detail="College not found for this email domain")

    display_name = (body.display_name or "").strip()
    if not display_name or len(display_name) > 80:
        raise HTTPException(status_code=400, detail="Display name must be 1-80 characters")

    supabase.table("students").insert({
        "id": current_user.id,
        "college_id": college_resp.data["id"],
        "display_name": display_name,
    }).execute()

    return {"success": True}
