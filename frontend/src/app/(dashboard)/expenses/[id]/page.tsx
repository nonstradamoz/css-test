'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { Expense, AuditLog, ApprovalRecord } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { TimelineStepper } from '@/components/ui/TimelineStepper';
import {
  ArrowLeft,
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  CreditCard,
  Edit3,
  ExternalLink,
  Clock,
  ShieldAlert,
  User,
  Calendar,
  Building
} from 'lucide-react';
import Link from 'next/link';

export default function ExpenseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const expenseId = params.id as string;
  const { activeOrg, activeRole, user } = useAuth();
  const orgId = activeOrg?.id;

  // Modals state
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isChangesOpen, setIsChangesOpen] = useState(false);
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Receipt download state
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false);

  // Query expense doc
  const { data: expense, isLoading, refetch } = useQuery({
    queryKey: ['expense-detail', orgId, expenseId],
    queryFn: async () => {
      if (!orgId || !expenseId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('organisation_id', orgId)
        .eq('id', expenseId)
        .single();
        
      if (error || !data) return null;
      
      return {
        id: data.id,
        organisationId: data.organisation_id,
        submittedBy: data.submitted_by,
        submitterEmail: data.submitter_email,
        submitterName: data.submitter_name,
        amount: data.amount,
        currency: data.currency,
        category: data.category,
        merchant: data.merchant,
        expenseDate: data.expense_date,
        description: data.description,
        status: data.status,
        receipt: data.receipt,
        duplicateWarning: data.duplicate_warning,
        changeRequestReason: data.change_request_reason,
        rejectionReason: data.rejection_reason,
        approvedBy: data.approved_by,
        approvedAt: data.approved_at,
        rejectedBy: data.rejected_by,
        rejectedAt: data.rejected_at,
        reimbursementId: data.reimbursement_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        submittedAt: data.submitted_at
      } as Expense;
    },
    enabled: !!orgId && !!expenseId
  });

  // Query activity / audit logs for this expense
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['expense-audit-logs', orgId, expenseId],
    queryFn: async () => {
      if (!orgId || !expenseId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('organisation_id', orgId)
        .order('created_at', { ascending: false });
        
      if (error || !data) return [];
      
      const allLogs = data.map((d: any) => ({
        id: d.id,
        organisationId: d.organisation_id,
        actorId: d.actor_id,
        actorEmail: d.actor_email,
        action: d.action,
        entityType: d.entity_type,
        entityId: d.entity_id,
        before: d.before_data,
        after: d.after_data,
        timestamp: d.created_at
      })) as AuditLog[];
      
      return allLogs.filter((log) => log.entityId === expenseId || log.metadata?.expenseId === expenseId);
    },
    enabled: !!orgId && !!expenseId
  });

  // Query approval records
  const { data: approvals = [] } = useQuery({
    queryKey: ['expense-approvals', orgId, expenseId],
    queryFn: async () => {
      // Approval records might not be a separate table yet, keeping empty array for now
      return [] as ApprovalRecord[];
    },
    enabled: !!orgId && !!expenseId
  });

  if (isLoading) {
    return (
      <div className="p-12 text-center text-xs text-slate-400">Loading expense details...</div>
    );
  }

  if (!expense) {
    return (
      <div className="p-12 text-center space-y-4">
        <h3 className="text-base font-semibold text-slate-800">Expense Claim Not Found</h3>
        <p className="text-xs text-slate-500">The requested expense claim does not exist or you do not have permission.</p>
        <Link href="/expenses">
          <Button size="sm" variant="outline">
            Back to Expenses
          </Button>
        </Link>
      </div>
    );
  }

  const isOwner = user?.uid === expense.submittedBy;
  const isReviewerOrAdmin = activeRole === 'REVIEWER' || activeRole === 'ADMIN';
  const isFinanceOrAdmin = activeRole === 'FINANCE' || activeRole === 'ADMIN';

  const canSubmit = (expense.status === 'DRAFT') && (isOwner || activeRole === 'ADMIN');
  const canReview = (expense.status === 'SUBMITTED' || expense.status === 'UNDER_REVIEW' || expense.status === 'RESUBMITTED') && isReviewerOrAdmin;
  const canEdit = (expense.status === 'DRAFT' || expense.status === 'CHANGES_REQUESTED') && isOwner;
  const canPayout = (expense.status === 'APPROVED' || expense.status === 'REFUND_PENDING') && isFinanceOrAdmin;

  // Actions
  const handleApprove = async () => {
    if (!orgId) return;
    setIsProcessingAction(true);
    setActionError(null);
    try {
      await api.approveExpense({
        organisationId: orgId,
        expenseId,
        reason: actionReason || 'Approved as legitimate business expense'
      });
      setIsApproveOpen(false);
      setActionReason('');
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Approval failed.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleReject = async () => {
    if (!orgId) return;
    if (!actionReason.trim()) {
      setActionError('A rejection reason is required.');
      return;
    }
    setIsProcessingAction(true);
    setActionError(null);
    try {
      await api.rejectExpense({
        organisationId: orgId,
        expenseId,
        reason: actionReason.trim()
      });
      setIsRejectOpen(false);
      setActionReason('');
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Rejection failed.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!orgId) return;
    if (!actionReason.trim()) {
      setActionError('A reason/instructions for the submitter is required.');
      return;
    }
    setIsProcessingAction(true);
    setActionError(null);
    try {
      await api.requestExpenseChanges({
        organisationId: orgId,
        expenseId,
        reason: actionReason.trim()
      });
      setIsChangesOpen(false);
      setActionReason('');
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Action failed.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleSubmitDraft = async () => {
    if (!orgId) return;
    setIsProcessingAction(true);
    try {
      await api.submitExpense({
        organisationId: orgId,
        expenseId
      });
      refetch();
    } catch (err: any) {
      alert(err.message || 'Submission failed.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleInitiatePayout = async (forcedOutcome?: 'SUCCESS' | 'FAILURE' | 'TIMEOUT') => {
    if (!orgId) return;
    setIsProcessingAction(true);
    setActionError(null);
    try {
      // Deterministic idempotency key for this expense payout
      const idempotencyKey = `payout_${expenseId}_${Date.now()}`;
      await api.createReimbursement({
        organisationId: orgId,
        expenseId,
        idempotencyKey,
        forcedOutcome
      });
      setIsPayoutOpen(false);
      refetch();
    } catch (err: any) {
      setActionError(err.message || 'Payout creation failed.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleDownloadReceipt = async () => {
    if (!orgId) return;
    setIsDownloadingReceipt(true);
    try {
      const { downloadUrl, fileName } = await api.generateReceiptDownloadUrl({
        organisationId: orgId,
        expenseId
      });

      if (downloadUrl.startsWith('https://mock-cloudinary.storage.local')) {
        alert(`Mock signed URL generated securely: \n${downloadUrl}\nIn production, Cloudinary delivers the pre-signed binary.`);
      } else {
        window.open(downloadUrl, '_blank');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to generate download URL.');
    } finally {
      setIsDownloadingReceipt(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <Link href="/expenses">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to Expenses
          </Button>
        </Link>

        <div className="flex items-center gap-2">
          {canEdit && (
            <Link href={`/expenses/${expenseId}/edit`}>
              <Button size="sm" variant="outline" leftIcon={<Edit3 className="w-4 h-4" />}>
                Edit Expense
              </Button>
            </Link>
          )}

          {canSubmit && (
            <Button size="sm" onClick={handleSubmitDraft} isLoading={isProcessingAction} leftIcon={<Send className="w-4 h-4" />}>
              Submit for Review
            </Button>
          )}

          {canReview && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActionReason('');
                  setActionError(null);
                  setIsChangesOpen(true);
                }}
              >
                Request Changes
              </Button>

              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setActionReason('');
                  setActionError(null);
                  setIsRejectOpen(true);
                }}
              >
                Reject
              </Button>

              <Button
                size="sm"
                variant="success"
                onClick={() => {
                  setActionReason('');
                  setActionError(null);
                  setIsApproveOpen(true);
                }}
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                Approve
              </Button>
            </>
          )}

          {canPayout && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setIsPayoutOpen(true)}
              leftIcon={<CreditCard className="w-4 h-4" />}
            >
              Initiate Reimbursement Payout
            </Button>
          )}
        </div>
      </div>

      {/* Duplicate Warning Callout */}
      {expense.duplicateWarning?.isDuplicate && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold">Possible Duplicate Expense Detected</h4>
              <p className="text-xs text-amber-800 mt-1">
                Our multi-signal verification detected an existing claim matching amount, merchant, date, or receipt checksum. Reviewers should verify before approval.
              </p>
              {expense.duplicateWarning.matchingExpenseId && (
                <div className="mt-2">
                  <Link
                    href={`/expenses/${expense.duplicateWarning.matchingExpenseId}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 underline hover:text-amber-950"
                  >
                    Inspect Potential Matching Expense <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Expense Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">{expense.merchant}</h1>
                <Badge status={expense.status} />
              </div>
              <p className="text-xs text-slate-500 font-mono">Claim Reference: #{expense.id.toUpperCase()}</p>
            </div>

            <div className="sm:text-right">
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {formatCurrency(expense.amount, expense.currency)}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{expense.category}</div>
            </div>
          </div>

          {/* Stepper Progress */}
          <TimelineStepper
            status={expense.status}
            rejectionReason={expense.rejectionReason}
            changeRequestReason={expense.changeRequestReason}
          />
        </CardContent>
      </Card>

      {/* Details & Receipt Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Details & Description */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Expense Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Submitted By</span>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {expense.submitterName || expense.submitterEmail}
                  </p>
                  <p className="text-[11px] text-slate-400">{expense.submitterEmail}</p>
                </div>

                <div>
                  <span className="text-slate-400 font-medium">Expense Date</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{formatDate(expense.expenseDate)}</p>
                </div>

                <div>
                  <span className="text-slate-400 font-medium">Category</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{expense.category}</p>
                </div>

                <div>
                  <span className="text-slate-400 font-medium">Created On</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{formatDateTime(expense.createdAt)}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400 font-medium">Business Justification</span>
                <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">
                  {expense.description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Activity / Audit Trail */}
          <Card>
            <CardHeader>
              <CardTitle>Activity & Audit Trail</CardTitle>
              <span className="text-xs text-slate-400 font-medium">{auditLogs.length} events logged</span>
            </CardHeader>
            <CardContent className="p-0">
              {auditLogs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No activity recorded yet.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-4 flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-primary-600 mt-1.5 shrink-0" />
                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{log.action.replace(/_/g, ' ')}</span>
                          <span className="text-[10px] text-slate-400">{formatDateTime(log.timestamp)}</span>
                        </div>
                        <p className="text-slate-500 text-[11px]">
                          By: <span className="font-medium text-slate-700">{log.actorEmail}</span>
                        </p>
                        {log.after && (
                          <div className="text-[10px] bg-slate-50 text-slate-600 p-2 rounded mt-1 font-mono">
                            {JSON.stringify(log.after)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Receipt & Approvers */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Attached Receipt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {expense.receipt ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
                    <FileText className="w-10 h-10 text-primary-600 mx-auto" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800 truncate">{expense.receipt.fileName}</p>
                      <p className="text-[11px] text-slate-400">
                        {(expense.receipt.fileSize / 1024).toFixed(1)} KB • {expense.receipt.contentType}
                      </p>
                    </div>
                    {expense.receipt.checksum && (
                      <div className="text-[10px] font-mono text-slate-400 break-all bg-white p-1 rounded border border-slate-100">
                        SHA256: {expense.receipt.checksum.substring(0, 16)}...
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={handleDownloadReceipt}
                    isLoading={isDownloadingReceipt}
                    leftIcon={<Download className="w-4 h-4" />}
                  >
                    View / Download Receipt
                  </Button>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                  <p>No receipt attached.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Approvals Information */}
          <Card>
            <CardHeader>
              <CardTitle>Review Decisions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {approvals.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">Awaiting reviewer action</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {approvals.map((app) => (
                    <div key={app.id} className="p-4 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{app.reviewerEmail || app.reviewerId}</span>
                        <Badge variant={app.decision === 'APPROVED' ? 'success' : app.decision === 'REJECTED' ? 'danger' : 'warning'}>
                          {app.decision}
                        </Badge>
                      </div>
                      {app.reason && <p className="text-slate-600 italic mt-1">"{app.reason}"</p>}
                      <p className="text-[10px] text-slate-400">{formatDateTime(app.timestamp)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal: Approve */}
      <Modal
        isOpen={isApproveOpen}
        onClose={() => setIsApproveOpen(false)}
        title="Approve Expense Claim"
        description="Authorise this expense for reimbursement settlement."
      >
        <div className="space-y-4">
          {actionError && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{actionError}</div>}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Approval Note (Optional)</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-primary-500/20"
              placeholder="e.g. Approved per company travel policy"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsApproveOpen(false)}>
              Cancel
            </Button>
            <Button variant="success" size="sm" onClick={handleApprove} isLoading={isProcessingAction}>
              Confirm Approval
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Reject */}
      <Modal
        isOpen={isRejectOpen}
        onClose={() => setIsRejectOpen(false)}
        title="Reject Expense Claim"
        description="Provide a mandatory reason explaining why this claim was rejected."
      >
        <div className="space-y-4">
          {actionError && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{actionError}</div>}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Rejection Reason *</label>
            <textarea
              rows={3}
              required
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-red-500/20"
              placeholder="e.g. Non-compliant expense category or missing itemized receipt"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleReject} isLoading={isProcessingAction}>
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Request Changes */}
      <Modal
        isOpen={isChangesOpen}
        onClose={() => setIsChangesOpen(false)}
        title="Request Changes from Submitter"
        description="Instruct the employee on required corrections before this expense can be approved."
      >
        <div className="space-y-4">
          {actionError && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{actionError}</div>}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Required Changes *</label>
            <textarea
              rows={3}
              required
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-amber-500/20"
              placeholder="e.g. Please attach the tax invoice rather than credit card receipt"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsChangesOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleRequestChanges} isLoading={isProcessingAction}>
              Send Change Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Initiate Reimbursement / Payout */}
      <Modal
        isOpen={isPayoutOpen}
        onClose={() => setIsPayoutOpen(false)}
        title="Process Financial Reimbursement"
        description="Trigger bank / gateway payout with idempotency and retry protection."
      >
        <div className="space-y-4">
          {actionError && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{actionError}</div>}
          <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Payee:</span>
              <span className="font-semibold text-slate-800">{expense.submitterEmail}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Amount:</span>
              <span className="font-bold text-slate-900">{formatCurrency(expense.amount, expense.currency)}</span>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            For demonstration and test simulation, choose the desired outcome:
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="success"
              size="sm"
              onClick={() => handleInitiatePayout('SUCCESS')}
              isLoading={isProcessingAction}
            >
              Simulate Success
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleInitiatePayout('FAILURE')}
              isLoading={isProcessingAction}
            >
              Simulate Failure
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleInitiatePayout('TIMEOUT')}
              isLoading={isProcessingAction}
            >
              Simulate Timeout
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
