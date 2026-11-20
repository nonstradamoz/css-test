import hashlib
import time
from typing import Optional, Dict
from fastapi import HTTPException, status
from app.core.config import settings

# In-memory revocation cache for development or testing: Dict[token_hash, expires_at_timestamp]
# Finding 3: Expired entries are automatically purged to prevent memory leaks.
_in_memory_revoked: Dict[str, float] = {}


def _get_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _cleanup_expired_in_memory() -> None:
    """Purge expired token hashes from in-memory cache (Finding 3)"""
    now = time.time()
    expired_keys = [k for k, exp in _in_memory_revoked.items() if exp <= now]
    for k in expired_keys:
        _in_memory_revoked.pop(k, None)


async def revoke_access_token(token: str, expires_in_seconds: int = 900) -> None:
    """
    Revoke an active access token by storing its SHA-256 fingerprint
    in Redis with an automatic TTL matching the token's lifetime.
    Finding 1: In production, requires REDIS_URL and fails closed (HTTP 503) if missing or unreachable.
    In-memory fallback is strictly disabled in production.
    """
    if not token or not token.strip():
        return

    token_hash = _get_token_hash(token.strip())
    is_prod = settings.ENVIRONMENT == "production"

    if is_prod:
        if not settings.REDIS_URL or not settings.REDIS_URL.strip():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Redis revocation store is required in production. Token revocation rejected."
            )
        try:
            import redis.asyncio as aioredis
            client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            async with client:
                await client.set(f"token_blocklist:{token_hash}", "revoked", ex=max(60, expires_in_seconds))
                return
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Token revocation service temporarily unavailable. Revocation cannot be guaranteed across workers."
            )

    # Development / testing fallback (in-memory with automatic expiration)
    try:
        if settings.REDIS_URL:
            import redis.asyncio as aioredis
            client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            async with client:
                await client.set(f"token_blocklist:{token_hash}", "revoked", ex=max(60, expires_in_seconds))
                return
    except Exception:
        pass

    _cleanup_expired_in_memory()
    _in_memory_revoked[token_hash] = time.time() + max(60, expires_in_seconds)


async def is_token_revoked(token: str) -> bool:
    """
    Check if an access token has been revoked / blacklisted.
    Finding 1: In production, requires REDIS_URL and fails closed (HTTP 503) if missing or unreachable.
    In-memory fallback is strictly disabled in production.
    """
    if not token or not token.strip():
        return True

    token_hash = _get_token_hash(token.strip())
    is_prod = settings.ENVIRONMENT == "production"

    if is_prod:
        if not settings.REDIS_URL or not settings.REDIS_URL.strip():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Redis revocation store is required in production."
            )
        try:
            import redis.asyncio as aioredis
            client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            async with client:
                val = await client.get(f"token_blocklist:{token_hash}")
                return val is not None
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Token revocation verification service temporarily unavailable."
            )

    # In development/test mode: check memory first, then Redis
    _cleanup_expired_in_memory()
    if token_hash in _in_memory_revoked:
        return True

    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        async with client:
            val = await client.get(f"token_blocklist:{token_hash}")
            return val is not None
    except Exception:
        return False
