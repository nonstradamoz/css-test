'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight, ShieldAlert, Building2, Workflow,
  CreditCard, ScrollText, BarChart3, Receipt, CheckSquare
} from 'lucide-react';

const FEATURES = [
  {
    icon: Building2,
    title: 'Multi-org support',
    desc: 'Manage multiple companies or subsidiaries from one login. Strict data isolation between every workspace.'
  },
  {
    icon: Workflow,
    title: 'Approval workflows',
    desc: 'Role-based chains: Member → Reviewer → Finance → Admin. Every step tracked, nothing skipped.'
  },
  {
    icon: CreditCard,
    title: 'Automated payouts',
    desc: 'Approve once, pay instantly. Built-in idempotency prevents double payouts even under retries.'
  },
  {
    icon: ShieldAlert,
    title: 'RBAC security',
    desc: 'Admin, Finance, Reviewer, Member. Each role sees exactly what they need and nothing more.'
  },
  {
    icon: ScrollText,
    title: 'Immutable audit trail',
    desc: 'Every action — approval, rejection, payout — is append-only logged for compliance teams.'
  },
  {
    icon: Receipt,
    title: 'Duplicate detection',
    desc: 'Fuzzy matching catches near-duplicate expense claims before they reach a reviewer.'
  }
];

const STATS = [
  { value: '4', label: 'Roles' },
  { value: '∞', label: 'Orgs' },
  { value: '100%', label: 'Audit coverage' },
  { value: '0', label: 'Double payouts' }
];

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#131210', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Navbar ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 60,
        background: 'rgba(19,18,16,0.85)', backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7,
            background: '#1a7a4a',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ShieldAlert size={15} color="#fff" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 750, letterSpacing: '-0.02em', color: '#fff' }}>
            AmritaCRS
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/login" style={{
            padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 550,
            color: 'rgba(255,255,255,0.55)', textDecoration: 'none',
            transition: 'color 0.15s'
          }}>
            Sign in
          </Link>
          <Link href="/signup" style={{
            padding: '7px 18px', borderRadius: 7, fontSize: 13, fontWeight: 650,
            background: '#1a7a4a', color: '#fff', textDecoration: 'none',
            boxShadow: '0 2px 8px rgba(26,122,74,0.3)',
            transition: 'background 0.15s'
          }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        padding: '100px 40px 80px', maxWidth: 1100, margin: '0 auto'
      }}>
        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: -80, opacity: 0.22,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '30px 30px', pointerEvents: 'none'
        }} />

        {/* Glow */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 700, height: 400,
          background: 'radial-gradient(ellipse at center top, rgba(26,122,74,0.16) 0%, transparent 65%)',
          pointerEvents: 'none'
        }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 780, margin: '0 auto' }}>
          {/* Tag */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 99, marginBottom: 28,
            background: 'rgba(26,122,74,0.12)', border: '1px solid rgba(26,122,74,0.25)',
            fontSize: 12, fontWeight: 650, color: '#2fa866', letterSpacing: '0.02em'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: '#2fa866' }} />
            Enterprise Expense Management
          </div>

          <h1 style={{
            fontSize: 'clamp(38px, 6vw, 68px)',
            fontWeight: 800,
            color: '#fff',
            lineHeight: 1.1,
            letterSpacing: '-0.04em',
            margin: '0 0 24px'
          }}>
            Your entire expense<br />
            <span style={{
              background: 'linear-gradient(135deg, #2fa866 0%, #7dd3b0 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              lifecycle, automated.
            </span>
          </h1>

          <p style={{
            fontSize: 17, lineHeight: 1.7,
            color: 'rgba(255,255,255,0.45)',
            maxWidth: 560, margin: '0 auto 40px'
          }}>
            Submit, review, approve, and reimburse expenses with complete audit trails,
            duplicate detection, and multi-org RBAC — built for finance teams that mean business.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Link href="/signup" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '12px 26px', borderRadius: 9, fontSize: 14, fontWeight: 650,
              background: '#1a7a4a', color: '#fff', textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(26,122,74,0.35)'
            }}>
              Create your workspace <ArrowRight size={15} />
            </Link>
            <Link href="/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '12px 22px', borderRadius: 9, fontSize: 14, fontWeight: 550,
              background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)',
              textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)'
            }}>
              Sign in →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '32px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0
      }}>
        {STATS.map((s, i) => (
          <div key={i} style={{
            flex: 1, maxWidth: 220, textAlign: 'center',
            borderRight: i < STATS.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
            padding: '0 32px'
          }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6, fontWeight: 500 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Features ── */}
      <section style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 56, maxWidth: 480 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#2fa866', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
            What's included
          </p>
          <h2 style={{ fontSize: 36, fontWeight: 750, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.15, margin: 0 }}>
            Everything your finance team needs
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', marginTop: 14, lineHeight: 1.6 }}>
            No duct tape. No spreadsheets. A real system built on proper roles, state machines, and an audit trail you can trust.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{
              padding: '28px 28px',
              background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: i === 0 ? '12px 0 0 0' : i === 2 ? '0 12px 0 0' : i === 3 ? '0 0 0 12px' : i === 5 ? '0 0 12px 0' : 0,
              transition: 'background 0.2s'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(26,122,74,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent')}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8, marginBottom: 18,
                background: 'rgba(26,122,74,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <f.icon size={17} color="#2fa866" />
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6, margin: 0 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Role breakdown ── */}
      <section style={{ padding: '0 40px 80px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, padding: '44px 44px', display: 'grid',
          gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center'
        }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#2fa866', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              Role-based access
            </p>
            <h2 style={{ fontSize: 28, fontWeight: 750, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.2, margin: '0 0 16px' }}>
              The right person sees the right thing
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, margin: '0 0 28px' }}>
              Four roles, each with exactly the access they need. Members submit. Reviewers approve.
              Finance pays out. Admins see everything.
            </p>
            <Link href="/signup" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 650,
              background: '#1a7a4a', color: '#fff', textDecoration: 'none'
            }}>
              Get started free <ArrowRight size={14} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { role: 'Admin',    color: '#1a7a4a', bg: 'rgba(26,122,74,0.12)',  actions: ['Full access · Manage members · Settings'] },
              { role: 'Finance',  color: '#c47f17', bg: 'rgba(196,127,23,0.1)',  actions: ['Process payouts · View audit logs'] },
              { role: 'Reviewer', color: '#2c7eb8', bg: 'rgba(44,126,184,0.1)', actions: ['Approve / reject · Request changes'] },
              { role: 'Member',   color: '#6b7280', bg: 'rgba(107,114,128,0.1)', actions: ['Submit expenses · Track status'] }
            ].map(r => (
              <div key={r.role} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 9,
                background: r.bg, border: `1px solid ${r.color}25`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 99, flexShrink: 0,
                    background: r.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <CheckSquare size={13} color="#fff" />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{r.role}</span>
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r.actions[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        padding: '0 40px 100px', maxWidth: 1100, margin: '0 auto', textAlign: 'center'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(26,122,74,0.15) 0%, rgba(26,122,74,0.05) 100%)',
          border: '1px solid rgba(26,122,74,0.2)',
          borderRadius: 20, padding: '64px 40px'
        }}>
          <h2 style={{ fontSize: 38, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: '0 0 16px' }}>
            Ready to clean up your expense mess?
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', margin: '0 0 36px' }}>
            Create your workspace in 30 seconds. No credit card required.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Link href="/signup" style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '13px 30px', borderRadius: 10, fontSize: 15, fontWeight: 700,
              background: '#1a7a4a', color: '#fff', textDecoration: 'none',
              boxShadow: '0 4px 24px rgba(26,122,74,0.4)'
            }}>
              Create workspace <ArrowRight size={16} />
            </Link>
            <Link href="/login" style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '13px 24px', borderRadius: 10, fontSize: 15, fontWeight: 550,
              background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)',
              textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)'
            }}>
              I already have an account
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '24px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1a7a4a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={16} color="#fff" />
          </div>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 550 }}>AmritaCRS</span>
        </div>
        <div style={{ textAlign: 'center', marginTop: 64, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
          © {new Date().getFullYear()} AmritaCRS · Enterprise Finance Platform
        </div>
      </footer>
    </div>
  );
}
