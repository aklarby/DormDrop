import pytest


@pytest.mark.asyncio
async def test_listings_requires_auth(client):
    # Without a bearer token the auth middleware should 401.
    res = await client.get("/listings")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_listings_create_requires_auth(client):
    res = await client.post("/listings", json={
        "title": "Test", "category": "electronics", "condition": "good",
        "price_cents": 100, "photos": [{"order": 0, "path": "x/y.jpg"}],
    })
    assert res.status_code == 401
