'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { api } from '@/lib/api';
import { toCents, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { ArrowLeft, Save, Send, AlertTriangle, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const CATEGORIES = [
  'Travel & Lodging',
  'Meals & Entertainment',
  'Office Supplies',
  'Software & Subscriptions',
  'Hardware & Equipment',
  'Telecom & Internet',
  'Training & Certifications',
  'Other'
];

export default function EditExpensePage() {
  const params = useParams();
  const router = useRouter();
  const expenseId = params.id as string;
  const { activeOrg, user } = useAuth();
  const orgId = activeOrg?.id;

  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [currentStatus, setCurrentStatus] = useState<string>('DRAFT');
  const [changeRequestReason, setChangeRequestReason] = useState<string>('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchExpense = async () => {
      if (!orgId || !expenseId) return;
      try {
        const snap = await getDoc(doc(db, 'organisations', orgId, 'expenses', expenseId));
        if (snap.exists()) {
          const data = snap.data();
          setMerchant(data.merchant || '');
          setAmount(((data.amount || 0) / 100).toString());
          setCurrency(data.currency || 'INR');
          setCategory(data.category || CATEGORIES[0]);
          setExpenseDate(data.expenseDate || '');
          setDescription(data.description || '');
          setCurrentStatus(data.status || 'DRAFT');
          setChangeRequestReason(data.changeRequestReason || '');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchExpense();
  }, [orgId, expenseId]);

  const handleSave = async (shouldResubmit: boolean) => {
    if (!orgId || !user) return;
    setIsSaving(true);
    setError(null);

    try {
      const amountInCents = toCents(parseFloat(amount));

      if (currentStatus === 'CHANGES_REQUESTED' && shouldResubmit) {
        // Use resubmitExpense Cloud Function for validated state transition
        await api.resubmitExpense({
          organisationId: orgId,
          expenseId,
          updates: {
            merchant,
            amount: amountInCents,
            category,
            expenseDate,
            description
          }
        });
      } else {
        // Direct Firestore update allowed by security rules for DRAFT status
        const docRef = doc(db, 'organisations', orgId, 'expenses', expenseId);
        await updateDoc(docRef, {
          merchant,
          amount: amountInCents,
          category,
          expenseDate,
          description,
          updatedAt: serverTimestamp()
        });

        if (shouldResubmit && currentStatus === 'DRAFT') {
          await api.submitExpense({ organisationId: orgId, expenseId });
        }
      }

      router.push(`/expenses/${expenseId}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update expense.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading expense details...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/expenses/${expenseId}`}>
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Cancel & Return
          </Button>
        </Link>
      </div>

      {changeRequestReason && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold">Reviewer Change Request</h4>
            <p className="text-xs text-amber-800 mt-1">{changeRequestReason}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Edit Expense Claim</CardTitle>
          <CardDescription>Update your expense details and resubmit for approval.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Merchant / Payee Name *"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              required
            />

            <Input
              label={`Amount (${currency}) *`}
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-primary-500/20"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Expense Date *"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">Description *</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSave(false)}
            isLoading={isSaving}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Save Changes
          </Button>

          <Button
            size="sm"
            onClick={() => handleSave(true)}
            isLoading={isSaving}
            leftIcon={<Send className="w-4 h-4" />}
          >
            {currentStatus === 'CHANGES_REQUESTED' ? 'Resubmit for Review' : 'Save & Submit'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
