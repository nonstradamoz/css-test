'use client';

import React from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Expense, Reimbursement } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  CreditCard,
  AlertTriangle,
  ArrowUpRight,
  PlusCircle,
  Receipt,
  CheckSquare
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { activeOrg, activeRole, user } = useAuth();
  const orgId = activeOrg?.id;

  const { data: expenses = [], isLoading: isLoadingExpenses } = useQuery({
    queryKey: ['dashboard-expenses', orgId, activeRole, user?.uid],
    queryFn: async () => {
      if (!orgId) return [];
      const expRef = collection(db, 'organisations', orgId, 'expenses');
      
      let q;
      if (activeRole === 'MEMBER') {
        q = query(expRef, where('submittedBy', '==', user?.uid), orderBy('createdAt', 'desc'), limit(50));
      } else {
        q = query(expRef, orderBy('createdAt', 'desc'), limit(50));
      }
      
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Expense[];
    },
    enabled: !!orgId
  });

  const { data: reimbursements = [], isLoading: isLoadingReimbursements } = useQuery({
    queryKey: ['dashboard-reimbursements', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const rRef = collection(db, 'organisations', orgId, 'reimbursements');
      const q = query(rRef, orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Reimbursement[];
    },
    enabled: !!orgId && (activeRole === 'ADMIN' || activeRole === 'FINANCE')
  });

  // Calculate metrics
  const totalSpendingCents = expenses
    .filter((e) => e.status === 'REFUNDED' || e.status === 'APPROVED' || e.status === 'REFUND_PENDING')
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const pendingApprovals = expenses.filter(
    (e) => e.status === 'SUBMITTED' || e.status === 'UNDER_REVIEW' || e.status === 'RESUBMITTED'
  );

  const approvedExpenses = expenses.filter((e) => e.status === 'APPROVED');
  const approvedAmountCents = approvedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const pendingReimbursements = reimbursements.filter(
    (r) => r.status === 'PENDING' || r.status === 'PROCESSING'
  );

  const completedRefunds = reimbursements.filter((r) => r.status === 'COMPLETED');
  const failedRefunds = reimbursements.filter((r) => r.status === 'FAILED');

  const recentExpenses = expenses.slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Financial Overview</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time status for {activeOrg?.name || 'Organisation'} ({activeOrg?.currency || 'USD'})
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/expenses/new">
            <Button size="sm" leftIcon={<PlusCircle className="w-4 h-4" />}>
              Submit Expense
            </Button>
          </Link>
          {(activeRole === 'ADMIN' || activeRole === 'REVIEWER') && (
            <Link href="/approvals">
              <Button size="sm" variant="outline" leftIcon={<CheckSquare className="w-4 h-4" />}>
                Review Queue ({pendingApprovals.length})
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Critical Alert Banner if there are failed refunds */}
      {failedRefunds.length > 0 && (activeRole === 'ADMIN' || activeRole === 'FINANCE') && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center text-red-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-red-900">
                {failedRefunds.length} Failed Reimbursement{failedRefunds.length > 1 ? 's' : ''} Require Attention
              </h4>
              <p className="text-xs text-red-700">
                Payment provider rejected one or more payout attempts. Manual retry is available.
              </p>
            </div>
          </div>
          <Link href="/reimbursements?status=FAILED">
            <Button size="sm" variant="danger">
              Resolve Failed Refunds
            </Button>
          </Link>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Total Spending */}
        <Card className="p-4 bg-gradient-to-br from-white to-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Spend</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {formatCurrency(totalSpendingCents, activeOrg?.currency)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Settled & approved</div>
        </Card>

        {/* Pending Approvals */}
        <Card className="p-4 bg-gradient-to-br from-white to-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending Review</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">{pendingApprovals.length}</div>
          <div className="text-[11px] text-amber-600 font-medium mt-0.5">Awaiting reviewer</div>
        </Card>

        {/* Approved Amount */}
        <Card className="p-4 bg-gradient-to-br from-white to-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Approved Queue</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {formatCurrency(approvedAmountCents, activeOrg?.currency)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{approvedExpenses.length} claims ready</div>
        </Card>

        {/* Pending Reimbursements */}
        <Card className="p-4 bg-gradient-to-br from-white to-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending Payouts</span>
            <div className="p-1.5 rounded-lg bg-cyan-50 text-cyan-600">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">{pendingReimbursements.length}</div>
          <div className="text-[11px] text-cyan-600 font-medium mt-0.5">In payout queue</div>
        </Card>

        {/* Completed Refunds */}
        <Card className="p-4 bg-gradient-to-br from-white to-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Completed</span>
            <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">{completedRefunds.length}</div>
          <div className="text-[11px] text-teal-600 font-medium mt-0.5">Settled via bank</div>
        </Card>

        {/* Failed Refunds */}
        <Card className="p-4 bg-gradient-to-br from-white to-slate-50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Failed Refunds</span>
            <div className="p-1.5 rounded-lg bg-red-50 text-red-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-red-600">{failedRefunds.length}</div>
          <div className="text-[11px] text-red-500 font-medium mt-0.5">Requires retry</div>
        </Card>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Expenses List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Expenses</CardTitle>
            <Link href="/expenses" className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingExpenses ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading expenses...</div>
            ) : recentExpenses.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500">No expenses recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentExpenses.map((exp) => (
                  <Link
                    key={exp.id}
                    href={`/expenses/${exp.id}`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{exp.merchant}</span>
                        <Badge status={exp.status} />
                        {exp.duplicateWarning?.isDuplicate && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
                            Duplicate Alert
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        <span>{exp.category}</span>
                        <span>•</span>
                        <span>{formatDate(exp.expenseDate)}</span>
                        <span>•</span>
                        <span>{exp.submitterName || exp.submitterEmail}</span>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {formatCurrency(exp.amount, exp.currency)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Approvals Summary for Reviewers/Finance */}
        <Card>
          <CardHeader>
            <CardTitle>Review Queue</CardTitle>
            <span className="text-xs font-medium text-slate-400">{pendingApprovals.length} pending</span>
          </CardHeader>
          <CardContent className="p-0">
            {pendingApprovals.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
                All expense claims have been reviewed.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingApprovals.slice(0, 5).map((exp) => (
                  <Link
                    key={exp.id}
                    href={`/expenses/${exp.id}`}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-slate-900">{exp.merchant}</p>
                      <p className="text-[11px] text-slate-400">{exp.submitterName || exp.submitterEmail}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-900">
                        {formatCurrency(exp.amount, exp.currency)}
                      </div>
                      <span className="text-[10px] text-primary-600 font-semibold">Review →</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
