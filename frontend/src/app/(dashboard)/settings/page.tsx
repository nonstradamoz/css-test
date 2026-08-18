'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Settings, Save, CheckCircle2, ShieldCheck, Cpu, DollarSign, Trash2, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const { activeOrg, isSuperAdmin, refreshProfile } = useAuth();
  const orgId = activeOrg?.id;

  const [mockOutcome, setMockOutcome] = useState<'SUCCESS' | 'FAILURE' | 'TIMEOUT'>(
    activeOrg?.settings?.mockRefundOutcome || 'SUCCESS'
  );
  const [duplicateDays, setDuplicateDays] = useState(
    (activeOrg?.settings?.duplicateWindowDays || 30).toString()
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setIsSaving(true);
    setError(null);
    setSavedSuccess(false);

    try {
      await api.updateOrgSettings({
        organisationId: orgId,
        settings: {
          mockRefundOutcome: mockOutcome,
          duplicateWindowDays: parseInt(duplicateDays, 10) || 30
        }
      });
      setSavedSuccess(true);
      await refreshProfile();
    } catch (err: any) {
      setError(err.message || 'Failed to update settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOrganisation = async () => {
    if (!orgId) return;
    
    if (!confirm('Are you absolutely sure you want to delete this organisation? This action cannot be undone and will delete all members, expenses, and reimbursements associated with it.')) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await api.deleteOrganisation({ organisationId: orgId });
      await refreshProfile();
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to delete organisation.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organisation Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure financial rules, duplicate detection windows, and external payment simulator parameters.
        </p>
      </div>

      <form onSubmit={handleSaveSettings}>
        <Card>
          <CardHeader>
            <CardTitle>Organisation Configuration</CardTitle>
            <CardDescription>{activeOrg?.name} ({activeOrg?.id})</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {savedSuccess && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Settings successfully updated.</span>
              </div>
            )}

            {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Organisation Name"
                  disabled
                  value={activeOrg?.name || ''}
                />

                <Input
                  label="Base Settlement Currency"
                  disabled
                  value={activeOrg?.currency || 'INR'}
                />
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Cpu className="w-4 h-4 text-primary-600" />
                  <span>Refund Provider Simulation Mode (Assignment Feature)</span>
                </div>
                <p className="text-xs text-slate-500">
                  Control the simulated behavior of external banking rails to demonstrate failure recovery, retries, and idempotency.
                </p>

                <div className="grid grid-cols-3 gap-3 pt-1">
                  <label
                    className={`border rounded-xl p-3.5 cursor-pointer flex flex-col justify-between transition-all ${
                      mockOutcome === 'SUCCESS'
                        ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="mockOutcome"
                      value="SUCCESS"
                      checked={mockOutcome === 'SUCCESS'}
                      onChange={() => setMockOutcome('SUCCESS')}
                      className="sr-only"
                    />
                    <span className="text-xs font-bold text-emerald-900">SUCCESS</span>
                    <span className="text-[10px] text-slate-500 mt-1">
                      Refund settles immediately with valid provider reference.
                    </span>
                  </label>

                  <label
                    className={`border rounded-xl p-3.5 cursor-pointer flex flex-col justify-between transition-all ${
                      mockOutcome === 'FAILURE'
                        ? 'border-red-500 bg-red-50/50 ring-2 ring-red-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="mockOutcome"
                      value="FAILURE"
                      checked={mockOutcome === 'FAILURE'}
                      onChange={() => setMockOutcome('FAILURE')}
                      className="sr-only"
                    />
                    <span className="text-xs font-bold text-red-900">FAILURE</span>
                    <span className="text-[10px] text-slate-500 mt-1">
                      Gateway rejects payment and triggers retry lifecycle until REFUND_FAILED.
                    </span>
                  </label>

                  <label
                    className={`border rounded-xl p-3.5 cursor-pointer flex flex-col justify-between transition-all ${
                      mockOutcome === 'TIMEOUT'
                        ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="mockOutcome"
                      value="TIMEOUT"
                      checked={mockOutcome === 'TIMEOUT'}
                      onChange={() => setMockOutcome('TIMEOUT')}
                      className="sr-only"
                    />
                    <span className="text-xs font-bold text-amber-900">TIMEOUT</span>
                    <span className="text-[10px] text-slate-500 mt-1">
                      Simulates HTTP 504 gateway timeout for network failure handling.
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <Input
                  label="Duplicate Expense Scan Lookback (Days)"
                  type="number"
                  min="1"
                  max="365"
                  value={duplicateDays}
                  onChange={(e) => setDuplicateDays(e.target.value)}
                  helperText="Expenses submitted within this window with matching amounts, merchants, or checksums are flagged."
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              isLoading={isSaving}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Save Settings
            </Button>
          </CardFooter>
        </Card>
      </form>

      {isSuperAdmin && (
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </CardTitle>
            <CardDescription className="text-red-600/80">
              Destructive actions that cannot be undone. Only visible to Super Admins.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 bg-white border border-red-100 rounded-xl">
              <div>
                <h4 className="font-semibold text-slate-900 text-sm">Delete Organisation</h4>
                <p className="text-xs text-slate-500 mt-0.5 max-w-md">
                  Permanently remove this organisation and all of its associated data, members, and financial records.
                </p>
              </div>
              <Button
                variant="danger"
                onClick={handleDeleteOrganisation}
                isLoading={isDeleting}
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                Delete Organisation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
