from decimal import Decimal
from typing import Tuple
from app.models import Expense, ExpenseStatus, UserRole, ApprovalDecision


class StateMachineError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ExpenseStateMachine:
    """
    Enforces financial state transitions and approval tiers.
    """

    VALID_TRANSITIONS = {
        ExpenseStatus.DRAFT: [ExpenseStatus.SUBMITTED],
        ExpenseStatus.SUBMITTED: [
            ExpenseStatus.UNDER_REVIEW,
            ExpenseStatus.APPROVED,
            ExpenseStatus.REJECTED,
            ExpenseStatus.CHANGES_REQUESTED
        ],
        ExpenseStatus.UNDER_REVIEW: [
            ExpenseStatus.APPROVED,
            ExpenseStatus.REJECTED,
            ExpenseStatus.CHANGES_REQUESTED
        ],
        ExpenseStatus.CHANGES_REQUESTED: [ExpenseStatus.SUBMITTED],
        ExpenseStatus.APPROVED: [ExpenseStatus.REIMBURSED],
        ExpenseStatus.REJECTED: [],     # Terminal state
        ExpenseStatus.REIMBURSED: []    # Terminal state
    }

    @staticmethod
    def transition_to_submitted(
        expense: Expense,
        threshold: Decimal,
        multi_tier_enabled: bool = True
    ) -> None:
        """Validate and transition an expense from DRAFT/CHANGES_REQUESTED to SUBMITTED"""
        if expense.status not in (ExpenseStatus.DRAFT, ExpenseStatus.CHANGES_REQUESTED):
            raise StateMachineError(
                f"Cannot submit expense from status '{expense.status}'. Only DRAFT or CHANGES_REQUESTED can be submitted."
            )
        
        # Two-tier review: when multi-tier approval is enabled, claims go through
        # Tier 1 (Reviewer) followed by Tier 2 (Admin final approval).
        if multi_tier_enabled:
            expense.approval_tier_required = 2
        else:
            expense.approval_tier_required = 1

        expense.current_approval_tier = 0
        expense.status = ExpenseStatus.SUBMITTED

    @staticmethod
    def evaluate_approval(
        expense: Expense,
        reviewer_role: UserRole,
        decision: ApprovalDecision,
        comments: str = ""
    ) -> Tuple[ExpenseStatus, int]:
        """
        Evaluate reviewer action based on role, decision, and tiered rules.
        Returns:
            (new_status, recorded_tier)
        """
        if expense.status not in (ExpenseStatus.SUBMITTED, ExpenseStatus.UNDER_REVIEW):
            raise StateMachineError(
                f"Cannot review expense in status '{expense.status}'. It must be SUBMITTED or UNDER_REVIEW."
            )

        # Handle Rejection
        if decision == ApprovalDecision.REJECTED:
            if reviewer_role not in (UserRole.ADMIN, UserRole.REVIEWER, UserRole.FINANCE):
                raise StateMachineError("Unauthorized: Role cannot reject expenses.", 403)
            tier = 1 if expense.current_approval_tier == 0 else 2
            expense.status = ExpenseStatus.REJECTED
            return ExpenseStatus.REJECTED, tier

        # Handle Changes Requested
        if decision == ApprovalDecision.CHANGES_REQUESTED:
            if reviewer_role not in (UserRole.ADMIN, UserRole.REVIEWER, UserRole.FINANCE):
                raise StateMachineError("Unauthorized: Role cannot request changes.", 403)
            tier = 1 if expense.current_approval_tier == 0 else 2
            expense.status = ExpenseStatus.CHANGES_REQUESTED
            return ExpenseStatus.CHANGES_REQUESTED, tier

        # Handle Approval
        if decision == ApprovalDecision.APPROVED:
            # Tier 1 Approval
            if expense.current_approval_tier == 0:
                if reviewer_role not in (UserRole.ADMIN, UserRole.REVIEWER, UserRole.FINANCE):
                    raise StateMachineError(
                        "Tier-1 approval must be performed by a REVIEWER or ADMIN.",
                        403
                    )
                
                if expense.approval_tier_required == 1:
                    # Single-tier: completes approval
                    expense.status = ExpenseStatus.APPROVED
                    expense.current_approval_tier = 1
                    return ExpenseStatus.APPROVED, 1
                else:
                    # Two-tier required: advance to UNDER_REVIEW for Finance / Secondary Review
                    expense.status = ExpenseStatus.UNDER_REVIEW
                    expense.current_approval_tier = 1
                    return ExpenseStatus.UNDER_REVIEW, 1

            # Tier 2 Approval (Admin final sign-off after Reviewer Tier 1 review)
            elif expense.current_approval_tier == 1:
                if expense.approval_tier_required < 2:
                    raise StateMachineError("Tier-2 approval is not required for this expense.", 400)
                
                if reviewer_role not in (UserRole.ADMIN, UserRole.FINANCE):
                    raise StateMachineError(
                        "Tier-2 final approval must be performed by an ADMIN.",
                        403
                    )
                
                expense.status = ExpenseStatus.APPROVED
                expense.current_approval_tier = 2
                return ExpenseStatus.APPROVED, 2

            else:
                raise StateMachineError("Expense has already satisfied all approval tiers.", 400)

        raise StateMachineError(f"Invalid approval decision: {decision}")
