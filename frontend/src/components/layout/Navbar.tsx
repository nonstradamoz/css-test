'use client';

import React from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { Menu, ShieldCheck } from 'lucide-react';

const ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  ADMIN:    { label: 'Admin',    color: '#1a7a4a', bg: '#e8f5ee' },
  FINANCE:  { label: 'Finance',  color: '#c47f17', bg: '#fdf6e3' },
  REVIEWER: { label: 'Reviewer', color: '#2c7eb8', bg: '#edf6fd' },
  EMPLOYEE: { label: 'Employee', color: '#6b7280', bg: '#f3f4f6' }
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
    <header className="px-4 md:px-7 py-3 flex items-center justify-between sticky top-0 z-30 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-black/5 dark:border-white/5 transition-colors">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Drawer Trigger */}
        <button
          type="button"
          onClick={onToggleMobileMenu}
          aria-label="Toggle navigation menu"
          className="md:hidden p-2 -ml-1 text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <Menu size={22} />
        </button>

        <div>
          <p className="text-sm font-semibold text-neutral-800 leading-tight">
            {greet()}{name ? `, ${name}` : ''}
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">
            ClearSpend · {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </p>
        </div>
      </div>

      {badge && (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}30` }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: badge.color }} />
          {badge.label}
        </div>
      )}
    </header>
  );
};
