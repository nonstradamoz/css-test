'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { api } from '@/lib/api';
import { Reimbursement } from '@/types';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CreditCard, RefreshCw, AlertTriangle, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function ReimbursementsPage() {
  const { activeOrg, activeRole } = useAuth();
  const orgId = activeOrg?.id;

  const [selectedReimb, setSelectedReimb] = useState<Reimbursement | null>(null);
  const [isRetryOpen, setIsRetryOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const { data: reimbursements = [], isLoading, refetch } = useQuery({
    queryKey: ['reimbursements-list', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const rRef = collection(db, 'organisations', orgId, 'reimbursements');
      const snap = await getDocs(query(rRef, orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Reimbursement[];
    },
    enabled: !!orgId
  });

  const handleRetryRefund = async (forcedOutcome?: 'SUCCESS' | 'FAILURE' | 'TIMEOUT') => {
    if (!orgId || !selectedReimb) return;
    setIsRetrying(true);
    setRetryError(null);

    try {
      const idempotencyKey = `retry_${selectedReimb.id}_${Date.now()}`;
      await api.retryRefund({
        organisationId: orgId,
        reimbursementId: selectedReimb.id,
        idempotencyKey,
        forcedOutcome
      });

      setIsRetryOpen(false);
      setSelectedReimb(null);
      refetch();
    } catch (err: any) {
      setRetryError(err.message || 'Retry failed.');
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reimbursements & Payouts</h1>
          <p className="text-xs text-slate-500 mt-1">
            Settlement tracking, payment provider orchestration, and automated failure recovery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Reimbursements List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading reimbursements...</div>
          ) : reimbursements.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <CreditCard className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-700">No Reimbursements Found</h3>
              <p className="text-xs text-slate-500">Approved claims will appear here for payout processing.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Payout ID / Ref</th>
                    <th className="px-6 py-3">Expense Claim</th>
                    <th className="px-6 py-3">Recipient</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Attempts</th>
                    <th className="px-6 py-3">Settlement Amount</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {reimbursements.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-mono font-bold text-slate-900">#{r.id.substring(0, 8).toUpperCase()}</div>
                        {r.providerReference ? (
                          <div className="text-[10px] text-emerald-600 font-mono mt-0.5">
                            Ref: {r.providerReference}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 mt-0.5">{r.provider}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/expenses/${r.expenseId}`}
                          className="text-primary-600 hover:text-primary-700 font-semibold inline-flex items-center gap-1"
                        >
                          View Expense <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-700 font-medium">{r.submittedBy}</td>
                      <td className="px-6 py-4">
                        <Badge status={r.status} />
                        {r.failureReason && (
                          <p className="text-[10px] text-red-600 font-medium mt-1 max-w-xs truncate">
                            {r.failureReason}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-800">{r.attemptCount}</span>
                        <span className="text-slate-400"> / {r.maxAttempts || 3}</span>
                      </td>
                      <td className="px-6 py-4 font-black text-slate-900">
                        {formatCurrency(r.amount, r.currency)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {r.status === 'FAILED' && (activeRole === 'ADMIN' || activeRole === 'FINANCE') && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setSelectedReimb(r);
                              setRetryError(null);
                              setIsRetryOpen(true);
                            }}
                            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                          >
                            Retry Payout
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Retry Modal */}
      {selectedReimb && (
        <Modal
          isOpen={isRetryOpen}
          onClose={() => {
            setIsRetryOpen(false);
            setSelectedReimb(null);
          }}
          title="Retry Failed Reimbursement"
          description={`Payout ID: #${selectedReimb.id.toUpperCase()} • Amount: ${formatCurrency(selectedReimb.amount, selectedReimb.currency)}`}
        >
          <div className="space-y-4">
            {retryError && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{retryError}</div>}

            <div className="p-3 bg-red-50 rounded-lg text-xs text-red-900 border border-red-200 space-y-1">
              <span className="font-semibold">Previous Failure Reason:</span>
              <p>{selectedReimb.failureReason || 'Bank gateway network timeout or card rejection.'}</p>
            </div>

            <p className="text-xs text-slate-600">
              For evaluation and demonstration testing, select an outcome to simulate for this retry attempt:
            </p>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <Button
                size="sm"
                variant="success"
                onClick={() => handleRetryRefund('SUCCESS')}
                isLoading={isRetrying}
              >
                Retry & Succeed
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => handleRetryRefund('FAILURE')}
                isLoading={isRetrying}
              >
                Retry & Fail
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleRetryRefund('TIMEOUT')}
                isLoading={isRetrying}
              >
                Retry & Timeout
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
