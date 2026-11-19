from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, desc, asc, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import (
    Expense,
    ExpenseStatus,
    Reimbursement,
    ReimbursementStatus,
    User,
    UserRole
)
from app.schemas import ReimbursementCreate, ReimbursementOut
from app.services.idempotency import IdempotencyService
from app.services.refund_provider import MockRefundProvider, RefundProviderError
from app.api.v1.deps import require_role, log_audit_event, get_current_user

router = APIRouter(prefix="/reimbursements", tags=["Reimbursements"])


@router.get("", response_model=List[ReimbursementOut])
async def list_reimbursements(
    status_filter: Optional[ReimbursementStatus] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("created_at"),
    sort_order: Optional[str] = Query("desc"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List reimbursement transactions.
    - Employees see reimbursements for their own claims.
    - Finance and Admins see all reimbursements enterprise-wide.
    Supports status filter, search by ID / idempotency key / claim title, and multi-column sorting.
    """
    query = select(Reimbursement).join(
        Expense, Reimbursement.expense_id == Expense.id, isouter=True
    ).options(
        selectinload(Reimbursement.expense).selectinload(Expense.submitter)
    )

    # RBAC filtering: Employees only view their own claims' reimbursements
    if current_user.role == UserRole.EMPLOYEE:
        query = query.where(Expense.submitted_by == current_user.id)

    if status_filter:
        query = query.where(Reimbursement.status == status_filter)

    if search and search.strip():
        search_fmt = f"%{search.strip()}%"
        query = query.where(
            or_(
                Reimbursement.id.ilike(search_fmt),
                Reimbursement.idempotency_key.ilike(search_fmt),
                Reimbursement.expense_id.ilike(search_fmt),
                Expense.title.ilike(search_fmt)
            )
        )

    sort_col_map = {
        "created_at": Reimbursement.created_at,
        "amount": Reimbursement.amount,
        "disbursed_at": Reimbursement.disbursed_at,
        "status": Reimbursement.status
    }
    sort_col = sort_col_map.get(sort_by or "created_at", Reimbursement.created_at)
    if sort_order == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))

    result = await db.execute(query)
    reimbursements = result.scalars().all()

    for r in reimbursements:
        if r.expense:
            r.expense_title = r.expense.title
            if r.expense.submitter:
                r.submitter_name = r.expense.submitter.full_name

    return reimbursements


@router.post("", response_model=ReimbursementOut, status_code=status.HTTP_201_CREATED)
async def create_reimbursement(
    data: ReimbursementCreate,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.FINANCE])),
    db: AsyncSession = Depends(get_db)
):
    """
    Disburse payout for an APPROVED expense.
    Guaranteed financial idempotency via Redis distributed locks and unique keys.
    """
    lock_key = f"disburse:{data.expense_id}"
    acquired = await IdempotencyService.acquire_lock(lock_key, ttl_seconds=30)
    if not acquired:
        raise HTTPException(
            status_code=409,
            detail="A disbursement transaction is currently in progress for this claim. Please wait."
        )

    try:
        # Check if idempotency key already exists
        existing_key = await db.execute(
            select(Reimbursement).where(Reimbursement.idempotency_key == data.idempotency_key)
        )
        if existing_key.scalars().first():
            raise HTTPException(
                status_code=409,
                detail="Duplicate transaction detected: Idempotency key has already been processed."
            )

        # Fetch expense with submitter
        exp_res = await db.execute(
            select(Expense)
            .options(selectinload(Expense.submitter))
            .where(Expense.id == data.expense_id)
        )
        expense = exp_res.scalars().first()
        if not expense:
            raise HTTPException(status_code=404, detail="Expense claim not found.")

        if expense.status != ExpenseStatus.APPROVED:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot disburse payout: Expense must be in APPROVED status (currently '{expense.status}')."
            )

        # Enforce that employee has configured bank details in their profile
        submitter = expense.submitter
        bd = submitter.bank_details if submitter and isinstance(submitter.bank_details, dict) else {}
        has_bank_details = bool(
            (bd.get("account_number") and (bd.get("ifsc_code") or bd.get("bank_name"))) or
            bd.get("upi_id")
        )
        if not has_bank_details:
            emp_name = submitter.full_name if submitter else "The employee"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot disburse payout: {emp_name} has not provided bank account or UPI details in their profile. "
                    "The employee must update their profile bank details before disbursement can be initiated."
                )
            )

        # Check if already has reimbursement
        existing_reimb = await db.execute(
            select(Reimbursement).where(Reimbursement.expense_id == expense.id)
        )
        if existing_reimb.scalars().first():
            raise HTTPException(status_code=400, detail="Reimbursement already exists for this expense.")

        reimbursement = Reimbursement(
            expense_id=expense.id,
            processed_by=current_user.id,
            amount=expense.amount,
            currency=expense.currency,
            status=ReimbursementStatus.PROCESSING,
            idempotency_key=data.idempotency_key,
            retry_count=0
        )
        db.add(reimbursement)
        await db.flush()

        # Call Refund Provider
        try:
            status_result, provider_resp = await MockRefundProvider.disburse(
                expense_id=expense.id,
                amount=float(expense.amount),
                currency=expense.currency,
                idempotency_key=data.idempotency_key
            )
            reimbursement.status = ReimbursementStatus(status_result)
            reimbursement.provider_response = provider_resp

            if status_result == "COMPLETED":
                reimbursement.disbursed_at = datetime.now(timezone.utc)
                expense.status = ExpenseStatus.REIMBURSED

        except RefundProviderError as e:
            reimbursement.status = ReimbursementStatus.FAILED
            reimbursement.provider_response = {"error": str(e), "can_retry": e.can_retry}

        await db.flush()

        await log_audit_event(
            db=db,
            actor_id=current_user.id,
            entity_type="REIMBURSEMENT",
            entity_id=reimbursement.id,
            action="DISBURSE",
            new_values={
                "amount": str(reimbursement.amount),
                "status": reimbursement.status.value,
                "idempotency_key": reimbursement.idempotency_key
            },
            ip_address=request.client.host if request.client else None
        )

        return reimbursement

    finally:
        await IdempotencyService.release_lock(lock_key)


@router.post("/{reimbursement_id}/retry", response_model=ReimbursementOut)
async def retry_reimbursement(
    reimbursement_id: str,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.FINANCE])),
    db: AsyncSession = Depends(get_db)
):
    """Retry a failed reimbursement payout"""
    result = await db.execute(
        select(Reimbursement).where(Reimbursement.id == reimbursement_id)
    )
    reimb = result.scalars().first()
    if not reimb:
        raise HTTPException(status_code=404, detail="Reimbursement record not found.")

    if reimb.status == ReimbursementStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Reimbursement has already completed successfully.")

    # Check if employee has valid bank details before retry
    exp_res = await db.execute(
        select(Expense).options(selectinload(Expense.submitter)).where(Expense.id == reimb.expense_id)
    )
    expense_obj = exp_res.scalars().first()
    if expense_obj and expense_obj.submitter:
        bd = expense_obj.submitter.bank_details if isinstance(expense_obj.submitter.bank_details, dict) else {}
        has_bank_details = bool(
            (bd.get("account_number") and (bd.get("ifsc_code") or bd.get("bank_name"))) or
            bd.get("upi_id")
        )
        if not has_bank_details:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot retry payout: {expense_obj.submitter.full_name} does not have valid bank account or UPI details in their profile."
            )

    reimb.retry_count += 1
    reimb.status = ReimbursementStatus.PROCESSING

    try:
        status_result, provider_resp = await MockRefundProvider.disburse(
            expense_id=reimb.expense_id,
            amount=float(reimb.amount),
            currency=reimb.currency,
            idempotency_key=f"{reimb.idempotency_key}-retry-{reimb.retry_count}"
        )
        reimb.status = ReimbursementStatus(status_result)
        reimb.provider_response = provider_resp

        if status_result == "COMPLETED":
            reimb.disbursed_at = datetime.now(timezone.utc)
            exp_res = await db.execute(select(Expense).where(Expense.id == reimb.expense_id))
            exp = exp_res.scalars().first()
            if exp:
                exp.status = ExpenseStatus.REIMBURSED

    except RefundProviderError as e:
        reimb.status = ReimbursementStatus.FAILED
        reimb.provider_response = {"error": str(e), "retry_attempt": reimb.retry_count}

    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="REIMBURSEMENT",
        entity_id=reimb.id,
        action="RETRY",
        new_values={"status": reimb.status.value, "retry_count": reimb.retry_count},
        ip_address=request.client.host if request.client else None
    )

    return reimb
