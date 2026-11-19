'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Expense, ExpenseStatus } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { PlusCircle, Search, Filter, Receipt, ArrowUpDown, Tag, Download, Trash2 } from 'lucide-react';
import Link from 'next/link';

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Drafts', value: 'DRAFT' },
  { label: 'Submitted (Tier 1)', value: 'SUBMITTED' },
  { label: 'Under Review (Tier 2)', value: 'UNDER_REVIEW' },
  { label: 'Changes Requested', value: 'CHANGES_REQUESTED' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Reimbursed', value: 'REIMBURSED' },
  { label: 'Rejected', value: 'REJECTED' }
];

export default function ExpensesPage() {
  const { role, user } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<string>('desc');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Load active dynamic categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-active'],
    queryFn: () => api.categories.list()
  });

  const { data: expenses = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['expenses-list', selectedStatus, selectedCategory, searchQuery, sortBy, sortOrder],
    queryFn: () => api.expenses.list({
      status: selectedStatus !== 'ALL' ? (selectedStatus as ExpenseStatus) : undefined,
      category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
      search: searchQuery || undefined,
      sort_by: sortBy,
      sort_order: sortOrder
    }),
    refetchInterval: 3000
  });

  const canExport = role === 'ADMIN' || role === 'REVIEWER' || role === 'FINANCE';

  const canDeleteExpense = (exp: Expense) => {
    if (role === 'ADMIN') return true;
    const isOwner = exp.submitted_by === user?.id;
    const isAccepted = ['APPROVED', 'REIMBURSED'].includes(exp.status);
    return isOwner && !isAccepted;
  };

  const handleDeleteExpense = async () => {
    if (!deletingExpense) return;
    setIsDeleting(true);
    try {
      await api.expenses.delete(deletingExpense.id);
      setDeletingExpense(null);
      await refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to delete expense claim.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportXlsx = async () => {
    setIsExporting(true);
    try {
      const blob = await api.expenses.exportXlsx({
        status: selectedStatus !== 'ALL' ? (selectedStatus as ExpenseStatus) : undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        search: searchQuery || undefined,
        sort_by: sortBy,
        sort_order: sortOrder
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Failed to export expenses report');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            Expense Claims
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {role === 'EMPLOYEE' ? 'Track and manage your expense claims.' : 'Company-wide expense claims and approval status.'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {canExport && (
            <button
              onClick={handleExportXlsx}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-300 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
              title="Extract and download sorted expense submissions with document links as Excel (.xlsx)"
            >
              <Download size={15} />
              {isExporting ? 'Generating Excel...' : 'Export Excel (.xlsx)'}
            </button>
          )}
          <Link
            href="/expenses/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors shadow-sm"
          >
            <PlusCircle size={16} />
            Submit Claim
          </Link>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by title, description, category, or submitter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter */}
            <div className="flex items-center gap-1.5">
              <Tag size={15} className="text-neutral-400 shrink-0" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="py-2 px-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown size={15} className="text-neutral-400 shrink-0" />
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [sb, so] = e.target.value.split('-');
                  setSortBy(sb);
                  setSortOrder(so);
                }}
                className="py-2 px-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="created_at-desc">Date (Newest First)</option>
                <option value="created_at-asc">Date (Oldest First)</option>
                <option value="amount-desc">Amount (Highest First)</option>
                <option value="amount-asc">Amount (Lowest First)</option>
                <option value="title-asc">Title (A-Z)</option>
                <option value="status-asc">Status</option>
              </select>
            </div>
          </div>
        </div>

        {/* Status Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-neutral-100">
          <Filter size={13} className="text-neutral-400 shrink-0 mr-1" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setSelectedStatus(f.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedStatus === f.value
                  ? 'bg-neutral-900 text-white shadow-sm'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table / Responsive Card View */}
      <div className="bg-white rounded-xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-neutral-500">Loading claims...</div>
        ) : expenses.length === 0 ? (
          <div className="p-16 text-center">
            <Receipt size={36} className="mx-auto text-neutral-300 mb-3" />
            <p className="text-sm font-semibold text-neutral-700">No expenses found</p>
            <p className="text-xs text-neutral-400 mt-1">Try clearing your filters or create a new expense claim.</p>
          </div>
        ) : (
          <>
            {/* 1. Desktop Responsive Table View (hidden on mobile) */}
            <div
              role="region"
              aria-label="Expense claims table"
              tabIndex={0}
              className="hidden md:block overflow-x-auto w-full focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50/75 border-b border-neutral-200 text-xs text-neutral-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Title & Submitter</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">Expense Date</th>
                    <th className="px-6 py-3.5">Amount</th>
                    <th className="px-6 py-3.5">Tier Progress</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-neutral-900">{exp.title}</p>
                        <p className="text-xs text-neutral-500">{exp.submitter_name || exp.submitter_email}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-neutral-600">
                        <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
                          {categories.find(c => c.code === exp.category)?.name || exp.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-neutral-500">
                        {formatDate(exp.expense_date)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-neutral-900">
                        {formatCurrency(exp.amount, exp.currency)}
                      </td>
                      <td className="px-6 py-4 text-xs text-neutral-600">
                        {exp.approval_tier_required === 2 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                            Tier {exp.current_approval_tier}/2
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">
                            Single-Tier
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge status={exp.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          <Link
                            href={`/expenses/${exp.id}`}
                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                          >
                            View Details →
                          </Link>
                          {canDeleteExpense(exp) && (
                            <button
                              type="button"
                              onClick={() => setDeletingExpense(exp)}
                              title="Delete claim"
                              className="p-1 text-neutral-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 2. Mobile Responsive Card List (visible on mobile < 768px) */}
            <div className="block md:hidden divide-y divide-neutral-200">
              {expenses.map((exp) => (
                <div key={exp.id} className="p-4 space-y-3 hover:bg-neutral-50/60 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-neutral-900 text-sm leading-snug">{exp.title}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{exp.submitter_name || exp.submitter_email}</p>
                    </div>
                    <Badge status={exp.status} />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 font-medium">
                      {categories.find(c => c.code === exp.category)?.name || exp.category}
                    </span>
                    <span className="text-neutral-500">{formatDate(exp.expense_date)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                    <div>
                      <span className="text-[11px] text-neutral-400 uppercase font-semibold block">Total</span>
                      <span className="text-base font-bold text-neutral-900">
                        {formatCurrency(exp.amount, exp.currency)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {canDeleteExpense(exp) && (
                        <button
                          type="button"
                          onClick={() => setDeletingExpense(exp)}
                          className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete claim"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <Link
                        href={`/expenses/${exp.id}`}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-xs rounded-lg transition-colors"
                      >
                        Details →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal Dialog */}
      {deletingExpense && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl text-neutral-900 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-xl">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">Delete Expense?</h3>
                <p className="text-xs text-neutral-500 truncate max-w-[200px]">{deletingExpense.title}</p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Are you sure you want to permanently delete this expense claim?
              {role === 'ADMIN' && deletingExpense.submitted_by !== user?.id && (
                <span className="block mt-2 font-semibold text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  Administrator Override: Deleting across enterprise records.
                </span>
              )}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingExpense(null)}
                className="px-3.5 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteExpense}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                <Trash2 size={13} />
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
