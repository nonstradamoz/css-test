import pytest
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from app.models import Expense, ExpenseStatus, ExpenseCategory
from app.services.duplicate_detector import DuplicateDetector


@pytest.mark.asyncio
async def test_duplicate_detector_exact_receipt_hash(test_db):
    # Create initial expense
    exp1 = Expense(
        id="exp-1",
        submitted_by="user-1",
        title="Software Subscription",
        category=ExpenseCategory.SOFTWARE,
        amount=Decimal("1200.00"),
        currency="INR",
        status=ExpenseStatus.SUBMITTED,
        receipt_hash="hash-abc-123",
        expense_date=datetime.now(timezone.utc)
    )
    test_db.add(exp1)
    await test_db.commit()

    # Attempt duplicate check with same receipt hash
    is_dup, msg = await DuplicateDetector.check_duplicate(
        db=test_db,
        submitted_by="user-2",
        amount=Decimal("1200.00"),
        expense_date=datetime.now(timezone.utc),
        receipt_hash="hash-abc-123"
    )
    assert is_dup is True
    assert "Duplicate receipt detected" in msg


@pytest.mark.asyncio
async def test_duplicate_detector_same_user_amount_24h(test_db):
    now = datetime.now(timezone.utc)
    exp1 = Expense(
        id="exp-2",
        submitted_by="user-1",
        title="Team Lunch",
        category=ExpenseCategory.MEALS,
        amount=Decimal("3500.00"),
        currency="INR",
        status=ExpenseStatus.APPROVED,
        expense_date=now
    )
    test_db.add(exp1)
    await test_db.commit()

    # Same user submits same amount 3 hours later
    is_dup, msg = await DuplicateDetector.check_duplicate(
        db=test_db,
        submitted_by="user-1",
        amount=Decimal("3500.00"),
        expense_date=now + timedelta(hours=3)
    )
    assert is_dup is True
    assert "Warning: An identical claim of amount" in msg


@pytest.mark.asyncio
async def test_duplicate_detector_different_user_legitimate(test_db):
    now = datetime.now(timezone.utc)
    exp1 = Expense(
        id="exp-3",
        submitted_by="user-1",
        title="Flight Ticket",
        category=ExpenseCategory.TRAVEL,
        amount=Decimal("8500.00"),
        currency="INR",
        status=ExpenseStatus.APPROVED,
        expense_date=now
    )
    test_db.add(exp1)
    await test_db.commit()

    # Different user submits same amount (legitimate)
    is_dup, msg = await DuplicateDetector.check_duplicate(
        db=test_db,
        submitted_by="user-2",
        amount=Decimal("8500.00"),
        expense_date=now
    )
    assert is_dup is False
    assert msg is None
