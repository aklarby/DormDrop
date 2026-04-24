"""Pytest fixtures. We stub Supabase with a lightweight fake so unit tests
don't need a real project. Integration tests that hit a real Supabase are
opt-in via RUN_INTEGRATION=1."""

from __future__ import annotations

import os
import types
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient


# ---------------------------------------------------------------------------
# Environment defaults so get_settings() doesn't explode when no .env is present.
# ---------------------------------------------------------------------------
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SECRET_KEY", "test-service-role-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")


# ---------------------------------------------------------------------------
# FakeSupabase: a tiny in-memory stand-in for the tests that need it.
# ---------------------------------------------------------------------------
@dataclass
class _Result:
    data: Any = None
    count: int | None = None


@dataclass
class _Query:
    rows: list[dict] = field(default_factory=list)
    limit_n: int | None = None
    last: dict[str, Any] = field(default_factory=dict)

    def select(self, *args, **kwargs) -> "_Query":
        return self

    def eq(self, _key: str, _val: Any) -> "_Query":
        return self

    def neq(self, *_a, **_k) -> "_Query":
        return self

    def in_(self, *_a, **_k) -> "_Query":
        return self

    def gte(self, *_a, **_k) -> "_Query":
        return self

    def lte(self, *_a, **_k) -> "_Query":
        return self

    def lt(self, *_a, **_k) -> "_Query":
        return self

    def ilike(self, *_a, **_k) -> "_Query":
        return self

    def order(self, *_a, **_k) -> "_Query":
        return self

    def limit(self, n: int) -> "_Query":
        self.limit_n = n
        return self

    def or_(self, *_a, **_k) -> "_Query":
        return self

    def text_search(self, *_a, **_k) -> "_Query":
        return self

    def single(self) -> "_Query":
        return self

    def maybe_single(self) -> "_Query":
        return self

    def insert(self, payload: dict) -> "_Query":
        self.last = payload
        self.rows.append(payload)
        return self

    def upsert(self, payload: dict, **_k) -> "_Query":
        self.last = payload
        self.rows.append(payload)
        return self

    def update(self, payload: dict) -> "_Query":
        self.last = payload
        return self

    def delete(self) -> "_Query":
        return self

    def execute(self) -> _Result:
        data = self.rows[: self.limit_n] if self.limit_n else self.rows
        return _Result(data=data)


class _FakeSupabase:
    def __init__(self) -> None:
        self._tables: dict[str, _Query] = {}
        self.last_rpc: dict[str, Any] = {}

    def table(self, name: str) -> _Query:
        self._tables.setdefault(name, _Query())
        return self._tables[name]

    def rpc(self, name: str, params: dict | None = None) -> _Query:
        self.last_rpc = {"name": name, "params": params or {}}
        return _Query(rows=[])


@pytest.fixture
def fake_supabase(monkeypatch: pytest.MonkeyPatch) -> _FakeSupabase:
    fake = _FakeSupabase()

    def get_supabase() -> _FakeSupabase:
        return fake

    # Patch in both the dependencies module and any router that imported it
    # at top level. Import lazily so tests that don't need this fixture
    # don't incur the app import cost.
    from app import dependencies as deps

    monkeypatch.setattr(deps, "get_supabase", get_supabase)

    # Routers bind `from app.dependencies import get_supabase` at import time,
    # so patch there too.
    for module_name in (
        "app.routers.auth",
        "app.routers.listings",
        "app.routers.conversations",
        "app.routers.students",
        "app.routers.reports",
        "app.routers.saved",
        "app.routers.saved_searches",
        "app.routers.blocks",
        "app.routers.offers",
        "app.routers.transactions",
        "app.routers.reviews",
        "app.routers.push",
        "app.routers.admin",
        "app.routers.internal",
    ):
        mod = __import__(module_name, fromlist=["get_supabase"])
        monkeypatch.setattr(mod, "get_supabase", get_supabase, raising=False)

    return fake


@pytest.fixture
async def client(fake_supabase: _FakeSupabase) -> Iterator[AsyncClient]:
    from app.main import app  # lazy import so conftest env is applied first

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


@pytest.fixture
def patch_get_current_user():
    """Swap get_current_user for a dep that returns a fixed CurrentUser."""
    from app.middleware.auth import (
        CurrentUser,
        get_current_user,
        require_admin,
        require_college_member,
    )
    from app.main import app

    def _fake_current_user() -> CurrentUser:
        return CurrentUser(
            id="00000000-0000-0000-0000-000000000001",
            college_id="00000000-0000-0000-0000-000000000002",
            is_active=True,
            role="student",
        )

    def _fake_college_member() -> CurrentUser:
        return _fake_current_user()

    def _fake_admin() -> CurrentUser:
        cu = _fake_current_user()
        cu.role = "admin"
        return cu

    app.dependency_overrides[get_current_user] = _fake_current_user
    app.dependency_overrides[require_college_member] = _fake_college_member
    app.dependency_overrides[require_admin] = _fake_admin
    yield
    app.dependency_overrides.clear()
