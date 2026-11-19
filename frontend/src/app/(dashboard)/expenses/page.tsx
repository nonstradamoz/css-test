'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Expense, ExpenseStatus } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { PlusCircle, Search, Filter, Receipt, ArrowUpDown, Tag } from 'lucide-react';
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
  const { role } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<string>('desc');

  // Load active dynamic categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-active'],
    queryFn: () => api.categories.list()
  });

  const { data: expenses = [], isLoading, isFetching } = useQuery({
    queryKey: ['expenses-list', selectedStatus, selectedCategory, searchQuery, sortBy, sortOrder],
    queryFn: () => api.expenses.list({
      status: selectedStatus !== 'ALL' ? (selectedStatus as ExpenseStatus) : undefined,
      category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
      search: searchQuery || undefined,
      sort_by: sortBy,
      sort_order: sortOrder
    })
  });

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
        <Link
          href="/expenses/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors shadow-sm self-start sm:self-auto"
        >
          <PlusCircle size={16} />
          Submit Claim
        </Link>
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

      {/* Table */}
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
          <div className="overflow-x-auto">
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
        )}
      </div>
    </div>
  );
}
