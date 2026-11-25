import pytest
from app.core.rate_limiter import rate_limiter, AUTH_RULE, AI_UPLOAD_RULE, EXPORT_PAYOUT_RULE, GENERAL_RULE


@pytest.fixture(autouse=True)
def reset_rate_limiter_state():
    rate_limiter.reset_memory()
    rate_limiter.enabled_in_tests = False
    yield
    rate_limiter.reset_memory()
    rate_limiter.enabled_in_tests = False


@pytest.mark.asyncio
async def test_rate_limiter_tier_classification():
    assert rate_limiter.classify_request("/api/v1/auth/login", "POST") == AUTH_RULE
    assert rate_limiter.classify_request("/api/v1/auth/register", "POST") == AUTH_RULE
    assert rate_limiter.classify_request("/api/v1/receipts/analyze", "POST") == AI_UPLOAD_RULE
    assert rate_limiter.classify_request("/api/v1/receipts/upload", "POST") == AI_UPLOAD_RULE
    assert rate_limiter.classify_request("/api/v1/expenses/export", "GET") == EXPORT_PAYOUT_RULE
    assert rate_limiter.classify_request("/api/v1/reimbursements", "POST") == EXPORT_PAYOUT_RULE
    assert rate_limiter.classify_request("/api/v1/expenses", "GET") == GENERAL_RULE
    assert rate_limiter.classify_request("/health", "GET") is None
    assert rate_limiter.classify_request("/api/v1/expenses", "OPTIONS") is None


@pytest.mark.asyncio
async def test_auth_rate_limit_enforces_429_and_per_ip_isolation(client):
    """
    Auth endpoints are strictly capped at 10 requests/min per IP.
    11th request from same IP must return 429 with Retry-After & X-RateLimit-* headers.
    A different IP must still be allowed.
    """
    rate_limiter.enabled_in_tests = True

    ip_a_headers = {"x-forwarded-for": "203.0.113.10"}
    for i in range(10):
        res = await client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@example.com", "password": "wrongpassword"},
            headers=ip_a_headers,
        )
        assert res.status_code != 429
        assert res.headers.get("X-RateLimit-Limit") == "10"
        assert res.headers.get("X-RateLimit-Remaining") == str(9 - i)

    # 11th request from IP A must be throttled
    blocked = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "wrongpassword"},
        headers=ip_a_headers,
    )
    assert blocked.status_code == 429
    assert int(blocked.headers.get("Retry-After", "0")) >= 1
    assert blocked.headers.get("X-RateLimit-Remaining") == "0"
    assert "Rate limit exceeded" in blocked.json()["detail"]

    # Request from IP B must succeed (isolated bucket)
    ip_b_headers = {"x-forwarded-for": "203.0.113.99"}
    other_ip_res = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "wrongpassword"},
        headers=ip_b_headers,
    )
    assert other_ip_res.status_code != 429
    assert other_ip_res.headers.get("X-RateLimit-Remaining") == "9"


@pytest.mark.asyncio
async def test_health_endpoint_exempt_from_rate_limit(client):
    rate_limiter.enabled_in_tests = True
    for _ in range(15):
        res = await client.get("/health", headers={"x-forwarded-for": "198.51.100.5"})
        assert res.status_code == 200
        assert "X-RateLimit-Limit" not in res.headers
