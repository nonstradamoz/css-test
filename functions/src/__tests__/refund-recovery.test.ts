import { describe, it, expect } from 'vitest';
import { MockRefundProvider } from '../providers/mock-refund-provider';

describe('MockRefundProvider & Failure Handling', () => {
  it('returns SUCCESS status with valid provider reference on normal execution', async () => {
    const provider = new MockRefundProvider();
    const result = await provider.createRefund({
      reimbursementId: 'reimb-1',
      organisationId: 'org-1',
      expenseId: 'exp-1',
      amount: 4500,
      currency: 'INR',
      recipientId: 'user-1',
      forcedOutcome: 'SUCCESS'
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.providerReference).toMatch(/^MOCK_TXN_/);
  });

  it('returns FAILED status and realistic failure reason on provider failure', async () => {
    const provider = new MockRefundProvider();
    const result = await provider.createRefund({
      reimbursementId: 'reimb-2',
      organisationId: 'org-1',
      expenseId: 'exp-2',
      amount: 12000,
      currency: 'INR',
      recipientId: 'user-2',
      forcedOutcome: 'FAILURE'
    });

    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toContain('ERR_PAYMENT_REJECTED');
  });

  it('throws error simulating gateway timeout on TIMEOUT outcome', async () => {
    const provider = new MockRefundProvider();
    await expect(
      provider.createRefund({
        reimbursementId: 'reimb-3',
        organisationId: 'org-1',
        expenseId: 'exp-3',
        amount: 8000,
        currency: 'INR',
        recipientId: 'user-3',
        forcedOutcome: 'TIMEOUT'
      })
    ).rejects.toThrow(/timeout/i);
  });
});
