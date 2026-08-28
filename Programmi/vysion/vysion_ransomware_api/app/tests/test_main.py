import json

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app

client = TestClient(app)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_read_main():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/")
    assert response.status_code == 200
    assert response.json() == "Check developers.vysion.ai ;)"


@pytest.mark.anyio
async def test_ransomware_feed():
    async with AsyncClient(base_url="http://127.0.0.1:8000") as ac:
        response = await ac.get("/api/v1/feed/ransomware?batch=2022-06-20")
    assert response.status_code == 200
    file = str("app/tests/ransomware_feed.json")
    with open(file) as f:
        raw_data = json.load(f)
    assert response.json() == raw_data
