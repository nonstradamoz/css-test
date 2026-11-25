import pytest
from decimal import Decimal
from datetime import datetime, timedelta, timezone

from app.models import ExpenseStatus


@pytest.mark.asyncio
async def test_ai_receipt_scanner_endpoint(client):
    # Register and login admin
    admin_data = {
        "email": "scanner.test@crs-corp.com",
        "full_name": "Scanner Test Admin",
        "password": "Password123!",
        "role": "ADMIN"
    }
    await client.post("/api/v1/auth/register", json=admin_data)
    login_res = await client.post("/api/v1/auth/login", json={
        "email": "scanner.test@crs-corp.com",
        "password": "Password123!"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test receipt analysis with mock file upload (handwritten taxi slip)
    files = {"file": ("taxi_handwritten_slip.jpg", b"fake image bytes", "image/jpeg")}
    res = await client.post("/api/v1/receipts/analyze", headers=headers, files=files)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["is_handwritten"] is True
    assert data["amount"] > 0
    assert data["suggested_category"] == "TRAVEL"
    assert len(data["line_items"]) >= 1

    # 2. Test receipt analysis with restaurant bill containing prohibited keyword
    files_food = {"file": ("dinner_food_restaurant_receipt.jpg", b"fake bytes", "image/jpeg")}
    res_food = await client.post("/api/v1/receipts/analyze", headers=headers, files=files_food)
    assert res_food.status_code == 200
    data_food = res_food.json()
    assert any(item["flagged"] for item in data_food["line_items"])


@pytest.mark.asyncio
async def test_forensics_smurfing_and_escalation(client):
    admin_data = {
        "email": "smurf.test@crs-corp.com",
        "full_name": "Smurf Tester",
        "password": "Password123!",
        "role": "EMPLOYEE"
    }
    await client.post("/api/v1/auth/register", json=admin_data)
    login_res = await client.post("/api/v1/auth/login", json={
        "email": "smurf.test@crs-corp.com",
        "password": "Password123!"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # First claim: ₹24,000 (below ₹25k threshold) -> single tier
    c1 = await client.post("/api/v1/expenses?submit_now=true", headers=headers, json={
        "title": "Vendor Project Payment Part 1",
        "amount": 24000.00,
        "category": "SUPPLIES",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/r1.png"
    })
    assert c1.status_code == 201
    claim1 = c1.json()
    assert claim1["approval_tier_required"] == 2

    # Second claim 1 hour later: ₹23,500 (individual < 25k, but cumulative = ₹47,500 > 25k)
    c2 = await client.post("/api/v1/expenses?submit_now=true", headers=headers, json={
        "title": "Vendor Project Payment Part 2",
        "amount": 23500.00,
        "category": "SUPPLIES",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/r2.png"
    })
    assert c2.status_code == 201
    claim2 = c2.json()

    # Forensics should detect smurfing and escalate claim2 to Tier 2!
    assert claim2["risk_score"] >= 35
    assert claim2["approval_tier_required"] == 2
    assert any(f["code"] == "THRESHOLD_SMURFING" for f in claim2["forensic_flags"])


@pytest.mark.asyncio
async def test_cross_employee_collusion_blocking(client):
    # Employee 1
    await client.post("/api/v1/auth/register", json={
        "email": "emp1.collusion@crs-corp.com",
        "full_name": "Employee One",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    l1 = await client.post("/api/v1/auth/login", json={"email": "emp1.collusion@crs-corp.com", "password": "Password123!"})
    t1 = l1.json()["access_token"]
    await client.patch("/api/v1/users/me", headers={"Authorization": f"Bearer {t1}"}, json={
        "bank_details": {"account_number": "111122223333", "ifsc_code": "HDFC0001111"}
    })

    shared_hash = "sha256_receipt_unique_duplicate_test_hash"

    # Employee 1 submits claim with receipt hash
    c1 = await client.post("/api/v1/expenses?submit_now=true", headers={"Authorization": f"Bearer {t1}"}, json={
        "title": "Client Lunch",
        "amount": 1500.00,
        "category": "MEALS",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/shared.png",
        "receipt_hash": shared_hash
    })
    assert c1.status_code == 201

    # Employee 2
    await client.post("/api/v1/auth/register", json={
        "email": "emp2.collusion@crs-corp.com",
        "full_name": "Employee Two",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    l2 = await client.post("/api/v1/auth/login", json={"email": "emp2.collusion@crs-corp.com", "password": "Password123!"})
    t2 = l2.json()["access_token"]
    await client.patch("/api/v1/users/me", headers={"Authorization": f"Bearer {t2}"}, json={
        "bank_details": {"account_number": "444455556666", "ifsc_code": "ICIC0002222"}
    })

    # Employee 2 tries to submit the EXACT SAME receipt hash -> MUST BE BLOCKED
    c2 = await client.post("/api/v1/expenses?submit_now=true", headers={"Authorization": f"Bearer {t2}"}, json={
        "title": "Another Lunch",
        "amount": 1500.00,
        "category": "MEALS",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/shared_dup.png",
        "receipt_hash": shared_hash
    })
    assert c2.status_code == 400
    assert "CROSS-EMPLOYEE" in c2.json()["detail"].upper()


@pytest.mark.asyncio
async def test_high_risk_approval_audit_exemption(client):
    # Admin reviewer
    await client.post("/api/v1/auth/register", json={
        "email": "admin.audit@crs-corp.com",
        "full_name": "Audit Admin",
        "password": "Password123!",
        "role": "ADMIN"
    })
    l_admin = await client.post("/api/v1/auth/login", json={"email": "admin.audit@crs-corp.com", "password": "Password123!"})
    t_admin = l_admin.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {t_admin}"}

    # Employee
    await client.post("/api/v1/auth/register", json={
        "email": "emp.audit@crs-corp.com",
        "full_name": "Audit Employee",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    l_emp = await client.post("/api/v1/auth/login", json={"email": "emp.audit@crs-corp.com", "password": "Password123!"})
    t_emp = l_emp.json()["access_token"]
    await client.patch("/api/v1/users/me", headers={"Authorization": f"Bearer {t_emp}"}, json={
        "bank_details": {"account_number": "999988887777", "ifsc_code": "SBIN0003333"}
    })

    # Submit high-risk claim (Sunday weekend + high amount + prohibited line item)
    # 2026-11-15 was a Sunday
    c = await client.post("/api/v1/expenses?submit_now=true", headers={"Authorization": f"Bearer {t_emp}"}, json={
        "title": "Weekend Team Celebration",
        "amount": 60000.00,
        "category": "MEALS",
        "expense_date": "2026-11-15T20:00:00Z",
        "receipt_url": "https://storage.crs-corp.com/receipts/party.png",
        "extracted_metadata": {
            "line_items": [
                {"description": "Sparkling Wine Bottle", "amount": 8000.00}
            ]
        }
    })
    assert c.status_code == 201
    claim = c.json()
    assert claim["risk_level"] == "HIGH"
    claim_id = claim["id"]

    # Attempt to approve WITHOUT audit_exemption_reason -> MUST FAIL 400
    app_fail = await client.post(f"/api/v1/approvals/{claim_id}/review", headers=admin_headers, json={
        "decision": "APPROVED",
        "comments": "Looks fine"
    })
    assert app_fail.status_code == 400
    assert "Audit Exemption Reason is mandatory" in app_fail.json()["detail"]

    # Approve WITH audit_exemption_reason -> SUCCESS
    app_ok = await client.post(f"/api/v1/approvals/{claim_id}/review", headers=admin_headers, json={
        "decision": "APPROVED",
        "comments": "Special department milestone event",
        "audit_exemption_reason": "Approved under Annual CEO Excellence Award budget code EX-901"
    })
    assert app_ok.status_code == 200
    assert app_ok.json()["audit_exemption_reason"] == "Approved under Annual CEO Excellence Award budget code EX-901"


@pytest.mark.asyncio
async def test_mandatory_receipt_on_submission(client):
    # Register and login employee
    await client.post("/api/v1/auth/register", json={
        "email": "mandatory.receipt@crs-corp.com",
        "full_name": "Receipt Tester",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    l_res = await client.post("/api/v1/auth/login", json={"email": "mandatory.receipt@crs-corp.com", "password": "Password123!"})
    token = l_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Attempt to create and submit without receipt -> MUST FAIL (400)
    fail_create = await client.post("/api/v1/expenses?submit_now=true", headers=headers, json={
        "title": "Train Ticket without receipt",
        "amount": 1200.00,
        "category": "TRAVEL",
        "expense_date": datetime.now(timezone.utc).isoformat()
    })
    assert fail_create.status_code == 400
    assert "Receipt upload is mandatory" in fail_create.json()["detail"]

    # 2. Saving as DRAFT without receipt is ALLOWED
    draft_res = await client.post("/api/v1/expenses?submit_now=false", headers=headers, json={
        "title": "Train Ticket Draft",
        "amount": 1200.00,
        "category": "TRAVEL",
        "expense_date": datetime.now(timezone.utc).isoformat()
    })
    assert draft_res.status_code == 201
    draft_id = draft_res.json()["id"]
    assert draft_res.json()["status"] == "DRAFT"

    # 3. Attempting to submit that draft without a receipt -> MUST FAIL (400)
    fail_submit = await client.post(f"/api/v1/expenses/{draft_id}/submit", headers=headers)
    assert fail_submit.status_code == 400
    assert "Receipt upload is mandatory" in fail_submit.json()["detail"]

    # 4. Attaching receipt and travel details and submitting -> SUCCESS (200)
    update_res = await client.patch(f"/api/v1/expenses/{draft_id}", headers=headers, json={
        "receipt_url": "https://storage.crs-corp.com/receipts/train_ticket.pdf",
        "category_details": {
            "travel_mode": "Train",
            "start_date": "2026-11-19",
            "end_date": "2026-11-20",
            "boarding_point": "Mumbai",
            "arrival_point": "Pune"
        }
    })
    assert update_res.status_code == 200

    submit_ok = await client.post(f"/api/v1/expenses/{draft_id}/submit", headers=headers)
    assert submit_ok.status_code == 200
    assert submit_ok.json()["status"] == "SUBMITTED"

