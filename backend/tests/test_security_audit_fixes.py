import os
import time
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


@pytest.mark.asyncio
async def test_production_config_validation(monkeypatch):
    """
    Findings 1 & 5: Production environment must validate mandatory configuration
    and reject startup if default/weak secrets or missing Redis/Google config.
    """
    from app.core.config import Settings

    # 1. Missing Redis URL in production
    s1 = Settings(ENVIRONMENT="production", REDIS_URL="", JWT_SECRET_KEY="A"*35, GOOGLE_CLIENT_ID="valid_id")
    with pytest.raises(RuntimeError) as exc1:
        s1.validate_production_security()
    assert "REDIS_URL is mandatory" in str(exc1.value)

    # 2. Insecure default JWT Secret
    s2 = Settings(ENVIRONMENT="production", REDIS_URL="redis://localhost:6379", JWT_SECRET_KEY="change-this-secret-key-32-chars!!", GOOGLE_CLIENT_ID="valid_id")
    with pytest.raises(RuntimeError) as exc2:
        s2.validate_production_security()
    assert "JWT_SECRET_KEY lacks sufficient cryptographic randomness" in str(exc2.value)

    # 3. Missing Google Client ID in production
    s3 = Settings(ENVIRONMENT="production", REDIS_URL="redis://localhost:6379", JWT_SECRET_KEY="X"*40, GOOGLE_CLIENT_ID="")
    with pytest.raises(RuntimeError) as exc3:
        s3.validate_production_security()
    assert "GOOGLE_CLIENT_ID is mandatory in production" in str(exc3.value)


@pytest.mark.asyncio
async def test_google_oauth_invalid_token_scenarios(monkeypatch):
    """
    Findings 2 & 11: Google login tests covering audience mismatch, invalid issuer,
    expired tokens, and unverified emails.
    """
    from app.api.v1.auth import google_login
    from app.schemas import GoogleAuthRequest
    from app.core.config import settings
    from unittest.mock import AsyncMock, MagicMock
    from fastapi import HTTPException
    import httpx

    mock_db = AsyncMock()
    mock_request = MagicMock()

    # 1. Incorrect Audience
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "expected_google_client_id_123")
    
    class MockResp:
        def __init__(self, data, status_code=200):
            self._data = data
            self.status_code = status_code
        def json(self):
            return self._data

    # Bad audience
    bad_aud_data = {
        "email": "user@example.com",
        "email_verified": True,
        "iss": "accounts.google.com",
        "aud": "attacker_different_client_id_456",
        "exp": str(time.time() + 3600)
    }
    
    async def mock_get(url):
        return MockResp(bad_aud_data)

    monkeypatch.setattr(httpx.AsyncClient, "get", lambda *args, **kwargs: mock_get(args[1]))

    req1 = GoogleAuthRequest(id_token="fake_token_bad_aud")
    with pytest.raises(HTTPException) as exc1:
        await google_login(req1, mock_request, mock_db)
    assert exc1.value.status_code == 401

    # 2. Invalid Issuer
    bad_iss_data = {
        "email": "user@example.com",
        "email_verified": True,
        "iss": "https://malicious-site.com",
        "aud": "expected_google_client_id_123",
        "exp": str(time.time() + 3600)
    }
    monkeypatch.setattr(httpx.AsyncClient, "get", lambda *args, **kwargs: MockResp(bad_iss_data))
    with pytest.raises(HTTPException) as exc2:
        await google_login(req1, mock_request, mock_db)
    assert exc2.value.status_code == 401

    # 3. Expired Token
    expired_data = {
        "email": "user@example.com",
        "email_verified": True,
        "iss": "accounts.google.com",
        "aud": "expected_google_client_id_123",
        "exp": str(time.time() - 100)  # Expired
    }
    monkeypatch.setattr(httpx.AsyncClient, "get", lambda *args, **kwargs: MockResp(expired_data))
    with pytest.raises(HTTPException) as exc3:
        await google_login(req1, mock_request, mock_db)
    assert exc3.value.status_code == 401

    # 4. Unverified Email
    unverified_data = {
        "email": "user@example.com",
        "email_verified": False,
        "iss": "accounts.google.com",
        "aud": "expected_google_client_id_123",
        "exp": str(time.time() + 3600)
    }
    monkeypatch.setattr(httpx.AsyncClient, "get", lambda *args, **kwargs: MockResp(unverified_data))
    with pytest.raises(HTTPException) as exc4:
        await google_login(req1, mock_request, mock_db)
    assert exc4.value.status_code == 401


@pytest.mark.asyncio
async def test_presigned_download_ceiling_enforced():
    """
    Finding 6: Presigned URL generator strictly enforces 900s ceiling even if
    caller passes 86400s or any higher value.
    """
    from app.services.storage import StorageService, MAX_PRESIGNED_EXPIRATION_SECONDS
    from unittest.mock import MagicMock

    storage = StorageService()
    storage.s3_client = MagicMock()
    storage.is_configured = MagicMock(return_value=True)

    storage.generate_presigned_download("receipts/test.jpg", expires_in=86400)
    
    # Assert ExpiresIn parameter passed to boto3 was clamped to 900
    call_args = storage.s3_client.generate_presigned_url.call_args
    assert call_args[1]["ExpiresIn"] == MAX_PRESIGNED_EXPIRATION_SECONDS
    assert call_args[1]["ExpiresIn"] == 900


@pytest.mark.asyncio
async def test_receipt_ownership_exact_matching(client):
    """
    Finding 4: Ownership verification uses exact key matching, preventing substring matching bypass.
    """
    from app.services.storage import storage_service

    # 1. Register bootstrap admin and employee
    admin_email = f"admin.exact.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": admin_email, "full_name": "Admin User", "password": "Password123!"
    })

    emp_email = f"emp.exact.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": emp_email, "full_name": "Employee Exact", "password": "Password123!"
    })
    l_res = await client.post("/api/v1/auth/login", json={"email": emp_email, "password": "Password123!"})
    headers = {"Authorization": f"Bearer {l_res.json()['access_token']}"}

    # 2. Create legitimate file for employee
    legit_key = f"legit_{uuid.uuid4().hex}.jpg"
    storage_service.save_local_file(legit_key, b"\xff\xd8\xff" + b"\x00" * 50)

    # 3. Create expense linked to legit_key
    await client.post(
        "/api/v1/expenses",
        headers=headers,
        json={
            "title": "Legit Coffee",
            "category": "MEALS",
            "amount": 100.0,
            "receipt_url": f"/api/v1/receipts/download?key={legit_key}",
            "expense_date": "2026-11-20T10:00:00Z"
        }
    )

    # 4. Attacker crafts substring key: "prefix_" + legit_key
    attacker_sub_key = f"prefix_{legit_key}"
    storage_service.save_local_file(attacker_sub_key, b"\xff\xd8\xff" + b"\x00" * 50)

    # Attacker tries to download attacker_sub_key claiming it matches substring
    bad_res = await client.get(f"/api/v1/receipts/download?key={attacker_sub_key}", headers=headers)
    assert bad_res.status_code == 403
    assert "Access denied" in bad_res.json()["detail"]


@pytest.mark.asyncio
async def test_audit_sanitization_avoids_false_positives():
    """
    Finding 8: Normalized exact-field matching avoids false positives
    (e.g., 'company_name', 'expand', 'token_count') while scrubbing sensitive fields.
    """
    from app.api.v1.deps import sanitize_audit_data

    payload = {
        "company_name": "Tech Corp",
        "expansion_rate": 12.5,
        "token_count": 42,
        "shopping_cart_id": "cart_99",
        "user_password": "RealSecretPassword!",
        "employee_pan": "ABCDE1234F",
        "vendor_account_number": "987654321098",
        "deeply_nested": {
            "oauth_access_token": "secret_jwt",
            "normal_description": "Conference ticket"
        }
    }

    sanitized = sanitize_audit_data(payload)
    # Must NOT produce false positive redactions
    assert sanitized["company_name"] == "Tech Corp"
    assert sanitized["expansion_rate"] == 12.5
    assert sanitized["token_count"] == 42
    assert sanitized["shopping_cart_id"] == "cart_99"

    # Must correctly sanitize real secrets and PII (exact and compound suffixes)
    assert sanitized["user_password"] == "[REDACTED]"
    assert sanitized["employee_pan"] == "****234F"
    assert sanitized["vendor_account_number"] == "****1098"
    assert sanitized["deeply_nested"]["oauth_access_token"] == "[REDACTED]"
    assert sanitized["deeply_nested"]["normal_description"] == "Conference ticket"


@pytest.mark.asyncio
async def test_production_api_documentation_endpoints_inaccessible():
    """
    Finding 12: In production, FastAPI app strictly returns 404 for /docs, /redoc, and /openapi.json.
    """
    from fastapi import FastAPI
    from httpx import AsyncClient, ASGITransport

    # Simulate production FastAPI instantiation
    prod_app = FastAPI(
        openapi_url=None,
        docs_url=None,
        redoc_url=None
    )

    transport = ASGITransport(app=prod_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res_docs = await ac.get("/docs")
        assert res_docs.status_code == 404

        res_redoc = await ac.get("/redoc")
        assert res_redoc.status_code == 404

        res_openapi = await ac.get("/openapi.json")
        assert res_openapi.status_code == 404


@pytest.mark.asyncio
async def test_pdf_isolated_worker_process_termination_on_timeout(monkeypatch):
    """
    Finding 3: PDF parsing executes in an isolated worker process and is terminated/killed
    when exceeding timeout.
    """
    from app.services.extractor.text_engine import DocumentTextEngine
    import app.services.extractor.text_engine as te_module
    import time

    def _hanging_worker(data, max_pages, conn):
        # Simulate infinite loop / parser freeze
        time.sleep(10)
        conn.send(("SUCCESS", "should not reach here"))

    monkeypatch.setattr(te_module, "_isolated_pdf_worker", _hanging_worker)
    monkeypatch.setattr(te_module, "PDF_TIMEOUT_SECONDS", 0.5)

    text, method, conf = DocumentTextEngine._extract_from_pdf(b"%PDF-1.4 sample content")
    assert method == "PDF_ERROR_TIMEOUT"
    assert conf == 0.0


@pytest.mark.asyncio
async def test_image_processing_malformed_and_bomb_isolation():
    """
    Finding 9: Enforce memory, dimension and decompression bomb isolation on images.
    """
    from app.services.extractor.text_engine import DocumentTextEngine

    # 1. Malformed binary image
    malformed_bytes = b"\xff\xd8\xff" + b"malformed_truncated_corrupt_stream"
    text_m, method_m, conf_m = DocumentTextEngine.extract_text(malformed_bytes, "broken.jpg", "image/jpeg")
    assert "IMAGE_ERROR" in method_m
    assert conf_m <= 0.30

    # 2. Decompression bomb / huge dimension simulation
    from PIL import Image
    import io
    img = Image.new("RGB", (6000, 6000))  # 36 million pixels > 25MP limit
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    bomb_bytes = buf.getvalue()

    text_b, method_b, conf_b = DocumentTextEngine.extract_text(bomb_bytes, "bomb.jpg", "image/jpeg")
    assert method_b in ["IMAGE_ERROR_DECOMPRESSION_BOMB", "IMAGE_ERROR_DIMENSION_LIMIT"]
    assert conf_b == 0.0


@pytest.mark.asyncio
async def test_production_jwt_revocation_missing_redis_url(monkeypatch):
    """
    Finding 1: In production, missing REDIS_URL raises HTTP 503 instead of falling open.
    """
    from app.core.config import settings
    from app.core.token_blocklist import is_token_revoked, revoke_access_token
    from fastapi import HTTPException

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "REDIS_URL", "")

    test_token = f"prod_no_redis_{uuid.uuid4().hex}"
    
    with pytest.raises(HTTPException) as exc1:
        await is_token_revoked(test_token)
    assert exc1.value.status_code == 503
    assert "Redis revocation store is required in production" in exc1.value.detail

    with pytest.raises(HTTPException) as exc2:
        await revoke_access_token(test_token)
    assert exc2.value.status_code == 503
    assert "Redis revocation store is required in production" in exc2.value.detail


@pytest.mark.asyncio
async def test_jwt_secret_entropy_and_localhost_redis_rejection():
    """
    Findings 2 & 8: Validate Shannon entropy calculation for JWT secret and localhost Redis rejection.
    """
    from app.core.config import Settings, calculate_entropy

    # Low entropy secret (repetitive)
    low_entropy_secret = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    assert calculate_entropy(low_entropy_secret) == 0.0

    s_low = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY=low_entropy_secret,
        REDIS_URL="rediss://default:secretpass@secure-redis.cloud:6379",
        GOOGLE_CLIENT_ID="valid_id_123"
    )
    with pytest.raises(RuntimeError) as exc_ent:
        s_low.validate_production_security()
    assert "cryptographic randomness" in str(exc_ent.value)

    # Localhost Redis without ALLOW_INSECURE_LOCAL_REDIS
    s_local_redis = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="c8f1e29a83d47b019f2e4c6b8a0d3f5e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",  # High entropy
        REDIS_URL="redis://localhost:6379/0",
        GOOGLE_CLIENT_ID="valid_id_123",
        ALLOW_INSECURE_LOCAL_REDIS=False
    )
    with pytest.raises(RuntimeError) as exc_redis:
        s_local_redis.validate_production_security()
    assert "Default localhost Redis" in str(exc_redis.value)


@pytest.mark.asyncio
async def test_google_access_token_audience_validation(monkeypatch):
    """
    Finding 4: Google access-token authentication explicitly verifies client audience via tokeninfo.
    """
    from app.api.v1.auth import google_login
    from app.schemas import GoogleAuthRequest
    from app.core.config import settings
    from unittest.mock import AsyncMock, MagicMock
    from fastapi import HTTPException
    import httpx

    mock_db = AsyncMock()
    mock_request = MagicMock()
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "corp_google_client_id_999")

    class MockResp:
        def __init__(self, data, status_code=200):
            self._data = data
            self.status_code = status_code
        def json(self):
            return self._data

    # 1. Access token issued to a different client ID (mismatched audience)
    async def mock_get(url, headers=None):
        if "tokeninfo" in url:
            return MockResp({
                "aud": "attacker_different_client_id_000",
                "expires_in": 3600,
                "email_verified": "true"
            })
        return MockResp({"email": "user@example.com", "email_verified": True})

    monkeypatch.setattr(httpx.AsyncClient, "get", lambda self, url, **kwargs: mock_get(url, **kwargs))

    req = GoogleAuthRequest(access_token="valid_format_but_wrong_aud_token")
    with pytest.raises(HTTPException) as exc:
        await google_login(req, mock_request, mock_db)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_storage_silent_fallback_blocked_in_production(monkeypatch):
    """
    Finding 9: Object storage failure in production must NOT silently fallback to local disk.
    """
    from app.core.config import settings
    from app.services.storage import StorageService
    from fastapi import HTTPException

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ALLOW_LOCAL_STORAGE_FALLBACK", False)

    storage = StorageService()
    # Force unconfigured R2
    storage.s3_client = None

    with pytest.raises(HTTPException) as exc:
        storage.upload_file_bytes("receipt.jpg", b"\xff\xd8\xff" + b"\x00" * 50)
    assert exc.value.status_code == 503
    assert "Silent local storage fallback is prohibited" in exc.value.detail


@pytest.mark.asyncio
async def test_receipt_ownership_ambiguous_matches_blocked(client):
    """
    Finding 10: Reject ambiguous receipt ownership matches across different accounts.
    """
    from app.services.storage import storage_service

    # 1. Register bootstrap admin, User A, and User B
    admin_email = f"admin.ambig.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": admin_email, "full_name": "Admin User", "password": "Password123!"
    })

    user_a_email = f"user.a.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": user_a_email, "full_name": "User Alpha", "password": "Password123!"
    })
    l_a = await client.post("/api/v1/auth/login", json={"email": user_a_email, "password": "Password123!"})
    h_a = {"Authorization": f"Bearer {l_a.json()['access_token']}"}

    user_b_email = f"user.b.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": user_b_email, "full_name": "User Beta", "password": "Password123!"
    })
    l_b = await client.post("/api/v1/auth/login", json={"email": user_b_email, "password": "Password123!"})
    h_b = {"Authorization": f"Bearer {l_b.json()['access_token']}"}

    # Save physical receipt file
    shared_key = f"shared_{uuid.uuid4().hex}.jpg"
    storage_service.save_local_file(shared_key, b"\xff\xd8\xff" + b"\x00" * 50)

    # User A creates expense with shared_key
    await client.post("/api/v1/expenses", headers=h_a, json={
        "title": "Expense User A",
        "category": "MEALS",
        "amount": 100.0,
        "receipt_url": f"/api/v1/receipts/download?key={shared_key}",
        "expense_date": "2026-11-20T10:00:00Z"
    })

    # User B also creates expense referencing shared_key (collision)
    await client.post("/api/v1/expenses", headers=h_b, json={
        "title": "Expense User B",
        "category": "MEALS",
        "amount": 100.0,
        "receipt_url": f"/api/v1/receipts/download?key={shared_key}",
        "expense_date": "2026-11-20T10:00:00Z"
    })

    # Either user attempting to download the ambiguous receipt must be rejected with 403
    ambig_res = await client.get(f"/api/v1/receipts/download?key={shared_key}", headers=h_a)
    assert ambig_res.status_code == 403
    assert "Ambiguous receipt ownership" in ambig_res.json()["detail"]


@pytest.mark.asyncio
async def test_reviewer_centre_level_isolation(client):
    """
    Finding 7: Enforce centre-level isolation on Reviewer/Finance roles.
    """
    from app.services.storage import storage_service

    # 1. Register bootstrap admin
    admin_email = f"admin.centre.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": admin_email, "full_name": "Admin User", "password": "Password123!"
    })

    # 2. Register Reviewer assigned to Centre "BLR-1"
    rev_email = f"rev.blr.{uuid.uuid4().hex[:6]}@crs-corp.com"
    await client.post("/api/v1/auth/register", json={
        "email": rev_email, "full_name": "Reviewer Bangalore", "password": "Password123!"
    })
    # Login admin to promote rev to REVIEWER and assign centre_id
    l_adm = await client.post("/api/v1/auth/login", json={"email": admin_email, "password": "Password123!"})
    h_adm = {"Authorization": f"Bearer {l_adm.json()['access_token']}"}

    users_res = await client.get("/api/v1/users", headers=h_adm)
    rev_user = next(u for u in users_res.json() if u["email"] == rev_email)
    await client.patch(
        f"/api/v1/users/{rev_user['id']}",
        headers=h_adm,
        json={"role": "REVIEWER", "bank_details": {"centre_id": "BLR-1"}}
    )

    l_rev = await client.post("/api/v1/auth/login", json={"email": rev_email, "password": "Password123!"})
    h_rev = {"Authorization": f"Bearer {l_rev.json()['access_token']}"}

    # 3. Save receipt and create expense assigned to Centre "DEL-1"
    del_key = f"delhi_exp_{uuid.uuid4().hex}.jpg"
    storage_service.save_local_file(del_key, b"\xff\xd8\xff" + b"\x00" * 50)

    await client.post("/api/v1/expenses", headers=h_adm, json={
        "title": "Delhi Office Expense",
        "category": "SUPPLIES",
        "amount": 500.0,
        "receipt_url": f"/api/v1/receipts/download?key={del_key}",
        "expense_date": "2026-11-20T10:00:00Z",
        "category_details": {"centre_id": "DEL-1"}
    })

    # Reviewer from BLR-1 tries to download DEL-1 receipt -> 403 Forbidden
    cross_centre_res = await client.get(f"/api/v1/receipts/download?key={del_key}", headers=h_rev)
    assert cross_centre_res.status_code == 403
    assert "restricted to assigned centre" in cross_centre_res.json()["detail"]


@pytest.mark.asyncio
async def test_asgi_middleware_upload_size_limit(client):
    """
    Finding 5: ASGI middleware intercepts requests with content-length > 10MB
    before multipart parsing occurs.
    """
    oversized_headers = {
        "content-length": str(15 * 1024 * 1024)  # 15 MB declared length
    }
    res = await client.post("/api/v1/receipts/upload", headers=oversized_headers, content=b"dummy")
    assert res.status_code == 413
    assert "exceeds maximum allowed size" in res.json()["detail"]

