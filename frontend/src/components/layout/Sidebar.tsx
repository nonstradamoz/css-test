'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  LayoutDashboard, Receipt, PlusCircle, CheckSquare,
  CreditCard, Users, ScrollText, Settings,
  ShieldCheck, LogOut, User, X
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

// Bottom navigation items for compact mobile screen
const MOBILE_BOTTOM_NAV: Record<string, { label: string; href: string; icon: any }[]> = {
  EMPLOYEE: [
    { label: 'Home',     href: '/dashboard',      icon: LayoutDashboard },
    { label: 'Expenses', href: '/expenses',       icon: Receipt },
    { label: 'Submit',   href: '/expenses/new',   icon: PlusCircle },
    { label: 'Payouts',  href: '/reimbursements', icon: CreditCard },
    { label: 'Profile',  href: '/profile',        icon: User }
  ],
  REVIEWER: [
    { label: 'Home',      href: '/dashboard',      icon: LayoutDashboard },
    { label: 'Expenses',  href: '/expenses',       icon: Receipt },
    { label: 'Approvals', href: '/approvals',      icon: CheckSquare },
    { label: 'Payouts',   href: '/reimbursements', icon: CreditCard },
    { label: 'Profile',   href: '/profile',        icon: User }
  ],
  FINANCE: [
    { label: 'Home',      href: '/dashboard',      icon: LayoutDashboard },
    { label: 'Expenses',  href: '/expenses',       icon: Receipt },
    { label: 'Approvals', href: '/approvals',      icon: CheckSquare },
    { label: 'Payouts',   href: '/reimbursements', icon: CreditCard },
    { label: 'Profile',   href: '/profile',        icon: User }
  ],
  ADMIN: [
    { label: 'Home',      href: '/dashboard',      icon: LayoutDashboard },
    { label: 'Expenses',  href: '/expenses',       icon: Receipt },
    { label: 'Approvals', href: '/approvals',      icon: CheckSquare },
    { label: 'Users',     href: '/users',          icon: Users },
    { label: 'Profile',   href: '/profile',        icon: User }
  ]
};

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onCloseMobile }) => {
  const pathname = usePathname();
  const { role, user, logout } = useAuth();

  const currentRole = (role as string) || 'EMPLOYEE';
  const items = NAV_ITEMS[currentRole] ?? NAV_ITEMS.EMPLOYEE;
  const bottomItems = MOBILE_BOTTOM_NAV[currentRole] ?? MOBILE_BOTTOM_NAV.EMPLOYEE;
  const initials = user?.full_name ? user.full_name.substring(0, 2).toUpperCase() : 'U';
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'User';

  const isActive = (href: string) =>
    pathname === href ||
    (href !== '/dashboard' && pathname.startsWith(href.split('?')[0]) && !href.includes('?'));

  // Close drawer on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen && onCloseMobile) {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  // Lock background scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const renderNavLinks = (isMobileDrawer = false) => (
    <div className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => {
              if (isMobileDrawer && onCloseMobile) onCloseMobile();
            }}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
              active
                ? "bg-neutral-800 text-white font-semibold shadow-sm"
                : "text-neutral-400 hover:text-white hover:bg-neutral-800/60"
            )}
          >
            <Icon size={18} className={active ? "text-brand-400" : "text-neutral-400"} />
            {item.label}
          </Link>
        );
      })}
    </div>
  );

  const renderUserFooter = () => (
    <div className="pt-4 border-t border-neutral-800">
      <div className="flex items-center justify-between px-2 py-2">
        <Link
          href="/profile"
          onClick={() => {
            if (onCloseMobile) onCloseMobile();
          }}
          className="flex items-center gap-2.5 overflow-hidden group hover:opacity-90 transition-opacity"
        >
          <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-xs shrink-0 group-hover:ring-2 group-hover:ring-brand-400">
            {initials}
          </div>
          <div className="truncate">
            <p className="text-sm font-medium text-white truncate leading-tight group-hover:text-brand-400 transition-colors">
              {displayName}
            </p>
            <p className="text-xs text-neutral-400 truncate">{user?.email}</p>
          </div>
        </Link>
        <button
          onClick={() => logout()}
          title="Log Out"
          className="p-1.5 text-neutral-400 hover:text-crimson-400 hover:bg-neutral-800 rounded-lg transition-colors ml-1 focus:outline-none"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Desktop Sidebar */}
      <nav className="hidden md:flex w-64 bg-neutral-900 text-neutral-200 h-screen sticky top-0 flex-col justify-between p-4 shrink-0 z-30 overflow-y-auto">
        <div>
          {/* Brand */}
          <div className="flex items-center gap-3 px-2 py-4 mb-4 border-b border-neutral-800">
            <div className="p-2 bg-brand-500/15 text-brand-400 rounded-xl">
              <ShieldCheck size={22} />
            </div>
            <div>
              <span className="font-bold text-white text-base tracking-tight block">
                ClearSpend
              </span>
              <span className="text-xs text-neutral-400">Refund & Expense</span>
            </div>
          </div>

          {/* Navigation Items */}
          {renderNavLinks(false)}
        </div>

        {/* User Footer */}
        {renderUserFooter()}
      </nav>

      {/* 2. Mobile Drawer Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden transition-opacity animate-in fade-in duration-200"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* 3. Mobile Navigation Drawer Sheet */}
      <nav
        role="dialog"
        aria-label="Mobile Navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-neutral-900 text-neutral-200 flex flex-col justify-between p-4 shadow-2xl transition-transform duration-300 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div>
          {/* Header with Close Button */}
          <div className="flex items-center justify-between px-2 py-4 mb-4 border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-500/15 text-brand-400 rounded-xl">
                <ShieldCheck size={22} />
              </div>
              <div>
                <span className="font-bold text-white text-base tracking-tight block">
                  ClearSpend
                </span>
                <span className="text-xs text-neutral-400">Refund & Expense</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors focus:outline-none"
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation Items */}
          {renderNavLinks(true)}
        </div>

        {/* User Footer */}
        {renderUserFooter()}
      </nav>

      {/* 4. Mobile Bottom Sticky Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-t border-neutral-200 dark:border-neutral-800 px-3 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] flex justify-around items-center shadow-lg">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[10px] font-medium transition-colors",
                active
                  ? "text-brand-500 font-bold"
                  : "text-neutral-500 hover:text-neutral-900"
              )}
            >
              <Icon size={20} className={active ? "text-brand-500 mb-0.5" : "text-neutral-400 mb-0.5"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
};
