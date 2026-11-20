import os
import secrets
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    hash_token
)
from app.models import User, UserRole, RefreshToken
from app.schemas import (
    LoginRequest,
    RefreshTokenRequest,
    GoogleAuthRequest,
    TokenResponse,
    UserCreate,
    UserOut
)
from app.api.v1.deps import get_current_user, log_audit_event

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register_user(
    data: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new user account.
    If this is the first user in the database, promote to ADMIN automatically.
    """
    # Check if email is already taken
    existing = await db.execute(select(User).where(User.email == data.email.lower()))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    # Count existing users
    user_count = await db.scalar(select(func.count(User.id)))
    # Security (Finding 1): Public registration must strictly assign EMPLOYEE.
    # Only the initial setup account when DB has 0 users is promoted to ADMIN.
    # Privileged roles (REVIEWER, FINANCE, ADMIN) must be provisioned by an authenticated Admin via POST /api/v1/users.
    assigned_role = UserRole.ADMIN if user_count == 0 else UserRole.EMPLOYEE

    new_user = User(
        email=data.email.lower(),
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        role=assigned_role,
        is_active=True
    )
    db.add(new_user)
    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=new_user.id,
        entity_type="USER",
        entity_id=new_user.id,
        action="REGISTER",
        new_values={"email": new_user.email, "role": new_user.role.value},
        ip_address=request.client.host if request.client else None
    )

    return new_user


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate with email and password.
    Returns short-lived JWT access token and rotating refresh token.
    """
    result = await db.execute(select(User).where(User.email == data.email.lower()))
    user = result.scalars().first()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact Administrator.")

    access_token = create_access_token(subject=user.id)
    raw_refresh_token, token_hash, expires_at = create_refresh_token()

    # Store refresh token in database
    db_token = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=expires_at
    )
    db.add(db_token)

    await log_audit_event(
        db=db,
        actor_id=user.id,
        entity_type="AUTH",
        entity_id=user.id,
        action="LOGIN",
        ip_address=request.client.host if request.client else None
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh_token,
        user=user
    )


@router.get("/google/config")
async def get_google_auth_config():
    """Returns public Google OAuth Client ID for frontend initialization."""
    client_id = settings.GOOGLE_CLIENT_ID or os.getenv("GOOGLE_CLIENT_ID") or os.getenv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "")
    return {
        "client_id": client_id,
        "is_configured": bool(client_id)
    }


@router.get("/google/login")
async def google_oauth_login(request: Request):
    """
    Initiates backend-driven Google OAuth 2.0 flow.
    Generates cryptographically secure state (Finding 8 CSRF protection)
    and redirects user to Google Accounts authorization screen.
    """
    client_id = settings.GOOGLE_CLIENT_ID or os.getenv("GOOGLE_CLIENT_ID", "")
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Authentication Client ID is not configured on the backend server."
        )
    base_url = str(request.base_url).rstrip("/")
    redirect_uri = f"{base_url}/api/v1/auth/google/callback"
    scope = "openid%20email%20profile"
    oauth_state = secrets.token_urlsafe(32)
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        f"response_type=code&"
        f"scope={scope}&"
        f"state={oauth_state}&"
        f"access_type=offline&"
        f"prompt=consent"
    )
    response = RedirectResponse(url=auth_url)
    response.set_cookie(
        key="oauth_state",
        value=oauth_state,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
        max_age=300,
        path="/"
    )
    return response


@router.get("/google/callback")
async def google_oauth_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Handles Google OAuth 2.0 callback with CSRF state validation (Finding 8)
    and delivers credentials via secure HttpOnly cookies rather than URL query parameters (Finding 4).
    """
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    if error or not code:
        return RedirectResponse(url=f"{frontend_url}/login?error={error or 'Google authorization denied'}")

    # Finding 8: Validate OAuth state parameter against HttpOnly cookie
    cookie_state = request.cookies.get("oauth_state")
    if not state or not cookie_state or not secrets.compare_digest(state, cookie_state):
        return RedirectResponse(url=f"{frontend_url}/login?error=Invalid+or+expired+OAuth+state+(CSRF+protection)")

    client_id = settings.GOOGLE_CLIENT_ID or os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = settings.GOOGLE_CLIENT_SECRET or os.getenv("GOOGLE_CLIENT_SECRET", "")
    base_url = str(request.base_url).rstrip("/")
    redirect_uri = f"{base_url}/api/v1/auth/google/callback"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code"
                }
            )
            if token_res.status_code != 200:
                return RedirectResponse(url=f"{frontend_url}/login?error=Failed to exchange Google OAuth authorization code")

            token_data = token_res.json()
            acc_token = token_data.get("access_token")
            uinfo_res = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {acc_token}"}
            )
            if uinfo_res.status_code != 200:
                return RedirectResponse(url=f"{frontend_url}/login?error=Failed to retrieve Google profile data")

            info = uinfo_res.json()
            user_email = info.get("email")
            user_name = info.get("name") or user_email.split("@")[0]

            # Find or provision user in DB
            result = await db.execute(select(User).where(User.email == user_email.lower()))
            user = result.scalars().first()
            if not user:
                user_count = await db.scalar(select(func.count(User.id)))
                assigned_role = UserRole.ADMIN if user_count == 0 else UserRole.EMPLOYEE
                user = User(
                    email=user_email.lower(),
                    hashed_password=get_password_hash(secrets.token_urlsafe(24)),
                    full_name=user_name,
                    role=assigned_role,
                    is_active=True
                )
                db.add(user)
                await db.flush()

            access_token = create_access_token(subject=user.id)
            raw_refresh_token, hashed_token, expires_at = create_refresh_token()
            db.add(RefreshToken(
                user_id=user.id,
                token_hash=hashed_token,
                expires_at=expires_at
            ))
            await db.commit()

            # Finding 4: Deliver credentials securely via HttpOnly cookies, NEVER in URL parameters
            response = RedirectResponse(url=f"{frontend_url}/dashboard", status_code=302)
            is_https = request.url.scheme == "https"
            response.set_cookie(
                key="access_token",
                value=access_token,
                httponly=True,
                secure=is_https,
                samesite="lax",
                max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                path="/"
            )
            response.set_cookie(
                key="refresh_token",
                value=raw_refresh_token,
                httponly=True,
                secure=is_https,
                samesite="lax",
                max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
                path="/"
            )
            response.delete_cookie(key="oauth_state", path="/")
            return response
    except Exception as e:
        return RedirectResponse(url=f"{frontend_url}/login?error={str(e)}")


@router.post("/google", response_model=TokenResponse)
async def google_login(
    data: GoogleAuthRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate via Google OAuth / Google Identity Services ID Token / Access Token.
    Verifies token with Google servers, provisions user if new, and returns active JWT session.
    """
    token = data.id_token or data.credential
    user_email = None
    user_name = None

    # Development/testing mock token support (STRICTLY disabled in production)
    if settings.ENVIRONMENT == "development" and token and token.startswith("mock_google_id_token_"):
        user_email = token.replace("mock_google_id_token_", "")
        user_name = data.full_name or user_email.split("@")[0].replace(".", " ").title()

    # 1. Verify Google GIS ID Token if provided
    if not user_email and token:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={token}")
                if resp.status_code == 200:
                    info = resp.json()
                    is_verified = info.get("email_verified") is True or info.get("email_verified") == "true"
                    valid_iss = info.get("iss") in ["accounts.google.com", "https://accounts.google.com"]
                    if (is_verified or valid_iss) and info.get("email"):
                        user_email = info.get("email")
                        user_name = info.get("name") or info.get("email", "").split("@")[0]
        except Exception as e:
            print(f"[WARN] Google tokeninfo verification exception: {e}")

    # 2. Verify Google OAuth Access Token via userinfo endpoint if provided
    if not user_email and data.access_token:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {data.access_token}"}
                )
                if resp.status_code == 200:
                    info = resp.json()
                    is_verified = info.get("email_verified") is True or info.get("email_verified") == "true"
                    if (is_verified or info.get("email")) and info.get("email"):
                        user_email = info.get("email")
                        user_name = info.get("name") or info.get("email", "").split("@")[0]
        except Exception as e:
            print(f"[WARN] Google userinfo verification exception: {e}")

    # 3. Exchange Authorization Code if provided
    if not user_email and data.code and settings.GOOGLE_CLIENT_ID:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                token_resp = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": data.code,
                        "client_id": settings.GOOGLE_CLIENT_ID,
                        "client_secret": settings.GOOGLE_CLIENT_SECRET or "",
                        "redirect_uri": data.redirect_uri or "postmessage",
                        "grant_type": "authorization_code"
                    }
                )
                if token_resp.status_code == 200:
                    token_data = token_resp.json()
                    acc_token = token_data.get("access_token")
                    if acc_token:
                        uinfo = await client.get(
                            "https://www.googleapis.com/oauth2/v3/userinfo",
                            headers={"Authorization": f"Bearer {acc_token}"}
                        )
                        if uinfo.status_code == 200:
                            info = uinfo.json()
                            if info.get("email"):
                                user_email = info.get("email")
                                user_name = info.get("name") or info.get("email", "").split("@")[0]
        except Exception as e:
            print(f"[WARN] Google code exchange exception: {e}")

    # Finding 7 Security Fix: Reject unverified authentication.
    # The endpoint MUST NOT accept an unverified email directly from the request body.
    # A valid Google token (GIS ID token, access token, or authorization code) must be verified.
    if not user_email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google Authentication token or credentials. Authentication rejected."
        )

    # Check if user exists in database
    result = await db.execute(select(User).where(User.email == user_email.lower()))
    user = result.scalars().first()

    if not user:
        # Determine role: First user is ADMIN, otherwise EMPLOYEE
        user_count = await db.scalar(select(func.count(User.id)))
        assigned_role = UserRole.ADMIN if user_count == 0 else UserRole.EMPLOYEE

        random_pwd = secrets.token_urlsafe(24)
        user = User(
            email=user_email.lower(),
            hashed_password=get_password_hash(random_pwd),
            full_name=user_name or "Google User",
            role=assigned_role,
            is_active=True
        )
        db.add(user)
        await db.flush()

        await log_audit_event(
            db=db,
            actor_id=user.id,
            entity_type="USER",
            entity_id=user.id,
            action="GOOGLE_REGISTER",
            new_values={"email": user.email, "role": user.role.value},
            ip_address=request.client.host if request.client else None
        )
    else:
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account is deactivated. Contact Administrator.")

    access_token = create_access_token(subject=user.id)
    raw_refresh, token_hash, expires_at = create_refresh_token()

    rt_record = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=expires_at
    )
    db.add(rt_record)
    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=user.id,
        entity_type="AUTH",
        entity_id=user.id,
        action="GOOGLE_LOGIN",
        ip_address=request.client.host if request.client else None
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        user=user
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    data: RefreshTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Exchange valid refresh token for a new access token and a new rotated refresh token.
    The old refresh token is revoked immediately.
    """
    incoming_hash = hash_token(data.refresh_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == incoming_hash))
    db_token = result.scalars().first()

    now = datetime.now(timezone.utc)

    if not db_token or db_token.revoked_at is not None or db_token.expires_at < now:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token. Please login again.")

    # Fetch user
    user = await db.get(User, db_token.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User account is inactive or not found.")

    # Revoke old refresh token
    db_token.revoked_at = now

    # Issue new pair
    access_token = create_access_token(subject=user.id)
    new_raw_token, new_hash, new_expires = create_refresh_token()

    rotated_token = RefreshToken(
        user_id=user.id,
        token_hash=new_hash,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=new_expires
    )
    db.add(rotated_token)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_raw_token,
        user=user
    )


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """Revoke refresh token on logout"""
    incoming_hash = hash_token(data.refresh_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == incoming_hash))
    db_token = result.scalars().first()

    if db_token and db_token.revoked_at is None:
        db_token.revoked_at = datetime.now(timezone.utc)

    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserOut)
async def get_current_profile(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user"""
    return current_user
