import pytest


@pytest.mark.asyncio
async def test_validate_domain_missing_at(client):
    # Malformed email -> 400, no DB lookup needed.
    res = await client.post("/auth/validate-domain", json={"email": "not-an-email"})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_waitlist_requires_email(client):
    res = await client.post("/auth/waitlist", json={"email": "not-an-email"})
    assert res.status_code == 400
