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
  Clock, ShieldCheck, ShieldAlert, PenTool, Sparkles, Tag, User, Calendar,
  FileSearch, Copy, Trash2
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
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [transferTxnId, setTransferTxnId] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: expense, isLoading, refetch } = useQuery({
    queryKey: ['expense-detail', expenseId],
    queryFn: () => api.expenses.get(expenseId),
    enabled: !!expenseId
  });

  const handleDeleteExpense = async () => {
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await api.expenses.delete(expenseId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses-list'] }),
        queryClient.invalidateQueries({ queryKey: ['approvals-list'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      ]);
      router.push('/expenses');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete expense claim');
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

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
    if (!transferTxnId.trim()) {
      setErrorMsg('A valid Transfer Transaction ID / Reference (e.g. UTR / IMPS / UPI ID) is required to record the payout.');
      return;
    }
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const idempotencyKey = `payout-${expenseId}-${Date.now()}`;
      await api.reimbursements.create(expenseId, idempotencyKey, transferTxnId.trim());
      setShowPayoutModal(false);
      setTransferTxnId('');
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
      if (err.message?.toLowerCase().includes('bank details')) {
        router.push(`/profile?prompt_bank=true&redirect_expense_id=${expenseId}`);
        return;
      }
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
  const isAccepted = ['APPROVED', 'REIMBURSED'].includes(expense.status);
  const canDelete = role === 'ADMIN' || (isOwner && !isAccepted);
  const canReviewTier1 = ['ADMIN', 'REVIEWER'].includes(role || '') && expense.status === 'SUBMITTED';
  const canReviewTier2 = ['ADMIN', 'REVIEWER', 'FINANCE'].includes(role || '') && expense.status === 'UNDER_REVIEW';
  const canDisburse = ['ADMIN', 'REVIEWER', 'FINANCE'].includes(role || '') && expense.status === 'APPROVED';

  // Cross-verification & audit metrics for reviewing personnel
  const isAuditor = ['ADMIN', 'REVIEWER', 'FINANCE'].includes(role || '');
  const extracted = (expense.extracted_metadata || {}) as any;
  const hasExtraction = Boolean(extracted && (extracted.amount || extracted.merchant_name || (extracted.line_items && extracted.line_items.length > 0)));

  const claimedAmount = Number(expense.amount);
  const extractedAmount = extracted?.amount ? Number(extracted.amount) : null;
  const amountDiff = extractedAmount !== null ? claimedAmount - extractedAmount : 0;
  const isAmountMatch = extractedAmount !== null && Math.abs(amountDiff) < 1.0;
  const isOverclaimed = extractedAmount !== null && amountDiff > 1.0;
  const isUnderclaimed = extractedAmount !== null && amountDiff < -1.0;
  const variancePct = extractedAmount ? ((amountDiff / extractedAmount) * 100).toFixed(1) : '0';

  const claimedDateStr = expense.expense_date ? expense.expense_date.split('T')[0] : '';
  const extractedDateStr = extracted?.expense_date || '';
  const isDateMatch = !extractedDateStr || claimedDateStr === extractedDateStr;
  const isCategoryMatch = !extracted?.suggested_category || expense.category.toUpperCase() === extracted.suggested_category.toUpperCase();
  const flaggedItems = extracted?.line_items?.filter((item: any) => item.flagged) || [];

  const hasBankDetails = Boolean((expense as any).submitter_has_bank_details);
  const bankDetails = (expense as any).submitter_bank_details;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/expenses"
            className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors shrink-0"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight truncate">{expense.title}</h1>
            <p className="text-xs text-neutral-500 mt-0.5 truncate">Claim ID: {expense.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0 pl-11 sm:pl-0">
          {canDelete && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-semibold transition-colors shadow-sm"
              title={role === 'ADMIN' ? 'Delete this claim (Admin privilege)' : 'Delete your unapproved claim'}
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">Delete Claim</span>
            </button>
          )}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-6 border-b border-neutral-200">
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
            <p className="text-sm text-neutral-700 mt-1.5 font-medium">
              {expense.submitter_name || expense.submitter_email}
              {Boolean((expense.category_details as any)?.proxy_filed_by_name) && (
                <span className="block text-[11px] text-emerald-700 font-semibold mt-0.5">
                  Proxy by: {(expense.category_details as any).proxy_filed_by_name}
                </span>
              )}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-neutral-400 uppercase mb-1">Business Purpose / Description</p>
          <p className="text-sm text-neutral-700 leading-relaxed">
            {expense.description || 'No description provided.'}
          </p>
        </div>

        {/* Category-Specific Details */}
        {expense.category_details && Object.keys(expense.category_details).length > 0 && (
          <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-200/80 space-y-2">
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              Category Specifics ({expense.category})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              {Object.entries(expense.category_details).map(([key, val]) => (
                <div key={key}>
                  <p className="text-[11px] text-neutral-500 capitalize">{key.replace(/_/g, ' ')}</p>
                  <p className="text-xs font-medium text-neutral-900 mt-0.5">{String(val)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

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

      {/* Forensic Cross-Verification & Extraction Reconciliation (Admin / Reviewer / Finance Only) */}
      {isAuditor && hasExtraction && (
        <div className="bg-white border-2 border-indigo-100 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <FileSearch size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-neutral-900">Receipt Forensic Cross-Verification</h2>
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                    Auditor View
                  </span>
                  {Boolean((expense.category_details as any)?.proxy_filed_by_name) && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full">
                      Proxy Filed by {(expense.category_details as any).proxy_filed_by_name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Cross-verify employee claimed details against in-house OCR extracted receipt facts.
                </p>
              </div>
            </div>

            {/* Reconciliation Status Badge */}
            <div className="self-start sm:self-auto">
              {isOverclaimed ? (
                <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle size={15} />
                  <span>Discrepancy: Overclaimed by +{formatCurrency(amountDiff, expense.currency)} (+{variancePct}%)</span>
                </div>
              ) : isUnderclaimed ? (
                <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle size={15} />
                  <span>Amount Underclaimed (-{formatCurrency(Math.abs(amountDiff), expense.currency)})</span>
                </div>
              ) : isAmountMatch ? (
                <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 size={15} />
                  <span>Exact Reconciled Match (₹0.00 Variance)</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Comparison Matrix Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-400 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Reconciliation Metric</th>
                  <th className="py-2.5 px-3">Employee Claimed</th>
                  <th className="py-2.5 px-3">Receipt Extracted</th>
                  <th className="py-2.5 px-3">Reconciliation Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {/* 1. Establishment / Merchant */}
                <tr>
                  <td className="py-3 px-3 font-semibold text-neutral-900">Merchant / Establishment</td>
                  <td className="py-3 px-3 text-neutral-700 font-medium">{expense.title}</td>
                  <td className="py-3 px-3 text-neutral-900 font-bold">
                    <div>{extracted.merchant_name || 'Not detected'}</div>
                    {extracted.vendor_location && (
                      <div className="text-[11px] text-neutral-500 font-normal">{extracted.vendor_location}</div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-100 text-neutral-700">
                      Receipt Origin
                    </span>
                  </td>
                </tr>

                {/* 2. Total Amount */}
                <tr className={isOverclaimed ? 'bg-red-50/50' : ''}>
                  <td className="py-3 px-3 font-semibold text-neutral-900">Total Claim Amount</td>
                  <td className="py-3 px-3 font-bold text-neutral-900">
                    {formatCurrency(claimedAmount, expense.currency)}
                  </td>
                  <td className="py-3 px-3 font-bold text-indigo-950">
                    {extractedAmount !== null
                      ? formatCurrency(extractedAmount, extracted.currency || expense.currency)
                      : 'Not detected'}
                  </td>
                  <td className="py-3 px-3">
                    {isAmountMatch ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[11px]">
                        <CheckCircle2 size={12} /> Exact Match
                      </span>
                    ) : isOverclaimed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 rounded font-semibold text-[11px]">
                        <AlertTriangle size={12} /> Overclaimed +{formatCurrency(amountDiff, expense.currency)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[11px]">
                        <AlertTriangle size={12} /> Underclaimed -{formatCurrency(Math.abs(amountDiff), expense.currency)}
                      </span>
                    )}
                  </td>
                </tr>

                {/* 3. Date */}
                <tr>
                  <td className="py-3 px-3 font-semibold text-neutral-900">Expense Date</td>
                  <td className="py-3 px-3 text-neutral-700">{formatDate(expense.expense_date)}</td>
                  <td className="py-3 px-3 text-neutral-900 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{extractedDateStr ? formatDate(extractedDateStr) : 'Not detected'}</span>
                      {extracted.is_future_date && (
                        <span className="px-1.5 py-0.2 bg-red-100 text-red-800 rounded font-bold text-[10px]">
                          Future Dated
                        </span>
                      )}
                      {extracted.is_stale_receipt && (
                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">
                          Stale (&gt;90d)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    {isDateMatch ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[11px]">
                        <CheckCircle2 size={12} /> Date Aligned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[11px]">
                        <AlertTriangle size={12} /> Date Mismatch ({extractedDateStr})
                      </span>
                    )}
                  </td>
                </tr>

                {/* 4. Category */}
                <tr>
                  <td className="py-3 px-3 font-semibold text-neutral-900">Category</td>
                  <td className="py-3 px-3 text-neutral-700 font-semibold">{expense.category}</td>
                  <td className="py-3 px-3 text-neutral-900 font-medium">
                    {extracted.suggested_category || 'N/A'}
                  </td>
                  <td className="py-3 px-3">
                    {isCategoryMatch ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[11px]">
                        <CheckCircle2 size={12} /> Category Aligned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[11px]">
                        <AlertTriangle size={12} /> Differs from receipt
                      </span>
                    )}
                  </td>
                </tr>

                {/* 5. Document & Bill Identifiers */}
                <tr>
                  <td className="py-3 px-3 font-semibold text-neutral-900">Document & Bill Identifiers</td>
                  <td className="py-3 px-3 text-neutral-500 italic">Self-declared in total</td>
                  <td className="py-3 px-3 text-neutral-800" colSpan={2}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      {extracted.bill_number && (
                        <span><strong className="text-neutral-900">Bill #:</strong> {extracted.bill_number}</span>
                      )}
                      {extracted.receipt_number && (
                        <span><strong className="text-neutral-900">Receipt #:</strong> {extracted.receipt_number}</span>
                      )}
                      <span><strong className="text-neutral-900">Invoice #:</strong> {extracted.invoice_number || 'N/A'}</span>
                      {extracted.gstin && (
                        <span><strong className="text-neutral-900">GSTIN:</strong> {extracted.gstin}</span>
                      )}
                    </div>
                  </td>
                </tr>

                {/* 5b. Subtotal & Dual Tax Breakdown */}
                {(extracted.subtotal_amount || extracted.tax_amount || extracted.cgst_amount || extracted.sgst_amount || extracted.igst_amount || extracted.is_itc_eligible !== undefined) && (
                  <tr>
                    <td className="py-3 px-3 font-semibold text-neutral-900">Tax & Financial Breakdown</td>
                    <td className="py-3 px-3 text-neutral-500 italic">Self-declared in total</td>
                    <td className="py-3 px-3 text-neutral-800" colSpan={2}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        {extracted.subtotal_amount ? (
                          <span><strong className="text-neutral-900">Subtotal:</strong> ₹{extracted.subtotal_amount}</span>
                        ) : null}
                        {extracted.tax_amount ? (
                          <span><strong className="text-neutral-900">Total Tax:</strong> ₹{extracted.tax_amount}</span>
                        ) : null}
                        {extracted.cgst_amount ? (
                          <span><strong className="text-neutral-900">CGST:</strong> ₹{extracted.cgst_amount}</span>
                        ) : null}
                        {extracted.sgst_amount ? (
                          <span><strong className="text-neutral-900">SGST:</strong> ₹{extracted.sgst_amount}</span>
                        ) : null}
                        {extracted.igst_amount ? (
                          <span><strong className="text-neutral-900">IGST:</strong> ₹{extracted.igst_amount}</span>
                        ) : null}
                        {extracted.is_itc_eligible !== undefined && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[11px] ${
                            extracted.is_itc_eligible ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {extracted.is_itc_eligible ? '✓ ITC Eligible (Company GSTIN)' : 'Standard ITC'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {/* 5c. Mathematical Sanity Check */}
                {extracted.math_check_passed !== undefined && (
                  <tr>
                    <td className="py-3 px-3 font-semibold text-neutral-900">Line-Item Sum Reconciliation</td>
                    <td className="py-3 px-3 text-neutral-500 italic">Line items total</td>
                    <td className="py-3 px-3 text-neutral-800" colSpan={2}>
                      {extracted.math_check_passed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[11px]">
                          <CheckCircle2 size={12} /> Line items sum matches total receipt value
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-800 rounded font-semibold text-[11px]">
                          <AlertTriangle size={12} /> Discrepancy: items sum differs by ₹{extracted.math_discrepancy_amount}
                        </span>
                      )}
                    </td>
                  </tr>
                )}

                {/* 5d. Deep Category Logistics */}
                {extracted.category_logistics && Object.keys(extracted.category_logistics).length > 0 && (
                  <tr>
                    <td className="py-3 px-3 font-semibold text-neutral-900">Category Logistics</td>
                    <td className="py-3 px-3 text-neutral-500 italic">Invoice specifics</td>
                    <td className="py-3 px-3 text-neutral-800" colSpan={2}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        {Object.entries(extracted.category_logistics)
                          .filter(([_, val]) => Boolean(val))
                          .map(([key, val]) => (
                            <span key={key}>
                              <strong className="text-neutral-900 capitalize">{key.replace(/_/g, ' ')}:</strong> {String(val)}
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                )}

                {/* 6. Transaction ID / Payment Reference */}
                <tr>
                  <td className="py-3 px-3 font-semibold text-neutral-900">Transaction ID (UPI/UTR/Ref)</td>
                  <td className="py-3 px-3 text-neutral-500 italic">Self-declared claim</td>
                  <td className="py-3 px-3 text-neutral-900 font-mono font-medium">
                    {extracted.transaction_id || 'Cash / Counter Payment'}
                  </td>
                  <td className="py-3 px-3">
                    {extracted.transaction_id ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[11px]">
                        <ShieldCheck size={12} /> Forensically Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded font-medium text-[11px]">
                        Counter Bill / Physical Cash
                      </span>
                    )}
                  </td>
                </tr>

                {/* 7. Mode of Payment */}
                {extracted.payment_mode && (
                  <tr>
                    <td className="py-3 px-3 font-semibold text-neutral-900">Mode of Payment</td>
                    <td className="py-3 px-3 text-neutral-500 italic">Declared via claim</td>
                    <td className="py-3 px-3 text-neutral-900 font-semibold">
                      {extracted.payment_mode}
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[11px]">
                        <CheckCircle2 size={12} /> Detected Instrument
                      </span>
                    </td>
                  </tr>
                )}

                {/* 8. Mobile / Contact Number */}
                {extracted.mobile_number && (
                  <tr>
                    <td className="py-3 px-3 font-semibold text-neutral-900">Merchant / Contact Number</td>
                    <td className="py-3 px-3 text-neutral-500 italic">
                      {(expense.category_details as any)?.contact_number || 'Self-declared'}
                    </td>
                    <td className="py-3 px-3 text-neutral-900 font-mono font-medium">
                      {extracted.mobile_number}
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded font-medium text-[11px]">
                        Receipt Contact
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Extracted Line Items List */}
          {Array.isArray(extracted.line_items) && extracted.line_items.length > 0 && (
            <div className="pt-2 border-t border-neutral-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
                  Extracted Receipt Line Items ({extracted.line_items.length})
                </span>
                {flaggedItems.length > 0 && (
                  <span className="text-xs font-bold text-red-600 flex items-center gap-1">
                    <AlertTriangle size={14} /> {flaggedItems.length} Policy Flag(s) Detected
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {extracted.line_items.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                      item.flagged
                        ? 'bg-red-50/90 border-red-200 text-red-950'
                        : 'bg-neutral-50/70 border-neutral-200 text-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{item.description}</span>
                      <span className="font-bold shrink-0">{formatCurrency(item.amount, expense.currency)}</span>
                    </div>
                    {item.flagged && (
                      <span className="text-[10px] font-bold text-red-700 mt-1 flex items-center gap-1">
                        <AlertTriangle size={12} className="shrink-0" />
                        {item.reason || 'Restricted item violation'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick-Action: Copy Discrepancy Note into Reviewer Comments */}
          {(canReviewTier1 || canReviewTier2) && (isOverclaimed || !isDateMatch || flaggedItems.length > 0) && (
            <div className="p-3 bg-indigo-50/60 border border-indigo-200/80 rounded-xl flex items-center justify-between text-xs">
              <span className="text-indigo-950 font-medium">
                Auditor discrepancy detected. You can insert this variance into your review decision notes with one click.
              </span>
              <button
                type="button"
                onClick={() => {
                  const discrepancyNote = `Forensic Reconciliation Note: Claimed ${formatCurrency(claimedAmount, expense.currency)} vs Receipt Extracted ${extractedAmount !== null ? formatCurrency(extractedAmount, expense.currency) : 'N/A'}${isOverclaimed ? ` (Overclaimed by +${formatCurrency(amountDiff, expense.currency)} / +${variancePct}%)` : ''}${!isDateMatch ? ` | Date Mismatch (Claimed: ${claimedDateStr}, Receipt: ${extractedDateStr})` : ''}${flaggedItems.length > 0 ? ` | Restricted items detected on receipt: ${flaggedItems.map((i: any) => i.description).join(', ')}` : ''}.`;
                  setComments(prev => prev ? `${prev}\n${discrepancyNote}` : discrepancyNote);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-sm transition-colors shrink-0 ml-3"
              >
                <Copy size={13} />
                Insert in Review Notes
              </button>
            </div>
          )}
        </div>
      )}

      {/* Receipt Extracted Details (Employee Submitter View) */}
      {!isAuditor && hasExtraction && (
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <FileSearch size={18} className="text-emerald-600" />
              <h2 className="text-sm font-bold text-neutral-900">Receipt Extracted Facts</h2>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                AI Verified
              </span>
            </div>
            {Boolean((expense.category_details as any)?.proxy_filed_by_name) && (
              <span className="text-xs px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-medium">
                Filed on your behalf by {(expense.category_details as any).proxy_filed_by_name}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-neutral-400 font-semibold uppercase">Extracted Vendor</p>
              <p className="font-bold text-neutral-900 mt-1">{extracted.merchant_name || 'N/A'}</p>
              {extracted.vendor_location && (
                <p className="text-[11px] text-neutral-500 mt-0.5">{extracted.vendor_location}</p>
              )}
            </div>
            <div>
              <p className="text-neutral-400 font-semibold uppercase">Extracted Amount</p>
              <p className="font-bold text-neutral-900 mt-1">
                {extracted.amount ? formatCurrency(extracted.amount, extracted.currency || expense.currency) : 'N/A'}
              </p>
              {extracted.subtotal_amount ? (
                <p className="text-[11px] text-neutral-500 mt-0.5">Subtotal: ₹{extracted.subtotal_amount}</p>
              ) : null}
            </div>
            <div>
              <p className="text-neutral-400 font-semibold uppercase">Receipt Date</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="font-semibold text-neutral-800">{extracted.expense_date || 'N/A'}</span>
                {extracted.is_future_date && (
                  <span className="px-1.5 py-0.2 bg-red-100 text-red-800 rounded font-bold text-[10px]">
                    Future
                  </span>
                )}
                {extracted.is_stale_receipt && (
                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">
                    &gt;90d
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="text-neutral-400 font-semibold uppercase">Document / Txn #</p>
              <p className="font-mono font-medium text-neutral-800 mt-1">
                {extracted.transaction_id || extracted.receipt_number || extracted.invoice_number || 'N/A'}
              </p>
              {extracted.gstin && (
                <p className="text-[11px] text-neutral-500 mt-0.5 font-mono">GSTIN: {extracted.gstin}</p>
              )}
            </div>
          </div>

          {/* Tax Breakdown, ITC & Mathematical Check Badges */}
          <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center gap-2 text-xs">
            {extracted.tax_amount ? (
              <span className="px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded font-medium">
                Tax: ₹{extracted.tax_amount}
                {extracted.cgst_amount ? ` (CGST: ₹${extracted.cgst_amount}` : ''}
                {extracted.sgst_amount ? `, SGST: ₹${extracted.sgst_amount}` : ''}
                {extracted.igst_amount ? `, IGST: ₹${extracted.igst_amount}` : ''}
                {extracted.cgst_amount || extracted.sgst_amount || extracted.igst_amount ? ')' : ''}
              </span>
            ) : null}
            {extracted.is_itc_eligible !== undefined && (
              <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                extracted.is_itc_eligible ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'
              }`}>
                {extracted.is_itc_eligible ? '✓ Corporate ITC Eligible' : 'Standard ITC'}
              </span>
            )}
            {extracted.math_check_passed !== undefined && (
              <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                extracted.math_check_passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {extracted.math_check_passed ? '✓ Items Sum Verified' : `Discrepancy: ₹${extracted.math_discrepancy_amount}`}
              </span>
            )}
          </div>

          {/* Category Logistics (if any) */}
          {extracted.category_logistics && Object.keys(extracted.category_logistics).length > 0 && (
            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 text-xs">
              <span className="font-semibold text-neutral-700 uppercase tracking-wider text-[11px] block mb-1.5">
                Extracted Logistics:
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-neutral-600">
                {Object.entries(extracted.category_logistics)
                  .filter(([_, val]) => Boolean(val))
                  .map(([key, val]) => (
                    <span key={key}>
                      <strong className="text-neutral-800 capitalize">{key.replace(/_/g, ' ')}:</strong> {String(val)}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {Array.isArray(extracted.line_items) && extracted.line_items.length > 0 && (
            <div className="pt-2 border-t border-neutral-100 space-y-2">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Recognized Receipt Line Items ({extracted.line_items.length}):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {extracted.line_items.map((item: any, idx: number) => (
                  <div key={idx} className="p-2.5 bg-neutral-50 rounded-lg border border-neutral-200 flex justify-between">
                    <span className="font-medium text-neutral-800 truncate">{item.description}</span>
                    <span className="font-bold text-neutral-900 shrink-0 ml-2">
                      {formatCurrency(item.amount, expense.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
                    flag.severity === 'HIGH' ? 'bg-red-100 text-red-700' :
                    flag.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                    'bg-emerald-100 text-emerald-800'
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
                This claim is flagged as HIGH RISK. Corporate compliance policy requires reviewers to document an explicit exemption rationale before approving.
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

      {/* Finance Disbursement Action (Locked unless employee has configured bank details) */}
      {canDisburse && (
        <div className={`bg-white border rounded-2xl p-6 shadow-sm space-y-4 ${
          hasBankDetails ? 'border-emerald-200' : 'border-amber-200 bg-amber-50/20'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-neutral-900">Approved for Disbursement</h2>
                {hasBankDetails ? (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Bank Profile Configured
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                    <AlertTriangle size={12} /> Bank Profile Missing
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500">
                {hasBankDetails
                  ? `Beneficiary: ${bankDetails?.account_holder_name || expense.submitter_name || 'Employee'}${bankDetails?.bank_name ? ` • ${bankDetails.bank_name}` : ''}${bankDetails?.account_number ? ` (A/C: ••••${bankDetails.account_number.slice(-4)})` : ''}${bankDetails?.upi_id ? ` • UPI: ${bankDetails.upi_id}` : ''}`
                  : `Disbursement is locked because ${expense.submitter_name || 'the employee'} has not added bank details or UPI ID in their profile.`}
              </p>
            </div>

            <button
              disabled={isProcessing || !hasBankDetails}
              onClick={() => setShowPayoutModal(true)}
              title={!hasBankDetails ? 'Employee must provide bank details in profile first' : undefined}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm inline-flex items-center gap-2 shrink-0 ${
                hasBankDetails
                  ? 'bg-neutral-900 hover:bg-neutral-800 text-white cursor-pointer'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed border border-neutral-300'
              }`}
            >
              <CreditCard size={16} />
              {!hasBankDetails
                ? 'Payout Locked (No Bank Details)'
                : 'Disburse Payout'}
            </button>
          </div>

          {!hasBankDetails && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              <span>
                <strong>Action Required:</strong> The employee ({expense.submitter_name || 'Submitter'}) has not configured a bank account or UPI ID. Ask the employee to open <em>Profile Settings</em> and enter their reimbursement bank details so payout can proceed.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Reimbursement Confirmation Modal with Transaction ID */}
      {showPayoutModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">Confirm Reimbursement Disbursement</h3>
                  <p className="text-xs text-neutral-500">Record payout transfer and financial transaction ID</p>
                </div>
              </div>
              <button
                onClick={() => setShowPayoutModal(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Beneficiary Details Card */}
            <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-neutral-200">
                <span className="text-neutral-500 font-medium">Reimbursement Amount</span>
                <span className="text-base font-bold text-neutral-900">
                  {formatCurrency(Number(expense.amount), expense.currency)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-neutral-400 block">Beneficiary Name</span>
                  <span className="font-semibold text-neutral-800">{bankDetails?.account_holder_name || expense.submitter_name || 'Employee'}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block">Bank Name</span>
                  <span className="font-semibold text-neutral-800">{bankDetails?.bank_name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block">Account Number</span>
                  <span className="font-mono font-semibold text-neutral-800">{bankDetails?.account_number ? `••••${bankDetails.account_number.slice(-4)}` : 'N/A'}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block">IFSC / UPI ID</span>
                  <span className="font-mono font-semibold text-neutral-800">{bankDetails?.upi_id || bankDetails?.ifsc_code || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Transaction ID Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                Bank Transfer Transaction ID / UTR / Reference ID *
              </label>
              <input
                type="text"
                required
                value={transferTxnId}
                onChange={(e) => setTransferTxnId(e.target.value)}
                placeholder="e.g. UTR-98401928374 or UPI-3091823746"
                className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <p className="text-[11px] text-neutral-400 mt-1">
                Enter the official transaction reference number from your corporate banking portal / payment processor.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowPayoutModal(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing || !transferTxnId.trim()}
                onClick={handleDisbursement}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                <CreditCard size={14} />
                {isProcessing ? 'Recording Transfer...' : 'Confirm & Disburse'}
              </button>
            </div>
          </div>
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl text-neutral-900 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-xl">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">Delete Expense Claim?</h3>
                <p className="text-xs text-neutral-500 truncate max-w-xs">{expense.title}</p>
              </div>
            </div>

            <p className="text-sm text-neutral-600 leading-relaxed">
              Are you sure you want to permanently delete this expense claim?
              {role === 'ADMIN' && !isOwner && (
                <span className="block mt-2 font-semibold text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-xs">
                  Administrative Override: You are removing this claim permanently across the enterprise.
                </span>
              )}
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteExpense}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                <Trash2 size={14} />
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
