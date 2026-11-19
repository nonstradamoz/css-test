import pytest
from decimal import Decimal


@pytest.mark.asyncio
async def test_full_lifecycle_api(client):
    # 1. Health check
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    # 2. Register first user (automatically becomes ADMIN)
    admin_data = {
        "email": "lead.admin@crs-corp.com",
        "full_name": "Lead Admin",
        "password": "Password123!",
        "role": "ADMIN"
    }
    reg_res = await client.post("/api/v1/auth/register", json=admin_data)
    assert reg_res.status_code == 201
    assert reg_res.json()["role"] == "ADMIN"

    # 3. Login as Admin
    login_res = await client.post("/api/v1/auth/login", json={
        "email": "lead.admin@crs-corp.com",
        "password": "Password123!"
    })
    assert login_res.status_code == 200
    admin_token = login_res.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 4. Register Employee
    emp_data = {
        "email": "employee.john@crs-corp.com",
        "full_name": "John Doe",
        "password": "Password123!",
        "role": "EMPLOYEE"
    }
    emp_reg = await client.post("/api/v1/auth/register", json=emp_data)
    assert emp_reg.status_code == 201
    assert emp_reg.json()["role"] == "EMPLOYEE"

    # 5. Login as Employee
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "employee.john@crs-corp.com",
        "password": "Password123!"
    })
    emp_token = emp_login.json()["access_token"]
    emp_headers = {"Authorization": f"Bearer {emp_token}"}

    # 5b. Employee attempts to submit an expense without bank details -> MUST BE BLOCKED (400)
    exp_payload = {
        "title": "Client Lunch Meeting",
        "description": "Lunch with prospective enterprise client",
        "category": "MEALS",
        "amount": 4500.00,
        "currency": "INR",
        "expense_date": "2026-11-18T12:00:00Z",
        "receipt_url": "https://storage.crs-corp.com/receipts/lunch_test.png"
    }
    blocked_create = await client.post(
        "/api/v1/expenses?submit_now=true",
        json=exp_payload,
        headers=emp_headers
    )
    assert blocked_create.status_code == 400
    assert "Bank account or UPI details are required" in blocked_create.json()["detail"]

    # 5c. Employee creates expense as DRAFT (saving for future submission) -> SUCCEEDS (201)
    draft_create = await client.post(
        "/api/v1/expenses?submit_now=false",
        json=exp_payload,
        headers=emp_headers
    )
    assert draft_create.status_code == 201
    draft_data = draft_create.json()
    assert draft_data["status"] == "DRAFT"
    expense_id = draft_data["id"]

    # 5d. Submitting draft directly without bank details -> MUST BE BLOCKED (400)
    blocked_submit = await client.post(
        f"/api/v1/expenses/{expense_id}/submit",
        headers=emp_headers
    )
    assert blocked_submit.status_code == 400
    assert "Bank account or UPI details are required" in blocked_submit.json()["detail"]

    # 5e. Employee updates profile with bank account details -> SUCCEEDS (200)
    patch_bank = await client.patch(
        "/api/v1/users/me",
        headers=emp_headers,
        json={
            "bank_details": {
                "account_holder_name": "John Doe",
                "bank_name": "HDFC Bank",
                "account_number": "50100234567890",
                "ifsc_code": "HDFC0001234",
                "upi_id": "johndoe@okhdfcbank"
            }
        }
    )
    assert patch_bank.status_code == 200

    # 6. Now employee submits the saved draft -> SUCCEEDS (200, status SUBMITTED)
    submit_res = await client.post(
        f"/api/v1/expenses/{expense_id}/submit",
        headers=emp_headers
    )
    assert submit_res.status_code == 200
    exp_data = submit_res.json()
    assert exp_data["status"] == "SUBMITTED"
    assert exp_data["approval_tier_required"] == 1

    # 7. Admin reviews and approves claim
    approval_res = await client.post(
        f"/api/v1/approvals/{expense_id}/review",
        json={"decision": "APPROVED", "comments": "Valid client entertainment receipt."},
        headers=admin_headers
    )
    assert approval_res.status_code == 200
    assert approval_res.json()["status"] == "APPROVED"

    # 8. Admin triggers reimbursement with idempotency key -> MUST SUCCEED (201)
    reimb_payload = {
        "expense_id": expense_id,
        "idempotency_key": "idemp-key-unique-test-12345678"
    }
    reimb_res = await client.post(
        "/api/v1/reimbursements",
        json=reimb_payload,
        headers=admin_headers
    )
    assert reimb_res.status_code == 201
    reimb_data = reimb_res.json()
    assert reimb_data["status"] == "COMPLETED"
    assert float(reimb_data["amount"]) == 4500.00

    # 9. Duplicate idempotency key must be rejected with 409 Conflict
    dup_res = await client.post(
        "/api/v1/reimbursements",
        json=reimb_payload,
        headers=admin_headers
    )
    assert dup_res.status_code == 409

    # 9b. Employee views their own reimbursement
    emp_reimb_res = await client.get("/api/v1/reimbursements", headers=emp_headers)
    assert emp_reimb_res.status_code == 200
    emp_reimbs = emp_reimb_res.json()
    assert len(emp_reimbs) == 1
    assert emp_reimbs[0]["expense_id"] == expense_id
    assert emp_reimbs[0]["expense_title"] == "Client Lunch Meeting"
    assert emp_reimbs[0]["status"] == "COMPLETED"

    # 10. Verify audit logs recorded actions
    audit_res = await client.get("/api/v1/audit-logs", headers=admin_headers)
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert len(logs) > 0
