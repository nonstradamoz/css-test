from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from app.models import (
    UserRole,
    ExpenseStatus,
    ExpenseCategory,
    ApprovalDecision,
    ReimbursementStatus
)


# ==================== Auth & User Schemas ====================

class BankDetails(BaseModel):
    account_holder_name: Optional[str] = None
    bank_name: Optional[str] = None
    bank_address: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    centre_id: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class UserBase(BaseModel):
    email: EmailStr
    full_name: str


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.EMPLOYEE
    bank_details: Optional[BankDetails] = None
    pan_number: Optional[str] = Field(None, min_length=10, max_length=20)
    pan_document_url: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    bank_details: Optional[BankDetails] = None
    pan_number: Optional[str] = Field(None, min_length=10, max_length=20)
    pan_document_url: Optional[str] = None


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=8)
    bank_details: Optional[BankDetails] = None
    pan_number: Optional[str] = Field(None, min_length=10, max_length=20)
    pan_document_url: Optional[str] = None


class UserOut(UserBase):
    id: str
    role: UserRole
    is_active: bool
    bank_details: Optional[Dict[str, Any]] = None
    pan_number: Optional[str] = None
    pan_document_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class GoogleAuthRequest(BaseModel):
    id_token: Optional[str] = None
    credential: Optional[str] = None
    access_token: Optional[str] = None
    code: Optional[str] = None
    redirect_uri: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None


# ==================== System Settings ====================

class SystemSettingsOut(BaseModel):
    company_name: str
    default_currency: str
    tier2_approval_threshold: Decimal
    allow_self_approval: bool
    expense_submissions_enabled: bool = True
    multi_tier_approval_enabled: bool = True
    enforce_date_window: bool = False
    policy_allowed_start_date: Optional[datetime] = None
    policy_allowed_end_date: Optional[datetime] = None
    ai_receipt_extractor_enabled: bool = True
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SystemSettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    default_currency: Optional[str] = None
    tier2_approval_threshold: Optional[Decimal] = None
    allow_self_approval: Optional[bool] = None
    expense_submissions_enabled: Optional[bool] = None
    multi_tier_approval_enabled: Optional[bool] = None
    enforce_date_window: Optional[bool] = None
    policy_allowed_start_date: Optional[datetime] = None
    policy_allowed_end_date: Optional[datetime] = None
    ai_receipt_extractor_enabled: Optional[bool] = None


# ==================== Approval Schemas ====================

class ApprovalActionRequest(BaseModel):
    decision: ApprovalDecision
    comments: Optional[str] = None
    audit_exemption_reason: Optional[str] = None


class ExpenseApprovalOut(BaseModel):
    id: str
    reviewer_id: str
    tier: int
    decision: ApprovalDecision
    comments: Optional[str]
    created_at: datetime
    reviewer_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== Reimbursement Schemas ====================

class ReimbursementCreate(BaseModel):
    expense_id: str
    idempotency_key: str = Field(..., min_length=16, description="Client-generated unique UUID to prevent double payouts")
    transaction_id: Optional[str] = Field(None, min_length=3, max_length=128, description="Transfer Transaction ID / UTR / Reference ID")


class ReimbursementOut(BaseModel):
    id: str
    expense_id: str
    processed_by: str
    amount: Decimal
    currency: str
    status: ReimbursementStatus
    idempotency_key: str
    transaction_id: Optional[str] = None
    retry_count: int
    provider_response: Optional[Dict[str, Any]] = None
    disbursed_at: Optional[datetime] = None
    created_at: datetime
    expense_title: Optional[str] = None
    submitter_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== Expense Schemas ====================

class ExpenseCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    description: Optional[str] = None
    category: str = Field(..., min_length=1, max_length=64)
    amount: Decimal = Field(..., gt=0)
    currency: str = "INR"
    expense_date: datetime
    receipt_url: Optional[str] = None
    receipt_hash: Optional[str] = None
    extracted_metadata: Optional[Dict[str, Any]] = None
    category_details: Optional[Dict[str, Any]] = None
    on_behalf_of_user_id: Optional[str] = Field(None, description="Admin/Reviewer can submit on behalf of an employee")
    vendor_id: Optional[str] = Field(None, description="Optional vendor profile ID when submitting a vendor bill")
    auto_approve_vendor_bill: bool = Field(False, description="Admin option to directly approve a vendor bill for payout")


class ExpenseUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = Field(None, min_length=1, max_length=64)
    amount: Optional[Decimal] = Field(None, gt=0)
    currency: Optional[str] = None
    expense_date: Optional[datetime] = None
    receipt_url: Optional[str] = None
    receipt_hash: Optional[str] = None
    extracted_metadata: Optional[Dict[str, Any]] = None
    category_details: Optional[Dict[str, Any]] = None


class ExpenseOut(BaseModel):
    id: str
    submitted_by: str
    title: str
    description: Optional[str]
    category: str
    amount: Decimal
    currency: str
    receipt_url: Optional[str]
    receipt_hash: Optional[str]
    status: ExpenseStatus
    approval_tier_required: int
    current_approval_tier: int
    expense_date: datetime
    risk_score: int = 0
    risk_level: str = "LOW"
    forensic_flags: List[Dict[str, Any]] = []
    extracted_metadata: Optional[Dict[str, Any]] = None
    category_details: Optional[Dict[str, Any]] = None
    audit_exemption_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    submitter_name: Optional[str] = None
    submitter_email: Optional[str] = None
    submitter_has_bank_details: bool = False
    submitter_bank_details: Optional[Dict[str, Any]] = None
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    approvals: List[ExpenseApprovalOut] = []
    reimbursement: Optional[ReimbursementOut] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== AI Receipt & Forensics Schemas ====================

class ExtractedLineItem(BaseModel):
    description: str
    amount: float
    flagged: bool = False
    reason: Optional[str] = None


class ReceiptAnalysisResponse(BaseModel):
    # Section 1: Vendor & Legal Identity
    merchant_name: str
    vendor_location: Optional[str] = None
    mobile_number: Optional[str] = None
    gstin: Optional[str] = None

    # Section 2: Document & Transaction Identifiers
    invoice_number: Optional[str] = None
    receipt_number: Optional[str] = None
    bill_number: Optional[str] = None
    transaction_id: Optional[str] = None
    payment_mode: Optional[str] = None

    # Section 3: Financials & Dual Tax / ITC Model
    amount: float
    subtotal_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    cgst_amount: Optional[float] = None
    sgst_amount: Optional[float] = None
    igst_amount: Optional[float] = None
    currency: str = "INR"
    is_itc_eligible: Optional[bool] = False

    # Section 4: Categorization & Line Items
    suggested_category: str
    line_items: List[ExtractedLineItem] = []

    # Section 5: Deep Category Logistics
    category_logistics: Optional[Dict[str, Any]] = None

    # Section 6: Mathematical & Temporal Sanity Engine
    math_check_passed: Optional[bool] = True
    math_discrepancy_amount: Optional[float] = 0.0
    is_future_date: Optional[bool] = False
    is_stale_receipt: Optional[bool] = False
    is_handwritten: bool = False
    handwritten_notes: Optional[str] = None

    # Verification & Confidence Metrics
    confidence_score: float = 0.95
    expense_date: Optional[str] = None
    is_synthetic_invoice: Optional[bool] = False
    date_found_in_bill: Optional[bool] = False
    date_verified: Optional[bool] = False
    amount_verified: Optional[bool] = False
    identifiers_verified: Optional[bool] = False
    verification_status: Optional[str] = "UNVERIFIED"


class ForensicsPreviewRequest(BaseModel):
    amount: Decimal
    expense_date: datetime
    category: str
    receipt_hash: Optional[str] = None
    line_items: Optional[List[Dict[str, Any]]] = None
    extracted_metadata: Optional[Dict[str, Any]] = None


class ForensicFlagItem(BaseModel):
    code: str
    label: str
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    description: str


class ForensicsPreviewResponse(BaseModel):
    risk_score: int
    risk_level: str  # LOW, MEDIUM, HIGH
    flags: List[ForensicFlagItem]
    will_escalate_tier2: bool
    is_blocked: bool = False
    block_reason: Optional[str] = None


# ==================== Category Schemas ====================

class CategoryCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    is_active: bool = True


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CategoryOut(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool
    is_system: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== Storage Schemas (Cloudflare R2) ====================

class PresignedUploadRequest(BaseModel):
    filename: str
    content_type: str = Field(..., pattern="^(image/.*|application/pdf)$")
    file_size_bytes: int = Field(..., gt=0, le=15 * 1024 * 1024)  # Max 15MB


class PresignedUploadResponse(BaseModel):
    upload_url: str
    key: str
    public_url: str
    fields: Optional[Dict[str, Any]] = None


# ==================== Audit Log Schemas ====================

class AuditLogOut(BaseModel):
    id: str
    actor_id: Optional[str]
    entity_type: str
    entity_id: str
    action: str
    old_values: Optional[Dict[str, Any]]
    new_values: Optional[Dict[str, Any]]
    ip_address: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== Notification Schemas ====================

class NotificationOut(BaseModel):
    id: str
    user_id: str
    title: str
    message: str
    type: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationListOut(BaseModel):
    items: List[NotificationOut]
    unread_count: int


class UnreadCountOut(BaseModel):
    unread_count: int


# ==================== Vendor Schemas ====================

class VendorBankDetails(BaseModel):
    account_holder_name: str = Field(..., min_length=2, max_length=255)
    bank_name: str = Field(..., min_length=2, max_length=255)
    bank_address: Optional[str] = None
    account_number: str = Field(..., min_length=4, max_length=64)
    ifsc_code: str = Field(..., min_length=4, max_length=32)
    upi_id: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class VendorCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    pan: str = Field(..., min_length=10, max_length=20, description="Mandatory 10-character PAN number")
    pan_document_url: str = Field(..., min_length=5, description="Mandatory uploaded PAN card document or image URL")
    address: Optional[str] = None
    default_category: Optional[str] = None
    bank_details: VendorBankDetails


class VendorUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    contact_person: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = Field(None, min_length=10, max_length=20)
    pan_document_url: Optional[str] = None
    address: Optional[str] = None
    default_category: Optional[str] = None
    bank_details: Optional[VendorBankDetails] = None
    is_active: Optional[bool] = None


class VendorOut(BaseModel):
    id: str
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    pan_document_url: Optional[str] = None
    address: Optional[str] = None
    default_category: Optional[str] = None
    bank_details: Dict[str, Any] = {}
    is_active: bool
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
