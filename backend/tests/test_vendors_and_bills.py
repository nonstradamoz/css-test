import pytest
from datetime import datetime, timezone


async def ensure_admin(client):
    await client.post("/api/v1/auth/register", json={
        "email": "v2.admin@crs-corp.com",
        "full_name": "Admin User",
        "password": "Password123!",
        "role": "ADMIN"
    })
    res = await client.post("/api/v1/auth/login", json={
        "email": "v2.admin@crs-corp.com",
        "password": "Password123!"
    })
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_vendor_profiles_and_bill_submission(client):
    """
    1. Admin creates multiple vendor profiles with banking details.
    2. Non-admin cannot create vendors or submit vendor bills (403).
    3. Admin submits a vendor bill (with auto-approve) without needing personal bank details.
    4. Vendor bill exposes vendor's bank details & vendor_name for payout.
    5. Deactivating a vendor with bills marks it inactive; deleting unused vendor removes it.
    """
    admin_headers = await ensure_admin(client)

    # Create a regular employee to verify RBAC
    await client.post("/api/v1/users", headers=admin_headers, json={
        "email": "emp.vendor@crs-corp.com",
        "full_name": "Regular Employee",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "emp.vendor@crs-corp.com",
        "password": "Password123!"
    })
    emp_headers = {"Authorization": f"Bearer {emp_login.json()['access_token']}"}

    # 1. Non-admin cannot create a vendor
    emp_vendor_res = await client.post("/api/v1/vendors", headers=emp_headers, json={
        "name": "Unauthorized Vendor",
        "bank_details": {
            "account_holder_name": "Unauthorized",
            "bank_name": "HDFC",
            "account_number": "12345678",
            "ifsc_code": "HDFC0001234"
        }
    })
    assert emp_vendor_res.status_code == 403

    # 2. Admin creates two vendor profiles with distinct banking details
    v1_res = await client.post("/api/v1/vendors", headers=admin_headers, json={
        "name": "Acme Cloud Infra Pvt Ltd",
        "contact_person": "Rohan Sharma",
        "email": "billing@acmecloud.in",
        "phone": "+91-9876543210",
        "gstin": "29ABCDE1234F1Z5",
        "default_category": "SOFTWARE",
        "bank_details": {
            "account_holder_name": "Acme Cloud Infra Pvt Ltd",
            "bank_name": "HDFC Bank",
            "account_number": "50200011223344",
            "ifsc_code": "HDFC0000123",
            "upi_id": "acme@okhdfcbank"
        }
    })
    assert v1_res.status_code == 201
    v1_id = v1_res.json()["id"]
    assert v1_res.json()["bank_details"]["account_number"] == "50200011223344"

    v2_res = await client.post("/api/v1/vendors", headers=admin_headers, json={
        "name": "Apex Office Supplies",
        "gstin": "27XYZAB5678G1Z2",
        "default_category": "SUPPLIES",
        "bank_details": {
            "account_holder_name": "Apex Office Supplies",
            "bank_name": "ICICI Bank",
            "account_number": "000405060708",
            "ifsc_code": "ICIC0000004"
        }
    })
    assert v2_res.status_code == 201
    v2_id = v2_res.json()["id"]

    # List vendors
    list_res = await client.get("/api/v1/vendors", headers=admin_headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 2

    # 3. Non-admin cannot submit a vendor bill
    emp_bill_res = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "Unauthorized Vendor Bill",
        "amount": 5000.00,
        "category": "SOFTWARE",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/vbill.pdf",
        "vendor_id": v1_id
    })
    assert emp_bill_res.status_code == 403

    # 4. Admin submits a vendor bill linked to Vendor 1 with auto-approve
    bill_res = await client.post("/api/v1/expenses?submit_now=true", headers=admin_headers, json={
        "title": "November Cloud Hosting Invoice",
        "amount": 18500.00,
        "category": "SOFTWARE",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/acme_nov.pdf",
        "vendor_id": v1_id,
        "auto_approve_vendor_bill": True
    })
    assert bill_res.status_code == 201
    bill_data = bill_res.json()
    assert bill_data["vendor_id"] == v1_id
    assert bill_data["vendor_name"] == "Acme Cloud Infra Pvt Ltd"
    assert bill_data["status"] == "APPROVED"
    assert bill_data["submitter_has_bank_details"] is True
    assert bill_data["submitter_bank_details"]["account_number"] == "50200011223344"

    # 5. Reimburse vendor bill & check vendor attribution
    reimb_res = await client.post("/api/v1/reimbursements", headers=admin_headers, json={
        "expense_id": bill_data["id"],
        "idempotency_key": "vendor-bill-payout-key-12345678",
        "transaction_id": "UTR9988776655"
    })
    assert reimb_res.status_code == 201

    reimb_list = await client.get("/api/v1/reimbursements", headers=admin_headers)
    assert any(r["submitter_name"] == "Vendor: Acme Cloud Infra Pvt Ltd" for r in reimb_list.json())

    # 6. Deleting Vendor 1 (has bills) -> soft deactivates; deleting Vendor 2 (unused) -> deletes
    del_v1 = await client.delete(f"/api/v1/vendors/{v1_id}", headers=admin_headers)
    assert del_v1.status_code == 204
    v1_check = await client.get(f"/api/v1/vendors/{v1_id}", headers=admin_headers)
    assert v1_check.status_code == 200
    assert v1_check.json()["is_active"] is False

    del_v2 = await client.delete(f"/api/v1/vendors/{v2_id}", headers=admin_headers)
    assert del_v2.status_code == 204
    v2_check = await client.get(f"/api/v1/vendors/{v2_id}", headers=admin_headers)
    assert v2_check.status_code == 404
