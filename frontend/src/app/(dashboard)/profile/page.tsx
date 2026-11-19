'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/providers/AuthProvider';
import { api } from '@/lib/api';
import { BankDetails } from '@/types';
import {
  User, Building2, CreditCard, ShieldCheck, CheckCircle2,
  AlertCircle, Save, Lock, Eye, EyeOff, Hash, QrCode, ArrowRight
} from 'lucide-react';

function ProfileContent() {
  const { user, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const promptBank = searchParams.get('prompt_bank') === 'true';
  const redirectExpenseId = searchParams.get('redirect_expense_id');

  // Personal Info Form
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Bank Details Form (for employees)
  const [accountHolder, setAccountHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [upiId, setUpiId] = useState('');

  // Status & Feedback
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEmployee = user?.role === 'EMPLOYEE';

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      if (user.bank_details) {
        setAccountHolder(user.bank_details.account_holder_name || '');
        setBankName(user.bank_details.bank_name || '');
        setAccountNumber(user.bank_details.account_number || '');
        setIfscCode(user.bank_details.ifsc_code || '');
        setUpiId(user.bank_details.upi_id || '');
      }
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const payload: {
        full_name?: string;
        password?: string;
        bank_details?: BankDetails;
      } = {
        full_name: fullName.trim()
      };

      if (password) {
        payload.password = password;
      }

      if (isEmployee) {
        payload.bank_details = {
          account_holder_name: accountHolder.trim() || undefined,
          bank_name: bankName.trim() || undefined,
          account_number: accountNumber.trim() || undefined,
          ifsc_code: ifscCode.trim().toUpperCase() || undefined,
          upi_id: upiId.trim() || undefined
        };
      }

      await api.users.updateMyProfile(payload);
      await refreshUser();
      setPassword('');
      setSuccessMsg('Profile and details updated successfully!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Account Profile</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Manage your personal details, corporate credentials{isEmployee ? ', and reimbursement bank account' : ''}.
        </p>
      </div>

      {/* Missing Bank Details Warning Banner */}
      {promptBank && (
        <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-start gap-3 text-amber-900 shadow-sm animate-in fade-in duration-300">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-amber-900">Bank Details Required to Submit Expense Claims</h3>
            <p className="text-xs text-amber-800 leading-relaxed">
              Your expense claim has been safely saved as a <strong>Draft</strong>. Corporate policy requires valid reimbursement bank details (Account Number or UPI ID) on your profile before a claim can be submitted. Please fill out your bank details below and save your profile.
            </p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl space-y-2 text-sm text-emerald-700">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
          {redirectExpenseId && (
            <div className="pt-2">
              <Link
                href={`/expenses/${redirectExpenseId}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
              >
                <span>Return to Claim & Submit Now</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/25 rounded-xl flex items-center gap-2.5 text-sm text-red-600">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-6">
        {/* Personal Details Card */}
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2.5 pb-4 border-b border-neutral-100">
            <div className="p-2 bg-neutral-100 text-neutral-700 rounded-lg">
              <User size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900">Personal Information</h2>
              <p className="text-xs text-neutral-500">Your profile details in ClearSpend.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                Work Email (Read Only)
              </label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full px-4 py-2.5 bg-neutral-100 border border-neutral-200 rounded-xl text-sm text-neutral-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                User Role
              </label>
              <div className="px-4 py-2.5 bg-neutral-100 border border-neutral-200 rounded-xl text-sm text-neutral-700 font-semibold flex items-center justify-between">
                <span>{user?.role}</span>
                <span className="text-[11px] font-normal px-2 py-0.5 bg-neutral-200 text-neutral-600 rounded">
                  Managed by Admin
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                Change Password (Optional)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Leave blank to keep unchanged"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bank Details Card (ONLY FOR EMPLOYEES) */}
        {isEmployee ? (
          <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-neutral-900">Reimbursement Bank Account</h2>
                  <p className="text-xs text-neutral-500">
                    Your approved expense claim reimbursements are disbursed directly into this account.
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                Employee Payout Details
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                  Account Holder Name
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="e.g. Johnathan Doe"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                  Bank Name
                </label>
                <div className="relative">
                  <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="e.g. HDFC Bank, SBI, ICICI"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                  Bank Account Number
                </label>
                <div className="relative">
                  <Hash size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="e.g. 5010049281928"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-neutral-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                  IFSC / Routing Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. HDFC0001234"
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                  UPI ID (Optional)
                </label>
                <div className="relative">
                  <QrCode size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="e.g. name@okhdfcbank"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 border border-neutral-200/80 rounded-xl text-xs text-neutral-600 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
              <span>
                Bank details are encrypted and utilized solely by Finance for automated settlement disbursements.
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-5 text-xs text-neutral-500 flex items-center justify-between">
            <div>
              <span className="font-semibold text-neutral-700 block text-sm">Bank Details Not Required</span>
              <span>
                As an  <strong>{user?.role}</strong>, you do not receive expense reimbursements. Bank details are only enabled for Employee accounts.
              </span>
            </div>
            <span className="px-2.5 py-1 bg-neutral-200 text-neutral-600 font-semibold rounded-lg shrink-0">
              {user?.role}
            </span>
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm shadow-sm transition-all disabled:opacity-50"
          >
            <Save size={16} />
            {isSaving ? 'Saving Changes...' : 'Save Profile Details'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="p-8 text-neutral-500 text-sm">Loading profile...</div>}>
      <ProfileContent />
    </Suspense>
  );
}
