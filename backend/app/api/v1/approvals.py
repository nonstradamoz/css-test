from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, and_, or_, desc, asc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import (
    Expense,
    ExpenseApproval,
    ExpenseStatus,
    User,
    UserRole,
    ApprovalDecision,
    SystemSettings
)
from app.schemas import ApprovalActionRequest, ExpenseOut, ExpenseApprovalOut
from app.services.state_machine import ExpenseStateMachine, StateMachineError
from app.services.notification_service import notify_reviewer_action, notify_admin_action
from app.api.v1.deps import get_current_user, require_role, log_audit_event

router = APIRouter(prefix="/approvals", tags=["Approvals"])


@router.get("/pending", response_model=List[ExpenseOut])
async def list_pending_approvals(
    search: Optional[str] = Query(None),
    category_filter: Optional[str] = Query(None, alias="category"),
    tier: Optional[int] = Query(None, ge=1, le=2),
    sort_by: Optional[str] = Query("created_at"),
    sort_order: Optional[str] = Query("desc"),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.REVIEWER, UserRole.FINANCE])),
    db: AsyncSession = Depends(get_db)
):
    """
    List expense claims awaiting approval matching the reviewer's permission level:
    - REVIEWER: Tier-1 pending claims (status SUBMITTED)
    - FINANCE / ADMIN: Tier-2 pending claims (status UNDER_REVIEW) or filtered by tier
    """
    query = select(Expense).join(
        User, Expense.submitted_by == User.id, isouter=True
    ).options(
        selectinload(Expense.submitter),
        selectinload(Expense.approvals),
        selectinload(Expense.reimbursement)
    )

    if tier == 1:
        query = query.where(Expense.status == ExpenseStatus.SUBMITTED)
    elif tier == 2:
        query = query.where(Expense.status == ExpenseStatus.UNDER_REVIEW)
    elif current_user.role == UserRole.REVIEWER:
        query = query.where(Expense.status == ExpenseStatus.SUBMITTED)
    else:
        query = query.where(
            Expense.status.in_([ExpenseStatus.SUBMITTED, ExpenseStatus.UNDER_REVIEW])
        )

    if category_filter and category_filter != "ALL":
        query = query.where(Expense.category == category_filter.upper())

    if search and search.strip():
        search_fmt = f"%{search.strip()}%"
        query = query.where(
            or_(
                Expense.title.ilike(search_fmt),
                Expense.description.ilike(search_fmt),
                Expense.category.ilike(search_fmt),
                Expense.id.ilike(search_fmt),
                User.full_name.ilike(search_fmt),
                User.email.ilike(search_fmt)
            )
        )

    sort_col_map = {
        "created_at": Expense.created_at,
        "amount": Expense.amount,
        "title": Expense.title,
        "expense_date": Expense.expense_date
    }
    sort_col = sort_col_map.get(sort_by or "created_at", Expense.created_at)
    if sort_order == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))

    result = await db.execute(query)
    expenses = result.scalars().all()

    for exp in expenses:
        if exp.submitter:
            exp.submitter_name = exp.submitter.full_name
            exp.submitter_email = exp.submitter.email

    return expenses


@router.post("/{expense_id}/review", response_model=ExpenseOut)
async def review_expense(
    expense_id: str,
    action: ApprovalActionRequest,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.REVIEWER, UserRole.FINANCE])),
    db: AsyncSession = Depends(get_db)
):
    """
    Execute approval decision on an expense claim:
    - APPROVE: Advances tier or completes approval
    - REJECT: Terminally rejects claim
    - CHANGES_REQUESTED: Sends claim back to employee for modification
    """
    result = await db.execute(
        select(Expense)
        .options(
            selectinload(Expense.submitter),
            selectinload(Expense.approvals),
            selectinload(Expense.reimbursement)
        )
        .where(Expense.id == expense_id)
    )
    expense = result.scalars().first()

    if not expense:
        raise HTTPException(status_code=404, detail="Expense claim not found.")

    # Check Self-Approval constraint
    if expense.submitted_by == current_user.id:
        settings_res = await db.execute(select(SystemSettings).where(SystemSettings.id == 1))
        settings_obj = settings_res.scalars().first()
        allow_self = settings_obj.allow_self_approval if settings_obj else False
        if not allow_self:
            raise HTTPException(
                status_code=403,
                detail="Financial Policy: Self-approval of your own expense claims is forbidden."
            )

    # Check High-Risk Audit Exemption requirement
    if action.decision == ApprovalDecision.APPROVED and expense.risk_level == "HIGH":
        if not action.audit_exemption_reason or not action.audit_exemption_reason.strip():
            raise HTTPException(
                status_code=400,
                detail="Audit Compliance Policy: This claim is flagged as HIGH RISK. An explicit Audit Exemption Reason is mandatory to approve this claim."
            )
        expense.audit_exemption_reason = action.audit_exemption_reason.strip()

    old_status = expense.status.value

    try:
        new_status, tier_recorded = ExpenseStateMachine.evaluate_approval(
            expense=expense,
            reviewer_role=current_user.role,
            decision=action.decision,
            comments=action.comments or ""
        )
    except StateMachineError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    # Record approval entry
    approval_record = ExpenseApproval(
        expense_id=expense.id,
        reviewer_id=current_user.id,
        tier=tier_recorded,
        decision=action.decision,
        comments=action.comments
    )
    db.add(approval_record)
    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="EXPENSE",
        entity_id=expense.id,
        action=f"APPROVAL_{action.decision.value}",
        old_values={"status": old_status},
        new_values={
            "status": new_status.value,
            "tier": tier_recorded,
            "decision": action.decision.value,
            "comments": action.comments
        },
        ip_address=request.client.host if request.client else None
    )

    if tier_recorded == 1:
        await notify_reviewer_action(db, expense, current_user, action.decision, action.comments)
    else:
        await notify_admin_action(db, expense, current_user, action.decision, action.comments)

    if expense.submitter:
        expense.submitter_name = expense.submitter.full_name
        expense.submitter_email = expense.submitter.email

    return expense
