import asyncio
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque, Dict, Optional, Tuple
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.services.idempotency import IdempotencyService


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    limit: int
    window_seconds: int = 60


AUTH_RULE = RateLimitRule(name="auth", limit=10, window_seconds=60)
AI_UPLOAD_RULE = RateLimitRule(name="ai_upload", limit=20, window_seconds=60)
EXPORT_PAYOUT_RULE = RateLimitRule(name="export_payout", limit=30, window_seconds=60)
GENERAL_RULE = RateLimitRule(name="general", limit=120, window_seconds=60)

EXEMPT_PATHS = {"/", "/health", "/docs", "/redoc", "/openapi.json"}


class RateLimiter:
    """
    Sliding-window API rate limiter backed by Redis with an asyncio-safe
    in-memory fallback when Redis is unavailable.
    """

    def __init__(self) -> None:
        self._memory_buckets: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()
        self.enabled_in_tests: bool = False

    def reset_memory(self) -> None:
        self._memory_buckets.clear()

    @staticmethod
    def classify_request(path: str, method: str) -> Optional[RateLimitRule]:
        if method == "OPTIONS" or path in EXEMPT_PATHS or path.startswith("/docs"):
            return None

        normalized = path.lower()
        # Auth endpoints (strict IP-based brute-force protection)
        if any(seg in normalized for seg in ("/auth/login", "/auth/register", "/auth/google")):
            return AUTH_RULE

        # AI / OCR & receipt upload endpoints
        if any(seg in normalized for seg in ("/receipts/analyze", "/receipts/upload", "/receipts/presigned-upload")):
            return AI_UPLOAD_RULE

        # Heavy export & financial payout endpoints
        if "/expenses/export" in normalized or (normalized.endswith("/reimbursements") and method == "POST"):
            return EXPORT_PAYOUT_RULE

        return GENERAL_RULE

    @staticmethod
    def extract_client_identity(request: Request, rule: RateLimitRule) -> str:
        forwarded_for = request.headers.get("x-forwarded-for")
        client_ip = (
            forwarded_for.split(",")[0].strip()
            if forwarded_for
            else (request.client.host if request.client else "unknown")
        )

        # For non-auth endpoints, key by authenticated JWT subject when available
        if rule.name != "auth":
            auth_header = request.headers.get("authorization", "")
            if auth_header.lower().startswith("bearer "):
                token = auth_header[7:].strip()
                if token:
                    try:
                        from app.core.security import decode_token
                        payload = decode_token(token)
                        if payload and payload.get("sub"):
                            return f"user:{payload['sub']}"
                    except Exception:
                        pass

        return f"ip:{client_ip}"

    async def check(self, key: str, rule: RateLimitRule) -> Tuple[bool, int, int, int]:
        """
        Check & record a hit for `key` under `rule`.
        Returns: (allowed, limit, remaining, reset_epoch_seconds)
        """
        now = time.time()
        window_start = now - rule.window_seconds

        # Try Redis sliding-window (sorted set) first
        try:
            redis_client = await IdempotencyService.get_redis()
            if redis_client is not None:
                redis_key = f"rl:{rule.name}:{key}"
                member = f"{now:.6f}:{id(now)}"
                pipe = redis_client.pipeline()
                pipe.zremrangebyscore(redis_key, 0, window_start)
                pipe.zcard(redis_key)
                pipe.zadd(redis_key, {member: now})
                pipe.expire(redis_key, rule.window_seconds + 1)
                results = await pipe.execute()
                current_count = int(results[1])

                if current_count >= rule.limit:
                    # Remove the optimistic entry we just added so blocked hits don't extend penalty
                    await redis_client.zrem(redis_key, member)
                    oldest = await redis_client.zrange(redis_key, 0, 0, withscores=True)
                    reset_at = int(math.ceil((oldest[0][1] if oldest else now) + rule.window_seconds))
                    return False, rule.limit, 0, reset_at

                remaining = max(0, rule.limit - (current_count + 1))
                reset_at = int(math.ceil(now + rule.window_seconds))
                return True, rule.limit, remaining, reset_at
        except Exception:
            # Fall back to in-memory limiter seamlessly
            pass

        async with self._lock:
            bucket = self._memory_buckets[f"{rule.name}:{key}"]
            while bucket and bucket[0] <= window_start:
                bucket.popleft()

            if len(bucket) >= rule.limit:
                reset_at = int(math.ceil(bucket[0] + rule.window_seconds))
                return False, rule.limit, 0, reset_at

            bucket.append(now)
            remaining = max(0, rule.limit - len(bucket))
            reset_at = int(math.ceil(bucket[0] + rule.window_seconds))
            return True, rule.limit, remaining, reset_at


rate_limiter = RateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        is_test_env = settings.ENVIRONMENT == "test"
        force_header = request.headers.get("x-enable-rate-limit", "").lower() == "true"
        if is_test_env and not (rate_limiter.enabled_in_tests or force_header):
            return await call_next(request)

        rule = rate_limiter.classify_request(request.url.path, request.method)
        if rule is None:
            return await call_next(request)

        identity = rate_limiter.extract_client_identity(request, rule)
        allowed, limit, remaining, reset_at = await rate_limiter.check(identity, rule)

        if not allowed:
            retry_after = max(1, reset_at - int(time.time()))
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded ({rule.name}: max {limit} requests per {rule.window_seconds}s). Please retry in {retry_after} seconds."
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_at),
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_at)
        return response
