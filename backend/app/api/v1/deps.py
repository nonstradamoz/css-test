from typing import List, Optional, Any
from fastapi import Depends, HTTPException, Security, status, Request
from fastapi.encoders import jsonable_encoder
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models import User, UserRole, AuditLog

security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    token = credentials.credentials if credentials else None
    if not token:
        # Finding 4: Secure cookie fallback for HttpOnly session authentication
        token = request.cookies.get("access_token")

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if user_id is None or token_type != "access":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()

    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated.")

    # Check JWT access token revocation / blacklist in Redis
    from app.core.token_blocklist import is_token_revoked
    if await is_token_revoked(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_role(allowed_roles: List[UserRole]):
    """Enforces that the current authenticated user possesses one of the allowed roles"""
    def _role_checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of roles {[r.value for r in allowed_roles]}"
            )
        return user
    return _role_checker


import re

# Exact normalized sensitive keys to redact completely (Finding 8)
EXACT_REDACT_KEYS = {
    # Passwords & Hashes
    "password", "hashed_password", "pass_hash", "password_hash", "passwd", "pwd",
    "user_password", "current_password", "new_password",
    # Tokens & JWTs
    "token", "access_token", "refresh_token", "id_token", "jwt", "jwt_token",
    "auth_token", "session_token", "bearer_token", "raw_refresh_token",
    # Secrets & Keys
    "secret", "client_secret", "jwt_secret", "jwt_secret_key", "secret_key",
    "api_key", "apikey", "private_key", "priv_key", "secret_access_key", "app_secret",
    # Credentials & Auth
    "credential", "credentials", "auth_header", "authorization", "bearer", "cookie", "cookies",
    # Card Security Codes
    "cvv", "cvc", "cvv2", "security_code", "card_pin", "pin", "mpin"
}

# Exact normalized PII & Financial keys to mask (Finding 8)
EXACT_MASK_KEYS = {
    # Bank & Financial accounts
    "account_number", "acc_no", "account_no", "acc_num", "bank_account",
    "bank_account_number", "bank_acc_no", "iban", "routing_number",
    # Payment codes & UPI
    "ifsc", "ifsc_code", "upi_id", "upi", "vpa",
    # Payment cards
    "card_number", "credit_card", "debit_card", "card_no", "card_num", "cc_number",
    # Government IDs & Tax Numbers
    "pan", "pan_number", "pan_no", "aadhaar", "aadhaar_number", "aadhaar_no",
    "ssn", "tax_id", "national_id", "social_security_number",
    # Personal Phone / Mobile
    "phone", "mobile", "phone_number", "mobile_number", "contact_number", "telephone", "cell_phone"
}


def _is_sensitive_key(k_norm: str) -> bool:
    """Check exact normalized key or standard sensitive suffix"""
    if k_norm in EXACT_REDACT_KEYS:
        return True
    suffixes = ("_password", "_secret", "_token", "_jwt", "_api_key", "_private_key", "_cvv", "_pin", "_credential")
    return any(k_norm.endswith(sfx) for sfx in suffixes)


def _is_masked_pii_key(k_norm: str) -> bool:
    """Check exact normalized key or standard PII suffix"""
    if k_norm in EXACT_MASK_KEYS:
        return True
    suffixes = (
        "_account_number", "_acc_no", "_account_no", "_ifsc", "_ifsc_code",
        "_upi_id", "_pan", "_aadhaar", "_ssn", "_card_number", "_phone", "_mobile"
    )
    return any(k_norm.endswith(sfx) for sfx in suffixes)


def sanitize_audit_data(data: Any) -> Any:
    """
    Finding 8: Normalized exact-field matching with comprehensive sensitive fields
    and composite alias support. Prevents false positive substring matches (e.g. 'company', 'expand')
    while guaranteeing full redaction/masking of deeply nested sensitive payloads.
    """
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            k_norm = re.sub(r"[^a-z0-9]+", "_", str(k).lower().strip()).strip("_")
            if _is_sensitive_key(k_norm):
                sanitized[k] = "[REDACTED]"
            elif _is_masked_pii_key(k_norm):
                val_str = str(v) if v is not None else ""
                if len(val_str) > 4:
                    sanitized[k] = f"****{val_str[-4:]}"
                else:
                    sanitized[k] = "****"
            else:
                sanitized[k] = sanitize_audit_data(v)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_audit_data(item) for item in data]
    return data


async def log_audit_event(
    db: AsyncSession,
    actor_id: Optional[str],
    entity_type: str,
    entity_id: str,
    action: str,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """Helper to record an immutable audit log record with sanitized payloads"""
    clean_old = sanitize_audit_data(old_values) if old_values is not None else None
    clean_new = sanitize_audit_data(new_values) if new_values is not None else None

    log_entry = AuditLog(
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        old_values=jsonable_encoder(clean_old) if clean_old is not None else None,
        new_values=jsonable_encoder(clean_new) if clean_new is not None else None,
        ip_address=ip_address
    )
    db.add(log_entry)
    return log_entry
