from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

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
    assigned_role = UserRole.ADMIN if user_count == 0 else data.role

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
