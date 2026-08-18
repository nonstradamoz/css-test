import { describe, it, expect } from 'vitest';
import { DuplicateDetector } from '../expenses/duplicate-detector';

describe('DuplicateDetector', () => {
  it('detects duplicate on matching receipt checksum and amount', async () => {
    const mockExpense = {
      id: 'exp-1',
      amount: 5000,
      currency: 'INR',
      merchant: 'Delta Airlines',
      expenseDate: '2026-08-15',
      submittedBy: 'user-1',
      status: 'APPROVED',
      receipt: { checksum: 'abc123hash' }
    };

    const mockDb: any = {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            where: () => ({
              where: () => ({
                limit: () => ({
                  get: async () => ({
                    empty: false,
                    docs: [{ id: 'exp-1', data: () => mockExpense }]
                  })
                })
              })
            })
          })
        })
      })
    };

    const result = await DuplicateDetector.checkDuplicates(mockDb, {
      organisationId: 'org-1',
      submittedBy: 'user-2',
      amount: 5000,
      currency: 'INR',
      expenseDate: '2026-08-15',
      merchant: 'Delta Airlines',
      receiptChecksum: 'abc123hash',
      currentExpenseId: 'exp-2'
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.matchingExpenseId).toBe('exp-1');
    expect(result.matchedSignals).toContain('receipt_checksum');
  });

  it('ignores rejected or draft expenses for duplicate warnings', async () => {
    const mockExpense = {
      id: 'exp-1',
      amount: 5000,
      currency: 'INR',
      merchant: 'Delta Airlines',
      expenseDate: '2026-08-15',
      submittedBy: 'user-1',
      status: 'REJECTED',
      receipt: { checksum: 'abc123hash' }
    };

    const mockDb: any = {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            where: () => ({
              where: () => ({
                limit: () => ({
                  get: async () => ({
                    empty: false,
                    docs: [{ id: 'exp-1', data: () => mockExpense }]
                  })
                })
              })
            })
          })
        })
      })
    };

    const result = await DuplicateDetector.checkDuplicates(mockDb, {
      organisationId: 'org-1',
      submittedBy: 'user-1',
      amount: 5000,
      currency: 'INR',
      expenseDate: '2026-08-15',
      merchant: 'Delta Airlines',
      currentExpenseId: 'exp-2'
    });

    expect(result.isDuplicate).toBe(false);
  });
});
