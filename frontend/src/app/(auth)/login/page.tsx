'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { AlertCircle, Eye, EyeOff, ShieldCheck, Mail, Lock, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const { user, login, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, redirect straight to dashboard
  useEffect(() => {
    if (user && !authLoading) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login({ email, password });
    } catch (err: any) {
      if (err.message === 'Not Found' || err.message?.includes('404')) {
        setError('Authentication service returned 404 (Not Found). Please check backend connectivity.');
      } else if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        setError('Cannot reach server. Please verify backend is running and CORS is enabled.');
      } else {
        setError(err.message || 'Incorrect email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(76,130,195,0.22),rgba(255,255,255,0))] flex flex-col justify-between p-6 text-neutral-100 selection:bg-brand-500 selection:text-white">
      {/* Top Brand Header */}
      <header className="max-w-md mx-auto w-full flex items-center justify-center pt-6 pb-2">
        <Link href="/" className="flex items-center gap-2.5 group transition-transform active:scale-95">
          <div className="p-2.5 bg-brand-500/15 text-brand-400 border border-brand-500/30 rounded-2xl shadow-inner group-hover:bg-brand-500/25 transition-all">
            <ShieldCheck size={24} className="stroke-[2.2]" />
          </div>
          <div>
            <span className="font-extrabold text-white text-lg tracking-tight">ClearSpend</span>
            <span className="text-[11px] text-brand-300 font-medium ml-2 px-1.5 py-0.5 rounded-full bg-brand-500/15 border border-brand-500/30">
              Workspace
            </span>
          </div>
        </Link>
      </header>

      {/* Main Login Card */}
      <main className="flex-1 flex items-center justify-center py-6">
        <div className="w-full max-w-md bg-neutral-900/90 backdrop-blur-xl border border-neutral-800/80 rounded-2xl p-7 sm:p-8 shadow-2xl space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Welcome back</h1>
            <p className="text-xs text-neutral-400 mt-1">Sign in to your corporate expense and disbursement portal.</p>
          </div>

          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-xs text-red-400 animate-in fade-in">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Primary Option: Email & Password */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-neutral-800/80 border border-neutral-700/80 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                />
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-11 py-2.5 bg-neutral-800/80 border border-neutral-700/80 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                />
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold rounded-xl text-sm shadow-lg shadow-brand-900/40 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In to Dashboard</span>
              )}
            </button>
          </form>

          {/* Elegant Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-800" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase">
              <span className="bg-neutral-900 px-3 text-neutral-400 font-semibold tracking-wider">
                or continue with
              </span>
            </div>
          </div>

          {/* 2. Google Account Sign-In (Moved to bottom) */}
          <GoogleSignInButton mode="signin" onError={setError} />

          {/* Footer Navigation */}
          <div className="pt-4 border-t border-neutral-800 text-center text-xs text-neutral-400">
            Need an account?{' '}
            <Link href="/signup" className="text-brand-400 hover:text-brand-300 hover:underline font-semibold transition-colors">
              Register here
            </Link>
          </div>
        </div>
      </main>

      {/* Page Footer */}
      <footer className="py-4 text-center text-xs text-neutral-400">
        © {new Date().getFullYear()} ClearSpend · Enterprise Expense & Refund Manager
      </footer>
    </div>
  );
}
