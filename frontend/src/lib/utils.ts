import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ExpenseStatus, ReimbursementStatus, Role } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats monetary amounts directly into INR / currency display string.
 */
export function formatCurrency(amount: number | string, currency: string = 'INR'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 2
    }).format(num);
  } catch {
    return `₹${num.toFixed(2)}`;
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
      return { label: 'Draft', className: 'bg-neutral-100 text-neutral-700 border-neutral-200' };
    case 'SUBMITTED':
      return { label: 'Submitted (Tier 1)', className: 'bg-brand-50 text-brand-700 border-brand-200' };
    case 'UNDER_REVIEW':
      return { label: 'Under Review (Tier 2)', className: 'bg-gold-100 text-gold-900 border-gold-300 font-semibold' };
    case 'CHANGES_REQUESTED':
      return { label: 'Changes Requested', className: 'bg-gold-100 text-gold-900 border-gold-300 font-semibold' };
    case 'APPROVED':
      return { label: 'Approved', className: 'bg-brand-50 text-brand-800 border-brand-200 font-semibold' };
    case 'REJECTED':
      return { label: 'Rejected', className: 'bg-crimson-50 text-crimson-800 border-crimson-200 font-semibold' };
    case 'REIMBURSED':
    case 'COMPLETED':
      return { label: 'Reimbursed', className: 'bg-brand-100 text-brand-900 border-brand-300 font-semibold' };
    case 'INITIATED':
    case 'PROCESSING':
      return { label: 'Processing Payout', className: 'bg-gold-50 text-gold-800 border-gold-200' };
    case 'FAILED':
      return { label: 'Disbursement Failed', className: 'bg-crimson-100 text-crimson-900 border-crimson-300 font-bold' };
    default:
      return { label: status as string, className: 'bg-neutral-100 text-neutral-700 border-neutral-200' };
  }
}

export function getRoleBadgeInfo(role: Role): { label: string; className: string } {
  switch (role) {
    case 'ADMIN':
      return { label: 'Admin', className: 'bg-brand-100 text-brand-900 border-brand-300 font-semibold' };
    case 'FINANCE':
      return { label: 'Finance', className: 'bg-gold-100 text-gold-900 border-gold-300 font-semibold' };
    case 'REVIEWER':
      return { label: 'Reviewer', className: 'bg-brand-50 text-brand-800 border-brand-200 font-semibold' };
    case 'EMPLOYEE':
      return { label: 'Employee', className: 'bg-neutral-100 text-neutral-800 border-neutral-200' };
    default:
      return { label: role as string, className: 'bg-neutral-100 text-neutral-800 border-neutral-200' };
  }
}
