'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Workflow, CreditCard, ScrollText,
  Receipt, Users, ArrowRight, Lock, Database,
  Cpu, CheckCircle2, ChevronRight, Server, FileText
} from 'lucide-react';

const ARCHITECTURE_SECTIONS = [
  {
    id: 'rbac',
    title: 'Role-Based Access Control (RBAC)',
    icon: Users,
    description: 'Direct three-tier permission matrix governing actions across the financial lifecycle.',
    details: [
      { role: 'ADMIN', color: '#8b5cf6', desc: 'Full control over users, settings, thresholds, audit trails, and approvals.' },
      { role: 'REVIEWER', color: '#10b981', desc: 'Authorizes Tier-1 & Tier-2 reviews, requests changes, and executes verified reimbursements.' },
      { role: 'EMPLOYEE', color: '#6b7280', desc: 'Creates claims, uploads receipts, manages bank profile, and tracks payouts.' }
    ]
  },
  {
    id: 'approval-tiers',
    title: 'Multi-Tiered Financial State Machine',
    icon: Workflow,
    description: 'Dynamic approval routing governed by global company threshold parameters.',
    details: [
      { label: 'Single-Tier Routing (< Threshold)', desc: 'Claims below the company threshold (default ₹25,000) require approval only from a designated Reviewer or Admin before becoming payable.' },
      { label: 'Two-Tier Escalation (≥ Threshold)', desc: 'High-value claims automatically escalate: Tier-1 Reviewer approval transitions claim to UNDER_REVIEW, requiring mandatory Tier-2 sign-off.' },
      { label: 'Change Request Cycle', desc: 'Reviewers can reject or request modifications. Submissions are returned to the employee with actionable audit comments.' }
    ]
  },
  {
    id: 'idempotency',
    title: 'Disbursement Safety & Transaction Verification',
    icon: Lock,
    description: 'Zero duplicate disbursements through distributed locks and verified transaction tracking.',
    details: [
      { label: 'Distributed Locks', desc: 'Acquires atomic locks on claim IDs during settlement to prevent simultaneous double payouts under network retries.' },
      { label: 'Mandatory Transfer Transaction ID', desc: 'Reviewers must supply the bank transfer transaction ID (UTR / IMPS Ref) before reimbursement completes.' },
      { label: 'Bank Profile Verification', desc: 'Employees must have configured bank details in their profile before claim submission is permitted.' }
    ]
  },
  {
    id: 'storage',
    title: 'Cloudflare R2 Object Storage',
    icon: Database,
    description: 'Zero-egress fee private cloud storage for sensitive receipts and invoices.',
    details: [
      { label: 'Pre-Signed Direct Uploads', desc: 'Browser uploads receipts directly to Cloudflare R2 via secure pre-signed PUT URLs, eliminating backend memory bottlenecks.' },
      { label: 'Pre-Signed Download Access', desc: 'Files are private with time-limited authenticated access URLs for reviewers and compliance auditors.' },
      { label: 'Duplicate Receipt Detection', desc: 'Checksum hashing detects identical invoices submitted across different claims or users.' }
    ]
  }
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('rbac');

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Header Bar */}
      <header className="sticky top-0 z-50 bg-neutral-900/80 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <ShieldCheck size={22} />
            </div>
            <div>
              <span className="font-bold text-white text-base tracking-tight">ClearSpend</span>
              <span className="text-xs text-neutral-400 ml-2 border-l border-neutral-700 pl-2 hidden sm:inline">System Documentation & Features</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-neutral-400 hover:text-white transition-colors hidden sm:inline-block"
            >
              Swagger API Docs ↗
            </a>
            <Link
              href="/"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition-colors shadow-sm inline-flex items-center gap-1.5"
            >
              Open Portal <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-7xl mx-auto px-6 py-12 text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-xs font-semibold">
          <Cpu size={14} /> Expense & Refund Platform
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight max-w-3xl mx-auto">
          ClearSpend Expense & Refund Management System
        </h1>
        <p className="text-sm md:text-base text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          Self-hosted, high-performance architecture powered by Python FastAPI, PostgreSQL 16, Redis 7, Celery, and Next.js 16.
        </p>
      </div>

      {/* Content Layout */}
      <div className="max-w-7xl mx-auto px-6 pb-20 grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Navigation Sidebar */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2 px-3">
            Core Modules
          </p>
          {ARCHITECTURE_SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const isSelected = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-neutral-800 text-white font-semibold'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={16} className={isSelected ? 'text-emerald-400' : 'text-neutral-500'} />
                  <span>{sec.title}</span>
                </div>
                {isSelected && <ChevronRight size={14} className="text-emerald-400" />}
              </button>
            );
          })}

          <div className="pt-6">
            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl space-y-2">
              <p className="text-xs font-bold text-white">Interactive API Specs</p>
              <p className="text-xs text-neutral-400">OpenAPI schema auto-synchronized with Next.js TypeScript types.</p>
              <a
                href="http://localhost:8000/docs"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-emerald-400 hover:underline block pt-1"
              >
                Explore FastAPI Swagger →
              </a>
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="md:col-span-3 space-y-6">
          {ARCHITECTURE_SECTIONS.filter((s) => s.id === activeSection).map((sec) => (
            <div key={sec.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">{sec.title}</h2>
                <p className="text-sm text-neutral-400 mt-1">{sec.description}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 pt-2">
                {sec.details.map((item: any, idx: number) => (
                  <div key={idx} className="p-5 bg-neutral-950/60 border border-neutral-800/80 rounded-xl space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <h3 className="text-sm font-bold text-white">
                        {item.role ? `Role: ${item.role}` : item.label}
                      </h3>
                    </div>
                    <p className="text-xs text-neutral-400 leading-relaxed pl-4">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Quick Technical Summary */}
          <div className="bg-neutral-900/50 border border-neutral-800/60 rounded-2xl p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-xs text-neutral-500 font-semibold uppercase">API Engine</p>
              <p className="text-sm font-bold text-white mt-1">FastAPI 0.110</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 font-semibold uppercase">Database</p>
              <p className="text-sm font-bold text-white mt-1">PostgreSQL 16</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 font-semibold uppercase">Task Queue</p>
              <p className="text-sm font-bold text-white mt-1">Redis 7 + Celery</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 font-semibold uppercase">Frontend</p>
              <p className="text-sm font-bold text-white mt-1">Next.js 16 + React 19</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
