import io
import uuid
import pytest
import openpyxl
from datetime import datetime, timezone, timedelta
from app.models import ExpenseStatus, UserRole


async def ensure_admin(client):
    await client.post("/api/v1/auth/register", json={
        "email": "v2.admin@crs-corp.com",
        "full_name": "V2 Admin",
        "password": "Password123!",
        "role": "ADMIN"
    })
    login_res = await client.post("/api/v1/auth/login", json={
        "email": "v2.admin@crs-corp.com",
        "password": "Password123!"
    })
    return {"Authorization": f"Bearer {login_res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_admin_pause_and_resume_submissions(client):
    """Admin can pause and resume company-wide expense submissions."""
    admin_headers = await ensure_admin(client)

    # 1. Register employee and setup bank details
    await client.post("/api/v1/auth/register", json={
        "email": "pause.test.emp@crs-corp.com",
        "full_name": "Pause Test Employee",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "pause.test.emp@crs-corp.com",
        "password": "Password123!"
    })
    emp_headers = {"Authorization": f"Bearer {emp_login.json()['access_token']}"}
    await client.patch("/api/v1/users/me", headers=emp_headers, json={
        "bank_details": {"account_number": "555566667777", "ifsc_code": "HDFC0005555"}
    })

    # 2. Admin pauses submissions
    p_res = await client.patch("/api/v1/settings", headers=admin_headers, json={
        "expense_submissions_enabled": False
    })
    assert p_res.status_code == 200
    assert p_res.json()["expense_submissions_enabled"] is False

    payload = {
        "title": "Cloud Server Provisioning",
        "amount": 3200.0,
        "category": "SOFTWARE",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/srv.png"
    }

    # 3. Employee tries to submit while submissions are paused -> BLOCKED 400
    sub_blocked = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json=payload)
    assert sub_blocked.status_code == 400
    assert "temporarily paused" in sub_blocked.json()["detail"]

    # 4. Employee can still save as DRAFT
    draft_res = await client.post("/api/v1/expenses?submit_now=false", headers=emp_headers, json=payload)
    assert draft_res.status_code == 201
    claim_id = draft_res.json()["id"]

    # 5. Submitting draft while paused -> BLOCKED 400
    sub_draft_blocked = await client.post(f"/api/v1/expenses/{claim_id}/submit", headers=emp_headers)
    assert sub_draft_blocked.status_code == 400
    assert "temporarily paused" in sub_draft_blocked.json()["detail"]

    # 6. Admin re-enables submissions
    r_res = await client.patch("/api/v1/settings", headers=admin_headers, json={
        "expense_submissions_enabled": True
    })
    assert r_res.status_code == 200

    # 7. Employee submits draft -> SUCCEEDS 200
    sub_draft_ok = await client.post(f"/api/v1/expenses/{claim_id}/submit", headers=emp_headers)
    assert sub_draft_ok.status_code == 200
    assert sub_draft_ok.json()["status"] == "SUBMITTED"


@pytest.mark.asyncio
async def test_admin_date_policy_window_flag_and_escalate(client):
    """Expenses falling outside the admin's authorized date window are flagged and escalated."""
    admin_headers = await ensure_admin(client)

    # 1. Setup employee
    await client.post("/api/v1/auth/register", json={
        "email": "datewindow.emp@crs-corp.com",
        "full_name": "Date Window Employee",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "datewindow.emp@crs-corp.com",
        "password": "Password123!"
    })
    emp_headers = {"Authorization": f"Bearer {emp_login.json()['access_token']}"}
    await client.patch("/api/v1/users/me", headers=emp_headers, json={
        "bank_details": {"account_number": "444433332222", "ifsc_code": "HDFC0004444"}
    })

    # 2. Admin configures authorized date window: 2026-11-01 to 2026-11-10
    start_dt = "2026-11-01T00:00:00Z"
    end_dt = "2026-11-10T23:59:59Z"
    await client.patch("/api/v1/settings", headers=admin_headers, json={
        "enforce_date_window": True,
        "policy_allowed_start_date": start_dt,
        "policy_allowed_end_date": end_dt,
        "multi_tier_approval_enabled": True
    })

    # 3. Employee submits claim INSIDE the authorized date window (2026-11-05) -> NOT flagged
    in_win_res = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "Authorized In-Window Travel",
        "amount": 4000.0,
        "category": "TRAVEL",
        "expense_date": "2026-11-05T10:00:00Z",
        "receipt_url": "https://storage.crs-corp.com/receipts/travel_in.png",
        "category_details": {
            "travel_mode": "Flight",
            "start_date": "2026-11-05",
            "end_date": "2026-11-06",
            "boarding_point": "DEL",
            "arrival_point": "BLR"
        }
    })
    assert in_win_res.status_code == 201
    in_win_data = in_win_res.json()
    flags_in = [f["code"] for f in in_win_data["forensic_flags"]]
    assert "OUT_OF_POLICY_DATE_WINDOW" not in flags_in
    assert in_win_data["approval_tier_required"] == 1

    # 4. Employee submits claim OUTSIDE the authorized date window (2026-11-20) -> FLAGGED & ESCALATED TO TIER 2
    out_win_res = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "Out-of-Window Incident",
        "amount": 4000.0,
        "category": "TRAVEL",
        "expense_date": "2026-11-20T10:00:00Z",
        "receipt_url": "https://storage.crs-corp.com/receipts/travel_out.png",
        "category_details": {
            "travel_mode": "Flight",
            "start_date": "2026-11-20",
            "end_date": "2026-11-21",
            "boarding_point": "DEL",
            "arrival_point": "BOM"
        }
    })
    assert out_win_res.status_code == 201
    out_win_data = out_win_res.json()
    flags_out = [f["code"] for f in out_win_data["forensic_flags"]]
    assert "OUT_OF_POLICY_DATE_WINDOW" in flags_out
    assert out_win_data["approval_tier_required"] == 2


@pytest.mark.asyncio
async def test_multi_tier_approval_toggle(client):
    """Admin can enable or disable multi-tier approval hierarchy enterprise-wide."""
    admin_headers = await ensure_admin(client)

    await client.post("/api/v1/auth/register", json={
        "email": "multitier.emp@crs-corp.com",
        "full_name": "Multi Tier Emp",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "multitier.emp@crs-corp.com",
        "password": "Password123!"
    })
    emp_headers = {"Authorization": f"Bearer {emp_login.json()['access_token']}"}
    await client.patch("/api/v1/users/me", headers=emp_headers, json={
        "bank_details": {"account_number": "888877776666", "ifsc_code": "SBIN0008888"}
    })

    # Disable date window enforcement, disable multi-tier approval
    await client.patch("/api/v1/settings", headers=admin_headers, json={
        "enforce_date_window": False,
        "multi_tier_approval_enabled": False,
        "tier2_approval_threshold": 25000.0
    })

    # High amount claim ($60,000 > $25,000 threshold) with multi-tier DISABLED -> Requires only 1 tier!
    res1 = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "High Value Equipment Purchase",
        "amount": 60000.0,
        "category": "HARDWARE",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/hw.png"
    })
    assert res1.status_code == 201
    assert res1.json()["approval_tier_required"] == 1

    # First approval finalizes the claim to APPROVED
    app_res = await client.post(f"/api/v1/approvals/{res1.json()['id']}/review", headers=admin_headers, json={
        "decision": "APPROVED",
        "comments": "Approved on single tier"
    })
    assert app_res.status_code == 200
    assert app_res.json()["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_reimbursement_with_transfer_transaction_id(client):
    """Admin/Reviewer records transfer transaction ID upon confirming payout."""
    admin_headers = await ensure_admin(client)

    # 1. Setup employee with claim and approve it
    await client.post("/api/v1/auth/register", json={
        "email": "reimb.txn.emp@crs-corp.com",
        "full_name": "Reimb Txn Employee",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "reimb.txn.emp@crs-corp.com",
        "password": "Password123!"
    })
    emp_headers = {"Authorization": f"Bearer {emp_login.json()['access_token']}"}
    await client.patch("/api/v1/users/me", headers=emp_headers, json={
        "bank_details": {
            "account_holder_name": "Reimb Txn Employee",
            "account_number": "123123123123",
            "bank_name": "HDFC Bank",
            "ifsc_code": "HDFC0001231"
        }
    })

    # Reset multi-tier to False for fast approval
    await client.patch("/api/v1/settings", headers=admin_headers, json={
        "enforce_date_window": False,
        "multi_tier_approval_enabled": False
    })

    c_res = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "Client Dinner Reimbursement",
        "amount": 3500.0,
        "category": "MEALS",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/dinner.png"
    })
    claim_id = c_res.json()["id"]

    await client.post(f"/api/v1/approvals/{claim_id}/review", headers=admin_headers, json={
        "decision": "APPROVED",
        "comments": "Verified and approved"
    })

    # 2. Confirm reimbursement with transfer transaction ID
    transfer_utr = "UTR-HDFC-9948201938"
    reimb_res = await client.post("/api/v1/reimbursements", headers=admin_headers, json={
        "expense_id": claim_id,
        "idempotency_key": f"idemp-reimb-txn-{claim_id}",
        "transaction_id": transfer_utr
    })
    assert reimb_res.status_code == 201
    reimb_data = reimb_res.json()
    assert reimb_data["transaction_id"] == transfer_utr
    assert reimb_data["status"] == "COMPLETED"

    # 3. Verify listed reimbursements contain the transaction_id
    list_res = await client.get("/api/v1/reimbursements", headers=admin_headers)
    assert list_res.status_code == 200
    items = [r for r in list_res.json() if r["expense_id"] == claim_id]
    assert len(items) == 1
    assert items[0]["transaction_id"] == transfer_utr


@pytest.mark.asyncio
async def test_xlsx_export_formatting_and_hyperlinks(client):
    """XLSX export generates a valid Excel workbook with emerald header styling and hyperlinks."""
    admin_headers = await ensure_admin(client)

    exp_res = await client.get("/api/v1/expenses/export?sort_by=created_at&sort_order=desc", headers=admin_headers)
    assert exp_res.status_code == 200
    assert "openxmlformats" in exp_res.headers["content-type"]

    wb = openpyxl.load_workbook(io.BytesIO(exp_res.content))
    ws = wb.active
    assert ws.title == "Expense Submissions"

    # Check headers
    first_row = [cell.value for cell in ws[1]]
    assert "Expense ID" in first_row
    assert "Receipt Document Link" in first_row
    assert "Category Specific Details" in first_row
    assert "Extracted Merchant" in first_row
    assert "Date Verified In Bill" in first_row

    # Check header fill color (Corporate Emerald)
    first_cell = ws.cell(row=1, column=1)
    assert first_cell.fill.start_color.rgb in ("00059669", "059669")
    assert first_cell.font.bold is True


@pytest.mark.asyncio
async def test_category_mandatory_details_filling(client):
    """Enforces category-specific mandatory details for Hotel, Training, and Travel."""
    admin_headers = await ensure_admin(client)

    # Setup employee
    await client.post("/api/v1/auth/register", json={
        "email": "catdetails.emp@crs-corp.com",
        "full_name": "Category Details Emp",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "catdetails.emp@crs-corp.com",
        "password": "Password123!"
    })
    emp_headers = {"Authorization": f"Bearer {emp_login.json()['access_token']}"}
    await client.patch("/api/v1/users/me", headers=emp_headers, json={
        "bank_details": {"account_number": "112233445566", "ifsc_code": "HDFC0001122"}
    })

    # 1. Hotel & Lodging without required details fails
    res_hotel_fail = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "Grand Hotel Stay",
        "amount": 7500.0,
        "category": "ACCOMMODATION",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/hotel.png"
    })
    assert res_hotel_fail.status_code == 400
    assert "Hotel & Lodging requires the following mandatory details" in res_hotel_fail.json()["detail"]

    # 2. Hotel & Lodging with all mandatory details succeeds
    res_hotel_ok = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "Grand Hotel Stay",
        "amount": 7500.0,
        "category": "ACCOMMODATION",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/hotel.png",
        "category_details": {
            "hotel_name": "Taj Lands End",
            "check_in": "2026-11-10 14:00",
            "check_out": "2026-11-12 11:00",
            "hotel_location": "Bandra West, Mumbai",
            "contact_number": "+91 22 6668 1234"
        }
    })
    assert res_hotel_ok.status_code == 201
    assert res_hotel_ok.json()["category_details"]["hotel_name"] == "Taj Lands End"

    # 3. Training & Certifications without details fails
    res_train_fail = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "AWS Solutions Architect",
        "amount": 15000.0,
        "category": "TRAINING",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/aws_exam.png"
    })
    assert res_train_fail.status_code == 400
    assert "Training & Certifications requires the following mandatory details" in res_train_fail.json()["detail"]

    # 4. Training & Certifications with details succeeds
    res_train_ok = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "AWS Solutions Architect",
        "amount": 15000.0,
        "category": "TRAINING",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/aws_exam.png",
        "category_details": {
            "certification_name": "AWS Certified Solutions Architect - Associate",
            "institute": "Amazon Web Services",
            "enrollment_date": "2026-11-01",
            "certification_type": "Technical Training"
        }
    })
    assert res_train_ok.status_code == 201
    assert res_train_ok.json()["category_details"]["institute"] == "Amazon Web Services"

    # 5. Travel & Commute without details fails
    res_travel_fail = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "Client Meeting Flight",
        "amount": 8200.0,
        "category": "TRAVEL",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/flight.png"
    })
    assert res_travel_fail.status_code == 400
    assert "Travel & Commute requires the following mandatory details" in res_travel_fail.json()["detail"]

    # 6. Travel & Commute with details succeeds
    res_travel_ok = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "Client Meeting Flight",
        "amount": 8200.0,
        "category": "TRAVEL",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/flight.png",
        "category_details": {
            "travel_mode": "Flight",
            "start_date": "2026-11-15",
            "end_date": "2026-11-16",
            "boarding_point": "DEL",
            "arrival_point": "BLR"
        }
    })
    assert res_travel_ok.status_code == 201
    assert res_travel_ok.json()["category_details"]["boarding_point"] == "DEL"


@pytest.mark.asyncio
async def test_behalf_of_submission_and_flexible_deletion(client):
    """
    1. Admin / Reviewer can submit on behalf of an employee.
    2. Non-admins cannot submit on behalf of others.
    3. Employees can delete their own unaccepted claims.
    4. Employees CANNOT delete accepted / approved claims.
    5. Admin CAN delete other users' claims, even if approved.
    """
    admin_headers = await ensure_admin(client)

    # 1. Register employee
    await client.post("/api/v1/auth/register", json={
        "email": "target.emp@crs-corp.com",
        "full_name": "Target Employee",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "target.emp@crs-corp.com",
        "password": "Password123!"
    })
    emp_token = emp_login.json()["access_token"]
    emp_headers = {"Authorization": f"Bearer {emp_token}"}
    target_emp_id = emp_login.json()["user"]["id"]

    await client.patch("/api/v1/users/me", headers=emp_headers, json={
        "bank_details": {"account_number": "998877665544", "ifsc_code": "HDFC0009988"}
    })

    # 2. Admin submits claim on behalf of employee
    proxy_res = await client.post("/api/v1/expenses?submit_now=false", headers=admin_headers, json={
        "title": "On-Behalf Software Tool",
        "amount": 2500.0,
        "category": "SOFTWARE",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/tool.png",
        "on_behalf_of_user_id": target_emp_id
    })
    assert proxy_res.status_code == 201
    claim_id = proxy_res.json()["id"]
    assert proxy_res.json()["submitted_by"] == target_emp_id

    # 3. Employee sees the claim in their list and can delete it while it's DRAFT
    emp_del_res = await client.delete(f"/api/v1/expenses/{claim_id}", headers=emp_headers)
    assert emp_del_res.status_code == 204

    # 4. Another claim submitted and approved
    c2_res = await client.post("/api/v1/expenses?submit_now=true", headers=admin_headers, json={
        "title": "On-Behalf Approved Commute",
        "amount": 1800.0,
        "category": "MEALS",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/meal.png",
        "on_behalf_of_user_id": target_emp_id
    })
    assert c2_res.status_code == 201
    c2_id = c2_res.json()["id"]

    # Approve the claim
    appr_res = await client.post(f"/api/v1/approvals/{c2_id}/review", headers=admin_headers, json={
        "decision": "APPROVED",
        "comments": "Approved on behalf"
    })
    assert appr_res.status_code == 200

    # 5. Employee attempts to delete accepted claim -> MUST BE REJECTED (400)
    del_blocked = await client.delete(f"/api/v1/expenses/{c2_id}", headers=emp_headers)
    assert del_blocked.status_code == 400
    assert "cannot be deleted" in del_blocked.json()["detail"].lower()

    # 6. Admin can delete the accepted claim -> SUCCEEDS (204)
    admin_del = await client.delete(f"/api/v1/expenses/{c2_id}", headers=admin_headers)
    assert admin_del.status_code == 204


@pytest.mark.asyncio
async def test_drafts_privacy_from_admins_and_reviewers(client):
    """
    Ensure drafts are strictly private to the user who created them:
    - Never visible in list_expenses or export_expenses to Admins, Reviewers, or Finance.
    - Direct access by ID returns 403 Forbidden for non-owners.
    - Only becomes visible to reviewing personnel once formally SUBMITTED.
    """
    # 1. Login Admin, Reviewer, and Employee
    admin_headers = await ensure_admin(client)

    await client.post("/api/v1/auth/register", json={
        "email": "v2.reviewer.draft@crs-corp.com",
        "full_name": "V2 Reviewer Draft",
        "password": "Password123!",
        "role": "REVIEWER"
    })
    rev_login = await client.post("/api/v1/auth/login", json={
        "email": "v2.reviewer.draft@crs-corp.com",
        "password": "Password123!"
    })
    rev_token = rev_login.json()["access_token"]
    rev_headers = {"Authorization": f"Bearer {rev_token}"}

    emp_email = f"emp.draft.{uuid.uuid4().hex[:6]}@company.com"
    await client.post("/api/v1/auth/register", json={
        "email": emp_email, "password": "Password123!", "full_name": "Private Draft Employee"
    })
    emp_token = (await client.post("/api/v1/auth/login", json={"email": emp_email, "password": "Password123!"})).json()["access_token"]
    emp_headers = {"Authorization": f"Bearer {emp_token}"}

    # 2. Employee creates a DRAFT claim
    draft_res = await client.post("/api/v1/expenses?submit_now=false", headers=emp_headers, json={
        "title": "Confidential Preliminary Draft",
        "amount": 4200.0,
        "category": "SUPPLIES",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/supplies.png"
    })
    assert draft_res.status_code == 201
    draft_id = draft_res.json()["id"]

    # 3. Employee CAN see their own draft in list & detail
    emp_list = await client.get("/api/v1/expenses", headers=emp_headers)
    assert any(e["id"] == draft_id for e in emp_list.json())

    emp_detail = await client.get(f"/api/v1/expenses/{draft_id}", headers=emp_headers)
    assert emp_detail.status_code == 200

    # 4. Admin CANNOT see the employee's draft in /expenses (all or status=DRAFT)
    admin_list = await client.get("/api/v1/expenses", headers=admin_headers)
    assert not any(e["id"] == draft_id for e in admin_list.json())

    admin_drafts = await client.get("/api/v1/expenses?status=DRAFT", headers=admin_headers)
    assert not any(e["id"] == draft_id for e in admin_drafts.json())

    # 5. Reviewer CANNOT see the employee's draft in /expenses
    rev_list = await client.get("/api/v1/expenses", headers=rev_headers)
    assert not any(e["id"] == draft_id for e in rev_list.json())

    rev_drafts = await client.get("/api/v1/expenses?status=DRAFT", headers=rev_headers)
    assert not any(e["id"] == draft_id for e in rev_drafts.json())

    # 6. Admin and Reviewer CANNOT retrieve detail of employee's draft -> 403 Forbidden
    admin_detail = await client.get(f"/api/v1/expenses/{draft_id}", headers=admin_headers)
    assert admin_detail.status_code == 403
    assert "private" in admin_detail.json()["detail"].lower()

    rev_detail = await client.get(f"/api/v1/expenses/{draft_id}", headers=rev_headers)
    assert rev_detail.status_code == 403

    # 7. Admin CANNOT delete employee's draft -> 403 Forbidden
    admin_del = await client.delete(f"/api/v1/expenses/{draft_id}", headers=admin_headers)
    assert admin_del.status_code == 403

    # 8. Employee submits bank details & submits the draft -> moves to SUBMITTED
    await client.patch("/api/v1/users/me", headers=emp_headers, json={
        "bank_details": {"account_number": "112233445566", "ifsc_code": "SBIN0001122"}
    })
    sub_res = await client.post(f"/api/v1/expenses/{draft_id}/submit", headers=emp_headers)
    assert sub_res.status_code == 200
    assert sub_res.json()["status"] == "SUBMITTED"

    # 9. NOW Admin & Reviewer CAN see the submitted expense
    admin_list_after = await client.get("/api/v1/expenses", headers=admin_headers)
    assert any(e["id"] == draft_id for e in admin_list_after.json())

    rev_list_after = await client.get("/api/v1/expenses", headers=rev_headers)
    assert any(e["id"] == draft_id for e in rev_list_after.json())


@pytest.mark.asyncio
async def test_expense_deletion_removes_file_from_storage(client):
    """
    Upon deleting an expense claim, the uploaded receipt file must be permanently
    removed from the storage bucket / local file storage.
    """
    import os
    from app.services.storage import storage_service

    # 1. Register and setup employee
    emp_email = f"emp.storage.{uuid.uuid4().hex[:6]}@company.com"
    await client.post("/api/v1/auth/register", json={
        "email": emp_email, "password": "Password123!", "full_name": "Storage Test Employee"
    })
    emp_token = (await client.post("/api/v1/auth/login", json={"email": emp_email, "password": "Password123!"})).json()["access_token"]
    emp_headers = {"Authorization": f"Bearer {emp_token}"}

    # 2. Upload a test receipt file via receipts API
    test_file_content = b"Mock receipt image data for storage test"
    files = {"file": ("test_receipt_to_delete.jpg", test_file_content, "image/jpeg")}
    upload_res = await client.post("/api/v1/receipts/upload", headers=emp_headers, files=files)
    assert upload_res.status_code == 200
    receipt_url = upload_res.json()["url"]
    receipt_key = upload_res.json()["key"]

    # Verify file exists in local storage
    local_path = storage_service.get_local_file_path(receipt_key)
    assert os.path.exists(local_path)

    # 3. Create expense with this receipt URL as DRAFT
    exp_res = await client.post("/api/v1/expenses?submit_now=false", headers=emp_headers, json={
        "title": "Expense to Delete with File",
        "amount": 950.0,
        "category": "MEALS",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": receipt_url
    })
    assert exp_res.status_code == 201
    expense_id = exp_res.json()["id"]

    # 4. Delete the expense
    del_res = await client.delete(f"/api/v1/expenses/{expense_id}", headers=emp_headers)
    assert del_res.status_code == 204

    # 5. Verify the file was permanently deleted from storage
    assert not os.path.exists(local_path)


@pytest.mark.asyncio
async def test_google_auth_endpoint_and_config(client):
    """
    1. GET /api/v1/auth/google/config returns client_id status.
    2. POST /api/v1/auth/google without credentials returns 401.
    3. POST /api/v1/auth/google with valid credentials provisions user and returns tokens.
    """
    await ensure_admin(client)

    # 1. Config endpoint
    cfg_res = await client.get("/api/v1/auth/google/config")
    assert cfg_res.status_code == 200
    cfg_data = cfg_res.json()
    assert "client_id" in cfg_data
    assert "is_configured" in cfg_data

    # 2. Missing credentials -> 401 Unauthorized
    bad_res = await client.post("/api/v1/auth/google", json={})
    assert bad_res.status_code == 401
    assert "Invalid Google Authentication token" in bad_res.json()["detail"]

    # 3. Valid synthetic payload for testing provisions new Google employee
    google_email = f"emp.google.{uuid.uuid4().hex[:6]}@company.com"
    auth_res = await client.post("/api/v1/auth/google", json={
        "email": google_email,
        "full_name": "Google User Verified"
    })
    assert auth_res.status_code == 200
    auth_data = auth_res.json()
    assert "access_token" in auth_data
    assert "refresh_token" in auth_data
    assert auth_data["user"]["email"] == google_email
    assert auth_data["user"]["full_name"] == "Google User Verified"
    assert auth_data["user"]["role"] == "EMPLOYEE"
