'use client';

import React from 'react';
import { useAuth } from '@/components/providers/AuthProvider';

const ROLE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  ADMIN:    { label: 'Admin',    color: '#1a7a4a', bg: '#e8f5ee' },
  FINANCE:  { label: 'Finance',  color: '#c47f17', bg: '#fdf6e3' },
  REVIEWER: { label: 'Reviewer', color: '#2c7eb8', bg: '#edf6fd' },
  MEMBER:   { label: 'Member',   color: '#6b7280', bg: '#f3f4f6' }
};

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const Navbar: React.FC = () => {
  const { user, activeOrg, activeRole } = useAuth();
  const badge = activeRole ? ROLE_BADGE[activeRole] : null;
  const name = user?.user_metadata?.display_name || user?.email?.split('@')[0] || '';

  return (
    <header style={{
      padding: '12px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'rgba(244,243,240,0.82)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
      position: 'sticky',
      top: 0,
      zIndex: 40
    }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-heavy)', lineHeight: 1 }}>
          {greet()}{name ? `, ${name}` : ''}
        </p>
        <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3 }}>
          {activeOrg?.name}
          {activeOrg?.currency ? ` · ${activeOrg.currency}` : ''}
          {' · '}
          {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
        </p>
      </div>

      {badge && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 99,
          background: badge.bg, color: badge.color,
          fontSize: 11, fontWeight: 650, letterSpacing: '0.01em',
          border: `1px solid ${badge.color}30`
        }}>
          <span style={{ width: 5, height: 5, borderRadius: 99, background: badge.color }} />
          {badge.label}
        </div>
      )}
    </header>
  );
};
