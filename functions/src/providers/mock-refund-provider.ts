import { v4 as uuidv4 } from 'uuid';
import { RefundProvider, RefundRequest, RefundResult } from './refund-provider.interface';

export class MockRefundProvider implements RefundProvider {
  /**
   * Simulates external payment gateway / banking rail with controlled outcomes.
   */
  async createRefund(request: RefundRequest): Promise<RefundResult> {
    const outcome = request.forcedOutcome || (process.env.MOCK_REFUND_OUTCOME as 'SUCCESS' | 'FAILURE' | 'TIMEOUT') || 'SUCCESS';
    const providerReference = `MOCK_TXN_${uuidv4().substring(0, 8).toUpperCase()}`;

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (outcome === 'TIMEOUT') {
      throw new Error('Mock refund provider gateway timeout (HTTP 504)');
    }

    if (outcome === 'FAILURE') {
      return {
        status: 'FAILED',
        providerReference,
        failureReason: 'Bank network rejection: Account temporarily restricted or invalid routing information (ERR_PAYMENT_REJECTED)',
        rawResponse: {
          gatewayCode: 'REJECTED_BY_ISSUER',
          errorCode: '4001',
          attemptedAt: new Date().toISOString()
        }
      };
    }

    return {
      status: 'SUCCESS',
      providerReference,
      rawResponse: {
        gatewayCode: 'SETTLED',
        settledAmount: request.amount,
        currency: request.currency,
        settledAt: new Date().toISOString()
      }
    };
  }

  async getRefundStatus(providerReference: string): Promise<RefundResult> {
    return {
      status: 'SUCCESS',
      providerReference,
      rawResponse: {
        status: 'VERIFIED_SETTLED',
        timestamp: new Date().toISOString()
      }
    };
  }
}
