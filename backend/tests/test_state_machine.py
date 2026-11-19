import pytest
from datetime import datetime, timezone
from decimal import Decimal
from app.models import Expense, ExpenseStatus, ExpenseCategory, UserRole, ApprovalDecision
from app.services.state_machine import ExpenseStateMachine, StateMachineError


def make_expense(amount: float, status: ExpenseStatus = ExpenseStatus.DRAFT) -> Expense:
    return Expense(
        id="test-exp-1",
        submitted_by="user-1",
        title="Conference Ticket",
        category=ExpenseCategory.TRAINING,
        amount=Decimal(str(amount)),
        currency="INR",
        status=status,
        approval_tier_required=1,
        current_approval_tier=0,
        expense_date=datetime.now(timezone.utc)
    )


def test_transition_to_submitted_single_tier():
    exp = make_expense(5000.00)
    ExpenseStateMachine.transition_to_submitted(exp, threshold=Decimal("25000.00"))
    assert exp.status == ExpenseStatus.SUBMITTED
    assert exp.approval_tier_required == 1
    assert exp.current_approval_tier == 0


def test_transition_to_submitted_multi_tier():
    exp = make_expense(35000.00)
    ExpenseStateMachine.transition_to_submitted(exp, threshold=Decimal("25000.00"))
    assert exp.status == ExpenseStatus.SUBMITTED
    assert exp.approval_tier_required == 2
    assert exp.current_approval_tier == 0


def test_single_tier_approval_flow():
    exp = make_expense(5000.00)
    ExpenseStateMachine.transition_to_submitted(exp, threshold=Decimal("25000.00"))
    
    # Reviewer approves Tier 1
    new_status, tier = ExpenseStateMachine.evaluate_approval(
        exp,
        reviewer_role=UserRole.REVIEWER,
        decision=ApprovalDecision.APPROVED
    )
    assert new_status == ExpenseStatus.APPROVED
    assert tier == 1
    assert exp.current_approval_tier == 1


def test_multi_tier_approval_flow():
    exp = make_expense(50000.00)
    ExpenseStateMachine.transition_to_submitted(exp, threshold=Decimal("25000.00"))
    assert exp.approval_tier_required == 2

    # Tier 1 approval by Reviewer
    status1, tier1 = ExpenseStateMachine.evaluate_approval(
        exp,
        reviewer_role=UserRole.REVIEWER,
        decision=ApprovalDecision.APPROVED
    )
    assert status1 == ExpenseStatus.UNDER_REVIEW
    assert tier1 == 1
    assert exp.current_approval_tier == 1

    # Tier 2 attempt by unauthorized role (EMPLOYEE) must fail
    with pytest.raises(StateMachineError):
        ExpenseStateMachine.evaluate_approval(
            exp,
            reviewer_role=UserRole.EMPLOYEE,
            decision=ApprovalDecision.APPROVED
        )

    # Tier 2 approval by Reviewer / Finance succeeds
    status2, tier2 = ExpenseStateMachine.evaluate_approval(
        exp,
        reviewer_role=UserRole.REVIEWER,
        decision=ApprovalDecision.APPROVED
    )
    assert status2 == ExpenseStatus.APPROVED
    assert tier2 == 2
    assert exp.current_approval_tier == 2


def test_rejection_flow():
    exp = make_expense(1000.00, status=ExpenseStatus.SUBMITTED)
    status_out, tier = ExpenseStateMachine.evaluate_approval(
        exp,
        reviewer_role=UserRole.REVIEWER,
        decision=ApprovalDecision.REJECTED
    )
    assert status_out == ExpenseStatus.REJECTED
    assert exp.status == ExpenseStatus.REJECTED


def test_changes_requested_flow():
    exp = make_expense(2000.00, status=ExpenseStatus.SUBMITTED)
    status_out, _ = ExpenseStateMachine.evaluate_approval(
        exp,
        reviewer_role=UserRole.REVIEWER,
        decision=ApprovalDecision.CHANGES_REQUESTED
    )
    assert status_out == ExpenseStatus.CHANGES_REQUESTED
    assert exp.status == ExpenseStatus.CHANGES_REQUESTED

    # Employee can resubmit after changes
    ExpenseStateMachine.transition_to_submitted(exp, threshold=Decimal("25000.00"))
    assert exp.status == ExpenseStatus.SUBMITTED
