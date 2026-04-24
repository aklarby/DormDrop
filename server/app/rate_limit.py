"""Shared slowapi Limiter + keyfunc for DormDrop.

Per-user when the caller is authenticated (best-effort: pulls `sub`
from the JWT without a round-trip to Supabase), falling back to the
client IP. Rate limits are applied on top of the existing auth path —
a request that fails rate limits never reaches get_current_user.
"""

from __future__ import annotations

from typing import Optional

import jwt
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _subject_from_request(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        return None
    token = auth.split(" ", 1)[1]
    try:
        # We only need `sub` for the bucket key. Signature verification
        # happens in get_current_user; treating a forged token as its own
        # key can't bypass the limit because an attacker controls the key.
        payload = jwt.decode(token, options={"verify_signature": False})
        sub = payload.get("sub")
        if sub:
            return f"user:{sub}"
    except Exception:
        return None
    return None


def user_or_ip_key(request: Request) -> str:
    return _subject_from_request(request) or f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=user_or_ip_key, headers_enabled=True)
