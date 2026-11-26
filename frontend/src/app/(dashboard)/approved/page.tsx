'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { GroupedExpenseSections } from '@/components/expenses/GroupedSectionWrapper';
import { CheckCircle2, Search, ArrowUpDown, Tag, Download, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function ApprovedListPage() {
  const { role } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<string>('desc');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-active'],
    queryFn: () => api.categories.list()
  });

  const { data: expenses = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['approved-expenses-list', selectedCategory, searchQuery, sortBy, sortOrder],
    queryFn: () => api.expenses.list({
      status: 'APPROVED',
      category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
      search: searchQuery || undefined,
      sort_by: sortBy,
      sort_order: sortOrder
    }),
    refetchInterval: 3000
  });

  const canExport = role === 'ADMIN' || role === 'REVIEWER' || role === 'FINANCE';
  const totalApprovedAmount = expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

  const handleExportXlsx = async () => {
    setIsExporting(true);
    try {
      const blob = await api.expenses.exportXlsx({
        status: 'APPROVED',
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        search: searchQuery || undefined,
        sort_by: sortBy,
        sort_order: sortOrder
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `approved_expenses_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Failed to export approved expenses report');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
              Approved Expenses
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              {expenses.length} Approved
            </span>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            All approved expense claims ready for NEFT payout and Excel export.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-300 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin text-emerald-600' : 'text-neutral-500'} />
            Refresh
          </button>
          {canExport && (
            <button
              onClick={handleExportXlsx}
              disabled={isExporting || expenses.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
              title="Export approved expenses in consolidated NEFT Excel (.xlsx) format"
            >
              <Download size={15} />
              {isExporting ? 'Generating Excel...' : 'Export Excel (.xlsx)'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Approved Claims</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{expenses.length}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Total Approved Amount</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(totalApprovedAmount, 'INR')}</p>
          </div>
          <div className="text-xs font-medium text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-md">
            Ready for Payout
          </div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search approved claims by title, description, category, or submitter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Tag size={15} className="text-neutral-400 shrink-0" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="py-2 px-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="ALL">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.code} value={cat.code}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

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
                <option value="created_at-desc">Newest First</option>
                <option value="created_at-asc">Oldest First</option>
                <option value="amount-desc">Amount: High to Low</option>
                <option value="amount-asc">Amount: Low to High</option>
                <option value="expense_date-desc">Expense Date: Recent</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Approved List */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-neutral-200/80 shadow-sm p-12 text-center text-sm text-neutral-500">
          Loading approved expenses...
        </div>
      ) : expenses.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200/80 shadow-sm p-16 text-center">
          <CheckCircle2 size={36} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-sm font-semibold text-neutral-700">No approved expenses found</p>
          <p className="text-xs text-neutral-400 mt-1">
            Approved claims will appear here once they pass review and approval.
          </p>
        </div>
      ) : (
        <GroupedExpenseSections
          expenses={expenses}
          renderItems={(items) => (
            <>
              {/* Desktop Table */}
              <div
                role="region"
                aria-label="Approved expenses table"
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
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {items.map((exp) => (
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
                        <td className="px-6 py-4">
                          <Badge status={exp.status} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/expenses/${exp.id}`}
                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                          >
                            View Details →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List */}
              <div className="block md:hidden divide-y divide-neutral-200">
                {items.map((exp) => (
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
                      <span className="font-bold text-neutral-900 text-sm">
                        {formatCurrency(exp.amount, exp.currency)}
                      </span>
                      <Link
                        href={`/expenses/${exp.id}`}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                      >
                        View Details →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        />
      )}
    </div>
  );
}
