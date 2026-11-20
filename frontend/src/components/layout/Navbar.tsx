'use client';

import React from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Menu, ShieldCheck } from 'lucide-react';

const ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  ADMIN:    { label: 'Admin',    color: '#4c82c3', bg: '#edf4fc' },
  FINANCE:  { label: 'Finance',  color: '#b87e04', bg: '#fff9e6' },
  REVIEWER: { label: 'Reviewer', color: '#3b6fae', bg: '#edf4fc' },
  EMPLOYEE: { label: 'Employee', color: '#666c7a', bg: '#f6f5f0' }
};

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

interface NavbarProps {
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleMobileMenu }) => {
  const { user, role } = useAuth();
  const badge = role ? ROLE_BADGE[role] : null;
  const name = user?.full_name || user?.email?.split('@')[0] || '';

  return (
    <header className="px-4 md:px-7 py-3 flex items-center justify-between sticky top-0 z-30 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 transition-colors min-h-[56px]">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile Hamburger Drawer Trigger */}
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Toggle navigation menu"
          className="md:hidden p-2 -ml-1 text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 shrink-0"
        >
          <Menu size={22} />
        </button>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-800 leading-tight truncate">
            {greet()}{name ? `, ${name}` : ''}
          </p>
          <p className="text-xs text-neutral-500 mt-0.5 hidden sm:block">
            ClearSpend · {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </p>
        </div>
      </div>

      {badge && (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ml-2"
          style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}30` }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: badge.color }} />
          {badge.label}
        </div>
      )}
    </header>
  );
};
