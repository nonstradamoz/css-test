'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Expense, ApprovalDecision } from '@/types';
import { Badge } from '@/components/ui/Badge';
import {
  ArrowLeft, FileText, CheckCircle2, XCircle,
  AlertTriangle, Send, CreditCard, ExternalLink,
  Clock, ShieldCheck, ShieldAlert, PenTool, Sparkles, Tag, User, Calendar
} from 'lucide-react';
import Link from 'next/link';

export default function ExpenseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const expenseId = params.id as string;
  const { role, user } = useAuth();

  const [comments, setComments] = useState('');
  const [auditExemption, setAuditExemption] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: expense, isLoading, refetch } = useQuery({
    queryKey: ['expense-detail', expenseId],
    queryFn: () => api.expenses.get(expenseId),
    enabled: !!expenseId
  });

  const handleApprovalAction = async (decision: ApprovalDecision) => {
    if (decision === 'APPROVED' && expense?.risk_level === 'HIGH' && !auditExemption.trim()) {
      setErrorMsg('Audit Compliance Policy: An explicit Audit Exemption Reason is mandatory when approving claims flagged as HIGH RISK.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await api.approvals.review(expenseId, {
        decision,
        comments: comments || undefined,
        audit_exemption_reason: auditExemption.trim() || undefined
      });
      setComments('');
      setAuditExemption('');
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['expenses-list'] }),
        queryClient.invalidateQueries({ queryKey: ['approvals-list'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      ]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Action failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisbursement = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const idempotencyKey = `payout-${expenseId}-${Date.now()}`;
      await api.reimbursements.create(expenseId, idempotencyKey);
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['reimbursements-list'] }),
        queryClient.invalidateQueries({ queryKey: ['expenses-list'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      ]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to trigger payout disbursement');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitDraft = async () => {
    if (!expense?.receipt_url) {
      setErrorMsg('A receipt upload is mandatory to submit an expense claim. Please edit the claim to attach a receipt.');
      return;
    }
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await api.expenses.submit(expenseId);
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['expenses-list'] }),
        queryClient.invalidateQueries({ queryKey: ['approvals-list'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      ]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit claim');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-sm text-neutral-500">Loading claim details...</div>;
  }

  if (!expense) {
    return <div className="p-12 text-center text-sm text-neutral-500">Expense claim not found.</div>;
  }

  const isOwner = user?.id === expense.submitted_by;
  const canReviewTier1 = ['ADMIN', 'REVIEWER'].includes(role || '') && expense.status === 'SUBMITTED';
  const canReviewTier2 = ['ADMIN', 'FINANCE'].includes(role || '') && expense.status === 'UNDER_REVIEW';
  const canDisburse = ['ADMIN', 'FINANCE'].includes(role || '') && expense.status === 'APPROVED';

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/expenses"
            className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{expense.title}</h1>
            <p className="text-xs text-neutral-500 mt-0.5">Claim ID: {expense.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge status={expense.status} />
          {expense.approval_tier_required === 2 && (
            <span className="text-xs font-semibold px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200">
              Tier {expense.current_approval_tier} of 2
            </span>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-sm text-red-600">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Claim Summary Card */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-6 border-b border-neutral-200">
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase">Amount</p>
            <p className="text-xl font-bold text-neutral-900 mt-1">
              {formatCurrency(expense.amount, expense.currency)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase">Category</p>
            <p className="text-sm font-semibold text-neutral-800 mt-1.5">{expense.category}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase">Expense Date</p>
            <p className="text-sm text-neutral-700 mt-1.5">{formatDate(expense.expense_date)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase">Submitter</p>
            <p className="text-sm text-neutral-700 mt-1.5 font-medium">{expense.submitter_name || expense.submitter_email}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-neutral-400 uppercase mb-1">Business Purpose / Description</p>
          <p className="text-sm text-neutral-700 leading-relaxed">
            {expense.description || 'No description provided.'}
          </p>
        </div>

        {/* Receipt Attachment */}
        {expense.receipt_url && (
          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                <FileText size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-800">Attached Receipt Document</p>
                <p className="text-xs text-neutral-500">Stored on Cloudflare R2</p>
              </div>
            </div>
            <a
              href={expense.receipt_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-50 shadow-sm"
            >
              View Document <ExternalLink size={14} />
            </a>
          </div>
        )}

        {/* Approvals History */}
        {expense.approvals && expense.approvals.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-neutral-200">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Approval Audit Trail
            </h3>
            <div className="space-y-2">
              {expense.approvals.map((appr) => (
                <div key={appr.id} className="p-3 bg-neutral-50/70 border border-neutral-200 rounded-xl text-xs flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-neutral-800">
                      Tier {appr.tier} {appr.decision}:
                    </span>
                    <span className="text-neutral-600 ml-2">{appr.comments || 'No comments'}</span>
                  </div>
                  <span className="text-neutral-400">{formatDate(appr.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reimbursement Details */}
        {expense.reimbursement && (
          <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-900">Reimbursement Payout: {expense.reimbursement.status}</span>
              <span className="text-emerald-700 font-semibold">{formatCurrency(expense.reimbursement.amount, expense.reimbursement.currency)}</span>
            </div>
            <p className="text-emerald-800">Idempotency Key: {expense.reimbursement.idempotency_key}</p>
          </div>
        )}
      </div>

      {/* AI Forensic Inspector Card */}
      <div className={`border rounded-2xl p-6 shadow-sm space-y-4 ${
        expense.risk_level === 'HIGH'
          ? 'bg-red-50/40 border-red-200'
          : expense.risk_level === 'MEDIUM'
          ? 'bg-amber-50/40 border-amber-200'
          : 'bg-white border-neutral-200/80'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {expense.risk_level === 'HIGH' ? (
              <ShieldAlert size={20} className="text-red-600 shrink-0" />
            ) : expense.risk_level === 'MEDIUM' ? (
              <AlertTriangle size={20} className="text-amber-600 shrink-0" />
            ) : (
              <ShieldCheck size={20} className="text-emerald-600 shrink-0" />
            )}
            <div>
              <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <span>AI Forensic Compliance Inspector</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                  expense.risk_level === 'HIGH'
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : expense.risk_level === 'MEDIUM'
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                }`}>
                  {expense.risk_score}/100 Risk Score ({expense.risk_level} RISK)
                </span>
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Automated multi-vector inspection for threshold smurfing, collusion, prohibited keywords, and weekend anomalies.
              </p>
            </div>
          </div>
        </div>

        {/* Forensic Flags List */}
        {Array.isArray(expense.forensic_flags) && expense.forensic_flags.length > 0 ? (
          <div className="space-y-2 pt-1">
            {(expense.forensic_flags as any[]).map((flag: any, idx: number) => (
              <div key={idx} className="p-3 bg-white/90 border border-neutral-200 rounded-xl text-xs space-y-0.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    flag.severity === 'CRITICAL' ? 'bg-red-600 text-white' :
                    flag.severity === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {flag.severity}
                  </span>
                  <span className="font-bold text-neutral-900">{flag.label}</span>
                </div>
                <p className="text-neutral-600 pl-0.5">{flag.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-emerald-800 font-medium">
            ✓ Claim passed all forensic checks. No smurfing evasion or collusion detected.
          </p>
        )}

        {/* Handwritten Recognition Metadata */}
        {Boolean((expense.extracted_metadata as any)?.is_handwritten) && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-center gap-2 text-amber-800">
            <PenTool size={16} className="text-amber-600 shrink-0" />
            <span>
              <strong>Handwritten Receipt Recognized:</strong> {String((expense.extracted_metadata as any)?.handwritten_notes || 'Extracted via Multimodal AI')}.
            </span>
          </div>
        )}

        {/* Existing Audit Exemption Record */}
        {expense.audit_exemption_reason && (
          <div className="p-3 bg-neutral-900 text-neutral-200 rounded-xl text-xs space-y-1">
            <span className="font-bold text-amber-400 uppercase tracking-wider text-[10px]">
              Documented Audit Exemption Justification:
            </span>
            <p className="italic text-neutral-300">"{expense.audit_exemption_reason}"</p>
          </div>
        )}
      </div>

      {/* Reviewer / Admin Actions */}
      {(canReviewTier1 || canReviewTier2) && (
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-neutral-900">
            {canReviewTier1 ? 'Tier 1 Review (Reviewer / Admin)' : 'Tier 2 Secondary Review (Finance / Admin)'}
          </h2>

          {/* Mandatory Audit Exemption input for HIGH risk */}
          {expense.risk_level === 'HIGH' && (
            <div className="p-4 bg-red-50/80 border border-red-200 rounded-xl space-y-1.5">
              <label className="block text-xs font-bold text-red-900 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-red-600" />
                Mandatory Audit Exemption Reason (Required for High-Risk Approval) *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Approved under Executive Client Hospitality budget code EX-901"
                value={auditExemption}
                onChange={(e) => setAuditExemption(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-red-300 rounded-lg text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              />
              <p className="text-[11px] text-red-700">
                This claim is flagged as HIGH RISK. Enterprise compliance requires reviewers to document an explicit exemption rationale before approving.
              </p>
            </div>
          )}

          <div>
            <textarea
              rows={2}
              placeholder="Add review comments or change instructions..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              disabled={isProcessing}
              onClick={() => handleApprovalAction('CHANGES_REQUESTED')}
              className="px-4 py-2 border border-amber-300 text-amber-800 hover:bg-amber-50 font-medium rounded-xl text-sm transition-colors"
            >
              Request Changes
            </button>
            <button
              disabled={isProcessing}
              onClick={() => handleApprovalAction('REJECTED')}
              className="px-4 py-2 border border-red-300 text-red-700 hover:bg-red-50 font-medium rounded-xl text-sm transition-colors"
            >
              Reject Claim
            </button>
            <button
              disabled={isProcessing}
              onClick={() => handleApprovalAction('APPROVED')}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              Approve Claim
            </button>
          </div>
        </div>
      )}

      {/* Finance Disbursement Action */}
      {canDisburse && (
        <div className="bg-white border border-emerald-200 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Approved for Disbursement</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Trigger idempotent bank transfer / refund settlement.</p>
          </div>
          <button
            disabled={isProcessing}
            onClick={handleDisbursement}
            className="px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-medium rounded-xl text-sm transition-colors shadow-sm inline-flex items-center gap-2"
          >
            <CreditCard size={16} />
            {isProcessing ? 'Processing Payout...' : 'Disburse Payout'}
          </button>
        </div>
      )}

      {/* Employee Submit Draft Action */}
      {isOwner && ['DRAFT', 'CHANGES_REQUESTED'].includes(expense.status) && (
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">Ready to Submit?</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Send claim to Reviewers for evaluation.</p>
          </div>
          <button
            disabled={isProcessing}
            onClick={handleSubmitDraft}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-sm transition-colors shadow-sm inline-flex items-center gap-2"
          >
            <Send size={16} />
            {isProcessing ? 'Submitting...' : 'Submit Claim'}
          </button>
        </div>
      )}
    </div>
  );
}
