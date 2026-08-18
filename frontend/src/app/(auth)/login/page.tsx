'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { ShieldCheck, ArrowRight, UserCheck, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else {
        setError(err.message || 'Failed to sign in. Ensure emulators are running.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    setIsLoading(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, demoEmail, 'password123');
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Quick login failed. Ensure seed data has been loaded.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-primary-600 items-center justify-center text-white shadow-elevated">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Centralised Expense & Refund</h1>
          <p className="text-xs text-slate-400">Enterprise Financial Operations Platform</p>
        </div>

        {/* Login Card */}
        <Card className="border-slate-700/60 bg-white/95 backdrop-blur-xl shadow-elevated">
          <CardHeader className="pb-3 border-none">
            <CardTitle className="text-lg">Sign In</CardTitle>
            <CardDescription>Enter your corporate credentials to continue</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label="Email Address"
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                label="Password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                  Remember me
                </label>
                <Link href="/forgot-password" className="text-primary-600 hover:text-primary-700 font-medium">
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" className="w-full" isLoading={isLoading} rightIcon={<ArrowRight className="w-4 h-4" />}>
                Sign In
              </Button>
            </form>

            <div className="pt-4 text-center text-sm text-slate-600">
              Don't have an account?{' '}
              <Link href="/signup" className="text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                Sign up
              </Link>
            </div>

            {/* Quick Demo Logins Section */}
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <UserCheck className="w-3.5 h-3.5" />
                <span>1-Click Demo Accounts</span>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-400">Organisation A (Acme Corp)</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('admin@acmecorp.com')}
                    className="text-left px-2.5 py-1.5 rounded-lg border border-purple-200 bg-purple-50/60 hover:bg-purple-100 text-purple-900 text-xs font-medium transition-colors"
                  >
                    <div className="font-bold">Admin</div>
                    <div className="text-[10px] text-purple-600 truncate">admin@acmecorp.com</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('finance@acmecorp.com')}
                    className="text-left px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100 text-emerald-900 text-xs font-medium transition-colors"
                  >
                    <div className="font-bold">Finance</div>
                    <div className="text-[10px] text-emerald-600 truncate">finance@acmecorp.com</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('reviewer@acmecorp.com')}
                    className="text-left px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50/60 hover:bg-blue-100 text-blue-900 text-xs font-medium transition-colors"
                  >
                    <div className="font-bold">Reviewer</div>
                    <div className="text-[10px] text-blue-600 truncate">reviewer@acmecorp.com</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('member@acmecorp.com')}
                    className="text-left px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-medium transition-colors"
                  >
                    <div className="font-bold">Member</div>
                    <div className="text-[10px] text-slate-500 truncate">member@acmecorp.com</div>
                  </button>
                </div>

                <div className="text-[11px] font-semibold text-slate-400 pt-1">Organisation B (Globex Inc)</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('admin@globex.com')}
                    className="text-left px-2.5 py-1.5 rounded-lg border border-purple-200 bg-purple-50/60 hover:bg-purple-100 text-purple-900 text-xs font-medium transition-colors"
                  >
                    <div className="font-bold">Admin (Org B)</div>
                    <div className="text-[10px] text-purple-600 truncate">admin@globex.com</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('member@globex.com')}
                    className="text-left px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-medium transition-colors"
                  >
                    <div className="font-bold">Member (Org B)</div>
                    <div className="text-[10px] text-slate-500 truncate">member@globex.com</div>
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
