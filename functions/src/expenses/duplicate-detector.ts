import * as admin from 'firebase-admin';
import { Expense } from '../shared/types';

export interface DuplicateDetectionParams {
  organisationId: string;
  submittedBy: string;
  amount: number;
  currency: string;
  expenseDate: string; // YYYY-MM-DD
  merchant: string;
  receiptChecksum?: string;
  currentExpenseId?: string;
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  matchingExpenseId?: string;
  matchedSignals: string[];
}

export class DuplicateDetector {
  /**
   * Evaluates multiple signals to identify likely duplicate expenses.
   */
  static async checkDuplicates(
    db: admin.firestore.Firestore,
    params: DuplicateDetectionParams
  ): Promise<DuplicateDetectionResult> {
    const expensesRef = db
      .collection('organisations')
      .doc(params.organisationId)
      .collection('expenses');

    // Query expenses with matching amount submitted by same user or in same org
    const snapshot = await expensesRef
      .where('amount', '==', params.amount)
      .where('currency', '==', params.currency)
      .limit(20)
      .get();

    if (snapshot.empty) {
      return { isDuplicate: false, matchedSignals: [] };
    }

    for (const doc of snapshot.docs) {
      if (params.currentExpenseId && doc.id === params.currentExpenseId) {
        continue; // Skip self
      }

      const existing = doc.data() as Expense;

      // Ignore rejected or draft expenses for duplicate comparison
      if (existing.status === 'REJECTED' || existing.status === 'DRAFT') {
        continue;
      }

      const matchedSignals: string[] = [];

      // Exact amount match already verified by query
      matchedSignals.push('amount');

      // 1. Check receipt checksum
      if (
        params.receiptChecksum &&
        existing.receipt?.checksum &&
        params.receiptChecksum === existing.receipt.checksum
      ) {
        matchedSignals.push('receipt_checksum');
      }

      // 2. Check merchant match (case-insensitive)
      if (
        params.merchant &&
        existing.merchant &&
        params.merchant.trim().toLowerCase() === existing.merchant.trim().toLowerCase()
      ) {
        matchedSignals.push('merchant');
      }

      // 3. Check exact or near expense date (same day)
      if (params.expenseDate === existing.expenseDate) {
        matchedSignals.push('expense_date');
      }

      // 4. Same submitter
      if (params.submittedBy === existing.submittedBy) {
        matchedSignals.push('submitter');
      }

      // Threshold:
      // - If receipt checksum matches -> strong duplicate
      // - If (same submitter + same date + same merchant) -> strong duplicate
      // - If (same merchant + same date) -> potential duplicate
      if (
        matchedSignals.includes('receipt_checksum') ||
        (matchedSignals.includes('submitter') &&
          matchedSignals.includes('merchant') &&
          matchedSignals.includes('expense_date')) ||
        (matchedSignals.includes('merchant') && matchedSignals.includes('expense_date'))
      ) {
        return {
          isDuplicate: true,
          matchingExpenseId: doc.id,
          matchedSignals
        };
      }
    }

    return { isDuplicate: false, matchedSignals: [] };
  }
}
