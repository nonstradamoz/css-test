'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { User, Role, BankDetails } from '@/types';
import { formatDate } from '@/lib/utils';
import {
  Users, UserPlus, Shield, Check, X, AlertTriangle,
  CreditCard, Building2, Hash, QrCode, Save, ShieldCheck
} from 'lucide-react';

const ROLES: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'Admin (Administrator)' },
  { value: 'EMPLOYEE', label: 'Employee (Submitter)' },
  { value: 'REVIEWER', label: 'Reviewer (Reviewer & Financier)' }
];

export default function UsersManagementPage() {
  const { role, user: currentUser } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userRole, setUserRole] = useState<Role>('EMPLOYEE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Bank Details Modal state
  const [selectedUserForBank, setSelectedUserForBank] = useState<User | null>(null);
  const [bankHolder, setBankHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccNumber, setBankAccNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankUpi, setBankUpi] = useState('');
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [bankModalMsg, setBankModalMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.users.list(),
    enabled: role === 'ADMIN'
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await api.users.create({
        full_name: fullName,
        email,
        password,
        role: userRole
      });
      setIsCreateOpen(false);
      setFullName('');
      setEmail('');
      setPassword('');
      await refetch();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: Role) => {
    try {
      await api.users.update(targetUserId, { role: newRole });
      await refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to update user role');
    }
  };

  const handleToggleActive = async (targetUser: User) => {
    if (targetUser.id === currentUser?.id) {
      alert('You cannot deactivate your own admin account.');
      return;
    }
    try {
      await api.users.update(targetUser.id, { is_active: !targetUser.is_active });
      await refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle user status');
    }
  };

  // Open Bank Details Modal
  const openBankModal = (user: User) => {
    setSelectedUserForBank(user);
    setBankModalMsg(null);
    setBankHolder(user.bank_details?.account_holder_name || user.full_name || '');
    setBankName(user.bank_details?.bank_name || '');
    setBankAccNumber(user.bank_details?.account_number || '');
    setBankIfsc(user.bank_details?.ifsc_code || '');
    setBankUpi(user.bank_details?.upi_id || '');
  };

  // Save Bank Details (Admin entry on behalf of Employee)
  const handleSaveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForBank) return;

    setIsSavingBank(true);
    setBankModalMsg(null);

    try {
      const bankPayload: BankDetails = {
        account_holder_name: bankHolder.trim() || undefined,
        bank_name: bankName.trim() || undefined,
        account_number: bankAccNumber.trim() || undefined,
        ifsc_code: bankIfsc.trim().toUpperCase() || undefined,
        upi_id: bankUpi.trim() || undefined
      };

      await api.users.update(selectedUserForBank.id, {
        bank_details: bankPayload
      });

      await refetch();
      setBankModalMsg({ type: 'success', text: `Bank details for ${selectedUserForBank.full_name} updated successfully!` });
      setTimeout(() => {
        setSelectedUserForBank(null);
      }, 1200);
    } catch (err: any) {
      setBankModalMsg({ type: 'error', text: err.message || 'Failed to update bank details.' });
    } finally {
      setIsSavingBank(false);
    }
  };

  if (role !== 'ADMIN') {
    return (
      <div className="p-12 text-center text-sm text-neutral-500">
        Access restricted. Only Administrators can manage enterprise users.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Enterprise User Management</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Provision accounts, assign RBAC permissions, and manage employee bank details.
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors shadow-sm"
        >
          <UserPlus size={16} />
          Add User
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-sm text-red-600">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-neutral-500">Loading user accounts...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50/75 border-b border-neutral-200 text-xs text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-6 py-3.5">Assigned Role</th>
                  <th className="px-6 py-3.5">Bank Status</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Joined Date</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {users.map((u) => {
                  const hasBank = Boolean(u.bank_details?.account_number);
                  return (
                    <tr key={u.id} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-neutral-900">{u.full_name}</p>
                        <p className="text-xs text-neutral-500">{u.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={u.role}
                          disabled={u.id === currentUser?.id}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                          className="px-2.5 py-1 border border-neutral-300 rounded-lg text-xs font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        {u.role === 'EMPLOYEE' ? (
                          hasBank ? (
                            <div className="text-xs">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CreditCard size={11} /> Configured
                              </span>
                              <p className="text-[11px] text-neutral-400 mt-0.5 font-mono">
                                {u.bank_details?.bank_name ? `${u.bank_details.bank_name} ••••${u.bank_details.account_number?.slice(-4)}` : '••••'}
                              </p>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              Not Provided
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-neutral-400">N/A ({u.role})</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
                        }`}>
                          {u.is_active ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-neutral-500">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {/* Admin Bank Details Button */}
                        {u.role === 'EMPLOYEE' && (
                          <button
                            onClick={() => openBankModal(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-neutral-300 hover:border-emerald-500 text-xs font-semibold rounded-lg text-neutral-700 hover:text-emerald-700 hover:bg-emerald-50/50 transition-colors"
                          >
                            <CreditCard size={12} />
                            <span>Bank Details</span>
                          </button>
                        )}

                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            className={`text-xs font-semibold hover:underline ${
                              u.is_active ? 'text-red-600' : 'text-emerald-600'
                            }`}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admin Bank Details Editor Modal */}
      {selectedUserForBank && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">Manage Employee Bank Details</h3>
                  <p className="text-xs text-neutral-500">Employee: {selectedUserForBank.full_name} ({selectedUserForBank.email})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserForBank(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {bankModalMsg && (
              <div className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                bankModalMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {bankModalMsg.type === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
                <span>{bankModalMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveBankDetails} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Johnathan Doe"
                  value={bankHolder}
                  onChange={(e) => setBankHolder(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC Bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">
                    IFSC / Routing Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC0001234"
                    value={bankIfsc}
                    onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm font-mono uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">
                  Bank Account Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 5010049281928"
                  value={bankAccNumber}
                  onChange={(e) => setBankAccNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">
                  UPI ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. employee@okaxis"
                  value={bankUpi}
                  onChange={(e) => setBankUpi(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-500 flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                <span>Entering bank details on behalf of the employee in case of technical or accessibility issues.</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedUserForBank(null)}
                  className="px-4 py-2 border border-neutral-300 rounded-xl text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSavingBank}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium shadow-sm disabled:opacity-50"
                >
                  <Save size={14} />
                  {isSavingBank ? 'Saving...' : 'Save Bank Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-neutral-900">Provision New User Account</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Robert Vance"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="robert@company.com"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Role</label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value as Role)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm bg-white"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-neutral-300 rounded-xl text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium shadow-sm"
                >
                  {isSubmitting ? 'Provisioning...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
