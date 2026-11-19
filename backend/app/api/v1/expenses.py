from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, and_, or_, desc, asc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Expense, ExpenseStatus, ExpenseCategory, ExpenseCategoryModel, User, UserRole, SystemSettings
from app.schemas import (
    ExpenseCreate, ExpenseUpdate, ExpenseOut,
    ForensicsPreviewRequest, ForensicsPreviewResponse
)
from app.services.duplicate_detector import DuplicateDetector
from app.services.forensics_engine import ForensicsEngine
from app.services.state_machine import ExpenseStateMachine, StateMachineError
from app.api.v1.deps import get_current_user, log_audit_event

router = APIRouter(prefix="/expenses", tags=["Expenses"])


@router.post("/forensics-preview", response_model=ForensicsPreviewResponse)
async def preview_forensics(
    data: ForensicsPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Real-time pre-submission AI forensics compliance inspection.
    Evaluates smurfing evasion velocity, cross-employee collisions,
    restricted keywords, and weekend spending before the user clicks Submit.
    """
    eval_res = await ForensicsEngine.evaluate_expense(
        db=db,
        submitter_id=current_user.id,
        amount=data.amount,
        expense_date=data.expense_date,
        category=data.category,
        receipt_hash=data.receipt_hash,
        line_items=data.line_items
    )
    return ForensicsPreviewResponse(**eval_res)


async def get_or_create_system_settings(db: AsyncSession) -> SystemSettings:
    result = await db.execute(select(SystemSettings).where(SystemSettings.id == 1))
    settings_obj = result.scalars().first()
    if not settings_obj:
        settings_obj = SystemSettings(id=1)
        db.add(settings_obj)
        await db.flush()
    return settings_obj


@router.get("", response_model=List[ExpenseOut])
async def list_expenses(
    status_filter: Optional[ExpenseStatus] = Query(None, alias="status"),
    category_filter: Optional[str] = Query(None, alias="category"),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("created_at"),
    sort_order: Optional[str] = Query("desc"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List expenses:
    - Employees see only their own expenses.
    - Reviewers, Finance, and Admins can view all company expenses.
    - Supports multi-field search and flexible column sorting.
    """
    query = select(Expense).join(
        User, Expense.submitted_by == User.id, isouter=True
    ).options(
        selectinload(Expense.submitter),
        selectinload(Expense.approvals),
        selectinload(Expense.reimbursement)
    )

    # RBAC filtering
    if current_user.role == UserRole.EMPLOYEE:
        query = query.where(Expense.submitted_by == current_user.id)

    if status_filter:
        query = query.where(Expense.status == status_filter)

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

    # Dynamic sorting
    sort_col_map = {
        "created_at": Expense.created_at,
        "amount": Expense.amount,
        "title": Expense.title,
        "expense_date": Expense.expense_date,
        "status": Expense.status,
    }
    sort_col = sort_col_map.get(sort_by or "created_at", Expense.created_at)
    if sort_order == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))

    result = await db.execute(query)
    expenses = result.scalars().all()

    # Populate submitter metadata
    for exp in expenses:
        if exp.submitter:
            exp.submitter_name = exp.submitter.full_name
            exp.submitter_email = exp.submitter.email

    return expenses


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
async def create_expense(
    data: ExpenseCreate,
    request: Request,
    submit_now: bool = Query(False, description="Directly transition to SUBMITTED upon creation"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new expense claim.
    Can be created as DRAFT or directly SUBMITTED.
    """
    # Mandatory receipt check upon submission
    if submit_now and not data.receipt_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receipt upload is mandatory to submit an expense claim."
        )

    # Forensics compliance evaluation
    line_items = data.extracted_metadata.get("line_items") if data.extracted_metadata else None
    forensic_eval = await ForensicsEngine.evaluate_expense(
        db=db,
        submitter_id=current_user.id,
        amount=data.amount,
        expense_date=data.expense_date,
        category=data.category,
        receipt_hash=data.receipt_hash,
        line_items=line_items
    )
    if forensic_eval["is_blocked"]:
        raise HTTPException(status_code=400, detail=forensic_eval["block_reason"])

    # Duplicate detection check
    is_dup, dup_msg = await DuplicateDetector.check_duplicate(
        db=db,
        submitted_by=current_user.id,
        amount=data.amount,
        expense_date=data.expense_date,
        receipt_hash=data.receipt_hash
    )
    if is_dup and submit_now:
        raise HTTPException(status_code=400, detail=f"Cannot submit: {dup_msg}")

    settings_obj = await get_or_create_system_settings(db)

    new_expense = Expense(
        submitted_by=current_user.id,
        title=data.title,
        description=data.description,
        category=data.category,
        amount=data.amount,
        currency=data.currency or settings_obj.default_currency,
        expense_date=data.expense_date,
        receipt_url=data.receipt_url,
        receipt_hash=data.receipt_hash,
        risk_score=forensic_eval["risk_score"],
        risk_level=forensic_eval["risk_level"],
        forensic_flags=forensic_eval["flags"],
        extracted_metadata=data.extracted_metadata or {},
        status=ExpenseStatus.DRAFT
    )

    if submit_now:
        ExpenseStateMachine.transition_to_submitted(
            new_expense,
            threshold=settings_obj.tier2_approval_threshold
        )
        # If forensics flagged smurfing or high risk, escalate to Tier 2
        if forensic_eval["will_escalate_tier2"]:
            new_expense.approval_tier_required = 2

    db.add(new_expense)
    await db.flush()

    # Re-fetch with relationships
    result = await db.execute(
        select(Expense)
        .options(selectinload(Expense.submitter), selectinload(Expense.approvals), selectinload(Expense.reimbursement))
        .where(Expense.id == new_expense.id)
    )
    created = result.scalars().first()
    if created and created.submitter:
        created.submitter_name = created.submitter.full_name
        created.submitter_email = created.submitter.email

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="EXPENSE",
        entity_id=new_expense.id,
        action="CREATE",
        new_values={"title": new_expense.title, "amount": str(new_expense.amount), "status": new_expense.status.value},
        ip_address=request.client.host if request.client else None
    )

    return created


@router.get("/{expense_id}", response_model=ExpenseOut)
async def get_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve details of a single expense claim"""
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

    # Permissions: Employee can only view their own
    if current_user.role == UserRole.EMPLOYEE and expense.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized to view this expense claim.")

    if expense.submitter:
        expense.submitter_name = expense.submitter.full_name
        expense.submitter_email = expense.submitter.email

    return expense


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: str,
    data: ExpenseUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Edit a claim while in DRAFT or CHANGES_REQUESTED status"""
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalars().first()

    if not expense:
        raise HTTPException(status_code=404, detail="Expense claim not found.")

    if current_user.role == UserRole.EMPLOYEE and expense.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized to modify this claim.")

    if expense.status not in (ExpenseStatus.DRAFT, ExpenseStatus.CHANGES_REQUESTED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot edit expense in status '{expense.status}'. Only DRAFT or CHANGES_REQUESTED claims can be edited."
        )

    old_values = {"title": expense.title, "amount": str(expense.amount)}

    # Apply updates
    update_dict = data.model_dump(exclude_unset=True)
    for field, val in update_dict.items():
        setattr(expense, field, val)

    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="EXPENSE",
        entity_id=expense.id,
        action="UPDATE",
        old_values=old_values,
        new_values=update_dict,
        ip_address=request.client.host if request.client else None
    )

    return await get_expense(expense_id, current_user, db)


@router.post("/{expense_id}/submit", response_model=ExpenseOut)
async def submit_expense(
    expense_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Submit a DRAFT or CHANGES_REQUESTED expense claim for approval"""
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalars().first()

    if not expense:
        raise HTTPException(status_code=404, detail="Expense claim not found.")

    if current_user.role == UserRole.EMPLOYEE and expense.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized to submit this claim.")

    # Mandatory receipt check
    if not expense.receipt_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receipt upload is mandatory to submit an expense claim."
        )

    # Duplicate check
    is_dup, dup_msg = await DuplicateDetector.check_duplicate(
        db=db,
        submitted_by=expense.submitted_by,
        amount=expense.amount,
        expense_date=expense.expense_date,
        receipt_hash=expense.receipt_hash,
        exclude_expense_id=expense.id
    )
    if is_dup:
        raise HTTPException(status_code=400, detail=f"Submission rejected: {dup_msg}")

    # Forensics compliance check
    line_items = expense.extracted_metadata.get("line_items") if expense.extracted_metadata else None
    forensic_eval = await ForensicsEngine.evaluate_expense(
        db=db,
        submitter_id=expense.submitted_by,
        amount=expense.amount,
        expense_date=expense.expense_date,
        category=expense.category,
        receipt_hash=expense.receipt_hash,
        line_items=line_items,
        exclude_expense_id=expense.id
    )
    if forensic_eval["is_blocked"]:
        raise HTTPException(status_code=400, detail=forensic_eval["block_reason"])

    expense.risk_score = forensic_eval["risk_score"]
    expense.risk_level = forensic_eval["risk_level"]
    expense.forensic_flags = forensic_eval["flags"]

    settings_obj = await get_or_create_system_settings(db)

    try:
        ExpenseStateMachine.transition_to_submitted(
            expense,
            threshold=settings_obj.tier2_approval_threshold
        )
        if forensic_eval["will_escalate_tier2"]:
            expense.approval_tier_required = 2
    except StateMachineError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="EXPENSE",
        entity_id=expense.id,
        action="SUBMIT",
        new_values={
            "status": expense.status.value,
            "tier_required": expense.approval_tier_required
        },
        ip_address=request.client.host if request.client else None
    )

    return await get_expense(expense_id, current_user, db)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an unsubmitted DRAFT expense claim"""
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalars().first()

    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found.")

    if current_user.role == UserRole.EMPLOYEE and expense.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized to delete this claim.")

    if expense.status != ExpenseStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Only DRAFT expenses can be deleted.")

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="EXPENSE",
        entity_id=expense.id,
        action="DELETE",
        old_values={"title": expense.title, "amount": str(expense.amount)},
        ip_address=request.client.host if request.client else None
    )

    await db.delete(expense)
    return None
