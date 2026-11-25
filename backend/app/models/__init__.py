import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    FINANCE = "FINANCE"
    REVIEWER = "REVIEWER"
    EMPLOYEE = "EMPLOYEE"


class ExpenseStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    CHANGES_REQUESTED = "CHANGES_REQUESTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    REIMBURSED = "REIMBURSED"


class ExpenseCategory(str, enum.Enum):
    TRAVEL = "TRAVEL"
    MEALS = "MEALS"
    SUPPLIES = "SUPPLIES"
    SOFTWARE = "SOFTWARE"
    TRAINING = "TRAINING"
    ACCOMMODATION = "ACCOMMODATION"
    OTHER = "OTHER"


class ExpenseCategoryModel(Base):
    __tablename__ = "expense_categories"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class ApprovalDecision(str, enum.Enum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CHANGES_REQUESTED = "CHANGES_REQUESTED"


class ReimbursementStatus(str, enum.Enum):
    INITIATED = "INITIATED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.EMPLOYEE, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    bank_details = Column(JSON, nullable=True, default=dict)
    pan_number = Column(String(20), nullable=True)
    pan_document_url = Column(String(1024), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    submitted_expenses = relationship("Expense", back_populates="submitter", foreign_keys="Expense.submitted_by")
    reviews = relationship("ExpenseApproval", back_populates="reviewer", foreign_keys="ExpenseApproval.reviewer_id")
    processed_reimbursements = relationship("Reimbursement", back_populates="processor", foreign_keys="Reimbursement.processed_by")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    user_agent = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="refresh_tokens")


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, default=1)
    company_name = Column(String(255), default="ClearSpend", nullable=False)
    default_currency = Column(String(3), default="INR", nullable=False)
    tier2_approval_threshold = Column(Numeric(12, 2), default=25000.00, nullable=False)
    allow_self_approval = Column(Boolean, default=False, nullable=False)
    expense_submissions_enabled = Column(Boolean, default=True, nullable=False)
    multi_tier_approval_enabled = Column(Boolean, default=True, nullable=False)
    enforce_date_window = Column(Boolean, default=False, nullable=False)
    policy_allowed_start_date = Column(DateTime(timezone=True), nullable=True)
    policy_allowed_end_date = Column(DateTime(timezone=True), nullable=True)
    ai_receipt_extractor_enabled = Column(Boolean, default=True, nullable=False)
    updated_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    submitted_by = Column(String(36), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(64), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), default="INR", nullable=False)
    receipt_url = Column(String(1024), nullable=True)
    receipt_storage_key = Column(String(255), nullable=True, index=True)
    receipt_hash = Column(String(64), nullable=True, index=True)
    status = Column(Enum(ExpenseStatus), default=ExpenseStatus.DRAFT, nullable=False, index=True)
    approval_tier_required = Column(Integer, default=1, nullable=False)  # 1 or 2
    current_approval_tier = Column(Integer, default=0, nullable=False)   # 0=none, 1=tier 1 done, 2=tier 2 done
    expense_date = Column(DateTime(timezone=True), nullable=False)
    risk_score = Column(Integer, default=0, nullable=False, index=True)
    risk_level = Column(String(20), default="LOW", nullable=False, index=True)  # LOW, MEDIUM, HIGH
    forensic_flags = Column(JSON, default=list, nullable=False)
    extracted_metadata = Column(JSON, default=dict, nullable=True)
    category_details = Column(JSON, default=dict, nullable=True)
    audit_exemption_reason = Column(Text, nullable=True)
    vendor_id = Column(String(36), ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    submitter = relationship("User", back_populates="submitted_expenses", foreign_keys=[submitted_by])
    vendor = relationship("Vendor", back_populates="expenses")
    approvals = relationship("ExpenseApproval", back_populates="expense", cascade="all, delete-orphan", order_by="ExpenseApproval.created_at")
    reimbursement = relationship("Reimbursement", back_populates="expense", uselist=False, cascade="all, delete-orphan")


class ExpenseApproval(Base):
    __tablename__ = "expense_approvals"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    expense_id = Column(String(36), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(String(36), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    tier = Column(Integer, nullable=False)  # 1 or 2
    decision = Column(Enum(ApprovalDecision), nullable=False)
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    expense = relationship("Expense", back_populates="approvals")
    reviewer = relationship("User", back_populates="reviews", foreign_keys=[reviewer_id])


class Reimbursement(Base):
    __tablename__ = "reimbursements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    expense_id = Column(String(36), ForeignKey("expenses.id", ondelete="CASCADE"), unique=True, nullable=False)
    processed_by = Column(String(36), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), default="INR", nullable=False)
    status = Column(Enum(ReimbursementStatus), default=ReimbursementStatus.INITIATED, nullable=False, index=True)
    idempotency_key = Column(String(128), unique=True, nullable=False, index=True)
    transaction_id = Column(String(128), nullable=True, index=True)
    retry_count = Column(Integer, default=0, nullable=False)
    provider_response = Column(JSON, nullable=True)
    disbursed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    expense = relationship("Expense", back_populates="reimbursement")
    processor = relationship("User", back_populates="processed_reimbursements", foreign_keys=[processed_by])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    entity_type = Column(String(64), nullable=False, index=True)
    entity_id = Column(String(36), nullable=False, index=True)
    action = Column(String(64), nullable=False, index=True)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), nullable=False, default="INFO")
    link = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    user = relationship("User", backref="notifications")


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False, index=True)
    contact_person = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    gstin = Column(String(50), nullable=True)
    pan = Column(String(50), nullable=True)
    pan_document_url = Column(String(1024), nullable=True)
    address = Column(Text, nullable=True)
    default_category = Column(String(64), nullable=True)
    bank_details = Column(JSON, nullable=False, default=dict)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    expenses = relationship("Expense", back_populates="vendor")
