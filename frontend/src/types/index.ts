export type Role = 'ADMIN' | 'FINANCE' | 'REVIEWER' | 'MEMBER';

export type ExpenseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'RESUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'REFUND_FAILED';

export type ReimbursementStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type AuditAction =
  | 'EXPENSE_CREATED'
  | 'EXPENSE_SUBMITTED'
  | 'EXPENSE_UPDATED'
  | 'CHANGES_REQUESTED'
  | 'EXPENSE_RESUBMITTED'
  | 'EXPENSE_APPROVED'
  | 'EXPENSE_REJECTED'
  | 'REFUND_CREATED'
  | 'REFUND_PROCESSING'
  | 'REFUND_COMPLETED'
  | 'REFUND_FAILED'
  | 'REFUND_RETRIED'
  | 'MEMBER_INVITED'
  | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED'
  | 'ORGANISATION_CREATED'
  | 'RECEIPT_UPLOADED';

export interface Organisation {
  id: string;
  name: string;
  currency: string;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
  settings?: {
    autoApproveUnderCents?: number;
    duplicateWindowDays?: number;
    mockRefundOutcome?: 'SUCCESS' | 'FAILURE' | 'TIMEOUT';
  };
}

export interface Member {
  id: string;
  organisationId: string;
  email: string;
  displayName: string;
  role: Role;
  joinedAt: any;
  invitedBy?: string;
}

export interface ReceiptMetadata {
  id: string;
  organisationId: string;
  expenseId: string;
  storageProvider: 'cloudinary' | 's3' | 'mock';
  storageKey: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  checksum: string;
  uploadedBy: string;
  createdAt: any;
}

export interface Expense {
  id: string;
  organisationId: string;
  submittedBy: string;
  submitterEmail?: string;
  submitterName?: string;
  amount: number; // in cents/paise
  currency: string;
  category: string;
  merchant: string;
  expenseDate: string; // YYYY-MM-DD
  description: string;
  status: ExpenseStatus;
  receipt?: ReceiptMetadata;
  duplicateWarning?: {
    isDuplicate: boolean;
    matchingExpenseId?: string;
    matchedOn?: string[];
  };
  changeRequestReason?: string;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: any;
  rejectedBy?: string;
  rejectedAt?: any;
  reimbursementId?: string;
  createdAt: any;
  updatedAt: any;
  submittedAt?: any;
}

export interface ApprovalRecord {
  id: string;
  organisationId: string;
  expenseId: string;
  decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  reviewerId: string;
  reviewerName?: string;
  reviewerEmail?: string;
  reason?: string;
  timestamp: any;
}

export interface Reimbursement {
  id: string;
  organisationId: string;
  expenseId: string;
  submittedBy: string;
  amount: number;
  currency: string;
  status: ReimbursementStatus;
  provider: string;
  providerReference?: string;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt?: any;
  failureReason?: string;
  createdAt: any;
  updatedAt: any;
  completedAt?: any;
  failedAt?: any;
}

export interface AuditLog {
  id: string;
  organisationId: string;
  actorId: string;
  actorEmail?: string;
  action: AuditAction;
  entityType: 'EXPENSE' | 'REIMBURSEMENT' | 'MEMBER' | 'ORGANISATION' | 'RECEIPT';
  entityId: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  metadata?: Record<string, any>;
  requestId?: string;
  timestamp: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  organisations?: string[];
}
