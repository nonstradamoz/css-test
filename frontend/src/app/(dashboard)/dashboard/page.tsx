'use client';

import React from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Expense, Reimbursement } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import {
  IndianRupee, Clock, CheckCircle2, CreditCard,
  AlertTriangle, PlusCircle, CheckSquare, ArrowUpRight
} from 'lucide-react';
import Link from 'next/link';

function Stat({
  label, value, note,
  icon: Icon, iconColor
}: {
  label: string; value: string | number; note?: string;
  icon: any; iconColor: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200/80 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            {label}
          </p>
          <p className="text-2xl font-bold text-neutral-900 tracking-tight">
            {value}
          </p>
          {note && <p className="text-xs text-neutral-500 mt-1">{note}</p>}
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${iconColor}15` }}
        >
          <Icon size={20} color={iconColor} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { role, user } = useAuth();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['dash-expenses'],
    queryFn: () => api.expenses.list(),
    refetchInterval: 3000
  });

  const { data: reimbursements = [] } = useQuery({
    queryKey: ['dash-reimbursements'],
    queryFn: () => api.reimbursements.list(),
    enabled: ['ADMIN', 'REVIEWER', 'FINANCE'].includes(role || ''),
    refetchInterval: 3000
  });

  const totalSpend = expenses
    .filter(e => ['REIMBURSED', 'APPROVED'].includes(e.status))
    .reduce((s, e) => s + parseFloat(e.amount as any || '0'), 0);

  const pending = expenses.filter(e => ['SUBMITTED', 'UNDER_REVIEW'].includes(e.status));
  const pendingAmt = pending.reduce((s, e) => s + parseFloat(e.amount as any || '0'), 0);

  const approved = expenses.filter(e => e.status === 'APPROVED');
  const approvedAmt = approved.reduce((s, e) => s + parseFloat(e.amount as any || '0'), 0);

  const reimbursed = expenses.filter(e => e.status === 'REIMBURSED');
  const reimbursedAmt = reimbursed.reduce((s, e) => s + parseFloat(e.amount as any || '0'), 0);

  const recent = expenses.slice(0, 10);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Real-time expense oversight and reimbursement settlement overview.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {['ADMIN', 'REVIEWER', 'FINANCE'].includes(role || '') && (
            <Link
              href="/approvals"
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-neutral-900 text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-neutral-800 transition-colors shadow-sm"
            >
              <CheckSquare size={16} />
              Review Claims ({pending.length})
            </Link>
          )}
          <Link
            href="/expenses/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs sm:text-sm font-medium hover:bg-emerald-500 transition-colors shadow-sm"
          >
            <PlusCircle size={16} />
            Submit Expense
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Total Approved / Settled"
          value={formatCurrency(totalSpend)}
          note="Approved & processed for Reimbursement"
          icon={IndianRupee}
          iconColor="#1a7a4a"
        />
        <Stat
          label="Pending Review"
          value={formatCurrency(pendingAmt)}
          note={`${pending.length} claims awaiting approval`}
          icon={Clock}
          iconColor="#c47f17"
        />
        <Stat
          label="Ready for Payout"
          value={formatCurrency(approvedAmt)}
          note={`${approved.length} approved for disbursement`}
          icon={CheckCircle2}
          iconColor="#2c7eb8"
        />
        <Stat
          label="Completed Disbursements"
          value={formatCurrency(reimbursedAmt)}
          note={`${reimbursed.length} payouts settled`}
          icon={CreditCard}
          iconColor="#7c3aed"
        />
      </div>

      {/* Recent Expense Claims Table */}
      <div className="bg-white rounded-xl border border-neutral-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">Recent Expense Claims</h2>
          <Link href="/expenses" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
            View All <ArrowUpRight size={14} />
          </Link>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-neutral-500">Loading expenses...</div>
        ) : recent.length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-500">
            No expense claims recorded yet.
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div
              role="region"
              aria-label="Recent expenses table"
              tabIndex={0}
              className="hidden md:block overflow-x-auto w-full focus:outline-none"
            >
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50/75 border-b border-neutral-200 text-xs text-neutral-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Title & Submitter</th>
                    <th className="px-6 py-3.5">Category</th>
                    <th className="px-6 py-3.5">Date</th>
                    <th className="px-6 py-3.5">Amount</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {recent.map((exp) => (
                    <tr key={exp.id} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-neutral-900">{exp.title}</p>
                        <p className="text-xs text-neutral-500">{exp.submitter_name || exp.submitter_email}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-neutral-600">
                        {exp.category}
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
                          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                        >
                          Details →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="block md:hidden divide-y divide-neutral-200">
              {recent.map((exp) => (
                <div key={exp.id} className="p-4 space-y-2 hover:bg-neutral-50/60 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-neutral-900 text-sm">{exp.title}</p>
                      <p className="text-xs text-neutral-500">{exp.submitter_name || exp.submitter_email}</p>
                    </div>
                    <Badge status={exp.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-neutral-500">{formatDate(exp.expense_date)}</span>
                    <span className="text-sm font-bold text-neutral-900">{formatCurrency(exp.amount, exp.currency)}</span>
                  </div>
                  <div className="pt-2 flex justify-end">
                    <Link
                      href={`/expenses/${exp.id}`}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      Details →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
