import csv
import io
import os
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
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
from app.services.storage import storage_service
from app.api.v1.deps import get_current_user, require_role, log_audit_event

router = APIRouter(prefix="/expenses", tags=["Expenses"])


def _normalize_dt(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is not None and dt.tzinfo.utcoffset(dt) is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def validate_category_mandatory_details(category: str, details: Optional[dict]):
    """
    Enforce mandatory details filling based on claim category:
    1. Hotel & Lodging (ACCOMMODATION):
       - hotel name, check-in date/time, check-out date/time, hotel location, contact number (if available)
    2. Training & Certifications (TRAINING):
       - certification name, platform or institute, enrollment date, type of certification
    3. Travel & Commute (TRAVEL):
       - mode of travel, start date, end date, boarding point, arrival point
    """
    details = details or {}
    clean_cat = (category or "").strip().upper()
    if clean_cat == "ACCOMMODATION":
        required = {
            "hotel_name": "Hotel Name",
            "check_in": "Check-in Date & Time",
            "check_out": "Check-out Date & Time",
            "hotel_location": "Hotel Location",
        }
        missing = [lbl for k, lbl in required.items() if not str(details.get(k) or "").strip()]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Hotel & Lodging requires the following mandatory details: {', '.join(missing)}."
            )
    elif clean_cat == "TRAINING":
        required = {
            "certification_name": "Certification Name",
            "institute": "Platform / Institute",
            "enrollment_date": "Enrollment Date",
            "certification_type": "Type of Certification",
        }
        missing = [lbl for k, lbl in required.items() if not str(details.get(k) or "").strip()]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Training & Certifications requires the following mandatory details: {', '.join(missing)}."
            )
    elif clean_cat == "TRAVEL":
        required = {
            "travel_mode": "Mode of Travel",
            "start_date": "Start Date",
            "end_date": "End Date",
            "boarding_point": "Boarding Point",
            "arrival_point": "Arrival Point",
        }
        missing = [lbl for k, lbl in required.items() if not str(details.get(k) or "").strip()]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Travel & Commute requires the following mandatory details: {', '.join(missing)}."
            )


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
        line_items=data.line_items,
        extracted_metadata=data.extracted_metadata
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
    else:
        # Non-employees (ADMIN, REVIEWER, FINANCE):
        # Drafts are strictly private to the user who created them (never visible to other admins or reviewers)
        query = query.where(
            or_(
                Expense.status != ExpenseStatus.DRAFT,
                Expense.submitted_by == current_user.id
            )
        )

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

    # Populate submitter metadata and enforce extraction privacy for employees
    for exp in expenses:
        if exp.submitter:
            exp.submitter_name = exp.submitter.full_name
            exp.submitter_email = exp.submitter.email
            bd = exp.submitter.bank_details or {}
            has_bd = bool((bd.get("account_number") and (bd.get("ifsc_code") or bd.get("bank_name"))) or bd.get("upi_id"))
            exp.submitter_has_bank_details = has_bd
            if current_user.role in (UserRole.ADMIN, UserRole.REVIEWER, UserRole.FINANCE):
                exp.submitter_bank_details = bd if has_bd else None
            else:
                exp.submitter_bank_details = None
        if current_user.role == UserRole.EMPLOYEE and exp.submitted_by != current_user.id:
            exp.extracted_metadata = None

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
    settings_obj = await get_or_create_system_settings(db)

    # Master switch check: Are expense submissions enabled company-wide?
    if submit_now and not settings_obj.expense_submissions_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expense submissions are temporarily paused by corporate administration. Please check back later."
        )

    # Mandatory receipt check upon submission
    if submit_now and not data.receipt_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receipt upload is mandatory to submit an expense claim."
        )

    # Determine effective submitter (Admin/Reviewer can submit on behalf of an employee)
    submitter_user = current_user
    if data.on_behalf_of_user_id:
        if current_user.role not in [UserRole.ADMIN, UserRole.REVIEWER]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Admins and Reviewers can submit expense claims on behalf of other employees."
            )
        u_res = await db.execute(select(User).where(User.id == data.on_behalf_of_user_id))
        target_user = u_res.scalars().first()
        if not target_user:
            raise HTTPException(status_code=404, detail="Designated employee account not found.")
        submitter_user = target_user

    # Mandatory bank details check upon submission for target employee
    if submit_now and submitter_user.role == UserRole.EMPLOYEE:
        bd = submitter_user.bank_details or {}
        has_bd = bool((bd.get("account_number") and (bd.get("ifsc_code") or bd.get("bank_name"))) or bd.get("upi_id"))
        if not has_bd:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Submission locked: Bank account or UPI details are required for {submitter_user.full_name} ({submitter_user.email}) before submitting an expense claim."
            )

    # Auto-extract from receipt if not provided
    extracted_meta = data.extracted_metadata or {}
    if not extracted_meta and data.receipt_url and "key=" in data.receipt_url:
        try:
            key = data.receipt_url.split("key=")[-1]
            local_path = storage_service.get_local_file_path(key)
            if os.path.exists(local_path):
                with open(local_path, "rb") as f:
                    content = f.read()
                from app.services.extractor import CustomReceiptExtractor
                extracted_meta = CustomReceiptExtractor.extract(content, os.path.basename(local_path))
        except Exception as e:
            print(f"[WARN] Automatic backend receipt extraction: {e}")

    # Forensics compliance evaluation (inspecting extracted line items & financial identifiers)
    line_items = extracted_meta.get("line_items") if extracted_meta else None
    forensic_eval = await ForensicsEngine.evaluate_expense(
        db=db,
        submitter_id=submitter_user.id,
        amount=data.amount,
        expense_date=data.expense_date,
        category=data.category,
        receipt_hash=data.receipt_hash,
        line_items=line_items,
        extracted_metadata=extracted_meta
    )
    if forensic_eval["is_blocked"]:
        raise HTTPException(status_code=400, detail=forensic_eval["block_reason"])

    # Date policy window evaluation: flag expenses outside allowed dates & escalate to Tier 2
    if settings_obj.enforce_date_window:
        exp_dt = data.expense_date
        exp_dt_norm = _normalize_dt(exp_dt)
        policy_start_norm = _normalize_dt(settings_obj.policy_allowed_start_date)
        policy_end_norm = _normalize_dt(settings_obj.policy_allowed_end_date)
        is_outside = False
        if policy_start_norm and exp_dt_norm and exp_dt_norm < policy_start_norm:
            is_outside = True
        if policy_end_norm and exp_dt_norm and exp_dt_norm > policy_end_norm:
            is_outside = True
        if is_outside:
            start_str = settings_obj.policy_allowed_start_date.strftime("%Y-%m-%d") if settings_obj.policy_allowed_start_date else "beginning"
            end_str = settings_obj.policy_allowed_end_date.strftime("%Y-%m-%d") if settings_obj.policy_allowed_end_date else "indefinite"
            forensic_eval["flags"].append({
                "code": "OUT_OF_POLICY_DATE_WINDOW",
                "label": "Out-of-Window Date Policy",
                "description": f"Expense date {exp_dt.strftime('%Y-%m-%d')} falls outside the authorized company policy window ({start_str} to {end_str}). Set up for mandatory review."
            })
            forensic_eval["risk_score"] = min(100, forensic_eval["risk_score"] + 35)
            if forensic_eval["risk_score"] >= 70:
                forensic_eval["risk_level"] = "HIGH"
            elif forensic_eval["risk_score"] >= 35 and forensic_eval["risk_level"] == "LOW":
                forensic_eval["risk_level"] = "MEDIUM"
            forensic_eval["will_escalate_tier2"] = True

    # Duplicate detection check
    is_dup, dup_msg = await DuplicateDetector.check_duplicate(
        db=db,
        submitted_by=submitter_user.id,
        amount=data.amount,
        expense_date=data.expense_date,
        receipt_hash=data.receipt_hash,
        title=data.title
    )
    if is_dup and submit_now:
        raise HTTPException(status_code=400, detail=f"Cannot submit: {dup_msg}")

    # Mandatory category specifics validation upon submission
    if submit_now:
        validate_category_mandatory_details(data.category, data.category_details)

    # Extract exact storage key from receipt URL (Finding 4)
    storage_key = storage_service.extract_key_from_url(data.receipt_url) if data.receipt_url else None
    clean_storage_key = os.path.basename(storage_key) if storage_key else None

    new_expense = Expense(
        submitted_by=submitter_user.id,
        title=data.title,
        description=data.description,
        category=data.category,
        amount=data.amount,
        currency=data.currency or settings_obj.default_currency,
        expense_date=data.expense_date,
        receipt_url=data.receipt_url,
        receipt_storage_key=clean_storage_key,
        receipt_hash=data.receipt_hash,
        risk_score=forensic_eval["risk_score"],
        risk_level=forensic_eval["risk_level"],
        forensic_flags=forensic_eval["flags"],
        extracted_metadata=extracted_meta,
        category_details=data.category_details or {},
        status=ExpenseStatus.DRAFT
    )

    if submit_now:
        ExpenseStateMachine.transition_to_submitted(
            new_expense,
            threshold=settings_obj.tier2_approval_threshold,
            multi_tier_enabled=settings_obj.multi_tier_approval_enabled
        )
        # If forensics flagged smurfing, policy violations, or out-of-window date, escalate to Tier 2 (if multi-tier enabled)
        if forensic_eval["will_escalate_tier2"] and settings_obj.multi_tier_approval_enabled:
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
        bd = created.submitter.bank_details or {}
        has_bd = bool((bd.get("account_number") and (bd.get("ifsc_code") or bd.get("bank_name"))) or bd.get("upi_id"))
        created.submitter_has_bank_details = has_bd
        if current_user.role in (UserRole.ADMIN, UserRole.REVIEWER, UserRole.FINANCE):
            created.submitter_bank_details = bd if has_bd else None
        else:
            created.submitter_bank_details = None

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


@router.get("/export")
async def export_expenses(
    request: Request,
    status_filter: Optional[ExpenseStatus] = Query(None, alias="status"),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("created_at"),
    sort_order: Optional[str] = Query("desc"),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.REVIEWER, UserRole.FINANCE])),
    db: AsyncSession = Depends(get_db)
):
    """
    Extract and export expense submissions into a structured Microsoft Excel (.xlsx) report.
    Includes sorting, filters, verified extraction facts, and active document hyperlinks.
    Accessible to Admin and Reviewer personnel.
    """
    query = select(Expense).options(
        selectinload(Expense.submitter)
    )

    # Drafts are private to the creator: never export another user's drafts
    query = query.where(
        or_(
            Expense.status != ExpenseStatus.DRAFT,
            Expense.submitted_by == current_user.id
        )
    )

    if status_filter:
        query = query.where(Expense.status == status_filter)

    if category:
        query = query.where(Expense.category == category)

    if search and search.strip():
        search_fmt = f"%{search.strip()}%"
        query = query.where(
            or_(
                Expense.id.ilike(search_fmt),
                Expense.title.ilike(search_fmt),
                Expense.description.ilike(search_fmt),
                Expense.category.ilike(search_fmt)
            )
        )

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

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Expense Submissions"

    headers = [
        "Expense ID",
        "Submission Timestamp",
        "Expense Date",
        "Submitter Name",
        "Submitter Email",
        "Title",
        "Category",
        "Amount",
        "Currency",
        "Status",
        "Approval Tier Required",
        "Current Approval Tier",
        "Risk Score",
        "Risk Level",
        "Receipt Document Link",
        "Extracted Merchant",
        "Extracted Bill No",
        "Extracted Receipt No",
        "Extracted Transaction ID",
        "Extracted GSTIN",
        "Extracted Date",
        "Date Verified In Bill",
        "Extraction Verified",
        "Category Specific Details"
    ]
    ws.append(headers)

    # Style header row (Corporate Emerald #059669)
    header_fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    thin_border = Border(
        left=Side(style="thin", color="D1D5DB"),
        right=Side(style="thin", color="D1D5DB"),
        top=Side(style="thin", color="D1D5DB"),
        bottom=Side(style="thin", color="D1D5DB")
    )

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border

    base_url = str(request.base_url).rstrip("/")
    for row_idx, exp in enumerate(expenses, start=2):
        meta = exp.extracted_metadata or {}
        sub_name = exp.submitter.full_name if exp.submitter else "Unknown"
        sub_email = exp.submitter.email if exp.submitter else "Unknown"
        doc_link = ""
        if exp.receipt_url:
            if exp.receipt_url.startswith("http"):
                doc_link = exp.receipt_url
            else:
                doc_link = f"{base_url}{exp.receipt_url if exp.receipt_url.startswith('/') else '/' + exp.receipt_url}"

        row_data = [
            exp.id,
            exp.created_at.strftime("%Y-%m-%d %H:%M:%S") if exp.created_at else "",
            exp.expense_date.strftime("%Y-%m-%d") if exp.expense_date else "",
            sub_name,
            sub_email,
            exp.title,
            exp.category,
            float(exp.amount),
            exp.currency,
            exp.status.value,
            exp.approval_tier_required,
            exp.current_approval_tier,
            exp.risk_score,
            exp.risk_level,
            doc_link,
            meta.get("merchant_name") or "",
            meta.get("bill_number") or "",
            meta.get("receipt_number") or "",
            meta.get("transaction_id") or "",
            meta.get("gstin") or "",
            meta.get("expense_date") or "",
            "YES" if meta.get("date_found_in_bill") else "NO",
            meta.get("verification_status") or "UNVERIFIED",
            ", ".join([f"{k}: {v}" for k, v in (exp.category_details or {}).items() if v])
        ]
        ws.append(row_data)

        # Apply hyperlink to the receipt column (Column 15)
        receipt_cell = ws.cell(row=row_idx, column=15)
        if doc_link:
            receipt_cell.hyperlink = doc_link
            receipt_cell.value = "View Document"
            receipt_cell.font = Font(color="2563EB", underline="single")

        # Styling & alignment for row cells
        for col_idx in range(1, len(headers) + 1):
            c = ws.cell(row=row_idx, column=col_idx)
            c.border = thin_border
            if col_idx in (8, 11, 12, 13):
                c.alignment = Alignment(horizontal="right")
            elif col_idx in (1, 2, 3, 9, 10, 14, 15, 21, 22, 23):
                c.alignment = Alignment(horizontal="center")

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or "")
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"expenses_export_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


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

    # Drafts are strictly private to the user who created them (never visible to other admins or reviewers)
    if expense.status == ExpenseStatus.DRAFT and expense.submitted_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Draft expense claims are private to the user and cannot be viewed by admins or reviewers."
        )

    if expense.submitter:
        expense.submitter_name = expense.submitter.full_name
        expense.submitter_email = expense.submitter.email
        bd = expense.submitter.bank_details or {}
        has_bd = bool((bd.get("account_number") and (bd.get("ifsc_code") or bd.get("bank_name"))) or bd.get("upi_id"))
        expense.submitter_has_bank_details = has_bd
        if current_user.role in (UserRole.ADMIN, UserRole.REVIEWER, UserRole.FINANCE):
            expense.submitter_bank_details = bd if has_bd else None
        else:
            expense.submitter_bank_details = None

    if current_user.role == UserRole.EMPLOYEE and expense.submitted_by != current_user.id:
        expense.extracted_metadata = None

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

    # Drafts are private to the creator
    if expense.status == ExpenseStatus.DRAFT and expense.submitted_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Draft expense claims are private to the user and cannot be modified by admins or reviewers."
        )

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

    if "receipt_url" in update_dict:
        new_url = update_dict["receipt_url"]
        storage_key = storage_service.extract_key_from_url(new_url) if new_url else None
        expense.receipt_storage_key = os.path.basename(storage_key) if storage_key else None

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

    if expense.submitted_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Draft expense claims are private to the creator. Only the owner can submit this claim for approval."
        )

    settings_obj = await get_or_create_system_settings(db)

    # Master switch check: Are expense submissions enabled company-wide?
    if not settings_obj.expense_submissions_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expense submissions are temporarily paused by corporate administration. Please check back later."
        )

    # Mandatory receipt check
    if not expense.receipt_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Receipt upload is mandatory to submit an expense claim."
        )

    # Mandatory bank details check on submission for employees
    if current_user.role == UserRole.EMPLOYEE:
        bd = current_user.bank_details or {}
        has_bd = bool((bd.get("account_number") and (bd.get("ifsc_code") or bd.get("bank_name"))) or bd.get("upi_id"))
        if not has_bd:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submission locked: Bank account or UPI details are required to submit an expense claim. Please configure your bank details in Profile Settings before submitting."
            )

    # Mandatory category specifics validation upon submission
    validate_category_mandatory_details(expense.category, expense.category_details)

    # Duplicate check
    is_dup, dup_msg = await DuplicateDetector.check_duplicate(
        db=db,
        submitted_by=expense.submitted_by,
        amount=expense.amount,
        expense_date=expense.expense_date,
        receipt_hash=expense.receipt_hash,
        title=expense.title,
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
        extracted_metadata=expense.extracted_metadata,
        exclude_expense_id=expense.id
    )
    if forensic_eval["is_blocked"]:
        raise HTTPException(status_code=400, detail=forensic_eval["block_reason"])

    # Date policy window evaluation: flag expenses outside allowed dates & escalate to Tier 2
    if settings_obj.enforce_date_window:
        exp_dt = expense.expense_date
        exp_dt_norm = _normalize_dt(exp_dt)
        policy_start_norm = _normalize_dt(settings_obj.policy_allowed_start_date)
        policy_end_norm = _normalize_dt(settings_obj.policy_allowed_end_date)
        is_outside = False
        if policy_start_norm and exp_dt_norm and exp_dt_norm < policy_start_norm:
            is_outside = True
        if policy_end_norm and exp_dt_norm and exp_dt_norm > policy_end_norm:
            is_outside = True
        if is_outside:
            start_str = settings_obj.policy_allowed_start_date.strftime("%Y-%m-%d") if settings_obj.policy_allowed_start_date else "beginning"
            end_str = settings_obj.policy_allowed_end_date.strftime("%Y-%m-%d") if settings_obj.policy_allowed_end_date else "indefinite"
            forensic_eval["flags"].append({
                "code": "OUT_OF_POLICY_DATE_WINDOW",
                "label": "Out-of-Window Date Policy",
                "description": f"Expense date {exp_dt.strftime('%Y-%m-%d')} falls outside the authorized company policy window ({start_str} to {end_str}). Set up for mandatory review."
            })
            forensic_eval["risk_score"] = min(100, forensic_eval["risk_score"] + 35)
            if forensic_eval["risk_score"] >= 70:
                forensic_eval["risk_level"] = "HIGH"
            elif forensic_eval["risk_score"] >= 35 and forensic_eval["risk_level"] == "LOW":
                forensic_eval["risk_level"] = "MEDIUM"
            forensic_eval["will_escalate_tier2"] = True

    expense.risk_score = forensic_eval["risk_score"]
    expense.risk_level = forensic_eval["risk_level"]
    expense.forensic_flags = forensic_eval["flags"]

    try:
        ExpenseStateMachine.transition_to_submitted(
            expense,
            threshold=settings_obj.tier2_approval_threshold,
            multi_tier_enabled=settings_obj.multi_tier_approval_enabled
        )
        if forensic_eval["will_escalate_tier2"] and settings_obj.multi_tier_approval_enabled:
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
    """
    Delete an expense claim:
    - Admin: Can delete any uploaded expense claim of other users or themselves.
    - Employee / Reviewer: Can delete their own claims, but CANNOT delete once accepted / approved.
    """
    result = await db.execute(select(Expense).where(Expense.id == expense_id))
    expense = result.scalars().first()

    if not expense:
        raise HTTPException(status_code=404, detail="Expense claim not found.")

    # Drafts are strictly private to the user who created them
    if expense.status == ExpenseStatus.DRAFT and expense.submitted_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Draft expense claims are private to the creator and cannot be viewed or deleted by other users."
        )

    is_admin = current_user.role == UserRole.ADMIN

    if not is_admin:
        if expense.submitted_by != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized: You cannot delete another user's claim.")

        # Non-admin users cannot delete accepted/approved claims
        accepted_statuses = [
            ExpenseStatus.APPROVED,
            ExpenseStatus.REIMBURSED
        ]
        if expense.status in accepted_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Action prohibited: Accepted / approved expense claims cannot be deleted by users. Please contact an Administrator."
            )

    # Delete uploaded receipt file from R2 / S3 storage bucket and local disk storage
    if expense.receipt_url:
        try:
            from app.services.storage import storage_service
            storage_service.delete_file(expense.receipt_url)
        except Exception as e:
            print(f"[WARN] Failed to delete receipt file from storage: {e}")

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="EXPENSE",
        entity_id=expense.id,
        action="DELETE",
        old_values={
            "title": expense.title,
            "amount": str(expense.amount),
            "owner_id": expense.submitted_by,
            "status": expense.status.value,
            "receipt_url": expense.receipt_url
        },
        ip_address=request.client.host if request.client else None
    )

    await db.delete(expense)
    return None
