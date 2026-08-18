import { describe, it, expect } from 'vitest';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { AppError } from '../shared/errors';

describe('IdempotencyService', () => {
  it('generates consistent payload hashes regardless of property order', () => {
    const hash1 = IdempotencyService.hashPayload({ a: 1, b: 'test', c: true });
    const hash2 = IdempotencyService.hashPayload({ c: true, a: 1, b: 'test' });
    expect(hash1).toEqual(hash2);
  });

  it('detects existing completed idempotency keys and returns cached results', async () => {
    const existingRecord = {
      key: 'idem-key-1',
      organisationId: 'org-1',
      userId: 'user-1',
      operation: 'CREATE_REIMBURSEMENT',
      requestHash: IdempotencyService.hashPayload({ expenseId: 'exp-1' }),
      status: 'COMPLETED',
      result: { reimbursementId: 'reimb-1', status: 'COMPLETED' },
      createdAt: { toMillis: () => Date.now() - 1000 },
      expiresAt: { toMillis: () => Date.now() + 10000 }
    };

    const mockTx: any = {
      get: async () => ({
        exists: true,
        data: () => existingRecord
      }),
      set: () => {},
      update: () => {}
    };

    const mockDb: any = {
      collection: () => ({
        doc: () => ({})
      })
    };

    const result = await IdempotencyService.checkAndLock(mockDb, mockTx, {
      key: 'idem-key-1',
      organisationId: 'org-1',
      userId: 'user-1',
      operation: 'CREATE_REIMBURSEMENT',
      payload: { expenseId: 'exp-1' }
    });

    expect(result.alreadyCompleted).toBe(true);
    expect(result.cachedResult?.reimbursementId).toBe('reimb-1');
  });

  it('prevents tenant crossover or key hijacking across users', async () => {
    const existingRecord = {
      key: 'idem-key-1',
      organisationId: 'org-1',
      userId: 'user-1',
      operation: 'CREATE_REIMBURSEMENT',
      requestHash: IdempotencyService.hashPayload({ expenseId: 'exp-1' }),
      status: 'COMPLETED',
      result: {},
      createdAt: { toMillis: () => Date.now() },
      expiresAt: { toMillis: () => Date.now() + 10000 }
    };

    const mockTx: any = {
      get: async () => ({
        exists: true,
        data: () => existingRecord
      })
    };

    const mockDb: any = { collection: () => ({ doc: () => ({}) }) };

    await expect(
      IdempotencyService.checkAndLock(mockDb, mockTx, {
        key: 'idem-key-1',
        organisationId: 'org-2', // Different org
        userId: 'user-2',
        operation: 'CREATE_REIMBURSEMENT',
        payload: { expenseId: 'exp-1' }
      })
    ).rejects.toThrowError(AppError);
  });
});
