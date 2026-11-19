from datetime import timedelta
from decimal import Decimal
from typing import Optional, Tuple
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Expense, ExpenseStatus


class DuplicateDetector:
    """
    Checks for potential duplicate expense submissions:
    1. Exact receipt hash match (high confidence duplicate)
    2. Same submitter, exact amount, within 24 hours (potential duplicate)
    """

    @staticmethod
    async def check_duplicate(
        db: AsyncSession,
        submitted_by: str,
        amount: Decimal,
        expense_date,
        receipt_hash: Optional[str] = None,
        exclude_expense_id: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        # Non-terminal statuses where collision matters
        active_statuses = [
            ExpenseStatus.SUBMITTED,
            ExpenseStatus.UNDER_REVIEW,
            ExpenseStatus.APPROVED,
            ExpenseStatus.REIMBURSED
        ]

        # 1. Exact receipt hash check
        if receipt_hash:
            query = select(Expense).where(
                and_(
                    Expense.receipt_hash == receipt_hash,
                    Expense.status.in_(active_statuses)
                )
            )
            if exclude_expense_id:
                query = query.where(Expense.id != exclude_expense_id)
            
            result = await db.execute(query)
            existing = result.scalars().first()
            if existing:
                return True, f"Duplicate receipt detected! Matches existing expense '{existing.title}' (ID: {existing.id[:8]})."

        # 2. Same submitter, same amount, within +/- 24 hours
        time_window_start = expense_date - timedelta(hours=24)
        time_window_end = expense_date + timedelta(hours=24)

        query = select(Expense).where(
            and_(
                Expense.submitted_by == submitted_by,
                Expense.amount == amount,
                Expense.expense_date.between(time_window_start, time_window_end),
                Expense.status.in_(active_statuses)
            )
        )
        if exclude_expense_id:
            query = query.where(Expense.id != exclude_expense_id)

        result = await db.execute(query)
        existing = result.scalars().first()
        if existing:
            return True, f"Warning: An identical claim of amount ₹{amount} was already submitted by you within 24 hours (ID: {existing.id[:8]})."

        return False, None
