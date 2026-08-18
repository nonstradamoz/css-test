import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ExpenseStatus, ReimbursementStatus, Role } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats monetary amounts from smallest integer unit (cents/paise) to display string.
 */
export function formatCurrency(amountInCents: number, currency: string = 'INR'): string {
  const normalized = (amountInCents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(normalized);
  } catch {
    return `${currency} ${normalized.toFixed(2)}`;
  }
}

/**
 * Converts user input decimal amount (e.g. 45.50) into integer smallest unit (4550)
 */
export function toCents(decimalAmount: number): number {
  return Math.round((decimalAmount || 0) * 100);
}

/**
 * Formats timestamp / date string into clean date
 */
export function formatDate(date: any): string {
  if (!date) return '—';
  let d: Date;
  if (typeof date === 'string') {
    d = new Date(date);
  } else if (date.toDate && typeof date.toDate === 'function') {
    d = date.toDate();
  } else if (date.seconds) {
    d = new Date(date.seconds * 1000);
  } else {
    d = new Date(date);
  }

  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(d);
}

/**
 * Formats timestamp to include time
 */
export function formatDateTime(date: any): string {
  if (!date) return '—';
  let d: Date;
  if (typeof date === 'string') {
    d = new Date(date);
  } else if (date.toDate && typeof date.toDate === 'function') {
    d = date.toDate();
  } else if (date.seconds) {
    d = new Date(date.seconds * 1000);
  } else {
    d = new Date(date);
  }

  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}

/**
 * Computes SHA-256 checksum of a browser File object for duplicate detection & data integrity.
 */
export async function calculateFileChecksum(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getStatusBadgeInfo(status: ExpenseStatus | ReimbursementStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'DRAFT':
      return { label: 'Draft', className: 'bg-slate-100 text-slate-700 border-slate-200' };
    case 'SUBMITTED':
      return { label: 'Submitted', className: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'UNDER_REVIEW':
      return { label: 'Under Review', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'CHANGES_REQUESTED':
      return { label: 'Changes Requested', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'RESUBMITTED':
      return { label: 'Resubmitted', className: 'bg-purple-50 text-purple-700 border-purple-200' };
    case 'APPROVED':
      return { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'REJECTED':
      return { label: 'Rejected', className: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'REFUND_PENDING':
    case 'PENDING':
      return { label: 'Refund Pending', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
    case 'PROCESSING':
      return { label: 'Processing', className: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'REFUNDED':
    case 'COMPLETED':
      return { label: 'Refunded', className: 'bg-teal-50 text-teal-700 border-teal-200' };
    case 'REFUND_FAILED':
    case 'FAILED':
      return { label: 'Refund Failed', className: 'bg-red-50 text-red-700 border-red-200 font-semibold' };
    default:
      return { label: status, className: 'bg-gray-100 text-gray-700 border-gray-200' };
  }
}

export function getRoleBadgeInfo(role: Role): { label: string; className: string } {
  switch (role) {
    case 'ADMIN':
      return { label: 'Admin', className: 'bg-purple-100 text-purple-800 border-purple-200' };
    case 'FINANCE':
      return { label: 'Finance', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'REVIEWER':
      return { label: 'Reviewer', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'MEMBER':
      return { label: 'Member', className: 'bg-slate-100 text-slate-800 border-slate-200' };
    default:
      return { label: role, className: 'bg-gray-100 text-gray-800 border-gray-200' };
  }
}
