import asyncio
from typing import Optional
import redis.asyncio as aioredis
from app.core.config import settings

# Global redis client connection
_redis_pool: Optional[aioredis.Redis] = None
# In-memory lock fallback when Redis is not running
_in_memory_locks: set[str] = set()
_in_memory_mutex = asyncio.Lock()


async def get_redis() -> Optional[aioredis.Redis]:
    global _redis_pool
    if _redis_pool is None:
        try:
            _redis_pool = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await _redis_pool.ping()
        except Exception:
            _redis_pool = None
    return _redis_pool


class IdempotencyService:
    """
    Guarantees that sensitive financial operations (disbursements, approvals)
    cannot be executed twice concurrently or repeatedly.
    """

    @staticmethod
    async def acquire_lock(lock_key: str, ttl_seconds: int = 30) -> bool:
        """
        Acquire distributed lock for a financial operation.
        Returns True if acquired, False if already locked.
        """
        r = await get_redis()
        if r:
            try:
                # Redis SETNX with TTL
                acquired = await r.set(f"lock:{lock_key}", "locked", nx=True, ex=ttl_seconds)
                return bool(acquired)
            except Exception:
                pass

        # Fallback to local in-memory lock
        async with _in_memory_mutex:
            if lock_key in _in_memory_locks:
                return False
            _in_memory_locks.add(lock_key)
            return True

    @staticmethod
    async def release_lock(lock_key: str) -> None:
        """Release the idempotency lock"""
        r = await get_redis()
        if r:
            try:
                await r.delete(f"lock:{lock_key}")
                return
            except Exception:
                pass

        async with _in_memory_mutex:
            _in_memory_locks.discard(lock_key)
