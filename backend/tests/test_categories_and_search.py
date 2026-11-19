import pytest
from app.models import ExpenseCategoryModel


@pytest.mark.asyncio
async def test_categories_crud_and_search(client, test_db):
    # 1. Register first user (automatically becomes ADMIN)
    admin_data = {
        "email": "cat.admin@crs-corp.com",
        "full_name": "Category Admin",
        "password": "Password123!",
        "role": "ADMIN"
    }
    reg_res = await client.post("/api/v1/auth/register", json=admin_data)
    assert reg_res.status_code == 201

    login_res = await client.post("/api/v1/auth/login", json={
        "email": "cat.admin@crs-corp.com",
        "password": "Password123!"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Attempting to create new category is rejected (hard-coded standard categories enforced)
    new_cat_res = await client.post("/api/v1/categories", headers=headers, json={
        "code": "HARDWARE_DEV",
        "name": "Hardware & Lab Equipment",
        "description": "Lab tools and test boards",
        "is_active": True
    })
    assert new_cat_res.status_code == 400
    assert "disabled" in new_cat_res.json()["detail"].lower()

    # 3. List active categories returns standardized hardcoded categories
    cat_res = await client.get("/api/v1/categories", headers=headers)
    assert cat_res.status_code == 200
    categories = cat_res.json()
    cat_codes = [c["code"] for c in categories]
    assert "ACCOMMODATION" in cat_codes
    assert "TRAINING" in cat_codes
    assert "TRAVEL" in cat_codes
    assert "MEALS" in cat_codes

    # 4. Attempting to update a category is also rejected
    first_cat = categories[0]
    patch_res = await client.patch(f"/api/v1/categories/{first_cat['id']}", headers=headers, json={
        "name": "Modified Name"
    })
    assert patch_res.status_code == 400

    # 5. Search & Sort expenses
    exp_res = await client.get("/api/v1/expenses?search=Hardware&sort_by=amount&sort_order=desc", headers=headers)
    assert exp_res.status_code == 200

    # 6. Search & Sort reimbursements
    reimb_res = await client.get("/api/v1/reimbursements?sort_by=amount&sort_order=asc", headers=headers)
    assert reimb_res.status_code == 200


@pytest.mark.asyncio
async def test_profile_and_bank_details(client, test_db):
    # 1. Register Admin (first user becomes ADMIN)
    adm_data = {
        "email": "bank.admin@crs-corp.com",
        "full_name": "Bank Administrator",
        "password": "Password123!",
        "role": "ADMIN"
    }
    await client.post("/api/v1/auth/register", json=adm_data)
    l_adm = await client.post("/api/v1/auth/login", json={"email": "bank.admin@crs-corp.com", "password": "Password123!"})
    token_adm = l_adm.json()["access_token"]
    adm_headers = {"Authorization": f"Bearer {token_adm}"}

    # 2. Register Employee (subsequent user is EMPLOYEE)
    emp_data = {
        "email": "bank.employee@crs-corp.com",
        "full_name": "Bank Tester Employee",
        "password": "Password123!",
        "role": "EMPLOYEE"
    }
    await client.post("/api/v1/auth/register", json=emp_data)
    l_emp = await client.post("/api/v1/auth/login", json={"email": "bank.employee@crs-corp.com", "password": "Password123!"})
    token_emp = l_emp.json()["access_token"]
    emp_headers = {"Authorization": f"Bearer {token_emp}"}

    # 3. Employee updates bank details via PATCH /users/me -> SUCCESS (200)
    patch_emp = await client.patch("/api/v1/users/me", headers=emp_headers, json={
        "bank_details": {
            "account_holder_name": "Bank Tester Employee",
            "bank_name": "ICICI Bank",
            "account_number": "000123456789",
            "ifsc_code": "ICIC0000001",
            "upi_id": "banktester@okicici"
        }
    })
    assert patch_emp.status_code == 200
    emp_profile = patch_emp.json()
    assert emp_profile["bank_details"]["account_number"] == "000123456789"
    emp_id = emp_profile["id"]

    # 4. Admin attempts to set bank_details on SELF via /users/me -> MUST BE FORBIDDEN (403)
    fail_adm_self = await client.patch("/api/v1/users/me", headers=adm_headers, json={
        "bank_details": {"account_number": "99999"}
    })
    assert fail_adm_self.status_code == 403

    # 5. Admin updates bank details for the Employee via /users/{emp_id} -> SUCCESS (200)
    admin_patch_emp = await client.patch(f"/api/v1/users/{emp_id}", headers=adm_headers, json={
        "bank_details": {
            "account_holder_name": "Bank Tester Employee (Admin Assisted)",
            "bank_name": "ICICI Bank",
            "account_number": "000123456789",
            "ifsc_code": "ICIC0000001",
            "upi_id": "banktester.admin@okicici"
        }
    })
    assert admin_patch_emp.status_code == 200
    assert admin_patch_emp.json()["bank_details"]["account_holder_name"] == "Bank Tester Employee (Admin Assisted)"


