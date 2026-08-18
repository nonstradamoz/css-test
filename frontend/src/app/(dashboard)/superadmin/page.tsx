'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { Building2, Plus, ArrowRight, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api';

const orgSchema = z.object({
  name: z.string().min(2, 'Organisation name must be at least 2 characters'),
  currency: z.string().min(3, 'Currency code must be 3 characters').max(3)
});

type OrgFormValues = z.infer<typeof orgSchema>;

export default function SuperAdminPage() {
  const { isSuperAdmin, userOrgs, refreshProfile } = useAuth();
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: {
      currency: 'INR'
    }
  });

  useEffect(() => {
    if (!isSuperAdmin) {
      router.push('/dashboard');
    }
  }, [isSuperAdmin, router]);

  const onSubmit = async (data: OrgFormValues) => {
    try {
      setSubmitError(null);
      await api.createOrganisation({
        name: data.name,
        currency: data.currency.toUpperCase()
      });
      await refreshProfile();
      setIsCreating(false);
      reset();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to create organisation');
    }
  };

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-violet-600" />
            Platform Administration
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Global management of tenants and organizations.
          </p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors bg-violet-600 border border-transparent rounded-lg shadow-sm hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
        >
          <Plus className="w-4 h-4" />
          {isCreating ? 'Cancel' : 'New Organisation'}
        </button>
      </div>

      {isCreating && (
        <div className="bg-white rounded-xl shadow-sm border border-violet-100 overflow-hidden">
          <div className="bg-violet-50/50 px-6 py-4 border-b border-violet-100">
            <h2 className="text-sm font-semibold text-violet-900">Provision New Tenant</h2>
          </div>
          <div className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl space-y-4">
              {submitError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-2">
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <p>{submitError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Organisation Name
                </label>
                <input
                  {...register('name')}
                  type="text"
                  placeholder="e.g. Acme Corp"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-shadow"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Base Currency
                </label>
                <input
                  {...register('currency')}
                  type="text"
                  maxLength={3}
                  placeholder="INR"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-shadow uppercase"
                />
                {errors.currency && (
                  <p className="mt-1 text-sm text-red-600">{errors.currency.message}</p>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors bg-violet-600 border border-transparent rounded-lg shadow-sm hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Provisioning...' : 'Create Organisation'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-violet-100 rounded-lg text-violet-600">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Organisations</p>
              <h3 className="text-2xl font-bold text-slate-900">{userOrgs.length}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-900">All Platform Tenants</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {userOrgs.map((org) => (
            <div key={org.id} className="p-4 sm:px-6 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-slate-900">{org.name}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{org.id}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                    {org.currency}
                  </span>
                  <span className="text-slate-400">
                    Created {org.createdAt ? new Date(org.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {userOrgs.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              No organisations found in the system.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
