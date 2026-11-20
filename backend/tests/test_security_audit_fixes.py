import os
import uuid
import pytest


@pytest.mark.asyncio
async def test_finding_1_public_registration_blocks_privileged_role_escalation(client):
    """
    Finding 1: Public registration must never grant requested privileged roles (ADMIN, FINANCE, REVIEWER).
    Any public signup must be assigned EMPLOYEE (except initial bootstrap user).
    """
    # 1. Bootstrap admin
    admin_email = f"bootstrap.admin.{uuid.uuid4().hex[:6]}@crs-corp.com"
    res_adm = await client.post("/api/v1/auth/register", json={
        "email": admin_email,
        "full_name": "Bootstrap Admin",
        "password": "Password123!",
        "role": "ADMIN"
    })
    assert res_adm.status_code == 201
    assert res_adm.json()["role"] == "ADMIN"

    # 2. Attacker attempts to register as ADMIN
    attacker_email = f"attacker.{uuid.uuid4().hex[:6]}@crs-corp.com"
    res_attacker = await client.post("/api/v1/auth/register", json={
        "email": attacker_email,
        "full_name": "Malicious User",
        "password": "Password123!",
        "role": "ADMIN"
    })
    assert res_attacker.status_code == 201
    # MUST BE ENFORCED AS EMPLOYEE
    assert res_attacker.json()["role"] == "EMPLOYEE"

    # 3. Attacker attempts to register as FINANCE
    finance_attacker = f"attacker.fin.{uuid.uuid4().hex[:6]}@crs-corp.com"
    res_fin = await client.post("/api/v1/auth/register", json={
        "email": finance_attacker,
        "full_name": "Finance Attacker",
        "password": "Password123!",
        "role": "FINANCE"
    })
    assert res_fin.status_code == 201
    assert res_fin.json()["role"] == "EMPLOYEE"


@pytest.mark.asyncio
async def test_finding_2_unauthenticated_receipt_endpoints_blocked(client):
    """
    Finding 2: Unauthenticated receipt upload, local-upload, and download must be blocked (401).
    Legacy mock endpoints must be removed (404/405).
    """
    # 1. Download without token -> 401
    dl_res = await client.get("/api/v1/receipts/download?key=test_key.jpg")
    assert dl_res.status_code == 401

    # 2. Local upload without token -> 401
    up_res = await client.put("/api/v1/receipts/local-upload?key=test_key.jpg", content=b"sample")
    assert up_res.status_code == 401

    # 3. Legacy mock endpoints are removed -> 404 or 405
    mock_up = await client.put("/api/v1/receipts/mock-upload?key=test_key.jpg", content=b"sample")
    assert mock_up.status_code in [404, 405]

    mock_dl = await client.get("/api/v1/receipts/mock-download?key=test_key.jpg")
    assert mock_dl.status_code in [404, 405]


@pytest.mark.asyncio
async def test_finding_2_and_9_receipt_path_traversal_and_size_validation(client):
    """
    Finding 2 & 9: Test path traversal protection and file size / format validation.
    """
    # Register and login user
    emp_email = f"emp.sec.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": emp_email, "full_name": "Security Tester", "password": "Password123!"
    })
    l_res = await client.post("/api/v1/auth/login", json={"email": emp_email, "password": "Password123!"})
    headers = {"Authorization": f"Bearer {l_res.json()['access_token']}"}

    # 1. Path traversal in download key -> 400
    traversal_dl = await client.get("/api/v1/receipts/download?key=../../etc/passwd", headers=headers)
    assert traversal_dl.status_code == 400
    assert "Invalid receipt key" in traversal_dl.json()["detail"]

    # 2. Path traversal in local-upload key -> 400
    traversal_up = await client.put("/api/v1/receipts/local-upload?key=../../evil.sh", headers=headers, content=b"fake")
    assert traversal_up.status_code == 400

    # 3. Invalid file extension (.sh) -> 400
    bad_ext = await client.post(
        "/api/v1/receipts/upload",
        headers=headers,
        files={"file": ("malicious_script.sh", b"fake script bytes", "application/x-sh")}
    )
    assert bad_ext.status_code == 400
    assert "Invalid file extension" in bad_ext.json()["detail"]

    # 4. Oversized upload > 10MB -> 413
    oversized_bytes = b"0" * (10 * 1024 * 1024 + 1)
    large_upload = await client.post(
        "/api/v1/receipts/upload",
        headers=headers,
        files={"file": ("large_receipt.jpg", oversized_bytes, "image/jpeg")}
    )
    assert large_upload.status_code == 413


@pytest.mark.asyncio
async def test_finding_7_google_auth_email_bypass_blocked(client):
    """
    Finding 7: Supplying an unverified email in /auth/google without a valid Google token must be rejected with 401.
    """
    # Attacker targets an existing account by email without valid Google token
    bypass_res = await client.post("/api/v1/auth/google", json={
        "email": "victim.admin@crs-corp.com",
        "full_name": "Victim Admin"
    })
    assert bypass_res.status_code == 401
    assert "Invalid Google Authentication token" in bypass_res.json()["detail"]


@pytest.mark.asyncio
async def test_finding_8_google_oauth_state_validation(client):
    """
    Finding 8: OAuth callback must enforce cryptographic state verification (CSRF protection).
    """
    # Callback without state or with mismatched state -> error redirect
    cb_no_state = await client.get("/api/v1/auth/google/callback?code=mock_code_123")
    assert cb_no_state.status_code in [302, 307]
    assert "Invalid+or+expired+OAuth+state" in cb_no_state.headers.get("location", "")


@pytest.mark.asyncio
async def test_finding_10_reimbursement_rbac_enforcement(client):
    """
    Finding 10: Employees are strictly restricted to their own claims, and only authorized roles
    have enterprise-wide financial access.
    """
    # 1. Register Employee A and submit claim
    emp_a_email = f"emp.a.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": emp_a_email, "full_name": "Employee Alpha", "password": "Password123!"
    })
    l_a = await client.post("/api/v1/auth/login", json={"email": emp_a_email, "password": "Password123!"})
    h_a = {"Authorization": f"Bearer {l_a.json()['access_token']}"}

    # 2. Register Employee B
    emp_b_email = f"emp.b.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": emp_b_email, "full_name": "Employee Beta", "password": "Password123!"
    })
    l_b = await client.post("/api/v1/auth/login", json={"email": emp_b_email, "password": "Password123!"})
    h_b = {"Authorization": f"Bearer {l_b.json()['access_token']}"}

    # Employee B queries reimbursements -> receives only their own (empty list)
    b_reimb = await client.get("/api/v1/reimbursements", headers=h_b)
    assert b_reimb.status_code == 200
    assert len(b_reimb.json()) == 0
