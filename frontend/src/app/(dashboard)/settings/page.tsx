'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Category } from '@/types';
import {
  Settings, Save, CheckCircle2, ShieldCheck,
  AlertTriangle, Tag, Plus, Edit2, Check, X, Power
} from 'lucide-react';

export default function SettingsPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();

  // Settings State
  const [companyName, setCompanyName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [threshold, setThreshold] = useState('25000');
  const [allowSelfApproval, setAllowSelfApproval] = useState(false);
  const [expenseSubmissionsEnabled, setExpenseSubmissionsEnabled] = useState(true);
  const [multiTierApprovalEnabled, setMultiTierApprovalEnabled] = useState(true);
  const [enforceDateWindow, setEnforceDateWindow] = useState(false);
  const [policyAllowedStartDate, setPolicyAllowedStartDate] = useState('');
  const [policyAllowedEndDate, setPolicyAllowedEndDate] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Category Management State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [catActionLoading, setCatActionLoading] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  // Editing Category state
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const { data: currentSettings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api.settings.get()
  });

  const { data: categories = [], refetch: refetchCategories } = useQuery({
    queryKey: ['categories-all'],
    queryFn: () => api.categories.listAll(),
    enabled: role === 'ADMIN'
  });

  useEffect(() => {
    if (currentSettings) {
      setCompanyName(currentSettings.company_name);
      setCurrency(currentSettings.default_currency);
      setThreshold(currentSettings.tier2_approval_threshold.toString());
      setAllowSelfApproval(currentSettings.allow_self_approval);
      setExpenseSubmissionsEnabled(currentSettings.expense_submissions_enabled ?? true);
      setMultiTierApprovalEnabled(currentSettings.multi_tier_approval_enabled ?? true);
      setEnforceDateWindow(currentSettings.enforce_date_window ?? false);
      if (currentSettings.policy_allowed_start_date) {
        setPolicyAllowedStartDate(currentSettings.policy_allowed_start_date.split('T')[0]);
      } else {
        setPolicyAllowedStartDate('');
      }
      if (currentSettings.policy_allowed_end_date) {
        setPolicyAllowedEndDate(currentSettings.policy_allowed_end_date.split('T')[0]);
      } else {
        setPolicyAllowedEndDate('');
      }
    }
  }, [currentSettings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setSavedSuccess(false);
    try {
      await api.settings.update({
        company_name: companyName,
        default_currency: currency,
        tier2_approval_threshold: parseFloat(threshold) as any,
        allow_self_approval: allowSelfApproval,
        expense_submissions_enabled: expenseSubmissionsEnabled,
        multi_tier_approval_enabled: multiTierApprovalEnabled,
        enforce_date_window: enforceDateWindow,
        policy_allowed_start_date: enforceDateWindow && policyAllowedStartDate ? new Date(policyAllowedStartDate).toISOString() : null,
        policy_allowed_end_date: enforceDateWindow && policyAllowedEndDate ? new Date(policyAllowedEndDate).toISOString() : null
      });
      setSavedSuccess(true);
      await queryClient.invalidateQueries({ queryKey: ['system-settings'] });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update system settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) return;
    setCatActionLoading(true);
    setCatError(null);
    try {
      await api.categories.create({
        code: newCode.trim().toUpperCase().replace(/\s+/g, '_'),
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        is_active: true
      });
      setShowAddModal(false);
      setNewCode('');
      setNewName('');
      setNewDesc('');
      await Promise.all([
        refetchCategories(),
        queryClient.invalidateQueries({ queryKey: ['categories-active'] })
      ]);
    } catch (err: any) {
      setCatError(err.message || 'Failed to create category');
    } finally {
      setCatActionLoading(false);
    }
  };

  const handleToggleActive = async (cat: Category) => {
    setCatError(null);
    try {
      await api.categories.update(cat.id, { is_active: !cat.is_active });
      await Promise.all([
        refetchCategories(),
        queryClient.invalidateQueries({ queryKey: ['categories-active'] })
      ]);
    } catch (err: any) {
      setCatError(err.message || 'Failed to update category status');
    }
  };

  const handleSaveEdit = async (catId: string) => {
    if (!editName.trim()) return;
    setCatActionLoading(true);
    setCatError(null);
    try {
      await api.categories.update(catId, {
        name: editName.trim(),
        description: editDesc.trim() || undefined
      });
      setEditingCatId(null);
      await Promise.all([
        refetchCategories(),
        queryClient.invalidateQueries({ queryKey: ['categories-active'] })
      ]);
    } catch (err: any) {
      setCatError(err.message || 'Failed to update category');
    } finally {
      setCatActionLoading(false);
    }
  };

  if (role !== 'ADMIN') {
    return (
      <div className="p-12 text-center text-sm text-neutral-500">
        Access restricted. Only Administrators can modify enterprise system settings and category governance.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Enterprise Settings & Governance</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Configure financial rules, multi-tiered approval thresholds, and manage claim submission categories.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-sm text-emerald-700">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>System configuration successfully saved.</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-sm text-red-600">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 1. System Financial Parameters */}
      <form onSubmit={handleSaveSettings} className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-5">
        <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
          <Settings size={18} className="text-emerald-600" /> Financial Parameters
        </h2>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
            Enterprise Name
          </label>
          <input
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
              Default Currency
            </label>
            <input
              type="text"
              required
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
              Tier-2 Approval Threshold (₹ INR)
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
            <p className="text-xs text-neutral-400 mt-1">
              Claims at or above this amount automatically trigger mandatory secondary Finance review.
            </p>
          </div>
        </div>

        {/* Expense Submissions Master Toggle */}
        <div className="pt-4 border-t border-neutral-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-sm font-bold text-neutral-900 block">Expense Submissions Master Switch</span>
              <p className="text-xs text-neutral-500 mt-0.5">
                Control whether employees across the organization are allowed to submit expense claims.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={expenseSubmissionsEnabled}
                onChange={(e) => setExpenseSubmissionsEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
          <span className={`inline-block mt-2 px-2.5 py-0.5 rounded text-xs font-semibold ${
            expenseSubmissionsEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {expenseSubmissionsEnabled ? 'Submissions Open (Accepting Claims)' : 'Submissions Paused (Claims Locked)'}
          </span>
        </div>

        {/* Multi-Tier Verification Toggle */}
        <div className="pt-4 border-t border-neutral-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-sm font-bold text-neutral-900 block">Multi-Tier Approval Hierarchy</span>
              <p className="text-xs text-neutral-500 mt-0.5">
                When enabled, high-value and escalated claims require secondary (Tier-2) sign-off. When disabled, all claims finalize upon Tier-1 review.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={multiTierApprovalEnabled}
                onChange={(e) => setMultiTierApprovalEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
          <span className={`inline-block mt-2 px-2.5 py-0.5 rounded text-xs font-semibold ${
            multiTierApprovalEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
          }`}>
            {multiTierApprovalEnabled ? 'Multi-Tier Active (Tier 1 & Tier 2 for high risk)' : 'Multi-Tier Disabled (Single-tier approval for all claims)'}
          </span>
        </div>

        {/* Authorized Expense Date Policy Window */}
        <div className="pt-4 border-t border-neutral-100 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-sm font-bold text-neutral-900 block">Authorized Expense Date Window</span>
              <p className="text-xs text-neutral-500 mt-0.5">
                Set a specific date window for allowable expenses (e.g. conference dates or billing cycles). Claims outside this window will be flagged and escalated for mandatory review.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={enforceDateWindow}
                onChange={(e) => setEnforceDateWindow(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {enforceDateWindow && (
            <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">
                  Policy Start Date
                </label>
                <input
                  type="date"
                  value={policyAllowedStartDate}
                  onChange={(e) => setPolicyAllowedStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">
                  Policy End Date
                </label>
                <input
                  type="date"
                  value={policyAllowedEndDate}
                  onChange={(e) => setPolicyAllowedEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allowSelfApproval}
              onChange={(e) => setAllowSelfApproval(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-neutral-300 focus:ring-emerald-500"
            />
            <span className="text-sm font-medium text-neutral-700">
              Allow Reviewers / Admins to approve their own submitted claims
            </span>
          </label>
          <p className="text-xs text-neutral-400 ml-6 mt-0.5">
            Recommended disabled for enterprise audit and compliance separation of duties.
          </p>
        </div>

        <div className="pt-4 border-t border-neutral-200 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-sm transition-colors shadow-sm"
          >
            <Save size={16} />
            {isSaving ? 'Saving Changes...' : 'Save Configuration'}
          </button>
        </div>
      </form>

      {/* 2. Expense Category Governance */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <Tag size={18} className="text-emerald-600" /> Expense Categories Governance
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Customize categories available for employee claim submission. System standard categories cannot be deleted but can be deactivated.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium rounded-xl text-xs transition-colors shadow-sm self-start sm:self-auto"
          >
            <Plus size={15} />
            Add Category
          </button>
        </div>

        {catError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
            <AlertTriangle size={15} />
            <span>{catError}</span>
          </div>
        )}

        {/* Categories List */}
        <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
          {categories.map((c) => {
            const isEditing = editingCatId === c.id;
            return (
              <div key={c.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-neutral-50/60 transition-colors">
                {isEditing ? (
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs px-2 py-0.5 bg-neutral-100 rounded text-neutral-700">
                        {c.code}
                      </span>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Category Display Name"
                        className="px-3 py-1 text-sm border border-neutral-300 rounded-lg flex-1"
                      />
                    </div>
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Optional policy description"
                      className="w-full px-3 py-1 text-xs border border-neutral-200 rounded-lg text-neutral-600"
                    />
                  </div>
                ) : (
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-neutral-900">{c.name}</span>
                      <span className="font-mono text-[11px] px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded">
                        {c.code}
                      </span>
                      {c.is_system && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-neutral-200/60 text-neutral-600 rounded">
                          System
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-xs text-neutral-500 mt-0.5">{c.description}</p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 self-end md:self-auto">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(c.id)}
                        disabled={catActionLoading}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Save Changes"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => setEditingCatId(null)}
                        className="p-1.5 text-neutral-400 hover:bg-neutral-100 rounded-lg transition-colors"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingCatId(c.id);
                          setEditName(c.name);
                          setEditDesc(c.description || '');
                        }}
                        className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                        title="Edit Category Name"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleToggleActive(c)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          c.is_active
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 border border-neutral-200'
                        }`}
                        title={c.is_active ? 'Click to Deactivate' : 'Click to Activate'}
                      >
                        <Power size={11} />
                        {c.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Category Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateCategory} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-neutral-900">Add New Expense Category</h3>

            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                Category Code * (Identifier)
              </label>
              <input
                type="text"
                required
                placeholder="e.g. HARDWARE, CLIENT_GIFT"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                className="w-full p-2.5 border border-neutral-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-neutral-400 mt-1">Uppercase letters and underscores only.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                Display Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Hardware & Peripherals"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full p-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                Description / Policy Guidance (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Covers keyboards, monitors, development boards under ₹20,000"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full p-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-neutral-200 text-neutral-700 rounded-xl text-xs font-medium hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={catActionLoading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium shadow-sm disabled:opacity-50"
              >
                {catActionLoading ? 'Creating...' : 'Create Category'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
