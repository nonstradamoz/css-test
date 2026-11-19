import pytest
from app.services.idempotency import IdempotencyService


@pytest.mark.asyncio
async def test_idempotency_lock_acquisition_and_release():
    lock_key = "test-unique-financial-lock-1"

    # First acquisition succeeds
    acq1 = await IdempotencyService.acquire_lock(lock_key, ttl_seconds=10)
    assert acq1 is True

    # Immediate second acquisition fails (contention)
    acq2 = await IdempotencyService.acquire_lock(lock_key, ttl_seconds=10)
    assert acq2 is False

    # Release lock
    await IdempotencyService.release_lock(lock_key)

    # Re-acquisition after release succeeds
    acq3 = await IdempotencyService.acquire_lock(lock_key, ttl_seconds=10)
    assert acq3 is True

    await IdempotencyService.release_lock(lock_key)
