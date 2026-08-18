import React from 'react';
import { cn, getRoleBadgeInfo, getStatusBadgeInfo } from '@/lib/utils';
import { ExpenseStatus, ReimbursementStatus, Role } from '@/types';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'success' | 'warning' | 'danger' | 'info';
  status?: ExpenseStatus | ReimbursementStatus;
  role?: Role;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  status,
  role,
  children,
  ...props
}) => {
  if (status) {
    const info = getStatusBadgeInfo(status);
    return (
      <span
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border tracking-wide shadow-2xs',
          info.className,
          className
        )}
        {...props}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-70" />
        {children || info.label}
      </span>
    );
  }

  if (role) {
    const info = getRoleBadgeInfo(role);
    return (
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border uppercase tracking-wider',
          info.className,
          className
        )}
        {...props}
      >
        {children || info.label}
      </span>
    );
  }

  const variants = {
    default: 'bg-slate-100 text-slate-800 border-slate-200',
    outline: 'border border-slate-300 text-slate-700 bg-white',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border shadow-2xs',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};
