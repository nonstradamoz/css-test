export type ProviderOutcome = 'SUCCESS' | 'FAILURE' | 'TIMEOUT';

export interface RefundRequest {
  reimbursementId: string;
  organisationId: string;
  expenseId: string;
  amount: number; // in cents/paise
  currency: string;
  recipientId: string;
  forcedOutcome?: ProviderOutcome;
}

export interface RefundResult {
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  providerReference: string;
  failureReason?: string;
  rawResponse?: Record<string, unknown>;
}

export interface RefundProvider {
  createRefund(request: RefundRequest): Promise<RefundResult>;
  getRefundStatus(providerReference: string): Promise<RefundResult>;
}
