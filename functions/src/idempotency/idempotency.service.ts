import { Timestamp } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { AppError } from '../shared/errors';
import { IdempotencyKeyRecord } from '../shared/types';

export interface IdempotencyCheckParams {
  key: string;
  organisationId: string;
  userId: string;
  operation: string;
  payload: Record<string, unknown>;
  ttlSeconds?: number;
}

export class IdempotencyService {
  /**
   * Generates a stable hash of the request payload to ensure parameters match.
   */
  static hashPayload(payload: Record<string, unknown>): string {
    const serialized = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Validates or registers an idempotency key inside a Firestore transaction.
   * If key is already COMPLETED: returns cached result.
   * If key is PENDING and not expired: throws CONCURRENCY_CONFLICT.
   * If key is new or expired: reserves the key as PENDING.
   */
  static async checkAndLock(
    db: admin.firestore.Firestore,
    tx: admin.firestore.Transaction,
    params: IdempotencyCheckParams
  ): Promise<{ alreadyCompleted: boolean; cachedResult?: Record<string, unknown> }> {
    const keyRef = db.collection('idempotencyKeys').doc(params.key);
    const doc = await tx.get(keyRef);
    const requestHash = this.hashPayload(params.payload);
    const now = Timestamp.now();
    const ttl = params.ttlSeconds || 86400; // 24 hours default
    const expiresAt = Timestamp.fromMillis(now.toMillis() + ttl * 1000);

    if (doc.exists) {
      const record = doc.data() as IdempotencyKeyRecord;

      // Verify tenant / user / operation isolation
      if (record.organisationId !== params.organisationId || record.userId !== params.userId) {
        throw new AppError('UNAUTHORIZED', 'Idempotency key belongs to a different user/organisation.');
      }

      if (record.operation !== params.operation) {
        throw new AppError('VALIDATION_ERROR', 'Idempotency key reused for different operation.');
      }

      if (record.requestHash !== requestHash) {
        throw new AppError('VALIDATION_ERROR', 'Idempotency key reused with different parameters.');
      }

      if (record.status === 'COMPLETED') {
        return { alreadyCompleted: true, cachedResult: record.result };
      }

      if (record.status === 'PENDING' && record.expiresAt.toMillis() > now.toMillis()) {
        throw new AppError(
          'CONCURRENCY_CONFLICT',
          'A request with this idempotency key is already currently processing. Please try again shortly.'
        );
      }
    }

    // Reserve key as PENDING
    const newRecord: IdempotencyKeyRecord = {
      key: params.key,
      organisationId: params.organisationId,
      userId: params.userId,
      operation: params.operation,
      requestHash,
      status: 'PENDING',
      createdAt: now,
      expiresAt
    };

    tx.set(keyRef, newRecord);
    return { alreadyCompleted: false };
  }

  /**
   * Finalizes the idempotency record with success result.
   */
  static complete(
    tx: admin.firestore.Transaction,
    keyRef: admin.firestore.DocumentReference,
    result: Record<string, unknown>
  ): void {
    tx.update(keyRef, {
      status: 'COMPLETED',
      result
    });
  }

  /**
   * Finalizes the idempotency record with error status.
   */
  static fail(
    tx: admin.firestore.Transaction,
    keyRef: admin.firestore.DocumentReference,
    error: string
  ): void {
    tx.update(keyRef, {
      status: 'FAILED',
      error
    });
  }
}
