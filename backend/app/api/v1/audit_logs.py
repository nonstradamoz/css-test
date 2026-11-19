from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import AuditLog, User, UserRole
from app.schemas import AuditLogOut
from app.api.v1.deps import require_role

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=List[AuditLogOut])
async def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.FINANCE])),
    db: AsyncSession = Depends(get_db)
):
    """View immutable system audit logs (Admin and Finance only)"""
    query = select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit).offset(offset)

    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if action:
        query = query.where(AuditLog.action == action)

    result = await db.execute(query)
    return result.scalars().all()
