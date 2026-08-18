import { Timestamp } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../shared/errors';
import { ApprovalRecord, Expense, ExpenseStatus, Role } from '../shared/types';
import { ExpenseStateMachine } from './state-machine';
import { DuplicateDetector } from './duplicate-detector';
import { AuditService } from '../audit/audit.service';

export interface SubmitExpenseParams {
  organisationId: string;
  expenseId: string;
  actorId: string;
  actorEmail?: string;
  userRole: Role;
}

export interface ReviewExpenseParams {
  organisationId: string;
  expenseId: string;
  actorId: string;
  actorEmail?: string;
  userRole: Role;
  reason?: string;
}

export class ExpenseService {
  /**
   * Submits a DRAFT expense for review.
   */
  static async submitExpense(
    db: admin.firestore.Firestore,
    params: SubmitExpenseParams
  ): Promise<{ success: boolean; status: ExpenseStatus; isDuplicateWarning: boolean }> {
    const expenseRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('expenses')
      .doc(params.expenseId);

    return db.runTransaction(async (tx) => {
      const doc = await tx.get(expenseRef);
      if (!doc.exists) {
        throw new AppError('NOT_FOUND', 'Expense not found.');
      }

      const expense = doc.data() as Expense;
      const isOwner = expense.submittedBy === params.actorId;

      ExpenseStateMachine.validateTransition({
        currentStatus: expense.status,
        targetStatus: 'SUBMITTED',
        userRole: params.userRole,
        isOwner
      });

      // Check duplicates
      const dupResult = await DuplicateDetector.checkDuplicates(db, {
        organisationId: params.organisationId,
        submittedBy: expense.submittedBy,
        amount: expense.amount,
        currency: expense.currency,
        expenseDate: expense.expenseDate,
        merchant: expense.merchant,
        receiptChecksum: expense.receipt?.checksum,
        currentExpenseId: params.expenseId
      });

      const now = Timestamp.now();
      const updatedData: Partial<Expense> = {
        status: 'SUBMITTED',
        submittedAt: now,
        updatedAt: now,
        duplicateWarning: {
          isDuplicate: dupResult.isDuplicate,
          matchingExpenseId: dupResult.matchingExpenseId,
          matchedOn: dupResult.matchedSignals
        }
      };

      tx.update(expenseRef, updatedData);

      AuditService.record(
        db,
        {
          organisationId: params.organisationId,
          actorId: params.actorId,
          actorEmail: params.actorEmail,
          action: 'EXPENSE_SUBMITTED',
          entityType: 'EXPENSE',
          entityId: params.expenseId,
          before: { status: expense.status },
          after: { status: 'SUBMITTED', duplicateWarning: updatedData.duplicateWarning }
        },
        tx
      );

      return {
        success: true,
        status: 'SUBMITTED',
        isDuplicateWarning: dupResult.isDuplicate
      };
    });
  }

  /**
   * Request changes on an expense with mandatory reason.
   */
  static async requestChanges(
    db: admin.firestore.Firestore,
    params: ReviewExpenseParams
  ): Promise<{ success: boolean; status: ExpenseStatus }> {
    if (!params.reason || params.reason.trim().length === 0) {
      throw new AppError('VALIDATION_ERROR', 'A reason is required when requesting changes.');
    }

    const expenseRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('expenses')
      .doc(params.expenseId);

    return db.runTransaction(async (tx) => {
      const doc = await tx.get(expenseRef);
      if (!doc.exists) {
        throw new AppError('NOT_FOUND', 'Expense not found.');
      }

      const expense = doc.data() as Expense;

      // Ensure current status is SUBMITTED or UNDER_REVIEW
      if (expense.status === 'SUBMITTED') {
        expense.status = 'UNDER_REVIEW';
      }

      ExpenseStateMachine.validateTransition({
        currentStatus: expense.status,
        targetStatus: 'CHANGES_REQUESTED',
        userRole: params.userRole,
        isOwner: expense.submittedBy === params.actorId,
        reason: params.reason
      });

      const now = Timestamp.now();
      const updatedData: Partial<Expense> = {
        status: 'CHANGES_REQUESTED',
        changeRequestReason: params.reason,
        updatedAt: now
      };

      tx.update(expenseRef, updatedData);

      // Record approval decision document
      const approvalId = uuidv4();
      const approvalRef = expenseRef.collection('approvals').doc(approvalId);
      const approvalRecord: ApprovalRecord = {
        id: approvalId,
        organisationId: params.organisationId,
        expenseId: params.expenseId,
        decision: 'CHANGES_REQUESTED',
        reviewerId: params.actorId,
        reviewerEmail: params.actorEmail,
        reason: params.reason,
        timestamp: now
      };
      tx.set(approvalRef, approvalRecord);

      AuditService.record(
        db,
        {
          organisationId: params.organisationId,
          actorId: params.actorId,
          actorEmail: params.actorEmail,
          action: 'CHANGES_REQUESTED',
          entityType: 'EXPENSE',
          entityId: params.expenseId,
          before: { status: expense.status },
          after: { status: 'CHANGES_REQUESTED', reason: params.reason }
        },
        tx
      );

      return { success: true, status: 'CHANGES_REQUESTED' };
    });
  }

  /**
   * Resubmit an expense after making requested modifications.
   */
  static async resubmitExpense(
    db: admin.firestore.Firestore,
    params: {
      organisationId: string;
      expenseId: string;
      actorId: string;
      actorEmail?: string;
      userRole: Role;
      updates?: Partial<Pick<Expense, 'amount' | 'merchant' | 'category' | 'description' | 'expenseDate'>>;
    }
  ): Promise<{ success: boolean; status: ExpenseStatus }> {
    const expenseRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('expenses')
      .doc(params.expenseId);

    return db.runTransaction(async (tx) => {
      const doc = await tx.get(expenseRef);
      if (!doc.exists) {
        throw new AppError('NOT_FOUND', 'Expense not found.');
      }

      const expense = doc.data() as Expense;
      const isOwner = expense.submittedBy === params.actorId;

      ExpenseStateMachine.validateTransition({
        currentStatus: expense.status,
        targetStatus: 'RESUBMITTED',
        userRole: params.userRole,
        isOwner
      });

      const now = Timestamp.now();
      const updatedData: Partial<Expense> = {
        ...(params.updates || {}),
        status: 'RESUBMITTED',
        updatedAt: now
      };

      tx.update(expenseRef, updatedData);

      AuditService.record(
        db,
        {
          organisationId: params.organisationId,
          actorId: params.actorId,
          actorEmail: params.actorEmail,
          action: 'EXPENSE_RESUBMITTED',
          entityType: 'EXPENSE',
          entityId: params.expenseId,
          before: { status: expense.status },
          after: { status: 'RESUBMITTED', updates: params.updates }
        },
        tx
      );

      return { success: true, status: 'RESUBMITTED' };
    });
  }

  /**
   * Approves an expense with atomic concurrency safety.
   */
  static async approveExpense(
    db: admin.firestore.Firestore,
    params: ReviewExpenseParams
  ): Promise<{ success: boolean; status: ExpenseStatus; approvalId: string }> {
    const expenseRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('expenses')
      .doc(params.expenseId);

    return db.runTransaction(async (tx) => {
      const doc = await tx.get(expenseRef);
      if (!doc.exists) {
        throw new AppError('NOT_FOUND', 'Expense not found.');
      }

      const expense = doc.data() as Expense;

      // Allow approval from SUBMITTED or RESUBMITTED as well by auto-transitioning
      if (expense.status === 'SUBMITTED' || expense.status === 'RESUBMITTED') {
        expense.status = 'UNDER_REVIEW';
      }

      ExpenseStateMachine.validateTransition({
        currentStatus: expense.status,
        targetStatus: 'APPROVED',
        userRole: params.userRole,
        isOwner: expense.submittedBy === params.actorId
      });

      const now = Timestamp.now();
      const approvalId = uuidv4();
      const approvalRef = expenseRef.collection('approvals').doc(approvalId);

      const approvalRecord: ApprovalRecord = {
        id: approvalId,
        organisationId: params.organisationId,
        expenseId: params.expenseId,
        decision: 'APPROVED',
        reviewerId: params.actorId,
        reviewerEmail: params.actorEmail,
        reason: params.reason || 'Approved as business expense',
        timestamp: now
      };

      const updatedData: Partial<Expense> = {
        status: 'APPROVED',
        approvedBy: params.actorId,
        approvedAt: now,
        updatedAt: now
      };

      tx.set(approvalRef, approvalRecord);
      tx.update(expenseRef, updatedData);

      AuditService.record(
        db,
        {
          organisationId: params.organisationId,
          actorId: params.actorId,
          actorEmail: params.actorEmail,
          action: 'EXPENSE_APPROVED',
          entityType: 'EXPENSE',
          entityId: params.expenseId,
          before: { status: doc.data()?.status },
          after: { status: 'APPROVED', approvedBy: params.actorId }
        },
        tx
      );

      return { success: true, status: 'APPROVED', approvalId };
    });
  }

  /**
   * Rejects an expense with mandatory reason.
   */
  static async rejectExpense(
    db: admin.firestore.Firestore,
    params: ReviewExpenseParams
  ): Promise<{ success: boolean; status: ExpenseStatus }> {
    if (!params.reason || params.reason.trim().length === 0) {
      throw new AppError('VALIDATION_ERROR', 'A rejection reason is required.');
    }

    const expenseRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('expenses')
      .doc(params.expenseId);

    return db.runTransaction(async (tx) => {
      const doc = await tx.get(expenseRef);
      if (!doc.exists) {
        throw new AppError('NOT_FOUND', 'Expense not found.');
      }

      const expense = doc.data() as Expense;

      if (expense.status === 'SUBMITTED' || expense.status === 'RESUBMITTED') {
        expense.status = 'UNDER_REVIEW';
      }

      ExpenseStateMachine.validateTransition({
        currentStatus: expense.status,
        targetStatus: 'REJECTED',
        userRole: params.userRole,
        isOwner: expense.submittedBy === params.actorId,
        reason: params.reason
      });

      const now = Timestamp.now();
      const approvalId = uuidv4();
      const approvalRef = expenseRef.collection('approvals').doc(approvalId);

      const approvalRecord: ApprovalRecord = {
        id: approvalId,
        organisationId: params.organisationId,
        expenseId: params.expenseId,
        decision: 'REJECTED',
        reviewerId: params.actorId,
        reviewerEmail: params.actorEmail,
        reason: params.reason,
        timestamp: now
      };

      const updatedData: Partial<Expense> = {
        status: 'REJECTED',
        rejectedBy: params.actorId,
        rejectedAt: now,
        rejectionReason: params.reason,
        updatedAt: now
      };

      tx.set(approvalRef, approvalRecord);
      tx.update(expenseRef, updatedData);

      AuditService.record(
        db,
        {
          organisationId: params.organisationId,
          actorId: params.actorId,
          actorEmail: params.actorEmail,
          action: 'EXPENSE_REJECTED',
          entityType: 'EXPENSE',
          entityId: params.expenseId,
          before: { status: doc.data()?.status },
          after: { status: 'REJECTED', rejectionReason: params.reason }
        },
        tx
      );

      return { success: true, status: 'REJECTED' };
    });
  }
}
