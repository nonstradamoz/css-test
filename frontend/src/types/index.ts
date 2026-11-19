import { components } from './api.generated';

export type BankDetails = {
  account_holder_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  upi_id?: string | null;
};

// Core Schema Types mapped directly from FastAPI OpenAPI
export type User = components["schemas"]["UserOut"] & {
  bank_details?: BankDetails | null;
};
export type Role = components["schemas"]["UserRole"];
export type UserRole = components["schemas"]["UserRole"];

export type Expense = components["schemas"]["ExpenseOut"];
export type ExpenseStatus = components["schemas"]["ExpenseStatus"];
export type ExpenseCategory = string;

export type ExpenseApproval = components["schemas"]["ExpenseApprovalOut"];
export type ApprovalDecision = components["schemas"]["ApprovalDecision"];

export type Reimbursement = components["schemas"]["ReimbursementOut"] & {
  expense_title?: string | null;
  submitter_name?: string | null;
};
export type ReimbursementStatus = components["schemas"]["ReimbursementStatus"];

export type SystemSettings = components["schemas"]["SystemSettingsOut"];
export type AuditLog = components["schemas"]["AuditLogOut"];
export type PresignedUploadResponse = components["schemas"]["PresignedUploadResponse"];

export type ExpenseCreate = components["schemas"]["ExpenseCreate"];
export type ExpenseUpdate = components["schemas"]["ExpenseUpdate"];

export type Category = components["schemas"]["CategoryOut"];
export type CategoryCreate = components["schemas"]["CategoryCreate"];
export type CategoryUpdate = components["schemas"]["CategoryUpdate"];

export type ReceiptAnalysisResponse = components["schemas"]["ReceiptAnalysisResponse"];
export type ExtractedLineItem = components["schemas"]["ExtractedLineItem"];
export type ForensicsPreviewResponse = components["schemas"]["ForensicsPreviewResponse"];
export type ForensicFlagItem = components["schemas"]["ForensicFlagItem"];
