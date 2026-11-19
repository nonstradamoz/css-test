'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ReceiptAnalysisResponse, ForensicsPreviewResponse } from '@/types';
import {
  UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowLeft,
  Send, Save, Sparkles, Scan, ShieldAlert, ShieldCheck, PenTool,
  Clock, AlertTriangle, Layers, Check, X, Building, GraduationCap, Plane
} from 'lucide-react';
import Link from 'next/link';

export default function NewExpensePage() {
  const router = useRouter();
  const { user, role } = useAuth();

  const canSubmitOnBehalf = role === 'ADMIN' || role === 'REVIEWER';
  const [onBehalfOfUserId, setOnBehalfOfUserId] = useState<string>('');

  // Form Fields
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [category, setCategory] = useState<string>('TRAVEL');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  // Category-specific mandatory details
  // 1. Hotel & Lodging (ACCOMMODATION)
  const [hotelName, setHotelName] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [hotelLocation, setHotelLocation] = useState('');
  const [hotelContact, setHotelContact] = useState('');

  // 2. Training & Certifications (TRAINING)
  const [certName, setCertName] = useState('');
  const [certInstitute, setCertInstitute] = useState('');
  const [certEnrollDate, setCertEnrollDate] = useState('');
  const [certType, setCertType] = useState('Professional Course');

  // 3. Travel & Commute (TRAVEL)
  const [travelMode, setTravelMode] = useState('Flight');
  const [travelStartDate, setTravelStartDate] = useState('');
  const [travelEndDate, setTravelEndDate] = useState('');
  const [boardingPoint, setBoardingPoint] = useState('');
  const [arrivalPoint, setArrivalPoint] = useState('');

  // File & AI Scanner State
  const [file, setFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ReceiptAnalysisResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forensics Preview State
  const [forensics, setForensics] = useState<ForensicsPreviewResponse | null>(null);
  const [isPreviewingForensics, setIsPreviewingForensics] = useState(false);

  // Load system settings
  const { data: systemSettings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api.settings.get()
  });

  // Load active dynamic categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-active'],
    queryFn: () => api.categories.list()
  });

  // Load corporate user list for Admin / Reviewer proxy submission
  const { data: userList = [] } = useQuery({
    queryKey: ['users-list-proxy'],
    queryFn: () => api.users.list(),
    enabled: canSubmitOnBehalf
  });

  const proxyEmployees = userList.filter(u => u.is_active !== false);
  const effectiveTargetUser = onBehalfOfUserId
    ? userList.find(u => u.id === onBehalfOfUserId)
    : user;

  const targetHasBankDetails = Boolean(
    (effectiveTargetUser?.bank_details?.account_number && effectiveTargetUser.bank_details.account_number.trim().length > 0) ||
    (effectiveTargetUser?.bank_details?.upi_id && effectiveTargetUser.bank_details.upi_id.trim().length > 0)
  );

  useEffect(() => {
    if (categories.length > 0 && !categories.some(c => c.code === category)) {
      setCategory(categories[0].code);
    }
  }, [categories, category]);

  // Handle file drop & AI Scanning
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setScanResult(null);

    // Run extraction in background for all roles
    // Employees will NOT see the extraction result in the form, but it will be attached to metadata for Admins/Reviewers
    setIsScanning(true);
    try {
      const result = await api.receipts.analyze(selectedFile);
      setScanResult(result);
    } catch (err: any) {
      console.warn('AI Receipt scan error:', err);
      // Non-blocking warning: user can still fill manually
    } finally {
      setIsScanning(false);
    }
  };

  // Apply AI extracted values to form (category-aware title formatting)
  const applyExtractedData = () => {
    if (!scanResult) return;

    let matchedCategoryName = '';
    if (scanResult.suggested_category) {
      const match = categories.find(c => c.code === scanResult.suggested_category);
      if (match) {
        setCategory(match.code);
        matchedCategoryName = match.name;
      }
    }

    if (scanResult.merchant_name) {
      const catSuffix = matchedCategoryName ? ` (${matchedCategoryName})` : '';
      setTitle(`${scanResult.merchant_name}${catSuffix}`);
    }

    if (scanResult.amount) setAmount(scanResult.amount.toString());
    if (scanResult.currency) setCurrency(scanResult.currency);
    if (scanResult.expense_date) {
      setExpenseDate(scanResult.expense_date);
    }
    if (scanResult.line_items && scanResult.line_items.length > 0) {
      const itemSummary = scanResult.line_items.map(i => `${i.description} (₹${i.amount})`).join(', ');
      setDescription(`Extracted Line Items: ${itemSummary}`);
    }
  };

  // Run live Forensics check when amount/date changes (debounced)
  useEffect(() => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || !expenseDate) {
      setForensics(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsPreviewingForensics(true);
      try {
        const preview = await api.expenses.forensicsPreview({
          amount: parsedAmount,
          expense_date: new Date(expenseDate).toISOString(),
          category,
          line_items: scanResult?.line_items as any
        });
        setForensics(preview);
      } catch (e) {
        // Silently ignore preview errors
      } finally {
        setIsPreviewingForensics(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [amount, expenseDate, category, scanResult]);

  const handleSaveOrSubmit = async (submitNow: boolean) => {
    if (!title || !amount || !expenseDate) {
      setError('Please provide title, amount, and expense date.');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid positive expense amount.');
      return;
    }

    if (submitNow && !file) {
      setError('A receipt upload is mandatory to submit an expense claim. Please upload a receipt or save as draft.');
      return;
    }

    // Category specifics validation
    let categoryDetails: Record<string, any> = {};
    if (category === 'ACCOMMODATION') {
      if (submitNow && (!hotelName.trim() || !checkIn.trim() || !checkOut.trim() || !hotelLocation.trim())) {
        setError('Hotel & Lodging claims require: Hotel Name, Check-in Date/Time, Check-out Date/Time, and Hotel Location.');
        return;
      }
      categoryDetails = {
        hotel_name: hotelName.trim(),
        check_in: checkIn.trim(),
        check_out: checkOut.trim(),
        hotel_location: hotelLocation.trim(),
        contact_number: hotelContact.trim() || undefined,
      };
    } else if (category === 'TRAINING') {
      if (submitNow && (!certName.trim() || !certInstitute.trim() || !certEnrollDate.trim() || !certType.trim())) {
        setError('Training & Certifications claims require: Certification Name, Platform / Institute, Enrollment Date, and Certification Type.');
        return;
      }
      categoryDetails = {
        certification_name: certName.trim(),
        institute: certInstitute.trim(),
        enrollment_date: certEnrollDate.trim(),
        certification_type: certType.trim(),
      };
    } else if (category === 'TRAVEL') {
      if (submitNow && (!travelMode.trim() || !travelStartDate.trim() || !travelEndDate.trim() || !boardingPoint.trim() || !arrivalPoint.trim())) {
        setError('Travel & Commute claims require: Mode of Travel, Start Date, End Date, Boarding Point, and Arrival Point.');
        return;
      }
      categoryDetails = {
        travel_mode: travelMode.trim(),
        start_date: travelStartDate.trim(),
        end_date: travelEndDate.trim(),
        boarding_point: boardingPoint.trim(),
        arrival_point: arrivalPoint.trim(),
      };
    }

    if (forensics?.is_blocked) {
      setError(forensics.block_reason || 'This claim is blocked by corporate forensics compliance.');
      return;
    }

    const isProxyFiling = canSubmitOnBehalf && !!onBehalfOfUserId;

    if (submitNow && isProxyFiling && !targetHasBankDetails) {
      setError(`Cannot submit immediately: Employee "${effectiveTargetUser?.full_name || 'selected'}" does not have bank details entered in their profile. You may save this claim as a DRAFT for now.`);
      return;
    }

    const willSaveAsDraftDueToMissingBank = submitNow && !isProxyFiling && user?.role === 'EMPLOYEE' && !targetHasBankDetails;
    const effectiveSubmitNow = submitNow && !willSaveAsDraftDueToMissingBank;

    setIsSubmitting(true);
    setError(null);

    try {
      let receiptUrl: string | undefined = undefined;

      // 1. Upload receipt to storage if attached
      if (file) {
        const uploadResult = await api.receipts.uploadFile(file);
        receiptUrl = uploadResult.url;
      }

      // 2. Create and optionally submit
      const created = await api.expenses.create({
        title,
        description: description || undefined,
        category,
        amount: parsedAmount as any,
        currency,
        expense_date: new Date(expenseDate).toISOString() as any,
        receipt_url: receiptUrl,
        category_details: Object.keys(categoryDetails).length > 0 ? categoryDetails : undefined,
        on_behalf_of_user_id: isProxyFiling ? onBehalfOfUserId : undefined,
        extracted_metadata: scanResult ? {
          merchant_name: scanResult.merchant_name,
          confidence_score: scanResult.confidence_score,
          is_handwritten: scanResult.is_handwritten,
          handwritten_notes: scanResult.handwritten_notes,
          line_items: scanResult.line_items,
          invoice_number: scanResult.invoice_number
        } : undefined
      }, effectiveSubmitNow);

      if (willSaveAsDraftDueToMissingBank) {
        router.push(`/profile?prompt_bank=true&redirect_expense_id=${created.id}`);
      } else if (isProxyFiling && !effectiveSubmitNow) {
        // Drafts are strictly private to the designated employee
        router.push('/expenses');
      } else {
        router.push(`/expenses/${created.id}`);
      }
    } catch (err: any) {
      if (err.message === 'Failed to fetch' || err.message?.includes('NetworkError')) {
        setError('Network error (Failed to fetch). Please verify your backend server is running and reachable.');
      } else {
        setError(err.message || 'Failed to create expense claim.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/expenses"
          className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">New Expense Claim</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Submit a claim.
          </p>
        </div>
      </div>

      {systemSettings?.expense_submissions_enabled === false && (
        <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-start gap-3 text-amber-900 shadow-sm animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-amber-900">Expense Submissions Temporarily Paused</h3>
            <p className="text-xs text-amber-800 leading-relaxed">
              Company-wide expense submissions have been paused by corporate administration. You may save your claim as a <strong>Draft</strong> for submission once the window reopens.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-sm text-red-600">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}


      {/* 2. Main Claim Submission Form */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-5">
        {/* Admin / Reviewer Proxy Submission Option */}
        {canSubmitOnBehalf && (
          <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-emerald-900">
                Submit on Behalf of Employee (Proxy Filing)
              </label>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                Admin / Reviewer Privileged
              </span>
            </div>
            <select
              value={onBehalfOfUserId}
              onChange={(e) => setOnBehalfOfUserId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-emerald-300 rounded-lg text-sm text-neutral-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <option value="">Myself ({user?.full_name || user?.email} - Current User)</option>
              {proxyEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.email}) — {emp.role}
                </option>
              ))}
            </select>
            {onBehalfOfUserId && (
              <p className="text-xs text-emerald-800">
                This claim will be attributed to <strong>{effectiveTargetUser?.full_name || effectiveTargetUser?.email}</strong>.
                {targetHasBankDetails ? (
                  <span className="text-emerald-700 font-semibold ml-1.5">✓ Bank details verified for disbursement.</span>
                ) : (
                  <span className="text-amber-800 font-semibold ml-1.5">⚠️ No bank details registered. Can only be saved as DRAFT until bank details are added.</span>
                )}
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
            Claim Title *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Flight ticket to Bangalore client meeting"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
              Amount (₹ INR) *
            </label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
            >
              {categories.map((cat) => (
                <option key={cat.code} value={cat.code}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
              Expense Incurred Date *
            </label>
            <input
              type="date"
              required
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
              Currency
            </label>
            <input
              type="text"
              readOnly
              value={currency}
              className="w-full px-4 py-2.5 bg-neutral-100 border border-neutral-200 rounded-xl text-sm text-neutral-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
            Business Purpose & Description
          </label>
          <textarea
            rows={3}
            placeholder="Explain business rationale, project milestones, or notes..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        {/* Dynamic Category Specific Details */}
        {category === 'ACCOMMODATION' && (
          <div className="bg-emerald-50/30 border border-emerald-200/80 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                <Building size={18} className="text-emerald-600" />
                <span>Hotel & Lodging Details *</span>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                Mandatory Details
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Hotel Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grand Hyatt, Marriott, Ginger"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Hotel Location / Address *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bandra Kurla Complex, Mumbai"
                  value={hotelLocation}
                  onChange={(e) => setHotelLocation(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Check-in Date & Time *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Check-out Date & Time *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Hotel Contact Number (If Available)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +91 22 6676 1234"
                  value={hotelContact}
                  onChange={(e) => setHotelContact(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        )}

        {category === 'TRAINING' && (
          <div className="bg-emerald-50/30 border border-emerald-200/80 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                <GraduationCap size={18} className="text-emerald-600" />
                <span>Training & Certification Details *</span>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                Mandatory Details
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Certification Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AWS Solutions Architect, PMP, Scikit-learn Mastery"
                  value={certName}
                  onChange={(e) => setCertName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Platform or Institute *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Coursera, Udemy, Harvard Online, AWS, IIM"
                  value={certInstitute}
                  onChange={(e) => setCertInstitute(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Enrollment Date *
                </label>
                <input
                  type="date"
                  required
                  value={certEnrollDate}
                  onChange={(e) => setCertEnrollDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Type of Certification *
                </label>
                <select
                  value={certType}
                  onChange={(e) => setCertType(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="Professional Course">Professional Course</option>
                  <option value="Technical Training">Technical Training</option>
                  <option value="Industry Accreditation">Industry Accreditation</option>
                  <option value="Executive Education">Executive Education</option>
                  <option value="Certification Exam">Certification Exam</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {category === 'TRAVEL' && (
          <div className="bg-emerald-50/30 border border-emerald-200/80 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                <Plane size={18} className="text-emerald-600" />
                <span>Travel & Commute Details *</span>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                Mandatory Details
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Mode of Travel *
                </label>
                <select
                  value={travelMode}
                  onChange={(e) => setTravelMode(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="Flight">Flight</option>
                  <option value="Train">Train</option>
                  <option value="Bus">Bus</option>
                  <option value="Cab / Taxi">Cab / Taxi</option>
                  <option value="Personal Vehicle">Personal Vehicle</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={travelStartDate}
                  onChange={(e) => setTravelStartDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  End Date *
                </label>
                <input
                  type="date"
                  required
                  value={travelEndDate}
                  onChange={(e) => setTravelEndDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Boarding Point (Origin) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mumbai (BOM) / New Delhi"
                  value={boardingPoint}
                  onChange={(e) => setBoardingPoint(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                  Arrival Point (Destination) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bengaluru (BLR) / Hyderabad"
                  value={arrivalPoint}
                  onChange={(e) => setArrivalPoint(e.target.value)}
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* 1. Multimodal AI Receipt Scanner Card */}
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
              <Scan size={18} className="text-emerald-600" />
              <span>Receipt Uploader *</span>
              {/* <span className="text-[11px] font-semibold px-2 py-0.5 bg-red-50 text-red-700 rounded-full border border-red-200">
                Mandatory to submit
              </span> */}
            </div>
            {file && (
              <span className="text-xs text-neutral-500 font-medium">
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </span>
            )}
          </div>

          {/* Dropzone */}
          <label className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${isScanning ? 'border-emerald-500 bg-emerald-50/20' : !file ? 'border-amber-300 hover:border-emerald-500 bg-amber-50/10' : 'border-neutral-300 hover:border-emerald-500 bg-neutral-50/50'
            }`}>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {isScanning ? (
              <div className="text-center py-4 space-y-3">
                <div className="inline-flex p-3 bg-emerald-100 text-emerald-600 rounded-full animate-bounce">
                  <Scan size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-900">Inspecting Document...</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Recognizing printed text, handwritten notes, and line items</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-2 space-y-2">
                <div className="inline-flex p-2.5 bg-neutral-100 text-neutral-600 rounded-full">
                  <UploadCloud size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-neutral-700">Drop invoice / receipt image or PDF *</p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">Supports printed receipts, hotel bills, and handwritten slips (PNG, JPG, PDF)</p>
                </div>
              </div>
            )}
          </label>

          {!file && (
            <p className="text-xs text-amber-600 flex items-center gap-1.5 font-medium">
              <AlertCircle size={14} className="shrink-0" />
              <span>A receipt upload is mandatory to submit this claim for approval.</span>
            </p>
          )}

          {file && (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-neutral-800 font-medium">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>Receipt document attached: <strong>{file.name}</strong></span>
              </div>
              <span className="text-neutral-500 font-mono">{(file.size / 1024).toFixed(0)} KB</span>
            </div>
          )}

          {/* Extracted Result Banner (Reviewers & Admins Only, confidential from Employees) */}
          {role !== 'EMPLOYEE' && scanResult && (
            <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-950">Receipt Extraction Complete:</span>
                  <span className="text-xs font-bold text-neutral-900 px-2 py-0.5 bg-white border border-emerald-200 rounded">
                    {scanResult.merchant_name}
                  </span>
                  <span className="text-xs font-bold text-emerald-800">
                    ₹{scanResult.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={applyExtractedData}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm transition-colors self-start sm:self-auto"
                >
                  <Sparkles size={13} />
                  Auto-Fill Claim Form
                </button>
              </div>

              {/* Handwritten Alert */}
              {scanResult.is_handwritten && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-800">
                  <PenTool size={14} className="shrink-0 text-amber-600" />
                  <span>
                    <strong>Handwritten Document Recognized:</strong> Detected handwritten notes/totals ({scanResult.handwritten_notes || 'Verified'}). Please verify amounts.
                  </span>
                </div>
              )}

              {/* Extracted Line Items */}
              {scanResult.line_items.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Extracted Line Items ({scanResult.line_items.length}):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {scanResult.line_items.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded-lg border flex items-center justify-between ${item.flagged
                          ? 'bg-red-50/80 border-red-200 text-red-900'
                          : 'bg-white border-neutral-200 text-neutral-700'
                          }`}
                      >
                        <span className="truncate mr-2">{item.description}</span>
                        <span className="font-semibold shrink-0">₹{item.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Live Forensics Policy Compliance Meter */}
        {forensics && (
          <div className={`p-4 rounded-xl border space-y-2.5 ${forensics.risk_level === 'HIGH'
            ? 'bg-red-50/70 border-red-200'
            : forensics.risk_level === 'MEDIUM'
              ? 'bg-amber-50/70 border-amber-200'
              : 'bg-emerald-50/70 border-emerald-200'
            }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                {forensics.risk_level === 'HIGH' ? (
                  <ShieldAlert size={16} className="text-red-600" />
                ) : forensics.risk_level === 'MEDIUM' ? (
                  <AlertTriangle size={16} className="text-amber-600" />
                ) : (
                  <ShieldCheck size={16} className="text-emerald-600" />
                )}
                AI Forensic Policy Score: {forensics.risk_score}/100 ({forensics.risk_level} RISK)
              </span>

              {forensics.will_escalate_tier2 && (
                <span className="text-[11px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-300">
                  Mandatory Tier-2 Finance Review Required
                </span>
              )}
            </div>

            {/* Itemized flags */}
            {forensics.flags.length > 0 ? (
              <div className="space-y-1 pt-1">
                {forensics.flags.map((flag, idx) => (
                  <div key={idx} className="text-xs text-neutral-700 flex items-start gap-1.5">
                    <span className="font-bold text-neutral-900 shrink-0">• {flag.label}:</span>
                    <span>{flag.description}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-emerald-800">
                ✓ No smurfing, collisions, or policy violations detected. Compliant with standard financial policy.
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSaveOrSubmit(false)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium rounded-xl text-sm transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            Save as Draft
          </button>

          <button
            type="button"
            disabled={isSubmitting || forensics?.is_blocked || systemSettings?.expense_submissions_enabled === false}
            onClick={() => handleSaveOrSubmit(true)}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            <Send size={16} />
            {isSubmitting ? 'Submitting...' : systemSettings?.expense_submissions_enabled === false ? 'Submissions Paused' : 'Submit Claim'}
          </button>
        </div>
      </div>
    </div>
  );
}
