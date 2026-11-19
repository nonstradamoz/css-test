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
  { key: 'submitted', label: 'Submitted', statuses: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REIMBURSED'] },
  { key: 'review', label: 'In Review', statuses: ['UNDER_REVIEW', 'APPROVED', 'REIMBURSED'] },
  { key: 'approval', label: 'Approved', statuses: ['APPROVED', 'REIMBURSED'] },
  { key: 'reimbursed', label: 'Reimbursed', statuses: ['REIMBURSED'] }
];

export const TimelineStepper: React.FC<TimelineStepperProps> = ({
  status,
  rejectionReason,
  changeRequestReason
}) => {
  const isRejected = status === 'REJECTED';
  const isChangesRequested = status === 'CHANGES_REQUESTED';

  return (
    <div className="w-full py-4">
      <div className="relative flex items-center justify-between">
        {/* Background Connecting Line */}
        <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-0.5 bg-neutral-200 -z-0" />

        {STEPS.map((step, idx) => {
          const isCompleted = step.statuses.includes(status) && !(isRejected && idx >= 2);
          const isCurrent =
            (step.key === 'submitted' && status === 'SUBMITTED') ||
            (step.key === 'review' && status === 'UNDER_REVIEW') ||
            (step.key === 'approval' && status === 'APPROVED') ||
            (step.key === 'reimbursed' && status === 'REIMBURSED');

          let icon = <span className="text-xs font-semibold">{idx + 1}</span>;
          let nodeBg = 'bg-white border-2 border-neutral-300 text-neutral-400';

          if (isCompleted && !isCurrent) {
            icon = <Check className="w-4 h-4 text-white stroke-[2.5]" />;
            nodeBg = 'bg-emerald-600 border-2 border-emerald-600 text-white shadow-sm';
          } else if (isCurrent) {
            icon = <Clock className="w-4 h-4 text-emerald-600 animate-pulse" />;
            nodeBg = 'bg-white border-2 border-emerald-600 text-emerald-600 ring-4 ring-emerald-50';
          }

          if (isRejected && idx === 2) {
            icon = <XCircle className="w-4 h-4 text-white" />;
            nodeBg = 'bg-rose-600 border-2 border-rose-600 text-white';
          }

          if (isChangesRequested && idx === 1) {
            icon = <AlertTriangle className="w-4 h-4 text-white" />;
            nodeBg = 'bg-amber-600 border-2 border-amber-600 text-white';
          }

          return (
            <div key={step.key} className="flex flex-col items-center relative z-10">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                  nodeBg
                )}
              >
                {icon}
              </div>
              <span
                className={cn(
                  "text-xs font-medium mt-2 whitespace-nowrap",
                  isCurrent ? "text-emerald-700 font-semibold" : "text-neutral-500"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {isRejected && rejectionReason && (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
          <XCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
          <div>
            <p className="font-semibold">Claim was rejected</p>
            <p className="mt-0.5">{rejectionReason}</p>
          </div>
        </div>
      )}

      {isChangesRequested && changeRequestReason && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold">Reviewer requested modifications</p>
            <p className="mt-0.5">{changeRequestReason}</p>
          </div>
        </div>
      )}
    </div>
  );
};
