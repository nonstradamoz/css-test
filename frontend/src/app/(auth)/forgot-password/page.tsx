'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { AlertCircle, ShieldAlert, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const sb = createClient();
      const { error: err } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setIsSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to send reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#131210',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
      overflow: 'hidden'
    }}>

      {/* Dot grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.25,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.09) 1px, transparent 1px)',
        backgroundSize: '32px 32px', pointerEvents: 'none'
      }} />

      {/* Accent glow */}
      <div style={{
        position: 'absolute', top: -100, right: -100,
        width: 450, height: 450, borderRadius: 999,
        background: 'radial-gradient(circle, rgba(26,122,74,0.14) 0%, transparent 65%)',
        pointerEvents: 'none'
      }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

        {/* Back button */}
        <Link href="/login" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 28,
          fontSize: 13, color: 'rgba(255,255,255,0.35)', textDecoration: 'none',
          transition: 'color 0.15s'
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
        >
          <ArrowLeft size={14} /> Back to sign in
        </Link>

        {/* Brand mark */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 9,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18
          }}>
            <ShieldAlert size={18} color="#fff" />
          </div>
          <h1 style={{
            fontSize: 24, fontWeight: 750, color: '#fff',
            letterSpacing: '-0.03em', lineHeight: 1.2, margin: 0
          }}>
            Reset password
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 7 }}>
            We'll send a secure reset link to your email
          </p>
        </div>

        {isSuccess ? (
          <div style={{
            padding: '16px', borderRadius: 9,
            background: 'rgba(26,122,74,0.1)', border: '1px solid rgba(26,122,74,0.2)',
            display: 'flex', flexDirection: 'column', gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={18} color="var(--accent)" />
              <span style={{ fontSize: 14, fontWeight: 650, color: '#fff' }}>Reset link sent</span>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, margin: 0 }}>
              Check your inbox for instructions to reset your password. The link will expire in 1 hour.
            </p>
          </div>
        ) : (
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {error && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '10px 13px', borderRadius: 7, marginBottom: 4,
                background: 'rgba(185,64,64,0.12)', border: '1px solid rgba(185,64,64,0.22)',
                color: '#fca5a5', fontSize: 13
              }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>
                Work Email
              </label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px 13px', borderRadius: 7,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)',
                  color: '#fff', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s'
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(26,122,74,0.65)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(26,122,74,0.12)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.09)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                marginTop: 8, width: '100%', padding: '11px',
                borderRadius: 7, background: isLoading ? 'rgba(26,122,74,0.55)' : 'var(--accent)',
                color: '#fff', fontSize: 13, fontWeight: 650,
                border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: isLoading ? 'none' : '0 2px 10px rgba(26,122,74,0.3)',
                transition: 'background 0.15s, box-shadow 0.15s'
              }}
            >
              {isLoading ? (
                <>
                  <div style={{
                    width: 14, height: 14, borderRadius: 99,
                    border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff',
                    animation: 'spin 0.7s linear infinite'
                  }} />
                  Sending…
                </>
              ) : 'Send reset link'}
            </button>
          </form>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
