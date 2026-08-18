import React from 'react';
import { Check, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { ExpenseStatus } from '@/types';
import { cn } from '@/lib/utils';

export interface TimelineStepperProps {
  status: ExpenseStatus;
  rejectionReason?: string;
  changeRequestReason?: string;
}

const STEPS: { key: string; label: string; statuses: ExpenseStatus[] }[] = [
  { key: 'submitted', label: 'Submitted', statuses: ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'] },
  { key: 'review', label: 'Under Review', statuses: ['UNDER_REVIEW', 'CHANGES_REQUESTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'] },
  { key: 'approval', label: 'Approved', statuses: ['APPROVED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'] },
  { key: 'reimbursement', label: 'Refund Processing', statuses: ['REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'] },
  { key: 'refunded', label: 'Refunded', statuses: ['REFUNDED'] }
];

export const TimelineStepper: React.FC<TimelineStepperProps> = ({
  status,
  rejectionReason,
  changeRequestReason
}) => {
  const isRejected = status === 'REJECTED';
  const isChangesRequested = status === 'CHANGES_REQUESTED';
  const isRefundFailed = status === 'REFUND_FAILED';

  return (
    <div className="w-full py-4">
      <div className="relative flex items-center justify-between">
        {/* Background Connecting Line */}
        <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 -z-0" />

        {STEPS.map((step, idx) => {
          const isCompleted = step.statuses.includes(status) && !(isRejected && idx >= 2);
          const isCurrent =
            (step.key === 'submitted' && (status === 'SUBMITTED' || status === 'DRAFT')) ||
            (step.key === 'review' && (status === 'UNDER_REVIEW' || status === 'RESUBMITTED')) ||
            (step.key === 'approval' && status === 'APPROVED') ||
            (step.key === 'reimbursement' && status === 'REFUND_PENDING') ||
            (step.key === 'refunded' && status === 'REFUNDED');

          let icon = <span className="text-xs font-semibold">{idx + 1}</span>;
          let nodeBg = 'bg-white border-2 border-slate-300 text-slate-400';

          if (isCompleted && !isCurrent) {
            icon = <Check className="w-4 h-4 text-white stroke-[2.5]" />;
            nodeBg = 'bg-emerald-600 border-2 border-emerald-600 text-white shadow-xs';
          } else if (isCurrent) {
            icon = <Clock className="w-4 h-4 text-primary-600 animate-pulse" />;
            nodeBg = 'bg-white border-2 border-primary-600 text-primary-600 ring-4 ring-primary-50';
          }

          if (isRejected && idx === 2) {
            icon = <XCircle className="w-4 h-4 text-white" />;
            nodeBg = 'bg-rose-600 border-2 border-rose-600 text-white';
          }

          if (isChangesRequested && idx === 1) {
            icon = <AlertTriangle className="w-4 h-4 text-amber-600" />;
            nodeBg = 'bg-amber-50 border-2 border-amber-500 text-amber-700 ring-4 ring-amber-50';
          }

          if (isRefundFailed && idx === 3) {
            icon = <AlertTriangle className="w-4 h-4 text-red-600" />;
            nodeBg = 'bg-red-50 border-2 border-red-500 text-red-700 ring-4 ring-red-50';
          }

          return (
            <div key={step.key} className="flex flex-col items-center relative z-10">
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300',
                  nodeBg
                )}
              >
                {icon}
              </div>
              <span
                className={cn(
                  'text-xs mt-2 font-medium tracking-tight text-center max-w-[80px]',
                  isCurrent || isCompleted ? 'text-slate-900 font-semibold' : 'text-slate-400'
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Status callout banner */}
      {isChangesRequested && (
        <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold">Changes Requested by Reviewer</h4>
            <p className="text-xs text-amber-800 mt-1">{changeRequestReason || 'Please modify the expense details or attach additional proof and resubmit.'}</p>
          </div>
        </div>
      )}

      {isRejected && (
        <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold">Expense Rejected</h4>
            <p className="text-xs text-rose-800 mt-1">{rejectionReason || 'This expense claim has been rejected by the reviewer.'}</p>
          </div>
        </div>
      )}

      {isRefundFailed && (
        <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold">Reimbursement Payment Failed</h4>
            <p className="text-xs text-red-800 mt-1">Payment gateway or bank rail rejected the transaction after maximum retry attempts. An authorized finance manager can initiate a manual retry.</p>
          </div>
        </div>
      )}
    </div>
  );
};
