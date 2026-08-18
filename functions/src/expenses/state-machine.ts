import { ExpenseStatus, Role } from '../shared/types';
import { AppError } from '../shared/errors';

export interface TransitionRule {
  from: ExpenseStatus;
  to: ExpenseStatus;
  allowedRoles: Role[];
  requiresOwner?: boolean;
  requiresReason?: boolean;
}

export const VALID_TRANSITIONS: TransitionRule[] = [
  // Member submits a draft
  {
    from: 'DRAFT',
    to: 'SUBMITTED',
    allowedRoles: ['MEMBER', 'ADMIN', 'REVIEWER', 'FINANCE'],
    requiresOwner: true
  },
  // Reviewer starts reviewing or system queues for review
  {
    from: 'SUBMITTED',
    to: 'UNDER_REVIEW',
    allowedRoles: ['REVIEWER', 'ADMIN', 'FINANCE']
  },
  // Reviewer requests changes (requires comment/reason)
  {
    from: 'UNDER_REVIEW',
    to: 'CHANGES_REQUESTED',
    allowedRoles: ['REVIEWER', 'ADMIN'],
    requiresReason: true
  },
  // Reviewer approves expense
  {
    from: 'UNDER_REVIEW',
    to: 'APPROVED',
    allowedRoles: ['REVIEWER', 'ADMIN']
  },
  // Reviewer rejects expense (requires reason)
  {
    from: 'UNDER_REVIEW',
    to: 'REJECTED',
    allowedRoles: ['REVIEWER', 'ADMIN'],
    requiresReason: true
  },
  // Member resubmits after making changes
  {
    from: 'CHANGES_REQUESTED',
    to: 'RESUBMITTED',
    allowedRoles: ['MEMBER', 'ADMIN', 'REVIEWER', 'FINANCE'],
    requiresOwner: true
  },
  // Resubmitted moves back to review
  {
    from: 'RESUBMITTED',
    to: 'UNDER_REVIEW',
    allowedRoles: ['REVIEWER', 'ADMIN', 'FINANCE']
  },
  // Approved expense moves to reimbursement queue
  {
    from: 'APPROVED',
    to: 'REFUND_PENDING',
    allowedRoles: ['FINANCE', 'ADMIN']
  },
  // Refund processing completes successfully
  {
    from: 'REFUND_PENDING',
    to: 'REFUNDED',
    allowedRoles: ['FINANCE', 'ADMIN']
  },
  // Refund processing fails after max attempts
  {
    from: 'REFUND_PENDING',
    to: 'REFUND_FAILED',
    allowedRoles: ['FINANCE', 'ADMIN']
  },
  // Finance / Admin retries a failed refund
  {
    from: 'REFUND_FAILED',
    to: 'REFUND_PENDING',
    allowedRoles: ['FINANCE', 'ADMIN']
  }
];

export class ExpenseStateMachine {
  /**
   * Validates whether a state transition is legal and authorized.
   */
  static validateTransition(params: {
    currentStatus: ExpenseStatus;
    targetStatus: ExpenseStatus;
    userRole: Role;
    isOwner: boolean;
    reason?: string;
  }): void {
    const rule = VALID_TRANSITIONS.find(
      (t) => t.from === params.currentStatus && t.to === params.targetStatus
    );

    if (!rule) {
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `Illegal state transition from ${params.currentStatus} to ${params.targetStatus}.`
      );
    }

    if (!rule.allowedRoles.includes(params.userRole)) {
      throw new AppError(
        'UNAUTHORIZED',
        `Role ${params.userRole} is not permitted to transition expense from ${params.currentStatus} to ${params.targetStatus}. Required: ${rule.allowedRoles.join(', ')}.`
      );
    }

    if (rule.requiresOwner && !params.isOwner && params.userRole !== 'ADMIN') {
      throw new AppError(
        'UNAUTHORIZED',
        'Only the submitter or an organization admin can perform this transition.'
      );
    }

    if (rule.requiresReason && (!params.reason || params.reason.trim().length === 0)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `A reason or comment is required when transitioning to ${params.targetStatus}.`
      );
    }
  }

  /**
   * Checks if an expense in a given status can be edited by its submitter.
   */
  static canEditContent(status: ExpenseStatus): boolean {
    return status === 'DRAFT' || status === 'CHANGES_REQUESTED';
  }
}
