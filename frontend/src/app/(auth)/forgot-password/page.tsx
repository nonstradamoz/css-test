'use client';

import React, { useState } from 'react';
import { AlertCircle, ShieldCheck, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSuccess(true);
  };

  return (
    <div className="min-h-screen bg-neutral-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))] flex flex-col justify-between p-6 text-neutral-100 selection:bg-emerald-500 selection:text-white">
      {/* Top Brand Header */}
      <header className="max-w-md mx-auto w-full flex items-center justify-center pt-6 pb-2">
        <Link href="/" className="flex items-center gap-2.5 group transition-transform active:scale-95">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl shadow-inner group-hover:bg-emerald-500/20 transition-all">
            <ShieldCheck size={24} className="stroke-[2.2]" />
          </div>
          <div>
            <span className="font-extrabold text-white text-lg tracking-tight">ClearSpend</span>
            <span className="text-[11px] text-emerald-400/80 font-medium ml-2 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              Recovery
            </span>
          </div>
        </Link>
      </header>

      {/* Main Card */}
      <main className="flex-1 flex items-center justify-center py-6">
        <div className="w-full max-w-md bg-neutral-900/90 backdrop-blur-xl border border-neutral-800/80 rounded-2xl p-7 sm:p-8 shadow-2xl space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Reset Password</h1>
            <p className="text-xs text-neutral-400 mt-1">Enter your work email to receive password reset instructions.</p>
          </div>

          {isSuccess ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-sm text-emerald-400">
                <CheckCircle2 size={18} className="shrink-0" />
                <span>Password reset instructions have been forwarded to your system administrator.</span>
              </div>
              <Link
                href="/login"
                className="w-full block py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-xl text-sm text-center transition-colors"
              >
                Return to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                  Work Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-4 py-2.5 bg-neutral-800/80 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-emerald-900/30 transition-all mt-2"
              >
                Request Password Reset
              </button>

              <div className="text-center pt-2">
                <Link href="/login" className="text-xs text-neutral-400 hover:text-white inline-flex items-center gap-1 transition-colors">
                  <ArrowLeft size={14} /> Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Page Footer */}
      <footer className="py-4 text-center text-xs text-neutral-400">
        © {new Date().getFullYear()} ClearSpend · Enterprise Expense & Refund Manager
      </footer>
    </div>
  );
}
