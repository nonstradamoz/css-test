from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Notification, User
from app.schemas import NotificationListOut, NotificationOut, UnreadCountOut
from app.api.v1.deps import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=NotificationListOut)
async def list_notifications(
    limit: int = Query(30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List recent notifications for the authenticated user along with unread count."""
    items_res = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(desc(Notification.created_at))
        .limit(limit)
    )
    items = items_res.scalars().all()

    unread_count = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False
        )
    ) or 0

    return NotificationListOut(items=items, unread_count=unread_count)


@router.get("/unread-count", response_model=UnreadCountOut)
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lightweight polling endpoint returning the unread notification count."""
    unread_count = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False
        )
    ) or 0
    return UnreadCountOut(unread_count=unread_count)


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a single notification belonging to the current user as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    notif = result.scalars().first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")

    notif.is_read = True
    await db.flush()
    return notif


@router.post("/mark-all-read", response_model=UnreadCountOut)
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark all unread notifications for the current user as read."""
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False
        )
        .values(is_read=True)
    )
    await db.flush()
    return UnreadCountOut(unread_count=0)
