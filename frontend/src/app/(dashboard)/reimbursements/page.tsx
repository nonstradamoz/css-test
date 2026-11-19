'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Reimbursement, ReimbursementStatus } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  CreditCard, RefreshCw, AlertTriangle, CheckCircle2,
  Search, ArrowUpDown, Filter, Wallet, ExternalLink, Clock
} from 'lucide-react';
import Link from 'next/link';

export default function ReimbursementsPage() {
  const { role } = useAuth();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEmployee = role === 'EMPLOYEE';
  const isFinanceOrAdmin = role === 'ADMIN' || role === 'REVIEWER' || role === 'FINANCE';

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<string>('desc');

  const { data: reimbursements = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['reimbursements-list', statusFilter, search, sortBy, sortOrder],
    queryFn: () => api.reimbursements.list({
      status: statusFilter !== 'ALL' ? (statusFilter as ReimbursementStatus) : undefined,
      search: search || undefined,
      sort_by: sortBy,
      sort_order: sortOrder
    }),
    refetchInterval: 3000
  });

  // Calculate high-level settlement summary
  const totalCompletedAmount = reimbursements
    .filter(r => r.status === 'COMPLETED')
    .reduce((acc, r) => acc + Number(r.amount), 0);

  const totalInFlightAmount = reimbursements
    .filter(r => r.status === 'PROCESSING' || r.status === 'INITIATED')
    .reduce((acc, r) => acc + Number(r.amount), 0);

  const completedCount = reimbursements.filter(r => r.status === 'COMPLETED').length;

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    setErrorMsg(null);
    try {
      await api.reimbursements.retry(id);
      await refetch();
    } catch (err: any) {
      setErrorMsg(err.message || 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            {isEmployee ? 'My Reimbursements' : 'Reimbursement Disbursements'}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {isEmployee
              ? 'Track your approved claim payouts, settled bank disbursements, and transfer statuses.'
              : 'Direct bank payouts and verified disbursement tracking.'}
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin text-emerald-600' : 'text-neutral-500'} />
          <span>{isFetching ? 'Syncing...' : 'Sync Now'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-sm text-red-600">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white border border-neutral-200/80 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Reimbursed</span>
            <Wallet size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-neutral-900">
            ₹{totalCompletedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-neutral-500">
            {completedCount} {completedCount === 1 ? 'claim settled' : 'claims settled'}
          </p>
        </div>

        <div className="p-5 bg-white border border-neutral-200/80 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold uppercase tracking-wider">In Flight / Processing</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-neutral-900">
            ₹{totalInFlightAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-neutral-500">Pending bank settlement</p>
        </div>

        <div className="p-5 bg-white border border-neutral-200/80 rounded-2xl shadow-sm space-y-1">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Transactions</span>
            <CreditCard size={16} className="text-neutral-500" />
          </div>
          <p className="text-2xl font-bold text-neutral-900">
            {reimbursements.length}
          </p>
          <p className="text-xs text-neutral-500">
            {isEmployee ? 'Claims submitted by you' : 'Company total'}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by Claim Title, Disbursement ID, or Idempotency Key..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-neutral-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-semibold text-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="PROCESSING">Processing</option>
            <option value="INITIATED">Initiated</option>
            <option value="FAILED">Failed</option>
          </select>

          {/* Sort By */}
          <div className="flex items-center gap-1.5 ml-1">
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
              <option value="status-asc">Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-neutral-500">Loading disbursements...</div>
        ) : reimbursements.length === 0 ? (
          <div className="p-16 text-center">
            <CreditCard size={36} className="mx-auto text-neutral-300 mb-3" />
            <p className="text-base font-bold text-neutral-900">No disbursements found</p>
            <p className="text-xs text-neutral-500 mt-1">
              {search || statusFilter !== 'ALL'
                ? 'Try adjusting your search criteria or status filter.'
                : isEmployee
                  ? 'Your approved expense claims will appear here once disbursed.'
                  : 'Disbursements will appear here when Finance approves claims for payout.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50/75 border-b border-neutral-200 text-xs text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Expense Claim</th>
                  <th className="px-6 py-3.5">Amount</th>
                  <th className="px-6 py-3.5">Disbursed Date</th>
                  <th className="px-6 py-3.5">Status</th>
                  {!isEmployee && <th className="px-6 py-3.5">Retries</th>}
                  <th className="px-6 py-3.5 text-right">Reference / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {reimbursements.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/expenses/${r.expense_id}`}
                        className="font-bold text-neutral-900 hover:text-emerald-600 transition-colors inline-flex items-center gap-1.5"
                      >
                        <span>{r.expense_title || `Claim #${r.expense_id.substring(0, 8)}`}</span>
                        <ExternalLink size={12} className="text-neutral-400" />
                      </Link>
                      <p className="text-xs text-neutral-400 font-mono mt-0.5">
                        ID: {r.id.substring(0, 8)}... · Key: {r.idempotency_key.substring(0, 16)}...
                      </p>
                      {r.transaction_id && (
                        <p className="text-[11px] text-emerald-700 font-mono mt-0.5 font-semibold">
                          Txn / UTR: {r.transaction_id}
                        </p>
                      )}
                      {!isEmployee && r.submitter_name && (
                        <p className="text-xs text-neutral-500 mt-0.5">Submitter: {r.submitter_name}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-neutral-900">
                      {formatCurrency(r.amount, r.currency)}
                    </td>
                    <td className="px-6 py-4 text-xs text-neutral-500">
                      {r.disbursed_at ? formatDate(r.disbursed_at) : (
                        <span className="text-amber-600 font-medium">In Progress</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        r.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : r.status === 'FAILED'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    {!isEmployee && (
                      <td className="px-6 py-4 text-xs font-medium text-neutral-600">
                        {r.retry_count}
                      </td>
                    )}
                    <td className="px-6 py-4 text-right">
                      {r.status === 'FAILED' && isFinanceOrAdmin && (
                        <button
                          disabled={retryingId === r.id}
                          onClick={() => handleRetry(r.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white font-medium rounded-lg text-xs transition-colors shadow-sm"
                        >
                          <RefreshCw size={13} className={retryingId === r.id ? 'animate-spin' : ''} />
                          Retry Payout
                        </button>
                      )}
                      {r.status === 'COMPLETED' && (
                        <span className="text-xs text-emerald-600 font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 size={14} /> Settled
                        </span>
                      )}
                      {(r.status === 'PROCESSING' || r.status === 'INITIATED') && (
                        <span className="text-xs text-amber-600 font-semibold inline-flex items-center gap-1">
                          <RefreshCw size={13} className="animate-spin" /> In Flight
                        </span>
                      )}
                      {r.status === 'FAILED' && isEmployee && (
                        <span className="text-xs text-red-600 font-medium">
                          Failed - Finance Reviewing
                        </span>
                      )}
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
