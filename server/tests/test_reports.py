import pytest


@pytest.mark.asyncio
async def test_reports_requires_auth(client):
    res = await client.post("/reports", json={
        "target_type": "listing",
        "target_id": "00000000-0000-0000-0000-000000000000",
        "reason": "spam",
    })
    assert res.status_code == 401
