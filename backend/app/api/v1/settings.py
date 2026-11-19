from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import SystemSettings, User, UserRole
from app.schemas import SystemSettingsOut, SystemSettingsUpdate
from app.api.v1.deps import get_current_user, require_role, log_audit_event

router = APIRouter(prefix="/settings", tags=["Settings"])


async def get_or_create_settings(db: AsyncSession) -> SystemSettings:
    result = await db.execute(select(SystemSettings).where(SystemSettings.id == 1))
    settings_obj = result.scalars().first()
    if not settings_obj:
        settings_obj = SystemSettings(id=1)
        db.add(settings_obj)
        await db.flush()
    return settings_obj


@router.get("", response_model=SystemSettingsOut)
async def get_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve system settings (thresholds, currency)"""
    return await get_or_create_settings(db)


@router.patch("", response_model=SystemSettingsOut)
async def update_settings(
    data: SystemSettingsUpdate,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """Update global system parameters (Admin only)"""
    settings_obj = await get_or_create_settings(db)

    old_values = {
        "company_name": settings_obj.company_name,
        "tier2_approval_threshold": str(settings_obj.tier2_approval_threshold),
        "allow_self_approval": settings_obj.allow_self_approval
    }

    update_dict = data.model_dump(exclude_unset=True)
    for field, val in update_dict.items():
        setattr(settings_obj, field, val)

    settings_obj.updated_by = current_user.id
    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="SYSTEM_SETTINGS",
        entity_id=str(settings_obj.id),
        action="UPDATE_SETTINGS",
        old_values=old_values,
        new_values=update_dict,
        ip_address=request.client.host if request.client else None
    )

    return settings_obj
