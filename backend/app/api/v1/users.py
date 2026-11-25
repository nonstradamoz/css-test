from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models import User, UserRole
from app.schemas import UserCreate, UserUpdate, UserProfileUpdate, UserOut
from app.api.v1.deps import require_role, log_audit_event, get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


@router.patch("/me", response_model=UserOut)
async def update_my_profile(
    data: UserProfileUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update own profile:
    - Any authenticated user can update their full_name or password.
    - Only EMPLOYEES can enter/update bank details for reimbursements.
    """
    user = await db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    old_values = {"full_name": user.full_name}
    new_values = {}

    if data.full_name is not None and data.full_name.strip():
        user.full_name = data.full_name.strip()
        new_values["full_name"] = user.full_name

    if data.password:
        user.hashed_password = get_password_hash(data.password)
        new_values["password_changed"] = True

    if data.bank_details is not None:
        if user.role != UserRole.EMPLOYEE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bank details entry is restricted to Employee accounts."
            )
        user.bank_details = data.bank_details.model_dump()
        new_values["bank_details"] = user.bank_details

    if data.pan_number is not None and data.pan_number.strip():
        user.pan_number = data.pan_number.strip().upper()
        new_values["pan_number"] = user.pan_number

    if data.pan_document_url is not None and data.pan_document_url.strip():
        user.pan_document_url = data.pan_document_url.strip()
        new_values["pan_document_url"] = user.pan_document_url

    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=user.id,
        entity_type="USER",
        entity_id=user.id,
        action="PROFILE_UPDATE",
        old_values=old_values,
        new_values=new_values,
        ip_address=request.client.host if request.client else None
    )

    return user


@router.get("", response_model=List[UserOut])
async def list_users(
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.REVIEWER])),
    db: AsyncSession = Depends(get_db)
):
    """List user accounts in the enterprise system (Admin & Reviewer)"""
    result = await db.execute(select(User).order_by(desc(User.created_at)))
    return result.scalars().all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """Admin-provisioned user creation with role assignment"""
    existing = await db.execute(select(User).where(User.email == data.email.lower()))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="A user with this email already exists.")

    new_user = User(
        email=data.email.lower(),
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        role=data.role,
        bank_details=data.bank_details.model_dump() if data.bank_details else {},
        pan_number=data.pan_number.strip().upper() if data.pan_number else None,
        pan_document_url=data.pan_document_url.strip() if data.pan_document_url else None,
        is_active=True
    )
    db.add(new_user)
    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="USER",
        entity_id=new_user.id,
        action="ADMIN_CREATE",
        new_values={"email": new_user.email, "role": new_user.role.value},
        ip_address=request.client.host if request.client else None
    )

    return new_user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    data: UserUpdate,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """Update user role or active status (Admin only)"""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.id == current_user.id and data.is_active is False:
        raise HTTPException(status_code=400, detail="Admins cannot deactivate their own account.")

    old_values = {"role": user.role.value, "is_active": user.is_active, "full_name": user.full_name}

    update_dict = data.model_dump(exclude_unset=True)
    for field, val in update_dict.items():
        setattr(user, field, val)

    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="USER",
        entity_id=user.id,
        action="ADMIN_UPDATE",
        old_values=old_values,
        new_values=update_dict,
        ip_address=request.client.host if request.client else None
    )

    return user
