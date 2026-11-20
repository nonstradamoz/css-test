import hashlib
import time
from typing import Optional, Set
from app.core.config import settings

# In-memory revocation cache for development or Redis fallback
_in_memory_revoked: Set[str] = set()


def _get_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def revoke_access_token(token: str, expires_in_seconds: int = 900) -> None:
    """
    Revoke an active access token by storing its SHA-256 fingerprint
    in Redis with an automatic TTL matching the token's lifetime.
    """
    if not token or not token.strip():
        return

    token_hash = _get_token_hash(token.strip())

    try:
        import redis.asyncio as aioredis
        client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        async with client:
            await client.set(f"token_blocklist:{token_hash}", "revoked", ex=max(60, expires_in_seconds))
            return
    except Exception as e:
        # Graceful fallback to memory set
        pass

    _in_memory_revoked.add(token_hash)


async def is_token_revoked(token: str) -> bool:
    """
    Check if an access token has been revoked / blacklisted.
    """
    if not token or not token.strip():
        return True

    token_hash = _get_token_hash(token.strip())

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
