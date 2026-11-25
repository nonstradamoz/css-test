import { Expense } from '@/types';

export interface ExpenseGroup {
  key: string;
  kind: 'VENDOR' | 'STUDENT';
  name: string;
  subtitle: string;
  currency: string;
  totalAmount: number;
  items: Expense[];
}

export function groupExpensesByPayee(expenses: Expense[]): ExpenseGroup[] {
  const map = new Map<string, ExpenseGroup>();

  for (const exp of expenses) {
    const ext = exp as Expense & { vendor_id?: string | null; vendor_name?: string | null };
    const isVendor = Boolean(ext.vendor_id);
    const key = isVendor ? `vendor:${ext.vendor_id}` : `user:${exp.submitted_by}`;

    const existing = map.get(key);
    const amt = Number(exp.amount) || 0;

    if (existing) {
      existing.items.push(exp);
      existing.totalAmount += amt;
    } else {
      const displayName = isVendor
        ? ext.vendor_name || exp.submitter_name || 'Vendor'
        : exp.submitter_name || exp.submitter_email || 'Student';
      map.set(key, {
        key,
        kind: isVendor ? 'VENDOR' : 'STUDENT',
        name: displayName,
        subtitle: exp.submitter_email || '',
        currency: exp.currency || 'INR',
        totalAmount: amt,
        items: [exp]
      });
    }
  }

  return Array.from(map.values());
}
