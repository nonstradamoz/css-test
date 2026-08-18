'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  LayoutDashboard,
  Receipt,
  PlusCircle,
  CheckSquare,
  CreditCard,
  AlertOctagon,
  Users,
  ScrollText,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { activeRole, isSuperAdmin } = useAuth();

  const getNavItems = () => {
    switch (activeRole) {
      case 'MEMBER':
        return [
          { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
          { label: 'My Expenses', href: '/expenses', icon: Receipt },
          { label: 'Create Expense', href: '/expenses/new', icon: PlusCircle }
        ];

      case 'REVIEWER':
        return [
          { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
          { label: 'All Expenses', href: '/expenses', icon: Receipt },
          { label: 'Approvals Queue', href: '/approvals', icon: CheckSquare }
        ];

      case 'FINANCE':
        return [
          { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
          { label: 'Approved Expenses', href: '/expenses?status=APPROVED', icon: Receipt },
          { label: 'Reimbursements', href: '/reimbursements', icon: CreditCard },
          { label: 'Failed Refunds', href: '/reimbursements?status=FAILED', icon: AlertOctagon },
          { label: 'Audit Logs', href: '/audit-logs', icon: ScrollText }
        ];

      case 'ADMIN':
      default:
        return [
          { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
          { label: 'Expenses', href: '/expenses', icon: Receipt },
          { label: 'Approvals', href: '/approvals', icon: CheckSquare },
          { label: 'Reimbursements', href: '/reimbursements', icon: CreditCard },
          { label: 'Members', href: '/members', icon: Users },
          { label: 'Audit Logs', href: '/audit-logs', icon: ScrollText },
          { label: 'Settings', href: '/settings', icon: Settings }
        ];
    }
  };

  const navItems = getNavItems();

  return (
    <aside className="w-64 bg-slate-50/70 border-r border-slate-200/80 min-h-[calc(100vh-61px)] p-4 flex flex-col justify-between">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Menu
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href.split('?')[0]) && !item.href.includes('?'));

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-white text-primary-600 shadow-2xs border border-slate-200/80 font-semibold'
                  : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
              )}
            >
              <Icon className={cn('w-4 h-4', isActive ? 'text-primary-600' : 'text-slate-400')} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {isSuperAdmin && (
          <>
            <div className="px-3 pt-4 pb-2 text-[11px] font-bold text-violet-500 uppercase tracking-wider">
              System Admin
            </div>
            <Link
              href="/superadmin"
              className={cn(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                pathname.startsWith('/superadmin')
                  ? 'bg-violet-50 text-violet-700 shadow-2xs border border-violet-200 font-semibold'
                  : 'text-slate-600 hover:bg-violet-50/50 hover:text-violet-700'
              )}
            >
              <LayoutDashboard className={cn('w-4 h-4', pathname.startsWith('/superadmin') ? 'text-violet-600' : 'text-slate-400')} />
              <span>Platform Admin</span>
            </Link>
          </>
        )}
      </div>

      <div className="pt-4 border-t border-slate-200/60 text-[11px] text-slate-400 text-center">
        Enterprise CRS v1.0.0
      </div>
    </aside>
  );
};
