"""
Idempotent Sample Data Seeder for ClearSpend
Populates realistic sample data across every page:
- Users (Admin, Reviewer, Finance, and multiple Students with Bank + PAN details)
- Vendors (Multiple vendor profiles with GSTIN, PAN, PAN Doc, Bank + Bank Address)
- Expenses & Vendor Bills (across DRAFT, SUBMITTED, UNDER_REVIEW, CHANGES_REQUESTED, APPROVED, REJECTED, REIMBURSED)
- Multiple bills per Vendor and per Student to showcase grouped sections & .xlsx subtotals
- ExpenseApprovals (Tier 1 & Tier 2 review records)
- Reimbursements (COMPLETED & FAILED payouts with UTR/NEFT transaction IDs)
- Notifications (for Admin, Reviewer, and Students)
- AuditLogs (for /audit-logs)
"""

import asyncio
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select

import app.core.database as db_module
from app.core.config import settings
from app.core.security import get_password_hash
from app.main import auto_migrate_schema
from app.models import (
    ApprovalDecision,
    AuditLog,
    Base,
    Expense,
    ExpenseApproval,
    ExpenseCategoryModel,
    ExpenseStatus,
    Notification,
    Reimbursement,
    ReimbursementStatus,
    SystemSettings,
    User,
    UserRole,
    Vendor,
)

# 1x1 transparent PNG bytes so local storage links can render if clicked
SAMPLE_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00"
    b"\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def now_minus(days: int = 0, hours: int = 0) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days, hours=hours)


async def ensure_tables():
    try:
        async with db_module.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(auto_migrate_schema)
    except Exception:
        if settings.ENVIRONMENT == "production" and not settings.ALLOW_SQLITE_FALLBACK:
            raise
        db_module.switch_to_sqlite_fallback()
        async with db_module.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(auto_migrate_schema)


async def seed():
    await ensure_tables()

    # Save sample placeholder images if local storage is used
    receipt_url_base = "http://localhost:8000/api/v1/receipts/local?key="
    try:
        from app.services.storage import storage_service
        if not storage_service.is_configured():
            storage_service.save_local_file("receipts/sample_receipt.png", SAMPLE_PNG_BYTES)
            storage_service.save_local_file("receipts/sample_pan.png", SAMPLE_PNG_BYTES)
            receipt_url_1 = f"{receipt_url_base}receipts/sample_receipt.png"
            pan_url_1 = f"{receipt_url_base}receipts/sample_pan.png"
        else:
            receipt_url_1 = "https://storage.clearspend.dev/receipts/sample_receipt.png"
            pan_url_1 = "https://storage.clearspend.dev/pan/sample_pan.png"
    except Exception:
        receipt_url_1 = "https://storage.clearspend.dev/receipts/sample_receipt.png"
        pan_url_1 = "https://storage.clearspend.dev/pan/sample_pan.png"

    async with db_module.AsyncSessionLocal() as db:
        # 1. SystemSettings
        s_res = await db.execute(select(SystemSettings).where(SystemSettings.id == 1))
        if not s_res.scalars().first():
            db.add(SystemSettings(
                id=1,
                company_name="ClearSpend",
                default_currency="INR",
                tier2_approval_threshold=Decimal("25000.00"),
                allow_self_approval=False,
                expense_submissions_enabled=True,
                multi_tier_approval_enabled=True,
                ai_receipt_extractor_enabled=True,
            ))

        # 2. Default Categories
        default_cats = [
            ("TRAVEL", "Travel & Commute", "Flights, trains, cabs, and transit"),
            ("MEALS", "Meals & Refreshments", "Team meals and client hospitality"),
            ("SUPPLIES", "Office & Event Supplies", "Stationery, printing, and hardware"),
            ("SOFTWARE", "Software & Cloud", "SaaS tools, domains, and cloud hosting"),
            ("TRAINING", "Training & Certifications", "Workshops, courses, and certifications"),
            ("ACCOMMODATION", "Hotel & Lodging", "Business travel hotel stays"),
            ("OTHER", "Other Expenses", "Miscellaneous approved costs"),
        ]
        for code, name, desc in default_cats:
            c_res = await db.execute(select(ExpenseCategoryModel).where(ExpenseCategoryModel.code == code))
            if not c_res.scalars().first():
                db.add(ExpenseCategoryModel(code=code, name=name, description=desc, is_active=True, is_system=True))

        # 3. Users (Admin, Reviewer, Finance, 3 Students)
        users_spec = [
            {
                "email": "admin@clearspend.com",
                "full_name": "System Administrator",
                "password": "Admin@ClearSpend2026",
                "role": UserRole.ADMIN,
                "bank_details": {},
                "pan_number": None,
                "pan_document_url": None,
            },
            {
                "email": "reviewer@clearspend.com",
                "full_name": "Kavya Menon",
                "password": "Password123!",
                "role": UserRole.REVIEWER,
                "bank_details": {},
                "pan_number": None,
                "pan_document_url": None,
            },
            {
                "email": "finance@clearspend.com",
                "full_name": "Arjun Deshmukh",
                "password": "Password123!",
                "role": UserRole.FINANCE,
                "bank_details": {},
                "pan_number": None,
                "pan_document_url": None,
            },
            {
                "email": "ananya.sharma@clearspend.com",
                "full_name": "Ananya Sharma",
                "password": "Password123!",
                "role": UserRole.EMPLOYEE,
                "pan_number": "ABCDE1234F",
                "pan_document_url": pan_url_1,
                "bank_details": {
                    "account_holder_name": "Ananya Sharma",
                    "bank_name": "HDFC Bank",
                    "bank_address": "MG Road Branch, Bengaluru - 560001",
                    "account_number": "50100293847561",
                    "ifsc_code": "HDFC0000123",
                    "upi_id": "ananya@okhdfcbank",
                },
            },
            {
                "email": "rohan.verma@clearspend.com",
                "full_name": "Rohan Verma",
                "password": "Password123!",
                "role": UserRole.EMPLOYEE,
                "pan_number": "FGHIJ5678K",
                "pan_document_url": pan_url_1,
                "bank_details": {
                    "account_holder_name": "Rohan Verma",
                    "bank_name": "ICICI Bank",
                    "bank_address": "Indiranagar 100ft Road, Bengaluru - 560038",
                    "account_number": "00040506112233",
                    "ifsc_code": "ICIC0000004",
                    "upi_id": "rohan.v@okicici",
                },
            },
            {
                "email": "priya.nair@clearspend.com",
                "full_name": "Priya Nair",
                "password": "Password123!",
                "role": UserRole.EMPLOYEE,
                "pan_number": "LMNOP9012Q",
                "pan_document_url": pan_url_1,
                "bank_details": {
                    "account_holder_name": "Priya Nair",
                    "bank_name": "State Bank of India",
                    "bank_address": "Edappally Branch, Kochi - 682024",
                    "account_number": "3098765432109",
                    "ifsc_code": "SBIN0004321",
                    "upi_id": "priya.nair@oksbi",
                },
            },
        ]

        user_map = {}
        for spec in users_spec:
            u_res = await db.execute(select(User).where(User.email == spec["email"]))
            user = u_res.scalars().first()
            if not user:
                user = User(
                    email=spec["email"],
                    hashed_password=get_password_hash(spec["password"]),
                    full_name=spec["full_name"],
                    role=spec["role"],
                    bank_details=spec["bank_details"],
                    pan_number=spec["pan_number"],
                    pan_document_url=spec["pan_document_url"],
                    is_active=True,
                )
                db.add(user)
                await db.flush()
            user_map[spec["email"]] = user

        admin = user_map["admin@clearspend.com"]
        reviewer = user_map["reviewer@clearspend.com"]
        ananya = user_map["ananya.sharma@clearspend.com"]
        rohan = user_map["rohan.verma@clearspend.com"]
        priya = user_map["priya.nair@clearspend.com"]

        # 4. Vendors (3 Vendor Profiles with Banking + Bank Address + PAN + PAN Doc)
        vendors_spec = [
            {
                "name": "Acme Cloud Solutions Pvt Ltd",
                "contact_person": "Vikram Rao",
                "email": "accounts@acmecloud.in",
                "phone": "+91-9845012345",
                "gstin": "29AAACA1234B1Z5",
                "pan": "AAACA1234B",
                "pan_document_url": pan_url_1,
                "default_category": "SOFTWARE",
                "bank_details": {
                    "account_holder_name": "Acme Cloud Solutions Pvt Ltd",
                    "bank_name": "HDFC Bank",
                    "bank_address": "Koramangala 4th Block, Bengaluru - 560034",
                    "account_number": "50200044556677",
                    "ifsc_code": "HDFC0000456",
                    "upi_id": "acmecloud@okhdfcbank",
                },
            },
            {
                "name": "Grand Hyatt Mumbai",
                "contact_person": "Meera Kulkarni",
                "email": "corporate@grandhyattmumbai.in",
                "phone": "+91-22-66761234",
                "gstin": "27BBBCG5678H1Z9",
                "pan": "BBBCG5678H",
                "pan_document_url": pan_url_1,
                "default_category": "ACCOMMODATION",
                "bank_details": {
                    "account_holder_name": "Grand Hyatt Mumbai Hospitality",
                    "bank_name": "Axis Bank",
                    "bank_address": "Bandra Kurla Complex, Mumbai - 400051",
                    "account_number": "918020033445566",
                    "ifsc_code": "UTIB0000234",
                },
            },
            {
                "name": "Apex Event & Print Supplies",
                "contact_person": "Suresh Iyer",
                "email": "billing@apexprint.in",
                "phone": "+91-9880098800",
                "gstin": "29CCCPA9012D1Z1",
                "pan": "CCCPA9012D",
                "pan_document_url": pan_url_1,
                "default_category": "SUPPLIES",
                "bank_details": {
                    "account_holder_name": "Apex Event & Print Supplies",
                    "bank_name": "Kotak Mahindra Bank",
                    "bank_address": "Jayanagar 3rd Block, Bengaluru - 560011",
                    "account_number": "44112233445566",
                    "ifsc_code": "KKBK0000421",
                },
            },
        ]

        vendor_map = {}
        for vspec in vendors_spec:
            v_res = await db.execute(select(Vendor).where(Vendor.name == vspec["name"]))
            v = v_res.scalars().first()
            if not v:
                v = Vendor(
                    name=vspec["name"],
                    contact_person=vspec["contact_person"],
                    email=vspec["email"],
                    phone=vspec["phone"],
                    gstin=vspec["gstin"],
                    pan=vspec["pan"],
                    pan_document_url=vspec["pan_document_url"],
                    default_category=vspec["default_category"],
                    bank_details=vspec["bank_details"],
                    is_active=True,
                    created_by=admin.id,
                )
                db.add(v)
                await db.flush()
            vendor_map[vspec["name"]] = v

        v_acme = vendor_map["Acme Cloud Solutions Pvt Ltd"]
        v_hyatt = vendor_map["Grand Hyatt Mumbai"]
        v_apex = vendor_map["Apex Event & Print Supplies"]

        # 5. Expenses & Vendor Bills across all statuses (multiple bills per Student & per Vendor)
        expenses_spec = [
            # --- Ananya Sharma (3 bills: SUBMITTED, UNDER_REVIEW, REIMBURSED) ---
            {
                "title": "Amrita Tech Symposium Flight",
                "description": "Round-trip flight to Bengaluru for annual tech symposium",
                "category": "TRAVEL",
                "amount": Decimal("8450.00"),
                "status": ExpenseStatus.SUBMITTED,
                "tier_req": 2,
                "tier_cur": 0,
                "submitter": ananya,
                "vendor": None,
                "days_ago": 1,
                "risk_score": 12,
                "risk_level": "LOW",
                "flags": [],
                "category_details": {
                    "travel_mode": "Flight",
                    "start_date": "2026-11-22",
                    "end_date": "2026-11-24",
                    "boarding_point": "COK",
                    "arrival_point": "BLR",
                },
            },
            {
                "title": "Amrita Tech Symposium Hotel Stay",
                "description": "2-night business stay near venue",
                "category": "ACCOMMODATION",
                "amount": Decimal("11200.00"),
                "status": ExpenseStatus.UNDER_REVIEW,
                "tier_req": 2,
                "tier_cur": 1,
                "submitter": ananya,
                "vendor": None,
                "days_ago": 3,
                "risk_score": 18,
                "risk_level": "LOW",
                "flags": [],
                "category_details": {
                    "hotel_name": "Ginger Hotel Whitefield",
                    "hotel_location": "Whitefield, Bengaluru",
                    "check_in": "2026-11-22T14:00",
                    "check_out": "2026-11-24T11:00",
                },
            },
            {
                "title": "AWS Cloud Practitioner Certification",
                "description": "Official AWS certification exam voucher",
                "category": "TRAINING",
                "amount": Decimal("9500.00"),
                "status": ExpenseStatus.REIMBURSED,
                "tier_req": 2,
                "tier_cur": 2,
                "submitter": ananya,
                "vendor": None,
                "days_ago": 10,
                "risk_score": 5,
                "risk_level": "LOW",
                "flags": [],
                "category_details": {
                    "certification_name": "AWS Certified Cloud Practitioner",
                    "institute": "Amazon Web Services",
                    "enrollment_date": "2026-11-10",
                    "certification_type": "Certification Exam",
                },
                "reimburse_txn": "NEFT20261118009812",
                "reimburse_status": ReimbursementStatus.COMPLETED,
            },
            # --- Rohan Verma (3 bills: SUBMITTED, APPROVED, CHANGES_REQUESTED) ---
            {
                "title": "Robotics Workshop Hardware Kit",
                "description": "Microcontrollers and sensors for student demo",
                "category": "SUPPLIES",
                "amount": Decimal("6750.00"),
                "status": ExpenseStatus.SUBMITTED,
                "tier_req": 2,
                "tier_cur": 0,
                "submitter": rohan,
                "vendor": None,
                "days_ago": 2,
                "risk_score": 25,
                "risk_level": "LOW",
                "flags": [],
                "category_details": {},
            },
            {
                "title": "Hackathon Mentors Working Dinner",
                "description": "Dinner for 6 visiting judges & mentors",
                "category": "MEALS",
                "amount": Decimal("4800.00"),
                "status": ExpenseStatus.APPROVED,
                "tier_req": 2,
                "tier_cur": 2,
                "submitter": rohan,
                "vendor": None,
                "days_ago": 5,
                "risk_score": 20,
                "risk_level": "LOW",
                "flags": [],
                "category_details": {},
            },
            {
                "title": "Client Visit Cab Transfers",
                "description": "Airport & local transit receipts",
                "category": "TRAVEL",
                "amount": Decimal("1950.00"),
                "status": ExpenseStatus.CHANGES_REQUESTED,
                "tier_req": 2,
                "tier_cur": 0,
                "submitter": rohan,
                "vendor": None,
                "days_ago": 4,
                "risk_score": 30,
                "risk_level": "MEDIUM",
                "flags": [{"code": "WEEKEND_EXPENSE", "label": "Weekend Transaction", "detail": "Claimed on Sunday"}],
                "category_details": {
                    "travel_mode": "Cab / Taxi",
                    "start_date": "2026-11-20",
                    "end_date": "2026-11-20",
                    "boarding_point": "Airport",
                    "arrival_point": "Campus",
                },
            },
            # --- Priya Nair (2 bills: DRAFT, REJECTED) ---
            {
                "title": "AI Research Conference Registration",
                "description": "Draft registration pending invoice PDF",
                "category": "TRAINING",
                "amount": Decimal("14500.00"),
                "status": ExpenseStatus.DRAFT,
                "tier_req": 2,
                "tier_cur": 0,
                "submitter": priya,
                "vendor": None,
                "days_ago": 1,
                "risk_score": 0,
                "risk_level": "LOW",
                "flags": [],
                "category_details": {
                    "certification_name": "NeurIPS Workshop Pass",
                    "institute": "NeurIPS Foundation",
                    "enrollment_date": "2026-11-24",
                    "certification_type": "Technical Training",
                },
            },
            {
                "title": "Unapproved Lounge & Bar Bill",
                "description": "Non-compliant hospitality receipt",
                "category": "MEALS",
                "amount": Decimal("3200.00"),
                "status": ExpenseStatus.REJECTED,
                "tier_req": 2,
                "tier_cur": 0,
                "submitter": priya,
                "vendor": None,
                "days_ago": 7,
                "risk_score": 78,
                "risk_level": "HIGH",
                "flags": [{"code": "RESTRICTED_ITEM", "label": "Restricted Item Detected", "detail": "Alcoholic beverage line item"}],
                "category_details": {},
            },
            # --- Vendor Bills: Acme Cloud Solutions (2 bills: REIMBURSED + APPROVED) ---
            {
                "title": "Annual Cloud Cluster Hosting (Inv: ACM-2026-101)",
                "description": "Kubernetes & PostgreSQL production hosting - Oct",
                "category": "SOFTWARE",
                "amount": Decimal("28500.00"),
                "status": ExpenseStatus.REIMBURSED,
                "tier_req": 2,
                "tier_cur": 2,
                "submitter": admin,
                "vendor": v_acme,
                "days_ago": 12,
                "risk_score": 0,
                "risk_level": "LOW",
                "flags": [],
                "category_details": {"invoice_number": "ACM-2026-101"},
                "reimburse_txn": "NEFT20261114005511",
                "reimburse_status": ReimbursementStatus.COMPLETED,
            },
            {
                "title": "Cloud GPU Compute Add-on (Inv: ACM-2026-118)",
                "description": "OCR & AI model batch compute - Nov",
                "category": "SOFTWARE",
                "amount": Decimal("16400.00"),
                "status": ExpenseStatus.APPROVED,
                "tier_req": 2,
                "tier_cur": 2,
                "submitter": admin,
                "vendor": v_acme,
                "days_ago": 2,
                "risk_score": 0,
                "risk_level": "LOW",
                "flags": [],
                "category_details": {"invoice_number": "ACM-2026-118"},
            },
            # --- Vendor Bills: Apex Event & Print Supplies (2 bills: UNDER_REVIEW + REIMBURSED/FAILED) ---
            {
                "title": "Symposium Banners & Lanyards (Inv: APX-884)",
                "description": "Stage backdrop and 500 attendee badges",
                "category": "SUPPLIES",
                "amount": Decimal("12800.00"),
                "status": ExpenseStatus.UNDER_REVIEW,
                "tier_req": 2,
                "tier_cur": 1,
                "submitter": admin,
                "vendor": v_apex,
                "days_ago": 2,
                "risk_score": 0,
                "risk_level": "LOW",
                "flags": [],
                "category_details": {"invoice_number": "APX-884"},
            },
            {
                "title": "Event Brochures & Certificates (Inv: APX-852)",
                "description": "Printed certificates for winners",
                "category": "SUPPLIES",
                "amount": Decimal("7400.00"),
                "status": ExpenseStatus.APPROVED,
                "tier_req": 2,
                "tier_cur": 2,
                "submitter": admin,
                "vendor": v_apex,
                "days_ago": 6,
                "risk_score": 0,
                "risk_level": "LOW",
                "flags": [],
                "category_details": {"invoice_number": "APX-852"},
                "reimburse_txn": None,
                "reimburse_status": ReimbursementStatus.FAILED,
            },
            # --- Vendor Bill: Grand Hyatt Mumbai (1 bill: SUBMITTED) ---
            {
                "title": "Keynote Speaker Lodging (Inv: GH-9042)",
                "description": "2 nights executive suite for keynote guest",
                "category": "ACCOMMODATION",
                "amount": Decimal("24000.00"),
                "status": ExpenseStatus.SUBMITTED,
                "tier_req": 2,
                "tier_cur": 0,
                "submitter": admin,
                "vendor": v_hyatt,
                "days_ago": 1,
                "risk_score": 15,
                "risk_level": "LOW",
                "flags": [],
                "category_details": {
                    "invoice_number": "GH-9042",
                    "hotel_name": "Grand Hyatt Mumbai",
                    "hotel_location": "Bandra Kurla Complex, Mumbai",
                    "check_in": "2026-11-23T14:00",
                    "check_out": "2026-11-25T11:00",
                },
            },
        ]

        created_expenses = {}
        for idx, espec in enumerate(expenses_spec):
            ex_res = await db.execute(select(Expense).where(Expense.title == espec["title"]))
            exp = ex_res.scalars().first()
            if not exp:
                ts = now_minus(days=espec["days_ago"])
                r_hash = hashlib.sha256(f"{espec['title']}-{idx}".encode()).hexdigest()
                exp = Expense(
                    submitted_by=espec["submitter"].id,
                    vendor_id=espec["vendor"].id if espec["vendor"] else None,
                    title=espec["title"],
                    description=espec["description"],
                    category=espec["category"],
                    amount=espec["amount"],
                    currency="INR",
                    receipt_url=receipt_url_1,
                    receipt_hash=r_hash,
                    status=espec["status"],
                    approval_tier_required=espec["tier_req"],
                    current_approval_tier=espec["tier_cur"],
                    expense_date=ts,
                    risk_score=espec["risk_score"],
                    risk_level=espec["risk_level"],
                    forensic_flags=espec["flags"],
                    extracted_metadata={
                        "merchant_name": espec["vendor"].name if espec["vendor"] else espec["title"].split()[0],
                        "amount": float(espec["amount"]),
                        "expense_date": ts.strftime("%Y-%m-%d"),
                        "date_found_in_bill": True,
                        "verification_status": "VERIFIED",
                    },
                    category_details=espec["category_details"],
                    created_at=ts,
                    updated_at=ts,
                )
                db.add(exp)
                await db.flush()

                # Approvals trail
                if espec["tier_cur"] >= 1:
                    db.add(ExpenseApproval(
                        expense_id=exp.id,
                        reviewer_id=reviewer.id,
                        tier=1,
                        decision=ApprovalDecision.APPROVED,
                        comments="Tier 1 verified against receipt & policy.",
                        created_at=ts + timedelta(hours=2),
                    ))
                if espec["tier_cur"] >= 2:
                    db.add(ExpenseApproval(
                        expense_id=exp.id,
                        reviewer_id=admin.id,
                        tier=2,
                        decision=ApprovalDecision.APPROVED,
                        comments="Final administrative approval granted.",
                        created_at=ts + timedelta(hours=4),
                    ))
                if espec["status"] == ExpenseStatus.CHANGES_REQUESTED:
                    db.add(ExpenseApproval(
                        expense_id=exp.id,
                        reviewer_id=reviewer.id,
                        tier=1,
                        decision=ApprovalDecision.CHANGES_REQUESTED,
                        comments="Please attach the itemized cab fare breakdown.",
                        created_at=ts + timedelta(hours=3),
                    ))
                if espec["status"] == ExpenseStatus.REJECTED:
                    db.add(ExpenseApproval(
                        expense_id=exp.id,
                        reviewer_id=reviewer.id,
                        tier=1,
                        decision=ApprovalDecision.REJECTED,
                        comments="Restricted alcohol items are not reimbursable under corporate policy.",
                        created_at=ts + timedelta(hours=3),
                    ))

                # Reimbursements
                if "reimburse_status" in espec:
                    r_status = espec["reimburse_status"]
                    db.add(Reimbursement(
                        expense_id=exp.id,
                        processed_by=admin.id,
                        amount=exp.amount,
                        currency="INR",
                        status=r_status,
                        idempotency_key=f"seed-idemp-{uuid.uuid4().hex[:12]}",
                        transaction_id=espec.get("reimburse_txn"),
                        retry_count=1 if r_status == ReimbursementStatus.FAILED else 0,
                        provider_response={"status": r_status.value, "mode": "NEFT"},
                        disbursed_at=(ts + timedelta(hours=6)) if r_status == ReimbursementStatus.COMPLETED else None,
                        created_at=ts + timedelta(hours=5),
                    ))

            created_expenses[espec["title"]] = exp

        # 6. Sample Notifications (only insert if user has 0 notifications)
        notif_seeds = [
            (reviewer.id, "New Expense Claim for Review", "Ananya Sharma submitted 'Amrita Tech Symposium Flight' (INR 8,450.00) for Tier 1 review.", "REVIEW_REQUIRED", "/reviews"),
            (reviewer.id, "New Expense Claim for Review", "Rohan Verma submitted 'Robotics Workshop Hardware Kit' (INR 6,750.00) for Tier 1 review.", "REVIEW_REQUIRED", "/reviews"),
            (admin.id, "Claim Awaiting Final Admin Approval", "Reviewer Kavya Menon completed Tier 1 review for 'Amrita Tech Symposium Hotel Stay' (INR 11,200.00).", "ADMIN_APPROVAL_REQUIRED", "/approvals"),
            (admin.id, "Claim Awaiting Final Admin Approval", "Reviewer Kavya Menon completed Tier 1 review for 'Symposium Banners & Lanyards (Inv: APX-884)' (INR 12,800.00).", "ADMIN_APPROVAL_REQUIRED", "/approvals"),
            (ananya.id, "Review Passed — Sent to Admin for Final Approval", "Reviewer Kavya Menon approved your claim 'Amrita Tech Symposium Hotel Stay'. Forwarded to Admin.", "REVIEW_PASSED", "/expenses"),
            (ananya.id, "Claim Fully Approved by Admin", "Admin System Administrator granted final approval for 'AWS Cloud Practitioner Certification'. Queued for payout.", "CLAIM_APPROVED", "/expenses"),
            (rohan.id, "Modifications Requested on Claim", "Reviewer Kavya Menon requested changes on 'Client Visit Cab Transfers'. Note: Please attach the itemized cab fare breakdown.", "CHANGES_REQUESTED", "/expenses"),
        ]
        for uid, title, msg, ntype, link in notif_seeds:
            existing_n = await db.execute(select(Notification).where(Notification.user_id == uid, Notification.title == title, Notification.message == msg))
            if not existing_n.scalars().first():
                db.add(Notification(user_id=uid, title=title, message=msg, type=ntype, link=link, is_read=False))

        # 7. Sample Audit Logs
        audit_seeds = [
            (admin.id, "VENDOR", v_acme.id, "CREATE_VENDOR", {"name": v_acme.name, "pan": v_acme.pan}),
            (ananya.id, "EXPENSE", created_expenses["Amrita Tech Symposium Flight"].id, "SUBMIT", {"status": "SUBMITTED", "tier_required": 2}),
            (reviewer.id, "EXPENSE", created_expenses["Amrita Tech Symposium Hotel Stay"].id, "APPROVAL_APPROVED", {"status": "UNDER_REVIEW", "tier": 1}),
            (admin.id, "EXPENSE", created_expenses["AWS Cloud Practitioner Certification"].id, "APPROVAL_APPROVED", {"status": "APPROVED", "tier": 2}),
            (admin.id, "REIMBURSEMENT", created_expenses["Annual Cloud Cluster Hosting (Inv: ACM-2026-101)"].id, "DISBURSE_COMPLETED", {"amount": "28500.00", "transaction_id": "NEFT20261114005511"}),
        ]
        for actor_id, etype, eid, act, new_vals in audit_seeds:
            existing_a = await db.execute(select(AuditLog).where(AuditLog.entity_id == eid, AuditLog.action == act))
            if not existing_a.scalars().first():
                db.add(AuditLog(
                    actor_id=actor_id,
                    entity_type=etype,
                    entity_id=eid,
                    action=act,
                    new_values=new_vals,
                    ip_address="127.0.0.1",
                ))

        await db.commit()
        print("✅ Sample data seeded successfully across Users, Vendors, Expenses, Approvals, Reimbursements, Notifications, and Audit Logs!")


if __name__ == "__main__":
    asyncio.run(seed())
