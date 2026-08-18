'use client';

import React from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase';
import { Expense, Reimbursement } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import {
  DollarSign, Clock, CheckCircle2, CreditCard,
  AlertTriangle, PlusCircle, CheckSquare, TrendingUp, ArrowUpRight
} from 'lucide-react';
import Link from 'next/link';

/* ─── Stat Tile ─────────────────────────────────────────── */
function Stat({
  label, value, note, noteColor = 'var(--ink-muted)',
  icon: Icon, iconColor, accentBar
}: {
  label: string; value: string | number; note?: string; noteColor?: string;
  icon: any; iconColor: string; accentBar?: string;
}) {
  return (
    <div className="stat-tile">
      {accentBar && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: accentBar, borderRadius: '12px 12px 0 0'
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: accentBar ? 8 : 0 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            {label}
          </p>
          <p style={{ fontSize: 22, fontWeight: 750, color: 'var(--ink-heavy)', lineHeight: 1, letterSpacing: '-0.03em' }}>
            {value}
          </p>
          {note && <p style={{ fontSize: 11, color: noteColor, marginTop: 5 }}>{note}</p>}
        </div>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${iconColor}14`
        }}>
          <Icon size={16} color={iconColor} />
        </div>
      </div>
    </div>
  );
}

/* ─── Dashboard ─────────────────────────────────────────── */
export default function DashboardPage() {
  const { activeOrg, activeRole, user } = useAuth();
  const orgId = activeOrg?.id;

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['dash-exp', orgId, activeRole, user?.id],
    queryFn: async () => {
      if (!orgId) return [];
      const sb = createClient();
      let q = sb.from('expenses').select('*').eq('organisation_id', orgId)
        .order('created_at', { ascending: false }).limit(15);
      if (activeRole === 'MEMBER') q = q.eq('submitted_by', user?.id);
      const { data, error } = await q;
      if (error) throw error;
      return data.map((d: any) => ({
        id: d.id, organisationId: d.organisation_id, submittedBy: d.submitted_by,
        submitterEmail: d.submitter_email, submitterName: d.submitter_name,
        amount: d.amount, currency: d.currency, category: d.category,
        merchant: d.merchant, expenseDate: d.expense_date, description: d.description,
        status: d.status, receipt: d.receipt, duplicateWarning: d.duplicate_warning,
        createdAt: d.created_at, updatedAt: d.updated_at
      })) as Expense[];
    },
    enabled: !!orgId
  });

  const { data: reimbursements = [] } = useQuery({
    queryKey: ['dash-reimb', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const sb = createClient();
      const { data, error } = await sb.from('reimbursements').select('*')
        .eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data.map((d: any) => ({
        id: d.id, expenseId: d.expense_id, amount: d.amount, currency: d.currency,
        status: d.status, providerReference: d.provider_reference,
        attemptCount: d.attempt_count, createdAt: d.created_at, completedAt: d.completed_at
      })) as Reimbursement[];
    },
    enabled: !!orgId && ['ADMIN', 'FINANCE'].includes(activeRole || '')
  });

  const totalSpend = expenses
    .filter(e => ['REIMBURSED', 'APPROVED', 'REFUND_PENDING'].includes(e.status))
    .reduce((s, e) => s + (e.amount || 0), 0);
  const pending = expenses.filter(e => ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED'].includes(e.status));
  const approved = expenses.filter(e => e.status === 'APPROVED');
  const approvedAmt = approved.reduce((s, e) => s + (e.amount || 0), 0);
  const failedRefunds = reimbursements.filter(r => r.status === 'FAILED');
  const completedRefunds = reimbursements.filter(r => r.status === 'COMPLETED');
  const recent = expenses.slice(0, 12);

  return (
    <div style={{ width: '100%' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 720, color: 'var(--ink-heavy)', letterSpacing: '-0.02em', margin: 0 }}>
            Overview
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 4 }}>
            {pending.length > 0
              ? `${pending.length} expense${pending.length > 1 ? 's' : ''} waiting for review`
              : 'Everything is up to date'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['ADMIN', 'REVIEWER'].includes(activeRole || '') && pending.length > 0 && (
            <Link href="/approvals">
              <button style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--amber-bg)', color: 'var(--amber)',
                border: '1px solid #e8c97040', fontSize: 13, fontWeight: 600
              }}>
                <Clock size={14} /> Review {pending.length}
              </button>
            </Link>
          )}
          <Link href="/expenses/new">
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              background: 'var(--accent)', color: '#fff',
              border: 'none', fontSize: 13, fontWeight: 600,
              boxShadow: '0 2px 8px rgba(26,122,74,0.25)'
            }}>
              <PlusCircle size={14} /> Submit Expense
            </button>
          </Link>
        </div>
      </div>

      {/* ── Failed alert ── */}
      {failedRefunds.length > 0 && ['ADMIN', 'FINANCE'].includes(activeRole || '') && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 18px', borderRadius: 10, marginBottom: 20,
          background: 'var(--red-bg)', border: '1px solid #e8b4b440'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={15} color="var(--red)" />
            <div>
              <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--red)' }}>
                {failedRefunds.length} failed reimbursement{failedRefunds.length > 1 ? 's' : ''}
              </span>
              <span style={{ fontSize: 12, color: '#b94040aa', marginLeft: 6 }}>— payment gateway rejected the payout</span>
            </div>
          </div>
          <Link href="/reimbursements">
            <button style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 650,
              background: 'var(--red)', color: '#fff', cursor: 'pointer', border: 'none'
            }}>
              Retry now
            </button>
          </Link>
        </div>
      )}

      {/* ── Stats grid — all 6 in one row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
        <Stat label="Total Spend" value={formatCurrency(totalSpend, activeOrg?.currency)}
          note="settled & approved" icon={DollarSign} iconColor="var(--accent)" accentBar="var(--accent)" />
        <Stat label="Awaiting Review" value={pending.length}
          note={pending.length > 0 ? 'needs attention' : 'all clear'}
          noteColor={pending.length > 0 ? 'var(--amber)' : 'var(--accent)'}
          icon={Clock} iconColor="var(--amber)" accentBar="var(--amber)" />
        <Stat label="Ready to Pay" value={formatCurrency(approvedAmt, activeOrg?.currency)}
          note={`${approved.length} claim${approved.length !== 1 ? 's' : ''} approved`}
          noteColor="var(--sky)" icon={CreditCard} iconColor="var(--sky)" accentBar="var(--sky)" />
        <Stat label="Completed Payouts" value={completedRefunds.length}
          note="settled via bank" noteColor="var(--accent)"
          icon={CheckCircle2} iconColor="var(--accent)" accentBar="var(--accent)" />
        <Stat label="Failed Refunds" value={failedRefunds.length}
          note={failedRefunds.length > 0 ? 'retry needed' : 'no failures'}
          noteColor={failedRefunds.length > 0 ? 'var(--red)' : 'var(--ink-muted)'}
          icon={AlertTriangle} iconColor={failedRefunds.length > 0 ? 'var(--red)' : 'var(--ink-faint)'}
          accentBar={failedRefunds.length > 0 ? 'var(--red)' : undefined} />
        <Stat label="Total Claims" value={expenses.length}
          note="this cycle" icon={TrendingUp} iconColor="var(--ink-muted)" />
      </div>

      {/* ── Main panels — stretch to fill height ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

        {/* Recent Expenses */}
        <div className="surface-card">
          <div className="card-header">
            <div>
              <p style={{ fontSize: 13, fontWeight: 650, color: 'var(--ink-heavy)' }}>Recent Expenses</p>
              <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 1 }}>{recent.length} latest submissions</p>
            </div>
            <Link href="/expenses" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
              View all <ArrowUpRight size={13} />
            </Link>
          </div>

          {isLoading ? (
            <div style={{ padding: '32px 20px' }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 10, width: '40%' }} />
                  </div>
                  <div className="skeleton" style={{ height: 12, width: 60 }} />
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)' }}>No expenses yet</p>
              <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 4 }}>Submit your first claim to get started</p>
              <Link href="/expenses/new">
                <button style={{
                  marginTop: 16, padding: '7px 16px', borderRadius: 7, cursor: 'pointer',
                  background: 'var(--accent-light)', color: 'var(--accent)',
                  border: 'none', fontSize: 12, fontWeight: 650
                }}>
                  + New Expense
                </button>
              </Link>
            </div>
          ) : recent.map(exp => (
            <Link key={exp.id} href={`/expenses/${exp.id}`} className="expense-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: 'var(--bg)', color: 'var(--ink-muted)',
                  fontSize: 11, fontWeight: 750,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  letterSpacing: '-0.01em'
                }}>
                  {exp.merchant?.substring(0, 2).toUpperCase() || 'EX'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-heavy)' }}>{exp.merchant}</span>
                    {exp.duplicateWarning?.isDuplicate && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                        background: '#fef3cd', color: '#c47f17'
                      }}>⚠ dup</span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>
                    {exp.category} · {formatDate(exp.expenseDate)}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Badge status={exp.status} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-heavy)', minWidth: 70, textAlign: 'right' }}>
                  {formatCurrency(exp.amount, exp.currency)}
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Review queue */}
          <div className="surface-card">
            <div className="card-header">
              <p style={{ fontSize: 13, fontWeight: 650, color: 'var(--ink-heavy)' }}>Review Queue</p>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: pending.length > 0 ? 'var(--amber-bg)' : 'var(--accent-light)',
                color: pending.length > 0 ? 'var(--amber)' : 'var(--accent)'
              }}>
                {pending.length}
              </span>
            </div>
            {pending.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <CheckCircle2 size={28} color="var(--accent)" style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)' }}>Queue is empty</p>
              </div>
            ) : pending.slice(0, 5).map(exp => (
              <Link key={exp.id} href={`/expenses/${exp.id}`} className="expense-row" style={{ padding: '11px 16px' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 650, color: 'var(--ink-heavy)' }}>{exp.merchant}</p>
                  <p style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>
                    {exp.submitterName || exp.submitterEmail}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 12, fontWeight: 750, color: 'var(--ink-heavy)' }}>
                    {formatCurrency(exp.amount, exp.currency)}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginTop: 2 }}>Review →</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Quick actions */}
          <div style={{
            background: 'var(--rail)', borderRadius: 12, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.04)'
          }}>
            <div style={{ padding: '13px 16px 8px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>
                Quick Actions
              </p>
            </div>
            {[
              { href: '/expenses/new', label: 'New Expense', sub: 'Submit a claim', color: 'var(--accent)', Icon: PlusCircle },
              ...(['ADMIN', 'REVIEWER'].includes(activeRole || '') ? [{ href: '/approvals', label: 'Review Queue', sub: 'Approve or reject', color: 'var(--amber)', Icon: CheckSquare }] : []),
              ...(['ADMIN', 'FINANCE'].includes(activeRole || '') ? [{ href: '/reimbursements', label: 'Process Payouts', sub: 'Reimburse claims', color: 'var(--sky)', Icon: CreditCard }] : [])
            ].map(action => (
              <Link key={action.href} href={action.href} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', textDecoration: 'none',
                borderTop: '1px solid rgba(255,255,255,0.04)',
                transition: 'background 0.1s'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                  background: `${action.color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <action.Icon size={13} color={action.color} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 650, color: '#fff', lineHeight: 1 }}>{action.label}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{action.sub}</p>
                </div>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.15)' }}>›</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
