import { Timestamp } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../shared/errors';
import { Expense, Reimbursement, ReimbursementStatus, Role } from '../shared/types';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { AuditService } from '../audit/audit.service';
import { RefundProvider } from '../providers/refund-provider.interface';
import { MockRefundProvider } from '../providers/mock-refund-provider';

export interface CreateReimbursementParams {
  organisationId: string;
  expenseId: string;
  actorId: string;
  actorEmail?: string;
  userRole: Role;
  idempotencyKey: string;
  forcedOutcome?: 'SUCCESS' | 'FAILURE' | 'TIMEOUT';
}

export interface RetryRefundParams {
  organisationId: string;
  reimbursementId: string;
  actorId: string;
  actorEmail?: string;
  userRole: Role;
  idempotencyKey: string;
  forcedOutcome?: 'SUCCESS' | 'FAILURE' | 'TIMEOUT';
}

export class ReimbursementService {
  private static refundProvider: RefundProvider = new MockRefundProvider();

  public static setRefundProvider(provider: RefundProvider): void {
    this.refundProvider = provider;
  }

  /**
   * Initiates a reimbursement with idempotency and transaction boundaries.
   */
  static async createReimbursement(
    db: admin.firestore.Firestore,
    params: CreateReimbursementParams
  ): Promise<{
    reimbursementId: string;
    status: ReimbursementStatus;
    expenseStatus: string;
    providerReference?: string;
    isIdempotentReplay?: boolean;
  }> {
    const expenseRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('expenses')
      .doc(params.expenseId);

    const idempotencyPayload = {
      organisationId: params.organisationId,
      expenseId: params.expenseId,
      action: 'CREATE_REIMBURSEMENT'
    };

    let reimbursementId = uuidv4();
    let expenseData: Expense | null = null;

    // Transaction Step 1: Idempotency lock + Expense status validation + Reimbursement document creation
    await db.runTransaction(async (tx) => {
      // ALL READS MUST HAPPEN BEFORE WRITES
      const expenseDoc = await tx.get(expenseRef);
      if (!expenseDoc.exists) {
        throw new AppError('NOT_FOUND', 'Expense not found.');
      }

      expenseData = expenseDoc.data() as Expense;

      const lockCheck = await IdempotencyService.checkAndLock(db, tx, {
        key: params.idempotencyKey,
        organisationId: params.organisationId,
        userId: params.actorId,
        operation: 'CREATE_REIMBURSEMENT',
        payload: idempotencyPayload
      });

      if (lockCheck.alreadyCompleted && lockCheck.cachedResult) {
        return; // Handled after transaction
      }

      if (expenseData.status !== 'APPROVED' && expenseData.status !== 'REFUND_PENDING') {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          `Cannot create reimbursement for expense in '${expenseData.status}' status. Must be 'APPROVED'.`
        );
      }

      if (expenseData.reimbursementId) {
        reimbursementId = expenseData.reimbursementId;
      }

      const now = Timestamp.now();
      const reimbursementRef = db
        .collection('organisations')
        .doc(params.organisationId)
        .collection('reimbursements')
        .doc(reimbursementId);

      const reimbursement: Reimbursement = {
        id: reimbursementId,
        organisationId: params.organisationId,
        expenseId: params.expenseId,
        submittedBy: expenseData.submittedBy,
        amount: expenseData.amount,
        currency: expenseData.currency,
        status: 'PENDING',
        provider: 'mock-refund-provider',
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: now,
        updatedAt: now
      };

      tx.set(reimbursementRef, reimbursement);
      tx.update(expenseRef, {
        status: 'REFUND_PENDING',
        reimbursementId,
        updatedAt: now
      });

      AuditService.record(
        db,
        {
          organisationId: params.organisationId,
          actorId: params.actorId,
          actorEmail: params.actorEmail,
          action: 'REFUND_CREATED',
          entityType: 'REIMBURSEMENT',
          entityId: reimbursementId,
          after: { amount: reimbursement.amount, currency: reimbursement.currency, status: 'PENDING' }
        },
        tx
      );
    });

    // Check if idempotency key returned cached result
    const keyDoc = await db.collection('idempotencyKeys').doc(params.idempotencyKey).get();
    if (keyDoc.exists && keyDoc.data()?.status === 'COMPLETED') {
      const cached = keyDoc.data()?.result as {
        reimbursementId: string;
        status: ReimbursementStatus;
        expenseStatus: string;
        providerReference?: string;
      };
      return { ...cached, isIdempotentReplay: true };
    }

    // Step 2: Execute refund processing via provider
    const executionResult = await this.executeRefundWorkflow(db, {
      organisationId: params.organisationId,
      reimbursementId,
      expenseId: params.expenseId,
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      forcedOutcome: params.forcedOutcome
    });

    // Finalize idempotency record
    const finalResult = {
      reimbursementId,
      status: executionResult.reimbursementStatus,
      expenseStatus: executionResult.expenseStatus,
      providerReference: executionResult.providerReference
    };

    await db.collection('idempotencyKeys').doc(params.idempotencyKey).update({
      status: 'COMPLETED',
      result: finalResult
    });

    return finalResult;
  }

  /**
   * Retries a failed refund.
   */
  static async retryRefund(
    db: admin.firestore.Firestore,
    params: RetryRefundParams
  ): Promise<{
    reimbursementId: string;
    status: ReimbursementStatus;
    expenseStatus: string;
    providerReference?: string;
    isIdempotentReplay?: boolean;
  }> {
    const reimbursementRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('reimbursements')
      .doc(params.reimbursementId);

    const idempotencyPayload = {
      organisationId: params.organisationId,
      reimbursementId: params.reimbursementId,
      action: 'RETRY_REFUND'
    };

    let expenseId = '';

    await db.runTransaction(async (tx) => {
      // ALL READS MUST HAPPEN BEFORE WRITES
      const reimbDoc = await tx.get(reimbursementRef);
      if (!reimbDoc.exists) {
        throw new AppError('NOT_FOUND', 'Reimbursement not found.');
      }

      const reimbData = reimbDoc.data() as Reimbursement;
      expenseId = reimbData.expenseId;

      const lockCheck = await IdempotencyService.checkAndLock(db, tx, {
        key: params.idempotencyKey,
        organisationId: params.organisationId,
        userId: params.actorId,
        operation: 'RETRY_REFUND',
        payload: idempotencyPayload
      });

      if (lockCheck.alreadyCompleted && lockCheck.cachedResult) {
        return;
      }

      if (reimbData.status !== 'FAILED') {
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          `Cannot retry reimbursement in '${reimbData.status}' status. Only 'FAILED' reimbursements can be retried.`
        );
      }

      const now = Timestamp.now();
      tx.update(reimbursementRef, {
        status: 'PENDING',
        attemptCount: 0,
        updatedAt: now
      });

      const expenseRef = db
        .collection('organisations')
        .doc(params.organisationId)
        .collection('expenses')
        .doc(expenseId);

      tx.update(expenseRef, {
        status: 'REFUND_PENDING',
        updatedAt: now
      });

      AuditService.record(
        db,
        {
          organisationId: params.organisationId,
          actorId: params.actorId,
          actorEmail: params.actorEmail,
          action: 'REFUND_RETRIED',
          entityType: 'REIMBURSEMENT',
          entityId: params.reimbursementId,
          before: { status: 'FAILED' },
          after: { status: 'PENDING', resetAttempts: true }
        },
        tx
      );
    });

    const keyDoc = await db.collection('idempotencyKeys').doc(params.idempotencyKey).get();
    if (keyDoc.exists && keyDoc.data()?.status === 'COMPLETED') {
      const cached = keyDoc.data()?.result as {
        reimbursementId: string;
        status: ReimbursementStatus;
        expenseStatus: string;
        providerReference?: string;
      };
      return { ...cached, isIdempotentReplay: true };
    }

    const executionResult = await this.executeRefundWorkflow(db, {
      organisationId: params.organisationId,
      reimbursementId: params.reimbursementId,
      expenseId,
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      forcedOutcome: params.forcedOutcome
    });

    const finalResult = {
      reimbursementId: params.reimbursementId,
      status: executionResult.reimbursementStatus,
      expenseStatus: executionResult.expenseStatus,
      providerReference: executionResult.providerReference
    };

    await db.collection('idempotencyKeys').doc(params.idempotencyKey).update({
      status: 'COMPLETED',
      result: finalResult
    });

    return finalResult;
  }

  /**
   * Internal worker executing payment provider call and managing exponential backoff retry lifecycle.
   */
  private static async executeRefundWorkflow(
    db: admin.firestore.Firestore,
    params: {
      organisationId: string;
      reimbursementId: string;
      expenseId: string;
      actorId: string;
      actorEmail?: string;
      forcedOutcome?: 'SUCCESS' | 'FAILURE' | 'TIMEOUT';
    }
  ): Promise<{
    reimbursementStatus: ReimbursementStatus;
    expenseStatus: string;
    providerReference?: string;
  }> {
    const reimbursementRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('reimbursements')
      .doc(params.reimbursementId);

    const expenseRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('expenses')
      .doc(params.expenseId);

    const doc = await reimbursementRef.get();
    if (!doc.exists) {
      throw new AppError('NOT_FOUND', 'Reimbursement record missing.');
    }

    const reimb = doc.data() as Reimbursement;
    const maxAttempts = reimb.maxAttempts || 3;
    let currentAttempt = reimb.attemptCount;
    let finalResult: {
      reimbursementStatus: ReimbursementStatus;
      expenseStatus: string;
      providerReference?: string;
    } = {
      reimbursementStatus: 'FAILED',
      expenseStatus: 'REFUND_FAILED'
    };

    while (currentAttempt < maxAttempts) {
      currentAttempt++;
      const now = Timestamp.now();

      // Mark PROCESSING
      await reimbursementRef.update({
        status: 'PROCESSING',
        attemptCount: currentAttempt,
        lastAttemptAt: now,
        updatedAt: now
      });

      try {
        const response = await this.refundProvider.createRefund({
          reimbursementId: params.reimbursementId,
          organisationId: params.organisationId,
          expenseId: params.expenseId,
          amount: reimb.amount,
          currency: reimb.currency,
          recipientId: reimb.submittedBy,
          forcedOutcome: params.forcedOutcome
        });

        if (response.status === 'SUCCESS') {
          // Success
          await reimbursementRef.update({
            status: 'COMPLETED',
            providerReference: response.providerReference,
            completedAt: now,
            updatedAt: now
          });

          await expenseRef.update({
            status: 'REFUNDED',
            updatedAt: now
          });

          AuditService.record(db, {
            organisationId: params.organisationId,
            actorId: params.actorId,
            actorEmail: params.actorEmail,
            action: 'REFUND_COMPLETED',
            entityType: 'REIMBURSEMENT',
            entityId: params.reimbursementId,
            after: {
              status: 'COMPLETED',
              providerReference: response.providerReference,
              attempts: currentAttempt
            }
          });

          return {
            reimbursementStatus: 'COMPLETED',
            expenseStatus: 'REFUNDED',
            providerReference: response.providerReference
          };
        } else {
          // Provider rejected
          if (currentAttempt >= maxAttempts) {
            await reimbursementRef.update({
              status: 'FAILED',
              providerReference: response.providerReference,
              failureReason: response.failureReason || 'Refund rejected by provider.',
              failedAt: now,
              updatedAt: now
            });

            await expenseRef.update({
              status: 'REFUND_FAILED',
              updatedAt: now
            });

            AuditService.record(db, {
              organisationId: params.organisationId,
              actorId: params.actorId,
              actorEmail: params.actorEmail,
              action: 'REFUND_FAILED',
              entityType: 'REIMBURSEMENT',
              entityId: params.reimbursementId,
              after: {
                status: 'FAILED',
                reason: response.failureReason,
                attempts: currentAttempt
              }
            });

            return {
              reimbursementStatus: 'FAILED',
              expenseStatus: 'REFUND_FAILED',
              providerReference: response.providerReference
            };
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown provider error';
        if (currentAttempt >= maxAttempts) {
          await reimbursementRef.update({
            status: 'FAILED',
            failureReason: errorMsg,
            failedAt: now,
            updatedAt: now
          });

          await expenseRef.update({
            status: 'REFUND_FAILED',
            updatedAt: now
          });

          AuditService.record(db, {
            organisationId: params.organisationId,
            actorId: params.actorId,
            actorEmail: params.actorEmail,
            action: 'REFUND_FAILED',
            entityType: 'REIMBURSEMENT',
            entityId: params.reimbursementId,
            after: { status: 'FAILED', error: errorMsg, attempts: currentAttempt }
          });

          return {
            reimbursementStatus: 'FAILED',
            expenseStatus: 'REFUND_FAILED'
          };
        }
      }

      // Small backoff delay between retry attempts
      await new Promise((res) => setTimeout(res, 200 * Math.pow(2, currentAttempt - 1)));
    }

    return finalResult;
  }
}
