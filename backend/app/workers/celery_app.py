import asyncio
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "crs_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1
)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_async_disbursement(self, reimbursement_id: str):
    """
    Background worker task to process payout retries with exponential backoff.
    """
    from app.core.database import AsyncSessionLocal
    from app.models import Reimbursement, ReimbursementStatus, Expense, ExpenseStatus
    from app.services.refund_provider import MockRefundProvider, RefundProviderError
    from sqlalchemy import select

    async def _run():
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Reimbursement).where(Reimbursement.id == reimbursement_id)
            )
            reimb = result.scalars().first()
            if not reimb or reimb.status == ReimbursementStatus.COMPLETED:
                return

            try:
                status, response = await MockRefundProvider.disburse(
                    expense_id=reimb.expense_id,
                    amount=float(reimb.amount),
                    currency=reimb.currency,
                    idempotency_key=reimb.idempotency_key
                )
                reimb.status = ReimbursementStatus(status)
                reimb.provider_response = response
                if status == "COMPLETED":
                    from datetime import datetime, timezone
                    reimb.disbursed_at = datetime.now(timezone.utc)
                    # Update expense status to REIMBURSED
                    exp_result = await session.execute(
                        select(Expense).where(Expense.id == reimb.expense_id)
                    )
                    exp = exp_result.scalars().first()
                    if exp:
                        exp.status = ExpenseStatus.REIMBURSED

                await session.commit()

            except RefundProviderError as e:
                reimb.retry_count += 1
                await session.commit()
                if e.can_retry and self.request.retries < self.max_retries:
                    countdown = 2 ** self.request.retries * 30  # Exponential backoff
                    raise self.retry(exc=e, countdown=countdown)
                else:
                    reimb.status = ReimbursementStatus.FAILED
                    reimb.provider_response = {"error": str(e), "failed_permanently": True}
                    await session.commit()

    loop = asyncio.get_event_loop()
    if loop.is_running():
        asyncio.create_task(_run())
    else:
        loop.run_until_complete(_run())
