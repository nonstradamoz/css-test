from datetime import timedelta
from decimal import Decimal
from typing import Optional, Tuple
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Expense, ExpenseStatus


class DuplicateDetector:
    """
    Checks for potential duplicate expense submissions across all users:
    1. Exact receipt hash match (high confidence duplicate across ANY user)
    2. Identical title/merchant + amount + date match across ANY user
    3. Same submitter, exact amount, within 24 hours (velocity duplicate)
    """

    @staticmethod
    async def check_duplicate(
        db: AsyncSession,
        submitted_by: str,
        amount: Decimal,
        expense_date,
        receipt_hash: Optional[str] = None,
        title: Optional[str] = None,
        exclude_expense_id: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        # Non-terminal statuses where collision matters
        active_statuses = [
            ExpenseStatus.SUBMITTED,
            ExpenseStatus.UNDER_REVIEW,
            ExpenseStatus.APPROVED,
            ExpenseStatus.REIMBURSED
        ]

        # 1. Exact receipt hash check across ALL users
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
                if existing.submitted_by != submitted_by:
                    return True, f"Duplicate receipt detected! This receipt was already submitted by another user in Claim '{existing.title}' (ID: {existing.id[:8]})."
                return True, f"Duplicate receipt detected! Matches existing expense '{existing.title}' (ID: {existing.id[:8]})."

        # 2. Same title/merchant + amount within +/- 24 hours across ALL users
        time_window_start = expense_date - timedelta(hours=24)
        time_window_end = expense_date + timedelta(hours=24)

        if title and title.strip():
            title_clean = title.strip().lower()
            query_title = select(Expense).where(
                and_(
                    func.lower(Expense.title) == title_clean,
                    Expense.amount == amount,
                    Expense.expense_date.between(time_window_start, time_window_end),
                    Expense.status.in_(active_statuses)
                )
            )
            if exclude_expense_id:
                query_title = query_title.where(Expense.id != exclude_expense_id)

            res_title = await db.execute(query_title)
            existing_title = res_title.scalars().first()
            if existing_title:
                if existing_title.submitted_by != submitted_by:
                    return True, f"Prohibited duplicate expense: An identical claim '{existing_title.title}' for ₹{amount} on this date was already submitted by another user (ID: {existing_title.id[:8]})."
                return True, f"Duplicate expense detected: An identical claim of amount ₹{amount} was already submitted by you within 24 hours (ID: {existing_title.id[:8]})."

        # 3. Same submitter, same amount, within +/- 24 hours
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
