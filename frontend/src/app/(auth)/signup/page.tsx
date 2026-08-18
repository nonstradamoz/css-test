'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { AlertCircle, Eye, EyeOff, ShieldAlert, Check, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function Field({
  label, type = 'text', placeholder, value, onChange, required, minLength, hint, showToggle, onToggle, showValue
}: {
  label: string; type?: string; placeholder?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean; minLength?: number; hint?: string;
  showToggle?: boolean; onToggle?: () => void; showValue?: boolean;
}) {
  const inputType = showToggle ? (showValue ? 'text' : 'password') : type;
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          minLength={minLength}
          style={{
            width: '100%',
            padding: showToggle ? '10px 40px 10px 13px' : '10px 13px',
            borderRadius: 7,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.09)',
            color: '#fff',
            fontSize: 13,
            fontFamily: 'Inter, sans-serif',
            outline: 'none',
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
        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            style={{
              position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.28)', padding: 2
            }}
          >
            {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {hint && (
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginTop: 4 }}>{hint}</p>
      )}
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError(null);

    try {
      const sb = createClient();
      const { data, error: authError } = await sb.auth.signUp({
        email, password,
        options: { data: { full_name: name } }
      });
      if (authError) throw authError;

      await new Promise(r => setTimeout(r, 1000));

      if (orgName.trim()) {
        const { data: { session } } = await sb.auth.getSession();
        const res = await fetch('/api/createOrganisation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ name: orgName.trim() })
        });
        if (!res.ok) await sb.rpc('join_demo_org');
      } else {
        await sb.rpc('join_demo_org');
      }

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Could not create account. Please try again.');
    } finally {
      setLoading(false);
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

      {/* Accent glow — top right this time (different from login) */}
      <div style={{
        position: 'absolute', top: -100, right: -100,
        width: 450, height: 450, borderRadius: 999,
        background: 'radial-gradient(circle, rgba(26,122,74,0.14) 0%, transparent 65%)',
        pointerEvents: 'none'
      }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

        {/* Back button */}
        <Link href="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 28,
          fontSize: 13, color: 'rgba(255,255,255,0.35)', textDecoration: 'none',
          transition: 'color 0.15s'
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
        >
          <ArrowLeft size={14} /> Back to home
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
            Create your<br />workspace
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 7 }}>
            Get your team managing expenses in minutes
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '10px 13px', borderRadius: 7, marginBottom: 14,
            background: 'rgba(185,64,64,0.12)', border: '1px solid rgba(185,64,64,0.22)',
            color: '#fca5a5', fontSize: 13
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>

          {/* Row: Name */}
          <Field label="Full Name" placeholder="Jane Doe" value={name}
            onChange={e => setName(e.target.value)} required />

          {/* Row: Org name */}
          <Field
            label="Organisation Name"
            placeholder="Acme Corp"
            value={orgName}
            onChange={e => setOrgName(e.target.value)}
            hint="Leave blank to join the demo workspace"
          />

          {/* Row: Email */}
          <Field label="Work Email" type="email" placeholder="you@company.com" value={email}
            onChange={e => setEmail(e.target.value)} required />

          {/* Row: Password + Confirm side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field
              label="Password" placeholder="Min. 6 chars" value={password}
              onChange={e => setPassword(e.target.value)} required minLength={6}
              showToggle onToggle={() => setShowPwd(!showPwd)} showValue={showPwd}
            />
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  style={{
                    width: '100%', padding: '10px 36px 10px 13px',
                    borderRadius: 7,
                    background: 'rgba(255,255,255,0.06)',
                    border: `1px solid ${confirmPassword.length > 0 ? (passwordsMatch ? 'rgba(26,122,74,0.6)' : 'rgba(185,64,64,0.5)') : 'rgba(255,255,255,0.09)'}`,
                    color: '#fff', fontSize: 13,
                    fontFamily: 'Inter, sans-serif', outline: 'none',
                    transition: 'border-color 0.15s'
                  }}
                  onFocus={e => {
                    if (!confirmPassword.length) {
                      e.target.style.borderColor = 'rgba(26,122,74,0.65)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(26,122,74,0.12)';
                    }
                  }}
                  onBlur={e => {
                    if (!passwordsMatch && confirmPassword.length > 0) {
                      e.target.style.borderColor = 'rgba(185,64,64,0.5)';
                    }
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.28)', padding: 2 }}>
                  {passwordsMatch
                    ? <Check size={14} color="var(--accent-mid)" />
                    : showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4, width: '100%', padding: '11px',
              borderRadius: 7, background: loading ? 'rgba(26,122,74,0.55)' : 'var(--accent)',
              color: '#fff', fontSize: 13, fontWeight: 650,
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: loading ? 'none' : '0 2px 10px rgba(26,122,74,0.3)',
              transition: 'background 0.15s, box-shadow 0.15s'
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: 14, height: 14, borderRadius: 99,
                  border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#fff',
                  animation: 'spin 0.7s linear infinite'
                }} />
                Creating account…
              </>
            ) : 'Create account'}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
