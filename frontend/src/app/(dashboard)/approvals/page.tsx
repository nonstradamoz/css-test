'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { api } from '@/lib/api';
import { Expense } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CheckSquare, CheckCircle2, XCircle, AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function ApprovalsQueuePage() {
  const { activeOrg, activeRole, user } = useAuth();
  const orgId = activeOrg?.id;

  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [modalType, setModalType] = useState<'APPROVE' | 'REJECT' | 'CHANGES' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: pendingExpenses = [], isLoading, refetch } = useQuery({
    queryKey: ['approvals-queue', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const expRef = collection(db, 'organisations', orgId, 'expenses');
      const snap = await getDocs(expRef);
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Expense[];
      return all.filter(
        (e) => e.status === 'SUBMITTED' || e.status === 'UNDER_REVIEW' || e.status === 'RESUBMITTED'
      );
    },
    enabled: !!orgId
  });

  const handleActionSubmit = async () => {
    if (!orgId || !selectedExpense || !modalType) return;
    setIsProcessing(true);
    setError(null);

    try {
      if (modalType === 'APPROVE') {
        await api.approveExpense({
          organisationId: orgId,
          expenseId: selectedExpense.id,
          reason: actionReason || 'Approved as legitimate business expense'
        });
      } else if (modalType === 'REJECT') {
        if (!actionReason.trim()) {
          setError('A rejection reason is required.');
          setIsProcessing(false);
          return;
        }
        await api.rejectExpense({
          organisationId: orgId,
          expenseId: selectedExpense.id,
          reason: actionReason.trim()
        });
      } else if (modalType === 'CHANGES') {
        if (!actionReason.trim()) {
          setError('Instructions/reason for changes are required.');
          setIsProcessing(false);
          return;
        }
        await api.requestExpenseChanges({
          organisationId: orgId,
          expenseId: selectedExpense.id,
          reason: actionReason.trim()
        });
      }

      setModalType(null);
      setSelectedExpense(null);
      setActionReason('');
      refetch();
    } catch (err: any) {
      setError(err.message || 'Action failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Approvals Queue</h1>
          <p className="text-xs text-slate-500 mt-1">
            Review and authorise pending employee expense claims with transactional concurrency safety.
          </p>
        </div>
        <div className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
          {pendingExpenses.length} Claims Awaiting Review
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading approval queue...</div>
          ) : pendingExpenses.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <CheckSquare className="w-10 h-10 text-emerald-500/60 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-700">Approval Queue is Clear</h3>
              <p className="text-xs text-slate-500">All submitted claims have been processed.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-slate-900 text-sm">{exp.merchant}</span>
                      <Badge status={exp.status} />
                      {exp.duplicateWarning?.isDuplicate && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Duplicate Alert
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-1">{exp.description}</p>

                    <div className="text-[11px] text-slate-400 flex items-center gap-3">
                      <span>Submitted by: <strong className="text-slate-700 font-medium">{exp.submitterName || exp.submitterEmail}</strong></span>
                      <span>•</span>
                      <span>Category: <strong className="text-slate-700 font-medium">{exp.category}</strong></span>
                      <span>•</span>
                      <span>Date: <strong className="text-slate-700 font-medium">{formatDate(exp.expenseDate)}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-base font-black text-slate-900">
                        {formatCurrency(exp.amount, exp.currency)}
                      </div>
                      <Link
                        href={`/expenses/${exp.id}`}
                        className="text-[11px] text-primary-600 hover:text-primary-700 font-semibold inline-flex items-center gap-1"
                      >
                        Inspect Details <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedExpense(exp);
                          setModalType('CHANGES');
                          setActionReason('');
                          setError(null);
                        }}
                      >
                        Changes
                      </Button>

                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setSelectedExpense(exp);
                          setModalType('REJECT');
                          setActionReason('');
                          setError(null);
                        }}
                      >
                        Reject
                      </Button>

                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => {
                          setSelectedExpense(exp);
                          setModalType('APPROVE');
                          setActionReason('');
                          setError(null);
                        }}
                        leftIcon={<CheckCircle2 className="w-4 h-4" />}
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Modal */}
      {selectedExpense && modalType && (
        <Modal
          isOpen={!!modalType}
          onClose={() => {
            setModalType(null);
            setSelectedExpense(null);
          }}
          title={
            modalType === 'APPROVE'
              ? `Approve Claim: ${selectedExpense.merchant}`
              : modalType === 'REJECT'
              ? `Reject Claim: ${selectedExpense.merchant}`
              : `Request Changes: ${selectedExpense.merchant}`
          }
          description={`Amount: ${formatCurrency(selectedExpense.amount, selectedExpense.currency)} • Submitter: ${selectedExpense.submitterEmail}`}
        >
          <div className="space-y-4">
            {error && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                {modalType === 'APPROVE'
                  ? 'Approval Note (Optional)'
                  : modalType === 'REJECT'
                  ? 'Rejection Reason *'
                  : 'Instructions for Employee *'}
              </label>
              <textarea
                rows={3}
                required={modalType !== 'APPROVE'}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={
                  modalType === 'APPROVE'
                    ? 'e.g. Approved per budget'
                    : modalType === 'REJECT'
                    ? 'e.g. Non-compliant category'
                    : 'e.g. Please attach itemized tax invoice'
                }
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setModalType(null);
                  setSelectedExpense(null);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant={modalType === 'APPROVE' ? 'success' : modalType === 'REJECT' ? 'danger' : 'primary'}
                onClick={handleActionSubmit}
                isLoading={isProcessing}
              >
                Confirm {modalType}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
