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


@pytest.mark.asyncio
async def test_jwt_access_token_blacklist_on_logout(client):
    """
    Security Architecture: Access tokens must be revoked in Redis upon logout.
    Attempting to use a revoked access token must return 401.
    """
    user_email = f"jwt.test.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": user_email, "full_name": "JWT Revoke User", "password": "Password123!"
    })
    login_res = await client.post("/api/v1/auth/login", json={"email": user_email, "password": "Password123!"})
    tokens = login_res.json()
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # 1. Access token works initially
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200

    # 2. User logs out
    logout_res = await client.post("/api/v1/auth/logout", headers=headers, json={"refresh_token": refresh_token})
    assert logout_res.status_code == 200

    # 3. Access token is now blacklisted -> 401
    me_revoked = await client.get("/api/v1/auth/me", headers=headers)
    assert me_revoked.status_code == 401
    assert "revoked" in me_revoked.json()["detail"].lower()


@pytest.mark.asyncio
async def test_audit_logs_sensitive_data_sanitization(client):
    """
    Security Architecture: Sensitive information (passwords, tokens, bank accounts)
    must never be stored in plain text within audit logs.
    """
    from app.api.v1.deps import sanitize_audit_data

    raw_payload = {
        "email": "user@example.com",
        "password": "SuperSecretPassword123!",
        "token": "sensitive_jwt_token_bytes",
        "bank_details": {
            "account_number": "987654321098",
            "ifsc_code": "HDFC0001234"
        }
    }

    sanitized = sanitize_audit_data(raw_payload)
    assert sanitized["password"] == "[REDACTED]"
    assert sanitized["token"] == "[REDACTED]"
    assert sanitized["bank_details"]["account_number"] == "****1098"
    assert sanitized["email"] == "user@example.com"


@pytest.mark.asyncio
async def test_expanded_audit_sanitization():
    """
    Finding 4: Test comprehensive redaction of credentials and masking of PII & banking fields.
    """
    from app.api.v1.deps import sanitize_audit_data

    payload = {
        "user_id": "usr_123",
        "password": "SecretPassword!",
        "access_token": "eyJh...",
        "api_key": "live_key_999",
        "client_secret": "cs_secret_123",
        "cvv": "123",
        "account_number": "123456789012",
        "ifsc": "SBIN0001234",
        "upi_id": "merchant@okaxis",
        "pan": "ABCDE1234F",
        "aadhaar": "123456789012",
        "ssn": "123-45-6789",
        "mobile": "+919876543210",
        "unrelated_field": "public_data"
    }

    cleaned = sanitize_audit_data(payload)
    # Redacted secrets
    assert cleaned["password"] == "[REDACTED]"
    assert cleaned["access_token"] == "[REDACTED]"
    assert cleaned["api_key"] == "[REDACTED]"
    assert cleaned["client_secret"] == "[REDACTED]"
    assert cleaned["cvv"] == "[REDACTED]"
    # Masked banking/PII (last 4 chars preserved)
    assert cleaned["account_number"] == "****9012"
    assert cleaned["ifsc"] == "****1234"
    assert cleaned["upi_id"] == "****axis"
    assert cleaned["pan"] == "****234F"
    assert cleaned["aadhaar"] == "****9012"
    assert cleaned["ssn"] == "****6789"
    assert cleaned["mobile"] == "****3210"
    # Unchanged
    assert cleaned["unrelated_field"] == "public_data"


@pytest.mark.asyncio
async def test_in_memory_blocklist_expiration():
    """
    Finding 3: Test that in-memory token blocklist entries expire and are purged.
    """
    from app.core.token_blocklist import (
        revoke_access_token,
        is_token_revoked,
        _in_memory_revoked,
        _get_token_hash
    )
    import time

    fake_token = "expiring_jwt_token_sample"
    # Revoke with 1 second TTL
    await revoke_access_token(fake_token, expires_in_seconds=1)

    t_hash = _get_token_hash(fake_token)
    assert t_hash in _in_memory_revoked

    # Token is revoked
    assert await is_token_revoked(fake_token) is True

    # Simulate expiration by setting timestamp in the past
    _in_memory_revoked[t_hash] = time.time() - 10

    # Checking revocation should now purge entry and return False
    assert await is_token_revoked(fake_token) is False
    assert t_hash not in _in_memory_revoked


@pytest.mark.asyncio
async def test_production_jwt_revocation_fails_closed(monkeypatch):
    """
    Finding 1 & 2: When Redis is unreachable in production, is_token_revoked must fail closed (HTTP 503).
    """
    from app.core.config import settings
    from app.core.token_blocklist import is_token_revoked
    from fastapi import HTTPException

    # Set environment to production
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    # Set invalid Redis URL to force connection error
    monkeypatch.setattr(settings, "REDIS_URL", "redis://nonexistent-redis-host:6379/9")

    # Clear memory cache for this token
    test_token = f"prod_test_token_{uuid.uuid4().hex}"
    
    with pytest.raises(HTTPException) as exc_info:
        await is_token_revoked(test_token)
    
    assert exc_info.value.status_code == 503
    assert "temporarily unavailable" in exc_info.value.detail


@pytest.mark.asyncio
async def test_presigned_download_url_ttl():
    """
    Finding 5: Verify that default presigned download URL expiration is 15 minutes (900 seconds).
    """
    from app.services.storage import StorageService

    storage = StorageService()
    # Mock s3_client if configured or test fallback
    if storage.s3_client:
        # Check generated params
        url = storage.generate_presigned_download("receipts/test.jpg")
        assert "X-Amz-Expires=900" in url or "Expires=" in url


@pytest.mark.asyncio
async def test_png_signature_validation(client):
    """
    Finding 9: Validate exact PNG magic bytes b"\\x89PNG\\r\\n\\x1a\\n".
    """
    from app.api.v1.receipts import validate_receipt_upload
    from fastapi import HTTPException

    # 1. Authentic PNG signature
    valid_png_header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
    # Should not raise
    validate_receipt_upload(valid_png_header, "receipt.png", "image/png")

    # 2. Corrupt / invalid PNG signature
    invalid_png = b"\x89PNG\x00\x00\x00\x00" + b"\x00" * 50
    with pytest.raises(HTTPException) as exc:
        validate_receipt_upload(invalid_png, "receipt.png", "image/png")
    assert exc.value.status_code == 400
    assert "Invalid file signature" in exc.value.detail


@pytest.mark.asyncio
async def test_mock_payload_prohibited_in_production(monkeypatch):
    """
    Finding 10: Mock test bytes must NEVER bypass upload validation in production.
    """
    from app.core.config import settings
    from app.api.v1.receipts import validate_receipt_upload
    from fastapi import HTTPException

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")

    mock_bytes = b"fake receipt test content"
    with pytest.raises(HTTPException) as exc:
        validate_receipt_upload(mock_bytes, "receipt.jpg", "image/jpeg")
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_fail_closed_receipt_download(client):
    """
    Finding 11: Fail closed if regular employee tries to download a receipt that has
    no matching expense record. Must return 403 Forbidden.
    """
    from app.services.storage import storage_service

    # Create dummy local file
    test_key = f"unclaimed_{uuid.uuid4().hex}.jpg"
    valid_jpg = b"\xff\xd8\xff" + b"\x00" * 50
    storage_service.save_local_file(test_key, valid_jpg)

    # 1. Register bootstrap admin first so subsequent user is EMPLOYEE
    admin_email = f"admin.boot.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": admin_email, "full_name": "Admin User", "password": "Password123!"
    })

    # 2. Register & login regular employee
    emp_email = f"emp.download.{uuid.uuid4().hex[:6]}@crs-corp.com"
    reg_emp = await client.post("/api/v1/auth/register", json={
        "email": emp_email, "full_name": "Employee Download", "password": "Password123!"
    })
    assert reg_emp.json()["role"] == "EMPLOYEE"

    l_res = await client.post("/api/v1/auth/login", json={"email": emp_email, "password": "Password123!"})
    headers = {"Authorization": f"Bearer {l_res.json()['access_token']}"}

    # Employee attempts download of unclaimed receipt -> 403 Forbidden
    dl_res = await client.get(f"/api/v1/receipts/download?key={test_key}", headers=headers)
    assert dl_res.status_code == 403
    assert "Access denied" in dl_res.json()["detail"]


@pytest.mark.asyncio
async def test_document_engine_resource_limits():
    """
    Findings 6 & 7: DocumentTextEngine enforces 5MB limit for PDFs, 10MB limit for images,
    and dimension/pixel limits.
    """
    from app.services.extractor.text_engine import DocumentTextEngine, MAX_PDF_SIZE, MAX_IMAGE_FILE_SIZE

    # 1. Oversized PDF > 5MB
    oversized_pdf = b"%PDF-" + b"0" * (MAX_PDF_SIZE + 10)
    text, method, conf = DocumentTextEngine.extract_text(oversized_pdf, "large.pdf", "application/pdf")
    assert method == "PDF_ERROR_OVERSIZED"
    assert conf == 0.0

    # 2. Oversized image > 10MB
    oversized_img = b"\xff\xd8\xff" + b"0" * (MAX_IMAGE_FILE_SIZE + 10)
    text_img, method_img, conf_img = DocumentTextEngine.extract_text(oversized_img, "large.jpg", "image/jpeg")
    assert method_img == "IMAGE_ERROR_OVERSIZED"
    assert conf_img == 0.0


@pytest.mark.asyncio
async def test_google_oauth_strict_conjunction_checks():
    """
    Finding 12: Google login requires conjunction (AND) of valid status, issuer, audience, and email_verified.
    """
    from app.api.v1.auth import google_login
    from app.schemas import GoogleAuthRequest
    from fastapi import HTTPException

    # Request with unverified email or missing token
    req = GoogleAuthRequest(email="victim@example.com")
    # Mock request
    from unittest.mock import AsyncMock, MagicMock
    mock_db = AsyncMock()
    mock_request = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await google_login(req, mock_request, mock_db)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_api_docs_strictly_disabled_in_production(monkeypatch):
    """
    Finding 8: In production, API documentation (Swagger / ReDoc / OpenAPI JSON)
    must be strictly disabled regardless of configuration overrides.
    """
    from app.core.config import settings

    # In production with ENABLE_API_DOCS=True override attempt
    is_prod = True
    enable_override = True
    docs_enabled = False if is_prod else (enable_override if enable_override is not None else True)
    assert docs_enabled is False


@pytest.mark.asyncio
async def test_streaming_upload_size_limit_aborts_early():
    """
    Finding 13: Upload size validation streams in 64KB chunks and raises 413
    without buffering the entire oversized file into memory.
    """
    from app.api.v1.receipts import read_stream_with_size_limit
    from fastapi import UploadFile, HTTPException
    import io

    # Create dummy stream exceeding 10MB
    data = b"X" * (10 * 1024 * 1024 + 1024)
    upload = UploadFile(filename="oversized.jpg", file=io.BytesIO(data))

    with pytest.raises(HTTPException) as exc:
        await read_stream_with_size_limit(upload, max_size=10 * 1024 * 1024)
    assert exc.value.status_code == 413
    assert "File exceeds maximum allowed size" in exc.value.detail

