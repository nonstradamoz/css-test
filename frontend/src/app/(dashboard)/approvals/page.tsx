'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Expense, ApprovalDecision } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  CheckSquare, CheckCircle2, XCircle, AlertTriangle,
  ExternalLink, ShieldCheck, ShieldAlert, Search, Filter, ArrowUpDown, Tag
} from 'lucide-react';
import Link from 'next/link';

export default function ApprovalsQueuePage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [decision, setDecision] = useState<ApprovalDecision | null>(null);
  const [comments, setComments] = useState('');
  const [auditExemption, setAuditExemption] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search, Filter & Sort state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Load active dynamic categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-active'],
    queryFn: () => api.categories.list()
  });

  const { data: pendingExpenses = [], isLoading, refetch } = useQuery({
    queryKey: ['pending-approvals', search, categoryFilter, sortBy, sortOrder],
    queryFn: () => api.approvals.listPending({
      search: search || undefined,
      category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
      sort_by: sortBy,
      sort_order: sortOrder
    }),
    refetchInterval: 3000
  });

  const handleAction = async () => {
    if (!selectedExpense || !decision) return;
    if (decision === 'APPROVED' && selectedExpense.risk_level === 'HIGH' && !auditExemption.trim()) {
      setError('Audit Compliance Policy: An explicit Audit Exemption Reason is mandatory when approving claims flagged as HIGH RISK.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      await api.approvals.review(selectedExpense.id, {
        decision,
        comments: comments || undefined,
        audit_exemption_reason: auditExemption.trim() || undefined
      });
      setSelectedExpense(null);
      setDecision(null);
      setComments('');
      setAuditExemption('');
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['expenses-list'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      ]);
    } catch (err: any) {
      setError(err.message || 'Approval action failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Approvals Queue</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Review, approve, or request modifications for pending employee claims.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-sm text-red-600">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by submitter name, claim title, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <Tag size={15} className="text-neutral-400 shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
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
              <option value="amount-desc">Amount (Highest First - Priority)</option>
              <option value="amount-asc">Amount (Lowest First)</option>
              <option value="title-asc">Title (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-neutral-500">Loading pending queue...</div>
        ) : pendingExpenses.length === 0 ? (
          <div className="p-16 text-center">
            <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-3" />
            <p className="text-base font-bold text-neutral-900">All caught up!</p>
            <p className="text-xs text-neutral-500 mt-1">
              {search || categoryFilter !== 'ALL'
                ? 'No claims match your search filters.'
                : 'There are no expense claims pending your approval at this time.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50/75 border-b border-neutral-200 text-xs text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Claim & Submitter</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Forensics Risk</th>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5">Amount</th>
                  <th className="px-6 py-3.5">Tier Target</th>
                  <th className="px-6 py-3.5 text-right">Quick Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {pendingExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <Link href={`/expenses/${exp.id}`} className="font-semibold text-neutral-900 hover:text-emerald-600">
                        {exp.title}
                      </Link>
                      <p className="text-xs text-neutral-500">{exp.submitter_name || exp.submitter_email}</p>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-neutral-600">
                      <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
                        {categories.find(c => c.code === exp.category)?.name || exp.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${
                        exp.risk_level === 'HIGH'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : exp.risk_level === 'MEDIUM'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {exp.risk_level === 'HIGH' ? (
                          <ShieldAlert size={12} className="text-red-600" />
                        ) : (
                          <ShieldCheck size={12} className="text-emerald-600" />
                        )}
                        {exp.risk_score}/100 ({exp.risk_level})
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-neutral-500">
                      {formatDate(exp.expense_date)}
                    </td>
                    <td className="px-6 py-4 font-semibold text-neutral-900">
                      {formatCurrency(exp.amount, exp.currency)}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {exp.status === 'SUBMITTED' ? (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                          Tier 1 (Reviewer)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                          Tier 2 (Finance)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setSelectedExpense(exp); setDecision('APPROVED'); }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-xs transition-colors shadow-sm"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => { setSelectedExpense(exp); setDecision('CHANGES_REQUESTED'); }}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-white font-medium rounded-lg text-xs transition-colors shadow-sm"
                        >
                          Request Info
                        </button>
                        <button
                          onClick={() => { setSelectedExpense(exp); setDecision('REJECTED'); }}
                          className="px-2.5 py-1 bg-neutral-200 hover:bg-red-50 hover:text-red-600 text-neutral-700 font-medium rounded-lg text-xs transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Decision Modal */}
      {selectedExpense && decision && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-neutral-900">
              Confirm {decision === 'APPROVED' ? 'Approval' : decision === 'REJECTED' ? 'Rejection' : 'Modification Request'}
            </h3>
            <p className="text-sm text-neutral-600">
              Claim: <span className="font-semibold text-neutral-900">{selectedExpense.title}</span> (
              {formatCurrency(selectedExpense.amount, selectedExpense.currency)})
            </p>

            {/* Mandatory Exemption for High Risk Claims */}
            {decision === 'APPROVED' && selectedExpense.risk_level === 'HIGH' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                <label className="block text-xs font-bold text-red-900 uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle size={13} className="text-red-600" />
                  Audit Exemption Reason (Mandatory for High Risk) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Approved under Executive Client Hospitality budget"
                  value={auditExemption}
                  onChange={(e) => setAuditExemption(e.target.value)}
                  className="w-full p-2 border border-red-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                Reviewer Comments {decision !== 'APPROVED' ? '(Required)' : '(Optional)'}
              </label>
              <textarea
                rows={3}
                required={decision !== 'APPROVED'}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Enter justification, notes, or specific policy references..."
                className="w-full p-3 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setSelectedExpense(null); setDecision(null); setAuditExemption(''); }}
                className="px-4 py-2 border border-neutral-200 text-neutral-700 rounded-xl text-xs font-medium hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing || (decision !== 'APPROVED' && !comments.trim()) || (decision === 'APPROVED' && selectedExpense.risk_level === 'HIGH' && !auditExemption.trim())}
                onClick={handleAction}
                className={`px-4 py-2 rounded-xl text-xs font-medium text-white shadow-sm transition-colors ${
                  decision === 'APPROVED' ? 'bg-emerald-600 hover:bg-emerald-500' :
                  decision === 'REJECTED' ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'
                } disabled:opacity-50`}
              >
                {isProcessing ? 'Processing...' : 'Confirm Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
