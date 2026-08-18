import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { assertAuthenticated, assertOrgMembership, assertRole } from './shared/auth-middleware';
import { AppError } from './shared/errors';
import { OrganisationService } from './organisations/org.service';
import { MemberService } from './members/member.service';
import { ExpenseService } from './expenses/expense.service';
import { ReimbursementService } from './reimbursements/reimbursement.service';
import { ReceiptService } from './receipts/receipt.service';
import { Role } from './shared/types';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

/**
 * Helper to wrap callable handlers with robust error logging and HttpsError conversion
 */
function handleCallable<TReq, TRes>(
  fn: (request: any) => Promise<TRes>
): (request: any) => Promise<TRes> {
  return async (request) => {
    try {
      return await fn(request);
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error.toHttpsError();
      }
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('[Unhandled Backend Error]', error);
      throw new HttpsError('internal', error.message || 'An internal server error occurred.');
    }
  };
}

// -------------------------------------------------------------
// 1. ORGANISATION & MEMBERSHIP FUNCTIONS
// -------------------------------------------------------------

export const createOrganisation = onCall(
  handleCallable(async (request) => {
    const auth = assertAuthenticated(request);
    const { name, currency } = request.data;
    return OrganisationService.createOrganisation(db, {
      name,
      currency,
      creatorId: auth.userId,
      creatorEmail: auth.email,
      creatorDisplayName: auth.displayName
    });
  })
);

export const updateOrgSettings = onCall(
  handleCallable(async (request) => {
    const { organisationId, settings } = request.data;
    const auth = await assertRole(db, request, organisationId, ['ADMIN']);
    await OrganisationService.updateSettings(db, {
      organisationId,
      actorId: auth.userId,
      actorEmail: auth.email,
      settings
    });
    return { success: true };
  })
);

export const inviteMember = onCall(
  handleCallable(async (request) => {
    const { organisationId, email, role } = request.data;
    const auth = await assertRole(db, request, organisationId, ['ADMIN']);
    return MemberService.inviteMember(db, {
      organisationId,
      email,
      role: role as Role,
      actorId: auth.userId,
      actorEmail: auth.email
    });
  })
);

export const changeMemberRole = onCall(
  handleCallable(async (request) => {
    const { organisationId, targetMemberId, newRole } = request.data;
    const auth = await assertRole(db, request, organisationId, ['ADMIN']);
    await MemberService.changeMemberRole(db, {
      organisationId,
      targetMemberId,
      newRole: newRole as Role,
      actorId: auth.userId,
      actorEmail: auth.email
    });
    return { success: true };
  })
);

export const removeMember = onCall(
  handleCallable(async (request) => {
    const { organisationId, targetMemberId } = request.data;
    const auth = await assertRole(db, request, organisationId, ['ADMIN']);
    await MemberService.removeMember(db, {
      organisationId,
      targetMemberId,
      actorId: auth.userId,
      actorEmail: auth.email
    });
    return { success: true };
  })
);

// -------------------------------------------------------------
// 2. EXPENSE LIFECYCLE & MUTATION FUNCTIONS
// -------------------------------------------------------------

export const submitExpense = onCall(
  handleCallable(async (request) => {
    const { organisationId, expenseId } = request.data;
    const auth = await assertOrgMembership(db, request, organisationId);
    return ExpenseService.submitExpense(db, {
      organisationId,
      expenseId,
      actorId: auth.userId,
      actorEmail: auth.email,
      userRole: auth.role
    });
  })
);

export const requestExpenseChanges = onCall(
  handleCallable(async (request) => {
    const { organisationId, expenseId, reason } = request.data;
    const auth = await assertRole(db, request, organisationId, ['REVIEWER', 'ADMIN']);
    return ExpenseService.requestChanges(db, {
      organisationId,
      expenseId,
      actorId: auth.userId,
      actorEmail: auth.email,
      userRole: auth.role,
      reason
    });
  })
);

export const resubmitExpense = onCall(
  handleCallable(async (request) => {
    const { organisationId, expenseId, updates } = request.data;
    const auth = await assertOrgMembership(db, request, organisationId);
    return ExpenseService.resubmitExpense(db, {
      organisationId,
      expenseId,
      actorId: auth.userId,
      actorEmail: auth.email,
      userRole: auth.role,
      updates
    });
  })
);

export const approveExpense = onCall(
  handleCallable(async (request) => {
    const { organisationId, expenseId, reason } = request.data;
    const auth = await assertRole(db, request, organisationId, ['REVIEWER', 'ADMIN']);
    return ExpenseService.approveExpense(db, {
      organisationId,
      expenseId,
      actorId: auth.userId,
      actorEmail: auth.email,
      userRole: auth.role,
      reason
    });
  })
);

export const rejectExpense = onCall(
  handleCallable(async (request) => {
    const { organisationId, expenseId, reason } = request.data;
    const auth = await assertRole(db, request, organisationId, ['REVIEWER', 'ADMIN']);
    return ExpenseService.rejectExpense(db, {
      organisationId,
      expenseId,
      actorId: auth.userId,
      actorEmail: auth.email,
      userRole: auth.role,
      reason
    });
  })
);

// -------------------------------------------------------------
// 3. REIMBURSEMENT & REFUND RECOVERY FUNCTIONS
// -------------------------------------------------------------

export const createReimbursement = onCall(
  handleCallable(async (request) => {
    const { organisationId, expenseId, idempotencyKey, forcedOutcome } = request.data;
    const auth = await assertRole(db, request, organisationId, ['FINANCE', 'ADMIN']);

    if (!idempotencyKey) {
      throw new AppError('VALIDATION_ERROR', 'Idempotency key is required for reimbursement operations.');
    }

    return ReimbursementService.createReimbursement(db, {
      organisationId,
      expenseId,
      actorId: auth.userId,
      actorEmail: auth.email,
      userRole: auth.role,
      idempotencyKey,
      forcedOutcome
    });
  })
);

export const retryRefund = onCall(
  handleCallable(async (request) => {
    const { organisationId, reimbursementId, idempotencyKey, forcedOutcome } = request.data;
    const auth = await assertRole(db, request, organisationId, ['FINANCE', 'ADMIN']);

    if (!idempotencyKey) {
      throw new AppError('VALIDATION_ERROR', 'Idempotency key is required for retry operations.');
    }

    return ReimbursementService.retryRefund(db, {
      organisationId,
      reimbursementId,
      actorId: auth.userId,
      actorEmail: auth.email,
      userRole: auth.role,
      idempotencyKey,
      forcedOutcome
    });
  })
);

// -------------------------------------------------------------
// 4. RECEIPT & OBJECT STORAGE FUNCTIONS
// -------------------------------------------------------------

export const generateReceiptUploadUrl = onCall(
  handleCallable(async (request) => {
    const { organisationId, expenseId, fileName, contentType, fileSize, checksum } = request.data;
    const auth = await assertOrgMembership(db, request, organisationId);

    return ReceiptService.generateUploadUrl(db, {
      organisationId,
      expenseId,
      fileName,
      contentType,
      fileSize: Number(fileSize),
      checksum,
      actorId: auth.userId,
      actorEmail: auth.email,
      userRole: auth.role
    });
  })
);

export const confirmReceiptUpload = onCall(
  handleCallable(async (request) => {
    const {
      organisationId,
      expenseId,
      receiptId,
      storageKey,
      fileName,
      contentType,
      fileSize,
      checksum
    } = request.data;
    const auth = await assertOrgMembership(db, request, organisationId);

    return ReceiptService.attachReceiptMetadata(db, {
      organisationId,
      expenseId,
      receiptId,
      storageKey,
      fileName,
      contentType,
      fileSize: Number(fileSize),
      checksum,
      actorId: auth.userId,
      actorEmail: auth.email
    });
  })
);

export const generateReceiptDownloadUrl = onCall(
  handleCallable(async (request) => {
    const { organisationId, expenseId } = request.data;
    const auth = await assertOrgMembership(db, request, organisationId);

    return ReceiptService.generateDownloadUrl(db, {
      organisationId,
      expenseId,
      actorId: auth.userId,
      actorEmail: auth.email,
      userRole: auth.role
    });
  })
);
