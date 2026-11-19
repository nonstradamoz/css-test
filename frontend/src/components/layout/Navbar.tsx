'use client';

import React from 'react';
import { useAuth } from '@/components/providers/AuthProvider';

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

export const Navbar: React.FC = () => {
  const { user, role } = useAuth();
  const badge = role ? ROLE_BADGE[role] : null;
  const name = user?.full_name || user?.email?.split('@')[0] || '';

  return (
    <header className="px-7 py-3 flex items-center justify-between sticky top-0 z-40 bg-[rgba(244,243,240,0.82)] backdrop-blur-md border-b border-black/5">
      <div>
        <p className="text-sm font-semibold text-neutral-800 leading-tight">
          {greet()}{name ? `, ${name}` : ''}
        </p>
        <p className="text-xs text-neutral-500 mt-1">
          ClearSpend · {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
        </p>
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
