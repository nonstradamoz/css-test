'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { api } from '@/lib/api';
import { ExpenseCategory } from '@/types';
import { ArrowLeft, Save, Send, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const CATEGORIES: { label: string; value: ExpenseCategory }[] = [
  { label: 'Travel & Accommodation', value: 'TRAVEL' },
  { label: 'Meals & Entertainment', value: 'MEALS' },
  { label: 'Office Supplies', value: 'SUPPLIES' },
  { label: 'Software & Cloud Subscriptions', value: 'SOFTWARE' },
  { label: 'Training & Certifications', value: 'TRAINING' },
  { label: 'Lodging', value: 'ACCOMMODATION' },
  { label: 'General / Other', value: 'OTHER' }
];

export default function EditExpensePage() {
  const params = useParams();
  const router = useRouter();
  const expenseId = params.id as string;
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('TRAVEL');
  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [currentStatus, setCurrentStatus] = useState<string>('DRAFT');
  const [hasReceipt, setHasReceipt] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchExpense = async () => {
      try {
        const exp = await api.expenses.get(expenseId);
        setTitle(exp.title);
        setAmount(exp.amount.toString());
        setCategory(exp.category);
        setExpenseDate(exp.expense_date.split('T')[0]);
        setDescription(exp.description || '');
        setCurrentStatus(exp.status);
        setHasReceipt(Boolean(exp.receipt_url));
      } catch (err: any) {
        setError(err.message || 'Failed to load expense details');
      } finally {
        setIsLoading(false);
      }
    };
    if (expenseId) fetchExpense();
  }, [expenseId]);

  const handleSave = async (submitAfterSave = false) => {
    if (!title || !amount || !expenseDate) {
      setError('Please provide title, amount, and expense date.');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid positive expense amount.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await api.expenses.update(expenseId, {
        title,
        amount: parsedAmount as any,
        category,
        expense_date: new Date(expenseDate).toISOString() as any,
        description: description || undefined
      });

      if (submitAfterSave) {
        if (!hasReceipt) {
          setError('A receipt upload is mandatory to submit an expense claim.');
          setIsSaving(false);
          return;
        }
        await api.expenses.submit(expenseId);
      }

      router.push(`/expenses/${expenseId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-sm text-neutral-500">Loading claim for editing...</div>;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/expenses/${expenseId}`}
          className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Edit Claim: {title}</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Status: {currentStatus}</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-sm text-red-600">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
            Claim Title *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
              Amount (₹ INR) *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
            Expense Date *
          </label>
          <input
            type="date"
            required
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
            Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSave(false)}
            className="px-5 py-2.5 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 font-medium rounded-xl text-sm transition-colors inline-flex items-center gap-2"
          >
            <Save size={16} />
            Save Changes
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSave(true)}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-sm transition-colors shadow-sm inline-flex items-center gap-2"
          >
            <Send size={16} />
            {isSaving ? 'Submitting...' : 'Save & Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
