'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  LayoutDashboard, Receipt, PlusCircle, CheckSquare,
  CreditCard, AlertOctagon, Users, ScrollText, Settings,
  ShieldAlert, LogOut, ChevronDown, Building2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS: Record<string, { label: string; href: string; icon: any }[]> = {
  MEMBER: [
    { label: 'Dashboard',       href: '/dashboard',    icon: LayoutDashboard },
    { label: 'My Expenses',     href: '/expenses',     icon: Receipt },
    { label: 'Submit Expense',  href: '/expenses/new', icon: PlusCircle }
  ],
  REVIEWER: [
    { label: 'Dashboard',       href: '/dashboard',  icon: LayoutDashboard },
    { label: 'All Expenses',    href: '/expenses',   icon: Receipt },
    { label: 'Approvals Queue', href: '/approvals',  icon: CheckSquare }
  ],
  FINANCE: [
    { label: 'Dashboard',      href: '/dashboard',                    icon: LayoutDashboard },
    { label: 'Approved Claims', href: '/expenses?status=APPROVED',   icon: Receipt },
    { label: 'Reimbursements', href: '/reimbursements',              icon: CreditCard },
    { label: 'Failed Refunds', href: '/reimbursements?status=FAILED', icon: AlertOctagon },
    { label: 'Audit Logs',     href: '/audit-logs',                  icon: ScrollText }
  ],
  ADMIN: [
    { label: 'Dashboard',      href: '/dashboard',      icon: LayoutDashboard },
    { label: 'Expenses',       href: '/expenses',       icon: Receipt },
    { label: 'Approvals',      href: '/approvals',      icon: CheckSquare },
    { label: 'Reimbursements', href: '/reimbursements', icon: CreditCard },
    { label: 'Members',        href: '/members',        icon: Users },
    { label: 'Audit Logs',     href: '/audit-logs',     icon: ScrollText },
    { label: 'Settings',       href: '/settings',       icon: Settings }
  ]
};

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { activeRole, isSuperAdmin, user, activeOrg, userOrgs, switchOrg, signOut } = useAuth();

  const items = NAV_ITEMS[activeRole || 'ADMIN'] ?? NAV_ITEMS.ADMIN;
  const initials = user?.email?.substring(0, 2).toUpperCase() ?? 'U';
  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';

  const isActive = (href: string) =>
    pathname === href ||
    (href !== '/dashboard' && pathname.startsWith(href.split('?')[0]) && !href.includes('?'));

  return (
    <nav className="nav-rail">
      {/* Brand */}
      <div style={{ padding: '20px 14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldAlert size={20} color="var(--accent)" />
          <span style={{ fontSize: 16, fontWeight: 750, color: '#fff', letterSpacing: '-0.02em' }}>
            AmritaCRS
          </span>
        </div>
      </div>

      {/* Org Switcher */}
      {userOrgs.length > 0 && (
        <div style={{ padding: '0 10px 12px' }}>
          <div className="relative group" style={{ position: 'relative' }}>
            <button style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 500
            }}>
              <Building2 size={13} />
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeOrg?.name ?? 'Select org'}
              </span>
              <ChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
            </button>
            <div className="group-hover:block hidden" style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
              background: '#252319', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 8, overflow: 'hidden', zIndex: 50,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
            }}>
              {userOrgs.map(org => (
                <button
                  key={org.id}
                  onClick={() => switchOrg(org.id)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '8px 12px',
                    fontSize: 12, fontWeight: 500, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', background: 'transparent',
                    color: activeOrg?.id === org.id ? 'var(--accent-mid)' : 'rgba(255,255,255,0.55)',
                    borderBottom: '1px solid rgba(255,255,255,0.04)'
                  }}
                >
                  {org.name}
                  {activeOrg?.id === org.id && (
                    <span style={{ width: 5, height: 5, borderRadius: 99, background: 'var(--accent-mid)' }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Nav items */}
      <div style={{ padding: '0 10px', flex: 1 }}>
        <div className="nav-section-label">Menu</div>
        {items.map(item => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link key={item.label} href={item.href} className={cn('nav-item', active && 'active')}>
              <div className="nav-icon"><Icon size={14} /></div>
              {item.label}
            </Link>
          );
        })}

        {isSuperAdmin && (
          <>
            <div className="nav-section-label" style={{ color: 'rgba(167,139,250,0.35)' }}>System</div>
            <Link href="/superadmin" className={cn('nav-item', pathname.startsWith('/superadmin') && 'active')}>
              <div className="nav-icon" style={pathname.startsWith('/superadmin') ? { background: '#7c3aed' } : {}}>
                <ShieldAlert size={14} />
              </div>
              Platform Admin
            </Link>
          </>
        )}
      </div>

      {/* Footer: user */}
      <div style={{
        margin: '8px 10px 12px',
        padding: '10px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 99, flexShrink: 0,
            background: 'var(--accent)', color: '#fff',
            fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </div>
          </div>
          <button
            onClick={() => signOut()}
            title="Sign out"
            style={{
              padding: 5, borderRadius: 6, background: 'transparent',
              color: 'rgba(255,255,255,0.25)', cursor: 'pointer',
              flexShrink: 0, transition: 'color 0.12s, background 0.12s'
            }}
            onMouseEnter={e => { (e.currentTarget as any).style.color = '#f87171'; (e.currentTarget as any).style.background = 'rgba(248,113,113,0.1)'; }}
            onMouseLeave={e => { (e.currentTarget as any).style.color = 'rgba(255,255,255,0.25)'; (e.currentTarget as any).style.background = 'transparent'; }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </nav>
  );
};
