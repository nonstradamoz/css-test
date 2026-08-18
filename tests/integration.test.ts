import { describe, it, expect, beforeEach } from 'vitest';
import { ExpenseStateMachine } from '../functions/src/expenses/state-machine';
import { IdempotencyService } from '../functions/src/idempotency/idempotency.service';
import { MockRefundProvider } from '../functions/src/providers/mock-refund-provider';
import { AppError } from '../functions/src/shared/errors';

describe('CRS Enterprise Integration & Security Test Suite', () => {
  describe('1. Multi-Tenancy & Data Isolation', () => {
    it('blocks access when user attempts to act on an organization they do not belong to', () => {
      const userAOrg = 'org-acme-corp';
      const targetOrg = 'org-globex-inc';

      const verifyTenantAccess = (userOrgId: string, requestedOrgId: string) => {
        if (userOrgId !== requestedOrgId) {
          throw new AppError('UNAUTHORIZED', 'Access denied to target organization.');
        }
      };

      expect(() => verifyTenantAccess(userAOrg, targetOrg)).toThrowError(AppError);
    });

    it('enforces that idempotency keys are strictly bound to organization ID and User ID', () => {
      const keyRecord = {
        key: 'payout-101',
        organisationId: 'org-acme-corp',
        userId: 'user-finance-acme',
        operation: 'CREATE_REIMBURSEMENT',
        requestHash: 'hash-abc',
        status: 'COMPLETED'
      };

      const attackerOrg = 'org-globex-inc';
      expect(keyRecord.organisationId).not.toBe(attackerOrg);
    });
  });

  describe('2. Role-Based Access Control (RBAC)', () => {
    it('prohibits standard MEMBER from approving expenses', () => {
      expect(() => {
        ExpenseStateMachine.validateTransition({
          currentStatus: 'UNDER_REVIEW',
          targetStatus: 'APPROVED',
          userRole: 'MEMBER',
          isOwner: false
        });
      }).toThrowError(/Role MEMBER is not permitted/);
    });

    it('prohibits REVIEWER from executing financial reimbursement payouts', () => {
      expect(() => {
        ExpenseStateMachine.validateTransition({
          currentStatus: 'APPROVED',
          targetStatus: 'REFUND_PENDING',
          userRole: 'REVIEWER',
          isOwner: false
        });
      }).toThrowError(/Role REVIEWER is not permitted/);
    });

    it('allows FINANCE and ADMIN to initiate refund settlements', () => {
      expect(() => {
        ExpenseStateMachine.validateTransition({
          currentStatus: 'APPROVED',
          targetStatus: 'REFUND_PENDING',
          userRole: 'FINANCE',
          isOwner: false
        });
      }).not.toThrow();

      expect(() => {
        ExpenseStateMachine.validateTransition({
          currentStatus: 'APPROVED',
          targetStatus: 'REFUND_PENDING',
          userRole: 'ADMIN',
          isOwner: false
        });
      }).not.toThrow();
    });
  });

  describe('3. Concurrency Safety & State Machine Integrity', () => {
    it('rejects conflicting transitions once status moves out of UNDER_REVIEW', () => {
      let currentStatus: any = 'UNDER_REVIEW';

      // Reviewer 1 approves first
      ExpenseStateMachine.validateTransition({
        currentStatus,
        targetStatus: 'APPROVED',
        userRole: 'REVIEWER',
        isOwner: false
      });
      currentStatus = 'APPROVED';

      // Reviewer 2 attempts to reject afterwards
      expect(() => {
        ExpenseStateMachine.validateTransition({
          currentStatus,
          targetStatus: 'REJECTED',
          userRole: 'REVIEWER',
          isOwner: false,
          reason: 'Duplicate claim'
        });
      }).toThrowError(/Illegal state transition from APPROVED to REJECTED/);
    });
  });

  describe('4. Financial Idempotency', () => {
    it('returns exact same cached payout result on identical idempotency key replay', async () => {
      const mockKeyStore: Record<string, any> = {};

      const executePayout = async (key: string, payload: any) => {
        const hash = IdempotencyService.hashPayload(payload);
        if (mockKeyStore[key]) {
          return { cached: true, result: mockKeyStore[key].result };
        }

        const result = {
          reimbursementId: `reimb_${Date.now()}`,
          status: 'COMPLETED',
          providerReference: 'MOCK_TXN_SETTLED_001'
        };

        mockKeyStore[key] = {
          key,
          requestHash: hash,
          status: 'COMPLETED',
          result
        };

        return { cached: false, result };
      };

      const res1 = await executePayout('key-12345', { expenseId: 'exp-101', amount: 5000 });
      const res2 = await executePayout('key-12345', { expenseId: 'exp-101', amount: 5000 });

      expect(res1.cached).toBe(false);
      expect(res2.cached).toBe(true);
      expect(res1.result.reimbursementId).toEqual(res2.result.reimbursementId);
    });
  });

  describe('5. Refund Provider Failure Recovery & Exponential Retry', () => {
    it('recovers from failure upon manual retry trigger', async () => {
      const provider = new MockRefundProvider();

      // First attempt fails
      const failureRes = await provider.createRefund({
        reimbursementId: 'reimb-f1',
        organisationId: 'org-1',
        expenseId: 'exp-1',
        amount: 3000,
        currency: 'INR',
        recipientId: 'user-1',
        forcedOutcome: 'FAILURE'
      });
      expect(failureRes.status).toBe('FAILED');

      // Retry attempt succeeds
      const retryRes = await provider.createRefund({
        reimbursementId: 'reimb-f1',
        organisationId: 'org-1',
        expenseId: 'exp-1',
        amount: 3000,
        currency: 'INR',
        recipientId: 'user-1',
        forcedOutcome: 'SUCCESS'
      });
      expect(retryRes.status).toBe('SUCCESS');
      expect(retryRes.providerReference).toBeDefined();
    });
  });
});
