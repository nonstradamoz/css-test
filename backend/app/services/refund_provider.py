import asyncio
import uuid
from typing import Dict, Any, Tuple
from app.core.config import settings


class RefundProviderError(Exception):
    def __init__(self, message: str, can_retry: bool = True):
        super().__init__(message)
        self.message = message
        self.can_retry = can_retry


class MockRefundProvider:
    """
    Pluggable Refund Provider interface.
    Simulates enterprise banking / payout gateway outcomes:
    - SUCCESS: Immediate completed settlement
    - FAILURE: Permanent or terminal bank decline
    - TIMEOUT: Gateway timeout / network error that requires Celery background retry
    """

    @staticmethod
    async def disburse(
        expense_id: str,
        amount: float,
        currency: str,
        idempotency_key: str
    ) -> Tuple[str, Dict[str, Any]]:
        outcome = settings.MOCK_REFUND_OUTCOME.upper()

        # Simulate small network latency
        await asyncio.sleep(0.1)

        txn_id = f"txn_{uuid.uuid4().hex[:12]}"

        if outcome == "SUCCESS":
            return "COMPLETED", {
                "transaction_id": txn_id,
                "provider": "MockBankGateway",
                "status": "SETTLED",
                "amount": amount,
                "currency": currency,
                "idempotency_key": idempotency_key,
                "message": "Funds successfully disbursed to recipient account."
            }
        
        elif outcome == "FAILURE":
            return "FAILED", {
                "transaction_id": txn_id,
                "provider": "MockBankGateway",
                "status": "DECLINED",
                "error_code": "ACCOUNT_INVALID",
                "idempotency_key": idempotency_key,
                "message": "Disbursement declined by recipient receiving bank."
            }
            
        elif outcome == "TIMEOUT":
            raise RefundProviderError("Gateway connection timed out. Queued for automatic retry.", can_retry=True)

        return "COMPLETED", {
            "transaction_id": txn_id,
            "provider": "MockBankGateway",
            "status": "SETTLED"
        }
