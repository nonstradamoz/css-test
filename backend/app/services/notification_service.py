from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, User, UserRole, Expense, ApprovalDecision


async def create_notification(
    db: AsyncSession,
    user_id: str,
    title: str,
    message: str,
    type: str = "INFO",
    link: Optional[str] = None
) -> Notification:
    """Create and stage an in-app notification for a specific user."""
    notif = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        link=link,
        is_read=False
    )
    db.add(notif)
    await db.flush()
    return notif


async def notify_users_by_role(
    db: AsyncSession,
    roles: List[UserRole],
    title: str,
    message: str,
    type: str = "INFO",
    link: Optional[str] = None,
    exclude_user_id: Optional[str] = None
) -> None:
    """Broadcast an in-app notification to all active users holding any of the given roles."""
    result = await db.execute(
        select(User).where(
            User.role.in_(roles),
            User.is_active == True
        )
    )
    recipients = result.scalars().all()
    for user in recipients:
        if exclude_user_id and user.id == exclude_user_id:
            continue
        await create_notification(
            db=db,
            user_id=user.id,
            title=title,
            message=message,
            type=type,
            link=link
        )


async def notify_claim_submitted(
    db: AsyncSession,
    expense: Expense,
    submitter: User
) -> None:
    """
    Notify all Reviewers when an expense claim is sent for review.
    """
    submitter_name = submitter.full_name or submitter.email
    await notify_users_by_role(
        db=db,
        roles=[UserRole.REVIEWER],
        title="New Expense Claim for Review",
        message=f"{submitter_name} submitted '{expense.title}' ({expense.currency} {expense.amount:,.2f}) for Tier 1 review.",
        type="REVIEW_REQUIRED",
        link=f"/reviews",
        exclude_user_id=submitter.id
    )


async def notify_reviewer_action(
    db: AsyncSession,
    expense: Expense,
    reviewer: User,
    decision: ApprovalDecision,
    comments: Optional[str] = None
) -> None:
    """
    Notify the User (submitter) after any review decision by the Reviewer,
    and notify the Admin(s) when the Reviewer approves & submits for final approval.
    """
    reviewer_name = reviewer.full_name or reviewer.email
    comment_suffix = f" Note: {comments.strip()}" if comments and comments.strip() else ""

    if decision == ApprovalDecision.APPROVED:
        # 1. Notify the employee/submitter that Tier 1 review passed
        if expense.approval_tier_required >= 2:
            await create_notification(
                db=db,
                user_id=expense.submitted_by,
                title="Review Passed — Sent to Admin for Final Approval",
                message=f"Reviewer {reviewer_name} reviewed and approved your claim '{expense.title}'. It has been forwarded to Admin for final approval.{comment_suffix}",
                type="REVIEW_PASSED",
                link=f"/expenses/{expense.id}"
            )
            # 2. Notify Admin(s) that the claim is ready for Tier 2 final approval
            await notify_users_by_role(
                db=db,
                roles=[UserRole.ADMIN],
                title="Claim Awaiting Final Admin Approval",
                message=f"Reviewer {reviewer_name} completed Tier 1 review for '{expense.title}' ({expense.currency} {expense.amount:,.2f}). Ready for your final approval.",
                type="ADMIN_APPROVAL_REQUIRED",
                link=f"/approvals",
                exclude_user_id=reviewer.id
            )
        else:
            await create_notification(
                db=db,
                user_id=expense.submitted_by,
                title="Expense Claim Approved",
                message=f"{reviewer_name} approved your claim '{expense.title}' ({expense.currency} {expense.amount:,.2f}).{comment_suffix}",
                type="CLAIM_APPROVED",
                link=f"/expenses/{expense.id}"
            )
    elif decision == ApprovalDecision.CHANGES_REQUESTED:
        await create_notification(
            db=db,
            user_id=expense.submitted_by,
            title="Modifications Requested on Claim",
            message=f"Reviewer {reviewer_name} requested changes on '{expense.title}'.{comment_suffix}",
            type="CHANGES_REQUESTED",
            link=f"/expenses/{expense.id}"
        )
    elif decision == ApprovalDecision.REJECTED:
        await create_notification(
            db=db,
            user_id=expense.submitted_by,
            title="Expense Claim Rejected",
            message=f"Reviewer {reviewer_name} rejected your claim '{expense.title}'.{comment_suffix}",
            type="CLAIM_REJECTED",
            link=f"/expenses/{expense.id}"
        )


async def notify_admin_action(
    db: AsyncSession,
    expense: Expense,
    admin: User,
    decision: ApprovalDecision,
    comments: Optional[str] = None
) -> None:
    """
    Notify the User (submitter) when Admin completes Tier 2 final approval / rejection.
    """
    admin_name = admin.full_name or admin.email
    comment_suffix = f" Note: {comments.strip()}" if comments and comments.strip() else ""

    if decision == ApprovalDecision.APPROVED:
        await create_notification(
            db=db,
            user_id=expense.submitted_by,
            title="Claim Fully Approved by Admin",
            message=f"Admin {admin_name} granted final approval for '{expense.title}' ({expense.currency} {expense.amount:,.2f}). Queued for reimbursement payout.{comment_suffix}",
            type="CLAIM_APPROVED",
            link=f"/expenses/{expense.id}"
        )
    elif decision == ApprovalDecision.CHANGES_REQUESTED:
        await create_notification(
            db=db,
            user_id=expense.submitted_by,
            title="Admin Requested Modifications",
            message=f"Admin {admin_name} requested changes on '{expense.title}'.{comment_suffix}",
            type="CHANGES_REQUESTED",
            link=f"/expenses/{expense.id}"
        )
    elif decision == ApprovalDecision.REJECTED:
        await create_notification(
            db=db,
            user_id=expense.submitted_by,
            title="Claim Rejected by Admin",
            message=f"Admin {admin_name} rejected your claim '{expense.title}'.{comment_suffix}",
            type="CLAIM_REJECTED",
            link=f"/expenses/{expense.id}"
        )
