import { components } from './api.generated';

export type BankDetails = {
  account_holder_name?: string | null;
  bank_name?: string | null;
  bank_address?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  upi_id?: string | null;
};

// Core Schema Types mapped directly from FastAPI OpenAPI
export type User = components["schemas"]["UserOut"] & {
  bank_details?: BankDetails | null;
  pan_number?: string | null;
  pan_document_url?: string | null;
};
export type Role = components["schemas"]["UserRole"];
export type UserRole = components["schemas"]["UserRole"];

export type Expense = components["schemas"]["ExpenseOut"] & {
  category_details?: Record<string, any> | null;
};
export type ExpenseStatus = components["schemas"]["ExpenseStatus"];
export type ExpenseCategory = string;

export type ExpenseApproval = components["schemas"]["ExpenseApprovalOut"];
export type ApprovalDecision = components["schemas"]["ApprovalDecision"];

export type Reimbursement = components["schemas"]["ReimbursementOut"] & {
  expense_title?: string | null;
  submitter_name?: string | null;
  transaction_id?: string | null;
};
export type ReimbursementStatus = components["schemas"]["ReimbursementStatus"];

export type SystemSettings = components["schemas"]["SystemSettingsOut"] & {
  expense_submissions_enabled?: boolean;
  multi_tier_approval_enabled?: boolean;
  enforce_date_window?: boolean;
  policy_allowed_start_date?: string | null;
  policy_allowed_end_date?: string | null;
  ai_receipt_extractor_enabled?: boolean;
};
export type AuditLog = components["schemas"]["AuditLogOut"];
export type PresignedUploadResponse = components["schemas"]["PresignedUploadResponse"];

export type ExpenseCreate = components["schemas"]["ExpenseCreate"] & {
  category_details?: Record<string, any> | null;
  on_behalf_of_user_id?: string | null;
  vendor_id?: string | null;
  auto_approve_vendor_bill?: boolean;
};
export type ExpenseUpdate = components["schemas"]["ExpenseUpdate"] & {
  category_details?: Record<string, any> | null;
};

export type Category = components["schemas"]["CategoryOut"];
export type CategoryCreate = components["schemas"]["CategoryCreate"];
export type CategoryUpdate = components["schemas"]["CategoryUpdate"];

export type ReceiptAnalysisResponse = components["schemas"]["ReceiptAnalysisResponse"] & {
  vendor_location?: string | null;
  mobile_number?: string | null;
  payment_mode?: string | null;
  transaction_id?: string | null;
  bill_number?: string | null;
  receipt_number?: string | null;
  gstin?: string | null;
  subtotal_amount?: number | null;
  cgst_amount?: number | null;
  sgst_amount?: number | null;
  igst_amount?: number | null;
  is_itc_eligible?: boolean;
  category_logistics?: Record<string, any> | null;
  math_check_passed?: boolean;
  math_discrepancy_amount?: number;
  is_future_date?: boolean;
  is_stale_receipt?: boolean;
  verification_status?: string | null;
  is_synthetic_invoice?: boolean;
  date_found_in_bill?: boolean;
  date_verified?: boolean;
};
export type ExtractedLineItem = components["schemas"]["ExtractedLineItem"];
export type ForensicsPreviewResponse = components["schemas"]["ForensicsPreviewResponse"];
export type ForensicFlagItem = components["schemas"]["ForensicFlagItem"];

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'REVIEW_REQUIRED' | 'REVIEW_PASSED' | 'ADMIN_APPROVAL_REQUIRED' | 'CLAIM_APPROVED' | 'CHANGES_REQUESTED' | 'CLAIM_REJECTED' | string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unread_count: number;
}

export interface VendorBankDetails {
  account_holder_name: string;
  bank_name: string;
  bank_address?: string | null;
  account_number: string;
  ifsc_code: string;
  upi_id?: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  pan?: string | null;
  pan_document_url?: string | null;
  address?: string | null;
  default_category?: string | null;
  bank_details: VendorBankDetails;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorCreate {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  pan: string;
  pan_document_url: string;
  address?: string;
  default_category?: string;
  bank_details: VendorBankDetails;
}

export interface VendorUpdate {
  name?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  pan?: string;
  pan_document_url?: string;
  address?: string;
  default_category?: string;
  bank_details?: VendorBankDetails;
  is_active?: boolean;
}
