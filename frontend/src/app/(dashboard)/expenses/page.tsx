'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { Expense, ExpenseStatus } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PlusCircle, Search, Filter, AlertTriangle, Receipt } from 'lucide-react';
import Link from 'next/link';

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending Review', value: 'SUBMITTED' },
  { label: 'Under Review', value: 'UNDER_REVIEW' },
  { label: 'Changes Requested', value: 'CHANGES_REQUESTED' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Refund Pending', value: 'REFUND_PENDING' },
  { label: 'Refunded', value: 'REFUNDED' },
  { label: 'Refund Failed', value: 'REFUND_FAILED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Drafts', value: 'DRAFT' }
];

export default function ExpensesPage() {
  const { activeOrg, activeRole, user } = useAuth();
  const orgId = activeOrg?.id;

  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const { data: expenses = [], isLoading, refetch } = useQuery({
    queryKey: ['expenses-list', orgId, activeRole, user?.id],
    queryFn: async () => {
      if (!orgId || !user) return [];
      const supabase = createClient();
      let query = supabase
        .from('expenses')
        .select('*')
        .eq('organisation_id', orgId)
        .order('created_at', { ascending: false });
      
      // Member can only see their own expenses unless higher role
      if (activeRole === 'MEMBER') {
        query = query.eq('submitted_by', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return data.map((d: any) => ({
        id: d.id,
        organisationId: d.organisation_id,
        submittedBy: d.submitted_by,
        submitterEmail: d.submitter_email,
        submitterName: d.submitter_name,
        amount: d.amount,
        currency: d.currency,
        category: d.category,
        merchant: d.merchant,
        expenseDate: d.expense_date,
        description: d.description,
        status: d.status,
        receipt: d.receipt,
        duplicateWarning: d.duplicate_warning,
        changeRequestReason: d.change_request_reason,
        rejectionReason: d.rejection_reason,
        approvedBy: d.approved_by,
        approvedAt: d.approved_at,
        rejectedBy: d.rejected_by,
        rejectedAt: d.rejected_at,
        reimbursementId: d.reimbursement_id,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        submittedAt: d.submitted_at
      })) as Expense[];
    },
    enabled: !!orgId && !!user
  });

  // Filter expenses
  const filteredExpenses = expenses.filter((e) => {
    const matchesStatus =
      selectedStatus === 'ALL' ||
      e.status === selectedStatus ||
      (selectedStatus === 'SUBMITTED' && (e.status === 'SUBMITTED' || e.status === 'RESUBMITTED'));

    const matchesSearch =
      searchQuery === '' ||
      e.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.submitterName && e.submitterName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.submitterEmail && e.submitterEmail.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'ALL' || e.category === selectedCategory;

    return matchesStatus && matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(expenses.map((e) => e.category))).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Expenses</h1>
          <p className="text-xs text-slate-500 mt-1">
            {activeRole === 'MEMBER'
              ? 'Track, edit and submit your personal expense claims'
              : 'Manage and review organisation-wide expense claims'}
          </p>
        </div>

        <Link href="/expenses/new">
          <Button size="sm" leftIcon={<PlusCircle className="w-4 h-4" />}>
            Create Expense
          </Button>
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b border-slate-200">
        {STATUS_FILTERS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setSelectedStatus(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedStatus === tab.value
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Category Filter Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by merchant, submitter, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>

        <div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          >
            <option value="ALL">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading expenses...</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-700">No expenses found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No expense records match the selected status or filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Merchant / Item</th>
                    <th className="px-6 py-3">Category</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Submitter</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredExpenses.map((exp) => (
                    <tr
                      key={exp.id}
                      onClick={() => (window.location.href = `/expenses/${exp.id}`)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{exp.merchant}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">{exp.description}</div>
                        {exp.duplicateWarning?.isDuplicate && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded w-fit">
                            <AlertTriangle className="w-3 h-3" /> Possible Duplicate
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{exp.category}</td>
                      <td className="px-6 py-4 text-slate-500">{formatDate(exp.expenseDate)}</td>
                      <td className="px-6 py-4 text-slate-600">
                        <div>{exp.submitterName || exp.submitterEmail?.split('@')[0]}</div>
                        <div className="text-[10px] text-slate-400">{exp.submitterEmail}</div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge status={exp.status} />
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900 text-sm">
                        {formatCurrency(exp.amount, exp.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
