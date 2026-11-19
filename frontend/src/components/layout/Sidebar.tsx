'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  LayoutDashboard, Receipt, PlusCircle, CheckSquare,
  CreditCard, Users, ScrollText, Settings,
  ShieldCheck, LogOut, User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Role } from '@/types';

const NAV_ITEMS: Record<string, { label: string; href: string; icon: any }[]> = {
  EMPLOYEE: [
    { label: 'Dashboard',       href: '/dashboard',      icon: LayoutDashboard },
    { label: 'My Expenses',     href: '/expenses',       icon: Receipt },
    { label: 'Submit Expense',  href: '/expenses/new',   icon: PlusCircle },
    { label: 'Reimbursements',  href: '/reimbursements', icon: CreditCard },
    { label: 'My Profile',      href: '/profile',        icon: User }
  ],
  REVIEWER: [
    { label: 'Dashboard',       href: '/dashboard',      icon: LayoutDashboard },
    { label: 'All Expenses',    href: '/expenses',       icon: Receipt },
    { label: 'Approvals Queue', href: '/approvals',      icon: CheckSquare },
    { label: 'Reimbursements',  href: '/reimbursements', icon: CreditCard },
    { label: 'My Profile',      href: '/profile',        icon: User }
  ],
  FINANCE: [
    { label: 'Dashboard',       href: '/dashboard',      icon: LayoutDashboard },
    { label: 'Expenses',        href: '/expenses',       icon: Receipt },
    { label: 'Approvals (T2)',  href: '/approvals',      icon: CheckSquare },
    { label: 'Reimbursements',  href: '/reimbursements', icon: CreditCard },
    { label: 'Audit Logs',      href: '/audit-logs',     icon: ScrollText },
    { label: 'My Profile',      href: '/profile',        icon: User }
  ],
  ADMIN: [
    { label: 'Dashboard',       href: '/dashboard',      icon: LayoutDashboard },
    { label: 'Expenses',        href: '/expenses',       icon: Receipt },
    { label: 'Approvals Queue', href: '/approvals',      icon: CheckSquare },
    { label: 'Reimbursements',  href: '/reimbursements', icon: CreditCard },
    { label: 'User Management', href: '/users',          icon: Users },
    { label: 'Audit Logs',      href: '/audit-logs',     icon: ScrollText },
    { label: 'Settings',        href: '/settings',       icon: Settings },
    { label: 'My Profile',      href: '/profile',        icon: User }
  ]
};

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { role, user, logout } = useAuth();

  const currentRole = (role as string) || 'EMPLOYEE';
  const items = NAV_ITEMS[currentRole] ?? NAV_ITEMS.EMPLOYEE;
  const initials = user?.full_name ? user.full_name.substring(0, 2).toUpperCase() : 'U';
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'User';

  const isActive = (href: string) =>
    pathname === href ||
    (href !== '/dashboard' && pathname.startsWith(href.split('?')[0]) && !href.includes('?'));

  return (
    <nav className="w-64 bg-neutral-900 text-neutral-200 h-screen sticky top-0 flex flex-col justify-between p-4 shrink-0 z-30 overflow-y-auto">
      <div>
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 py-4 mb-4 border-b border-neutral-800">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <ShieldCheck size={22} />
          </div>
          <div>
            <span className="font-bold text-white text-base tracking-tight block">
              CRS Enterprise
            </span>
            <span className="text-xs text-neutral-400">Refund & Expense</span>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-neutral-800 text-white font-semibold"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800/60"
                )}
              >
                <Icon size={18} className={active ? "text-emerald-400" : "text-neutral-400"} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* User Footer */}
      <div className="pt-4 border-t border-neutral-800">
        <div className="flex items-center justify-between px-2 py-2">
          <Link
            href="/profile"
            className="flex items-center gap-2.5 overflow-hidden group hover:opacity-90 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shrink-0 group-hover:ring-2 group-hover:ring-emerald-400">
              {initials}
            </div>
            <div className="truncate">
              <p className="text-sm font-medium text-white truncate leading-tight group-hover:text-emerald-400 transition-colors">{displayName}</p>
              <p className="text-xs text-neutral-400 truncate">{user?.email}</p>
            </div>
          </Link>
          <button
            onClick={() => logout()}
            title="Log Out"
            className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors ml-1"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
};
