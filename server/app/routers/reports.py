from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_supabase
from app.middleware.auth import CurrentUser, get_current_user
from app.constants import REPORT_TARGET_TYPES

router = APIRouter()


class CreateReportRequest(BaseModel):
    target_type: str
    target_id: str
    reason: str


@router.post("")
async def create_report(
    body: CreateReportRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    if body.target_type not in REPORT_TARGET_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid target type: {body.target_type}")
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required")

    supabase = get_supabase()

    result = supabase.table("reports").insert({
        "reporter_id": current_user.id,
        "target_type": body.target_type,
        "target_id": body.target_id,
        "reason": body.reason.strip(),
    }).execute()

    return result.data[0]
