'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const { register, googleLogin } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({
        full_name: fullName,
        email,
        password
      });
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const googleEmail = prompt('Enter your Google Account email for corporate onboarding:', email || 'employee@company.com');
      if (!googleEmail) {
        setLoading(false);
        return;
      }
      await googleLogin({
        email: googleEmail,
        full_name: fullName.trim() || googleEmail.split('@')[0]
      });
    } catch (err: any) {
      setError(err.message || 'Google Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-neutral-100">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Create ClearSpend Account</h1>
            <p className="text-xs text-neutral-400">Expense & Refund Portal</p>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-sm text-red-400">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Jane Smith"
              className="w-full px-4 py-2.5 bg-neutral-800/80 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
            />
          </div>

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

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Password (min. 8 characters)
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 bg-neutral-800/80 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              >
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-sm shadow-lg shadow-emerald-900/30 disabled:opacity-50 transition-all mt-2"
          >
            {loading ? 'Creating Account...' : 'Register & Enter'}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-800" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase">
            <span className="bg-neutral-900 px-3 text-neutral-500 font-semibold tracking-wider">
              Or continue with
            </span>
          </div>
        </div>

        {/* Google Sign In / Registration Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-750 hover:border-neutral-600 border border-neutral-700 text-white font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2.5 shadow-sm disabled:opacity-50"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>Sign up with Google</span>
        </button>

        <div className="mt-6 pt-5 border-t border-neutral-800 text-center text-xs text-neutral-400">
          Already registered?{' '}
          <Link href="/login" className="text-emerald-400 hover:underline font-semibold">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
