import { HttpsError } from 'firebase-functions/v2/https';

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'INVALID_STATE_TRANSITION'
  | 'DUPLICATE_REQUEST'
  | 'DUPLICATE_EXPENSE'
  | 'VALIDATION_ERROR'
  | 'REFUND_FAILED'
  | 'RATE_LIMITED'
  | 'CONCURRENCY_CONFLICT'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  toHttpsError(): HttpsError {
    switch (this.code) {
      case 'UNAUTHENTICATED':
        return new HttpsError('unauthenticated', this.message, this.details);
      case 'UNAUTHORIZED':
        return new HttpsError('permission-denied', this.message, this.details);
      case 'NOT_FOUND':
        return new HttpsError('not-found', this.message, this.details);
      case 'INVALID_STATE_TRANSITION':
      case 'VALIDATION_ERROR':
        return new HttpsError('invalid-argument', this.message, this.details);
      case 'DUPLICATE_REQUEST':
      case 'CONCURRENCY_CONFLICT':
        return new HttpsError('already-exists', this.message, this.details);
      case 'RATE_LIMITED':
        return new HttpsError('resource-exhausted', this.message, this.details);
      case 'REFUND_FAILED':
      case 'INTERNAL_ERROR':
      default:
        return new HttpsError('internal', this.message, this.details);
    }
  }
}
