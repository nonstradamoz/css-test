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
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  createdBy: string;
  settings?: {
    autoApproveUnderCents?: number;
    duplicateWindowDays?: number;
    mockRefundOutcome?: 'SUCCESS' | 'FAILURE' | 'TIMEOUT';
  };
}

export interface Member {
  id: string; // matches Firebase Auth UID
  organisationId: string;
  email: string;
  displayName: string;
  role: Role;
  joinedAt: FirebaseFirestore.Timestamp;
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
  createdAt: FirebaseFirestore.Timestamp;
}

export interface Expense {
  id: string;
  organisationId: string;
  submittedBy: string;
  submitterEmail?: string;
  submitterName?: string;
  amount: number; // Integer smallest unit (cents/paise)
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
  approvedAt?: FirebaseFirestore.Timestamp;
  rejectedBy?: string;
  rejectedAt?: FirebaseFirestore.Timestamp;
  reimbursementId?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  submittedAt?: FirebaseFirestore.Timestamp;
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
  timestamp: FirebaseFirestore.Timestamp;
}

export interface Reimbursement {
  id: string;
  organisationId: string;
  expenseId: string;
  submittedBy: string;
  amount: number; // in cents/paise
  currency: string;
  status: ReimbursementStatus;
  provider: string;
  providerReference?: string;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt?: FirebaseFirestore.Timestamp;
  failureReason?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  failedAt?: FirebaseFirestore.Timestamp;
}

export interface AuditLog {
  id: string;
  organisationId: string;
  actorId: string;
  actorEmail?: string;
  action: AuditAction;
  entityType: 'EXPENSE' | 'REIMBURSEMENT' | 'MEMBER' | 'ORGANISATION' | 'RECEIPT';
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  requestId?: string;
  timestamp: FirebaseFirestore.Timestamp;
}

export interface IdempotencyKeyRecord {
  key: string;
  organisationId: string;
  userId: string;
  operation: string;
  requestHash: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  result?: Record<string, unknown>;
  error?: string;
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
}

export interface Invitation {
  id: string;
  organisationId: string;
  email: string;
  role: Role;
  invitedBy: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
}
