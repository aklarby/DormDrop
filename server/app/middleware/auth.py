from dataclasses import dataclass
from fastapi import Depends, HTTPException, Request
import jwt

from app.config import Settings, get_settings
from app.dependencies import get_supabase


@dataclass
class CurrentUser:
    id: str
    college_id: str | None = None


async def get_current_user(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = auth_header.split(" ", 1)[1]

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    supabase = get_supabase()
    result = supabase.table("students").select("college_id").eq("id", user_id).maybe_single().execute()
    college_id = result.data["college_id"] if result.data else None

    return CurrentUser(id=user_id, college_id=college_id)
