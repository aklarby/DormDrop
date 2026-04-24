import ssl
from dataclasses import dataclass
from functools import lru_cache
from fastapi import Depends, HTTPException, Request
import certifi
import jwt
from jwt import PyJWKClient

from app.config import Settings, get_settings
from app.dependencies import get_supabase


@dataclass
class CurrentUser:
    id: str
    college_id: str | None = None
    is_active: bool = True
    role: str = "student"


@lru_cache
def _get_jwk_client(jwks_url: str) -> PyJWKClient:
    ctx = ssl.create_default_context(cafile=certifi.where())
    return PyJWKClient(jwks_url, cache_keys=True, lifespan=3600, ssl_context=ctx)


async def get_current_user(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = auth_header.split(" ", 1)[1]

    try:
        jwk_client = _get_jwk_client(settings.supabase_jwks_url)
        signing_key = jwk_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
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
    # role column is added by the W2 admin migration; tolerate older schemas.
    try:
        result = (
            supabase.table("students")
            .select("college_id, is_active, role")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception:
        result = (
            supabase.table("students")
            .select("college_id, is_active")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )

    college_id: str | None = None
    is_active = True
    role = "student"
    if result and result.data:
        college_id = result.data.get("college_id")
        is_active = bool(result.data.get("is_active", True))
        role = result.data.get("role", "student") or "student"

    if not is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    return CurrentUser(id=user_id, college_id=college_id, is_active=is_active, role=role)


def require_college_member(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Dependency: ensures the caller has completed signup and is at a college.

    Replaces the scattered `if not current_user.college_id` checks across routers.
    """
    if not current_user.college_id:
        raise HTTPException(status_code=403, detail="Complete your profile first")
    return current_user


def require_admin(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
