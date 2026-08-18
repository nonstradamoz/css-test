import { describe, it, expect } from 'vitest';
import { ExpenseStateMachine } from '../expenses/state-machine';
import { AppError } from '../shared/errors';

describe('ExpenseStateMachine & RBAC Transitions', () => {
  it('allows MEMBER to submit a DRAFT expense they own', () => {
    expect(() => {
      ExpenseStateMachine.validateTransition({
        currentStatus: 'DRAFT',
        targetStatus: 'SUBMITTED',
        userRole: 'MEMBER',
        isOwner: true
      });
    }).not.toThrow();
  });

  it('rejects a MEMBER submitting someone elses draft expense', () => {
    expect(() => {
      ExpenseStateMachine.validateTransition({
        currentStatus: 'DRAFT',
        targetStatus: 'SUBMITTED',
        userRole: 'MEMBER',
        isOwner: false
      });
    }).toThrowError(AppError);
  });

  it('rejects illegal transition directly from DRAFT to APPROVED', () => {
    expect(() => {
      ExpenseStateMachine.validateTransition({
        currentStatus: 'DRAFT',
        targetStatus: 'APPROVED',
        userRole: 'ADMIN',
        isOwner: true
      });
    }).toThrowError(/Illegal state transition/);
  });

  it('allows REVIEWER to approve an UNDER_REVIEW expense', () => {
    expect(() => {
      ExpenseStateMachine.validateTransition({
        currentStatus: 'UNDER_REVIEW',
        targetStatus: 'APPROVED',
        userRole: 'REVIEWER',
        isOwner: false
      });
    }).not.toThrow();
  });

  it('prohibits standard MEMBER from approving an expense', () => {
    expect(() => {
      ExpenseStateMachine.validateTransition({
        currentStatus: 'UNDER_REVIEW',
        targetStatus: 'APPROVED',
        userRole: 'MEMBER',
        isOwner: true
      });
    }).toThrowError(/Role MEMBER is not permitted/);
  });

  it('requires a reason when requesting changes or rejecting', () => {
    expect(() => {
      ExpenseStateMachine.validateTransition({
        currentStatus: 'UNDER_REVIEW',
        targetStatus: 'CHANGES_REQUESTED',
        userRole: 'REVIEWER',
        isOwner: false,
        reason: ''
      });
    }).toThrowError(/reason or comment is required/);

    expect(() => {
      ExpenseStateMachine.validateTransition({
        currentStatus: 'UNDER_REVIEW',
        targetStatus: 'REJECTED',
        userRole: 'REVIEWER',
        isOwner: false,
        reason: 'Missing itemized receipt'
      });
    }).not.toThrow();
  });

  it('allows FINANCE / ADMIN to retry a REFUND_FAILED expense', () => {
    expect(() => {
      ExpenseStateMachine.validateTransition({
        currentStatus: 'REFUND_FAILED',
        targetStatus: 'REFUND_PENDING',
        userRole: 'FINANCE',
        isOwner: false
      });
    }).not.toThrow();
  });
});
