import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { ArrowRight, BarChart3, ShieldCheck, Building2, Workflow, CreditCard, Banknote } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-primary-500 selection:text-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="bg-primary-600 text-white p-1.5 rounded-lg">
                <Banknote className="w-5 h-5" />
              </div>
              <span className="font-bold text-xl text-slate-900 tracking-tight">Amrita CRS</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                Sign In
              </Link>
              <Link href="/signup">
                <Button variant="primary" size="sm">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-grow">
        <div className="relative overflow-hidden bg-white">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiIGZpbGw9Im5vbmUiLz4KPHBhdGggZD0iTTAgMGg0MHYxSDB6bTAgNDBoMXYtNDBoLTEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNSkiLz4KPC9zdmc+')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-40"></div>
          
          <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-primary-50/50 to-transparent"></div>
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-32">
            <div className="text-center max-w-3xl mx-auto">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 border border-primary-100 text-primary-600 text-xs font-semibold uppercase tracking-wider mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
                </span>
                Enterprise Grade
              </div>
              <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-8">
                Automate your entire <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-indigo-600">expense lifecycle</span>.
              </h1>
              <p className="text-lg md:text-xl text-slate-600 mb-10 leading-relaxed">
                A multi-tenant platform designed to handle complex approval workflows, receipt management, and automated payouts for modern organisations.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/signup">
                  <Button variant="primary" size="lg" className="w-full sm:w-auto text-base group">
                    Start for free
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto text-base">
                    Access Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="py-24 bg-slate-50 border-t border-slate-200/50 relative z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Everything you need to scale</h2>
              <p className="mt-4 text-slate-600">Built for finance teams and employees alike.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Building2,
                  title: 'Multi-Tenant Architecture',
                  description: 'Manage multiple organisations, subsidiaries, or clients from a single centralized dashboard with strict data isolation.'
                },
                {
                  icon: Workflow,
                  title: 'Smart Approval Workflows',
                  description: 'Define custom approval chains, auto-flag policy violations, and streamline the review process for managers.'
                },
                {
                  icon: CreditCard,
                  title: 'Automated Payouts',
                  description: 'Integrate directly with payment gateways to process refunds instantly. Built-in idempotency ensures no double payouts.'
                },
                {
                  icon: ShieldCheck,
                  title: 'Enterprise Security',
                  description: 'Role-based access control (RBAC), end-to-end encryption, and comprehensive audit logs for compliance.'
                },
                {
                  icon: BarChart3,
                  title: 'Real-time Analytics',
                  description: 'Track spending patterns, identify bottlenecks, and generate compliance reports with a single click.'
                },
                {
                  icon: Banknote,
                  title: 'Receipt Management',
                  description: 'Secure cloud storage for receipts with automated validation and secure signed URLs for access.'
                }
              ].map((feature, i) => (
                <div key={i} className="bg-white p-8 rounded-2xl border border-slate-200/50 shadow-sm hover:shadow-md transition-shadow group">
                  <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-primary-100 transition-all">
                    <feature.icon className="w-6 h-6 text-primary-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed text-sm">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <div className="bg-primary-600 text-white p-1 rounded-md">
              <Banknote className="w-4 h-4" />
            </div>
            <span className="font-semibold text-slate-900 tracking-tight">Amrita CRS</span>
          </div>
          <p className="text-slate-500 text-sm">
            © {new Date().getFullYear()} Amrita Centralised Refund System. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
