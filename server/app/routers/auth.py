from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, get_current_user

router = APIRouter()


class ValidateDomainRequest(BaseModel):
    email: str


class ValidateDomainResponse(BaseModel):
    valid: bool
    college_id: str | None = None
    college_name: str | None = None


class CompleteSignupRequest(BaseModel):
    display_name: str


@router.post("/validate-domain", response_model=ValidateDomainResponse)
async def validate_domain(body: ValidateDomainRequest):
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

    if not result.data:
        return ValidateDomainResponse(valid=False)

    return ValidateDomainResponse(
        valid=True,
        college_id=result.data["id"],
        college_name=result.data["name"],
    )


@router.post("/complete-signup")
async def complete_signup(
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
    if existing.data:
        raise HTTPException(status_code=409, detail="Student profile already exists")

    user_resp = supabase.auth.admin.get_user_by_id(current_user.id)
    email = user_resp.user.email
    domain = email.split("@")[-1]

    college_resp = (
        supabase.table("colleges")
        .select("id")
        .eq("email_domain", domain)
        .single()
        .execute()
    )

    supabase.table("students").insert({
        "id": current_user.id,
        "college_id": college_resp.data["id"],
        "display_name": body.display_name,
    }).execute()

    return {"success": True}
