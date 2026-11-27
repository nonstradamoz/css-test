import pytest
from datetime import datetime, timezone, timedelta
from app.services.extractor.financial_parser import FinancialParser
from app.models import UserRole


async def ensure_admin(client):
    """Ensure at least one admin is registered and return admin headers."""
    await client.post("/api/v1/auth/register", json={
        "email": "root.admin@crs-corp.com",
        "full_name": "Root Admin",
        "password": "Password123!",
        "role": "ADMIN"
    })
    l_res = await client.post("/api/v1/auth/login", json={
        "email": "root.admin@crs-corp.com",
        "password": "Password123!"
    })
    return {"Authorization": f"Bearer {l_res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_feature1_bank_details_submission_guard(client):
    """Feature 1: Employee cannot submit expense without bank details; drafts allowed; submits after adding."""
    await ensure_admin(client)
    # 1. Register employee
    reg_res = await client.post("/api/v1/auth/register", json={
        "email": "bankguard.emp@crs-corp.com",
        "full_name": "Bank Guard Emp",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    assert reg_res.status_code == 201
    assert reg_res.json()["role"] == "EMPLOYEE"

    login_res = await client.post("/api/v1/auth/login", json={
        "email": "bankguard.emp@crs-corp.com",
        "password": "Password123!"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "title": "Software Tool Subscription",
        "amount": 2500.0,
        "category": "SOFTWARE",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/tool.png"
    }

    # Attempt to submit now without bank details -> BLOCKED 400
    res_blocked = await client.post("/api/v1/expenses?submit_now=true", json=payload, headers=headers)
    assert res_blocked.status_code == 400
    assert "Bank account or UPI details are required" in res_blocked.json()["detail"]

    # Save as draft -> SUCCEEDS 201
    res_draft = await client.post("/api/v1/expenses?submit_now=false", json=payload, headers=headers)
    assert res_draft.status_code == 201
    claim_id = res_draft.json()["id"]
    assert res_draft.json()["status"] == "DRAFT"

    # Direct submit attempt on draft without bank details -> BLOCKED 400
    res_sub_blocked = await client.post(f"/api/v1/expenses/{claim_id}/submit", headers=headers)
    assert res_sub_blocked.status_code == 400
    assert "Bank account or UPI details are required" in res_sub_blocked.json()["detail"]

    # Configure bank details on profile (PAN is optional for employees)
    res_profile = await client.patch("/api/v1/users/me", headers=headers, json={
        "bank_details": {
            "account_holder_name": "Bank Guard Emp",
            "bank_name": "State Bank of India",
            "account_number": "123456789012",
            "ifsc_code": "SBIN0001234"
        }
    })
    assert res_profile.status_code == 200

    # Submit saved draft now without PAN -> SUCCEEDS 200
    res_sub_success = await client.post(f"/api/v1/expenses/{claim_id}/submit", headers=headers)
    assert res_sub_success.status_code == 200
    assert res_sub_success.json()["status"] == "SUBMITTED"

    # Optional: Employee can still add PAN details & document if they have one
    res_pan_ok = await client.patch("/api/v1/users/me", headers=headers, json={
        "pan_number": "ABCDE1234F",
        "pan_document_url": "https://storage.crs-corp.com/pan/sample_pan.pdf"
    })
    assert res_pan_ok.status_code == 200


@pytest.mark.asyncio
async def test_feature2_admin_reviewer_export_csv_with_links(client):
    """Feature 2: Admin & Reviewer can export sorted expenses with uploaded document links."""
    await ensure_admin(client)
    # 1. Admin login
    admin_login = await client.post("/api/v1/auth/login", json={
        "email": "root.admin@crs-corp.com",
        "password": "Password123!"
    })
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    # 2. Export Excel (.xlsx) as admin
    exp_res = await client.get("/api/v1/expenses/export?sort_by=created_at&sort_order=desc", headers=admin_headers)
    assert exp_res.status_code == 200
    assert "openxmlformats" in exp_res.headers["content-type"]
    import io
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(exp_res.content))
    ws = wb.active
    assert ws.title == "Expense Submissions"
    assert len(wb.sheetnames) == 1
    row1 = [cell.value for cell in ws[1]]
    assert "Sno." in row1
    assert "PAN Card Document" in row1
    assert "Receipt Uploaded" in row1
    assert "Category of Expense" in row1

    # 3. Employee forbidden from export (403)
    await client.post("/api/v1/auth/register", json={
        "email": "export.employee@crs-corp.com",
        "full_name": "Export Employee",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "export.employee@crs-corp.com",
        "password": "Password123!"
    })
    emp_headers = {"Authorization": f"Bearer {emp_login.json()['access_token']}"}
    emp_export = await client.get("/api/v1/expenses/export", headers=emp_headers)
    assert emp_export.status_code == 403


@pytest.mark.asyncio
async def test_feature3_reviewer_disburse_and_reviews(client):
    """Feature 3: Reviewer role has full review and payout disbursement capability."""
    admin_headers = await ensure_admin(client)
    # Admin provisions Reviewer via /users
    await client.post("/api/v1/users", headers=admin_headers, json={
        "email": "finance.reviewer@crs-corp.com",
        "full_name": "Finance Reviewer",
        "password": "Password123!",
        "role": "REVIEWER"
    })
    rev_login = await client.post("/api/v1/auth/login", json={
        "email": "finance.reviewer@crs-corp.com",
        "password": "Password123!"
    })
    rev_headers = {"Authorization": f"Bearer {rev_login.json()['access_token']}"}

    # Reviewer can also export CSV
    rev_export = await client.get("/api/v1/expenses/export", headers=rev_headers)
    assert rev_export.status_code == 200


@pytest.mark.asyncio
async def test_feature4_cross_user_duplicate_prohibition(client):
    """Feature 4: Prohibit duplicate submissions across ALL users (same title + amount + date within 24h)."""
    await ensure_admin(client)
    # User A registers & sets bank details
    await client.post("/api/v1/auth/register", json={
        "email": "user.alice@crs-corp.com",
        "full_name": "Alice Submitter",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    l_a = await client.post("/api/v1/auth/login", json={"email": "user.alice@crs-corp.com", "password": "Password123!"})
    h_a = {"Authorization": f"Bearer {l_a.json()['access_token']}"}
    await client.patch("/api/v1/users/me", headers=h_a, json={
        "bank_details": {"account_number": "999911112222", "ifsc_code": "HDFC0009999"},
        "pan_number": "ABCDE1234F",
        "pan_document_url": "https://storage.crs-corp.com/pan/sample_pan.pdf"
    })

    # User B registers & sets bank details
    await client.post("/api/v1/auth/register", json={
        "email": "user.bob@crs-corp.com",
        "full_name": "Bob Submitter",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    l_b = await client.post("/api/v1/auth/login", json={"email": "user.bob@crs-corp.com", "password": "Password123!"})
    h_b = {"Authorization": f"Bearer {l_b.json()['access_token']}"}
    await client.patch("/api/v1/users/me", headers=h_b, json={
        "bank_details": {"account_number": "888811112222", "ifsc_code": "HDFC0008888"},
        "pan_number": "ABCDE1234F",
        "pan_document_url": "https://storage.crs-corp.com/pan/sample_pan.pdf"
    })

    same_date = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    claim_payload = {
        "title": "AWS Cloud Production Cluster",
        "amount": 18450.00,
        "category": "SOFTWARE",
        "expense_date": same_date,
        "receipt_url": "https://storage.crs-corp.com/receipts/aws_cluster.png"
    }

    # Alice submits claim
    res_a = await client.post("/api/v1/expenses?submit_now=true", json=claim_payload, headers=h_a)
    assert res_a.status_code == 201

    # Bob attempts to submit the EXACT SAME expense (matching title + amount + date within 24h) -> MUST BE BLOCKED
    res_b = await client.post("/api/v1/expenses?submit_now=true", json=claim_payload, headers=h_b)
    assert res_b.status_code == 400
    assert "Prohibited duplicate expense" in res_b.json()["detail"]
    assert "another user" in res_b.json()["detail"]


def test_feature5_and_6_bill_date_extractor_and_verification():
    """Features 5 & 6: Data extractions verification and explicit bill date search."""
    sample_ocr = """
    BLUE STAR DENTAL CLINIC
    104 Richmond Road, Bangalore
    Invoice No: BSD-9901
    Dated: 14/11/2026
    Txn ID: UPI-9876543210
    Contact: +91 98450 12345
    Consultation Fee: Rs. 1,500.00
    Total Paid: Rs. 1,500.00
    """
    parsed = FinancialParser.parse(
        sample_ocr,
        filename="sample_receipt.png",
        method="CUSTOM_REGEX",
        base_confidence=0.90
    )
    assert parsed["amount"] == 1500.00
    assert parsed["expense_date"] == "2026-11-14"
    assert parsed["date_found_in_bill"] is True
    assert parsed["invoice_number"] == "BSD-9901"
    assert parsed["transaction_id"] in ("9876543210", "UPI-9876543210")
    assert parsed["date_verified"] is True
    assert parsed["amount_verified"] is True
    assert parsed["identifiers_verified"] is True
    assert parsed["verification_status"] == "VERIFIED"


@pytest.mark.asyncio
async def test_feature7_google_authentication(client):
    """Feature 7: Google Authentication via POST /api/v1/auth/google."""
    await ensure_admin(client)
    google_payload = {
        "id_token": "mock_google_id_token_sarah.connor@enterprisegoogle.com",
        "full_name": "Sarah Connor"
    }
    res = await client.post("/api/v1/auth/google", json=google_payload)
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "sarah.connor@enterprisegoogle.com"
    assert data["user"]["full_name"] == "Sarah Connor"
    assert data["user"]["role"] == "EMPLOYEE"
