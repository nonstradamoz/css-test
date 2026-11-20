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
    default: 'bg-neutral-100 text-neutral-800 border-neutral-200',
    outline: 'border border-neutral-300 text-neutral-700 bg-white',
    success: 'bg-brand-50 text-brand-800 border-brand-200 font-semibold',
    warning: 'bg-gold-50 text-gold-900 border-gold-200 font-semibold',
    danger: 'bg-crimson-50 text-crimson-800 border-crimson-200 font-semibold',
    info: 'bg-brand-50 text-brand-700 border-brand-200'
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
