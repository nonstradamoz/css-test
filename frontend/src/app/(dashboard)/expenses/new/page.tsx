'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { createClient } from '@/lib/supabase';
import { api } from '@/lib/api';
import { calculateFileChecksum, toCents } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowLeft, Send, Save } from 'lucide-react';
import Link from 'next/link';

const CATEGORIES = [
  'Travel & Lodging',
  'Meals & Entertainment',
  'Office Supplies',
  'Software & Subscriptions',
  'Hardware & Equipment',
  'Telecom & Internet',
  'Training & Certifications',
  'Other'
];

export default function NewExpensePage() {
  const router = useRouter();
  const { activeOrg, user } = useAuth();
  const orgId = activeOrg?.id;

  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(activeOrg?.currency || 'INR');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [fileChecksum, setFileChecksum] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      try {
        const checksum = await calculateFileChecksum(selectedFile);
        setFileChecksum(checksum);
      } catch (err) {
        console.error('Error calculating file checksum:', err);
      }
    }
  };

  const handleSaveOrSubmit = async (shouldSubmitDirectly: boolean) => {
    if (!orgId || !user) {
      setError('Please select an active organisation.');
      return;
    }

    if (!merchant || !amount || !expenseDate || !description) {
      setError('Please fill in all required fields.');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid positive expense amount.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const expenseId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const amountInCents = toCents(numAmount);

      // 1. Create the DRAFT document in Supabase
      const newExpenseData = {
        id: expenseId,
        organisation_id: orgId,
        submitted_by: user.id,
        submitter_email: user.email || '',
        submitter_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        amount: amountInCents,
        currency: currency.toUpperCase(),
        category,
        merchant: merchant.trim(),
        expense_date: expenseDate,
        description: description.trim(),
        status: 'DRAFT',
        receipt: null
      };

      const { error: insertError } = await supabase
        .from('expenses')
        .insert(newExpenseData);

      if (insertError) {
        throw insertError;
      }

      // 2. If a receipt file is attached, request pre-signed upload URL from Cloud Functions
      if (file && fileChecksum) {
        setIsUploading(true);
        const { uploadUrl, storageKey, receiptId } = await api.generateReceiptUploadUrl({
          organisationId: orgId,
          expenseId,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSize: file.size,
          checksum: fileChecksum
        });

        // Upload directly to Cloudinary storage pre-signed URL
        try {
          if (uploadUrl.includes('cloudinary.com')) {
            // Cloudinary requires POST with FormData containing all auth parameters
            const urlObj = new URL(uploadUrl);
            const formData = new FormData();
            
            // Append all authentication/upload parameters from query string to the body
            urlObj.searchParams.forEach((value, key) => {
              formData.append(key, value);
            });
            
            // File MUST be included
            formData.append('file', file);
            
            const cleanUrl = urlObj.origin + urlObj.pathname;

            const response = await fetch(cleanUrl, {
              method: 'POST',
              body: formData
            });
            if (!response.ok) {
              const errText = await response.text();
              console.error('Cloudinary upload failed:', errText);
              throw new Error('Failed to upload file to Cloudinary');
            }
          } else if (!uploadUrl.includes('mock-cloudinary.storage.local')) {
            // S3 requires PUT with raw body
            const response = await fetch(uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': file.type || 'application/octet-stream' },
              body: file
            });
            if (!response.ok) {
              throw new Error('Failed to upload file to S3');
            }
          }
        } catch (uploadErr) {
          console.warn('Upload error:', uploadErr);
          throw uploadErr; // Abort if upload fails
        }

        // Attach receipt metadata record securely via backend
        await api.confirmReceiptUpload({
          organisationId: orgId,
          expenseId,
          receiptId,
          storageKey,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSize: file.size,
          checksum: fileChecksum
        });
      }

      // 3. If submitting directly, trigger the submitExpense Cloud Function
      if (shouldSubmitDirectly) {
        await api.submitExpense({
          organisationId: orgId,
          expenseId
        });
      }

      router.push(`/expenses/${expenseId}`);
    } catch (err: any) {
      console.error('Error creating expense:', err);
      setError(err.message || 'Failed to create expense claim.');
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Navigation & Header */}
      <div className="flex items-center gap-3">
        <Link href="/expenses">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to Expenses
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Submit New Expense Claim</CardTitle>
            <CardDescription>
              Provide merchant details, receipt documentation, and itemization for business reimbursement.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Financial Details */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Financial Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Merchant / Payee Name *"
                placeholder="e.g. AWS Cloud, Uber, Delta Airlines"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                required
              />

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Input
                    label="Amount *"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="SGD">SGD ($)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Expense Incurred Date *"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Business Purpose / Description *
              </label>
              <textarea
                rows={3}
                placeholder="Explain the business reason for this expense..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Section 2: Secure Receipt Upload */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Receipt Document (Cloudinary Storage)
            </h3>

            <div className="border-2 border-dashed border-slate-200 hover:border-primary-400 rounded-xl p-6 text-center transition-colors bg-slate-50/50">
              <input
                type="file"
                id="receipt-upload"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="receipt-upload" className="cursor-pointer block space-y-2">
                <UploadCloud className="w-10 h-10 text-slate-400 mx-auto" />
                <div className="text-sm font-semibold text-slate-700">
                  {file ? file.name : 'Click to select or drag and drop receipt file'}
                </div>
                <div className="text-xs text-slate-400">PDF, PNG, JPG or WEBP up to 15MB</div>
              </label>

              {file && (
                <div className="mt-4 p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs text-slate-700 max-w-md mx-auto">
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 text-primary-600 shrink-0" />
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  {fileChecksum && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-mono">
                      SHA256: {fileChecksum.substring(0, 8)}...
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSaveOrSubmit(false)}
            isLoading={isSubmitting && !isUploading}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Save as Draft
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => handleSaveOrSubmit(true)}
            isLoading={isSubmitting}
            leftIcon={<Send className="w-4 h-4" />}
          >
            Submit for Review
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
