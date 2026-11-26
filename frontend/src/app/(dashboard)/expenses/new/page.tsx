'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ReceiptAnalysisResponse, ForensicsPreviewResponse } from '@/types';
import {
  UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowLeft,
  Send, Save, Sparkles, Scan, ShieldAlert, ShieldCheck, PenTool,
  Clock, AlertTriangle, Layers, Check, X, Building, GraduationCap, Plane,
  Search, ChevronDown, UserCheck
} from 'lucide-react';
import Link from 'next/link';

export default function NewExpensePage() {
  const router = useRouter();
  const { user, role } = useAuth();

  const canSubmitOnBehalf = role === 'ADMIN' || role === 'REVIEWER';
  const [onBehalfOfUserId, setOnBehalfOfUserId] = useState<string>('');
  const isProxyFiling = canSubmitOnBehalf && Boolean(onBehalfOfUserId);
  const [proxySearchQuery, setProxySearchQuery] = useState<string>('');
  const [isProxyDropdownOpen, setIsProxyDropdownOpen] = useState<boolean>(false);
  const proxyDropdownRef = useRef<HTMLDivElement>(null);

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

  // File State
  const [file, setFile] = useState<File | null>(null);
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

  const filteredProxyEmployees = proxyEmployees.filter(emp => {
    if (!proxySearchQuery.trim()) return true;
    const q = proxySearchQuery.toLowerCase();
    return (
      emp.full_name?.toLowerCase().includes(q) ||
      emp.email?.toLowerCase().includes(q) ||
      emp.role?.toLowerCase().includes(q)
    );
  });

  // Close proxy dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (proxyDropdownRef.current && !proxyDropdownRef.current.contains(event.target as Node)) {
        setIsProxyDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const targetHasBankDetails = Boolean(
    (effectiveTargetUser?.bank_details?.account_number && effectiveTargetUser.bank_details.account_number.trim().length > 0) ||
    (effectiveTargetUser?.bank_details?.upi_id && effectiveTargetUser.bank_details.upi_id.trim().length > 0)
  );

  useEffect(() => {
    if (categories.length > 0 && !categories.some(c => c.code === category)) {
      setCategory(categories[0].code);
    }
  }, [categories, category]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
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
          category
        });
        setForensics(preview);
      } catch (e) {
        // Silently ignore preview errors
      } finally {
        setIsPreviewingForensics(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [amount, expenseDate, category]);

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
    const targetHasPan = Boolean(effectiveTargetUser?.pan_number && effectiveTargetUser?.pan_document_url);

    if (submitNow && isProxyFiling && !targetHasBankDetails) {
      setError(`Cannot submit immediately: Employee "${effectiveTargetUser?.full_name || 'selected'}" does not have bank details entered in their profile. You may save this claim as a DRAFT for now.`);
      return;
    }

    if (submitNow && isProxyFiling && !targetHasPan) {
      setError(`Cannot submit immediately: Employee "${effectiveTargetUser?.full_name || 'selected'}" does not have PAN number and PAN document uploaded in their profile. You may save this claim as a DRAFT for now.`);
      return;
    }

    const willSaveAsDraftDueToMissingProfile = submitNow && !isProxyFiling && user?.role === 'EMPLOYEE' && (!targetHasBankDetails || !targetHasPan);
    const effectiveSubmitNow = submitNow && !willSaveAsDraftDueToMissingProfile;

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
        on_behalf_of_user_id: isProxyFiling ? onBehalfOfUserId : undefined
      }, effectiveSubmitNow);

      if (willSaveAsDraftDueToMissingProfile) {
        const promptKey = !targetHasBankDetails ? 'prompt_bank=true' : 'prompt_pan=true';
        router.push(`/profile?${promptKey}&redirect_expense_id=${created.id}`);
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/expenses"
          className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">New Expense Claim</h1>
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
        {/* Admin / Reviewer Searchable Proxy Submission Option */}
        {canSubmitOnBehalf && (
          <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl space-y-3 relative" ref={proxyDropdownRef}>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-emerald-900">
                Submit on Behalf of Employee (Proxy Filing)
              </label>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                Admin / Reviewer Privileged
              </span>
            </div>

            {/* Selected User Display / Dropdown Trigger */}
            <div className="relative">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setIsProxyDropdownOpen(prev => !prev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsProxyDropdownOpen(prev => !prev);
                  }
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white border border-emerald-300 rounded-xl text-left text-sm transition-all hover:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer shadow-sm"
              >
                <div className="flex items-center gap-3 truncate">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0">
                    {effectiveTargetUser?.full_name ? effectiveTargetUser.full_name.substring(0, 2).toUpperCase() : 'ME'}
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-semibold text-neutral-900 truncate">
                      {onBehalfOfUserId
                        ? effectiveTargetUser?.full_name || 'Selected Employee'
                        : `Myself (${user?.full_name || user?.email} — Current User)`}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      {effectiveTargetUser?.email} · Role: {effectiveTargetUser?.role}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onBehalfOfUserId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOnBehalfOfUserId('');
                        setProxySearchQuery('');
                      }}
                      className="p-1 text-neutral-400 hover:text-red-500 hover:bg-neutral-100 rounded-lg transition-colors"
                      title="Clear proxy selection (reset to myself)"
                    >
                      <X size={15} />
                    </button>
                  )}
                  <ChevronDown size={16} className={`text-neutral-400 transition-transform ${isProxyDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Searchable Dropdown Popover */}
              {isProxyDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-neutral-200 rounded-xl shadow-2xl p-2 space-y-2 animate-in fade-in duration-150">
                  {/* Search Input */}
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search employee by name, email, or role..."
                      value={proxySearchQuery}
                      onChange={(e) => setProxySearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  {/* List of matching employees */}
                  <div className="max-h-60 overflow-y-auto divide-y divide-neutral-100">
                    {/* Default Option: Myself */}
                    <button
                      type="button"
                      onClick={() => {
                        setOnBehalfOfUserId('');
                        setIsProxyDropdownOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-lg flex items-center justify-between text-left transition-colors ${
                        !onBehalfOfUserId ? 'bg-emerald-50 text-emerald-900 font-semibold' : 'hover:bg-neutral-50 text-neutral-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-7 h-7 rounded-full bg-neutral-200 text-neutral-700 font-bold flex items-center justify-center text-xs shrink-0">
                          ME
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-semibold">Myself (Current User)</p>
                          <p className="text-[11px] text-neutral-500 truncate">{user?.email}</p>
                        </div>
                      </div>
                      {!onBehalfOfUserId && <Check size={16} className="text-emerald-600 shrink-0" />}
                    </button>

                    {/* Filtered Proxy Employees */}
                    {filteredProxyEmployees.length === 0 ? (
                      <div className="p-4 text-center text-xs text-neutral-400">
                        No employees found matching &quot;{proxySearchQuery}&quot;
                      </div>
                    ) : (
                      filteredProxyEmployees.map((emp) => {
                        const isSelected = onBehalfOfUserId === emp.id;
                        const empHasBank = Boolean(
                          (emp.bank_details?.account_number && emp.bank_details.account_number.trim().length > 0) ||
                          (emp.bank_details?.upi_id && emp.bank_details.upi_id.trim().length > 0)
                        );
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => {
                              setOnBehalfOfUserId(emp.id);
                              setIsProxyDropdownOpen(false);
                            }}
                            className={`w-full p-2.5 rounded-lg flex items-center justify-between text-left transition-colors ${
                              isSelected ? 'bg-emerald-50 text-emerald-900 font-semibold' : 'hover:bg-neutral-50 text-neutral-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs shrink-0">
                                {emp.full_name ? emp.full_name.substring(0, 2).toUpperCase() : 'U'}
                              </div>
                              <div className="truncate">
                                <p className="text-xs font-semibold truncate">{emp.full_name}</p>
                                <p className="text-[11px] text-neutral-500 truncate">{emp.email} · {emp.role}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              {empHasBank ? (
                                <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                                  Bank Active
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                                  No Bank
                                </span>
                              )}
                              {isSelected && <Check size={16} className="text-emerald-600" />}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Status Information Box */}
            {onBehalfOfUserId && (
              <div className="text-xs text-emerald-800 pt-1">
                Filing claim on behalf of <strong>{effectiveTargetUser?.full_name || effectiveTargetUser?.email}</strong>.
                {targetHasBankDetails ? (
                  <span className="text-emerald-700 font-semibold ml-1.5">✓ Bank details verified for disbursement.</span>
                ) : (
                  <span className="text-amber-800 font-semibold ml-1.5">⚠️ No bank details registered in profile. Can only be saved as DRAFT until bank details are added.</span>
                )}
              </div>
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
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white text-neutral-900 font-medium"
            >
              {(categories && categories.length > 0 ? categories : [
                { code: 'TRAVEL', name: 'Travel & Commute' },
                { code: 'MEALS', name: 'Meals & Entertainment' },
                { code: 'SUPPLIES', name: 'Office Supplies & Equipment' },
                { code: 'SOFTWARE', name: 'Software & Cloud Services' },
                { code: 'TRAINING', name: 'Training & Certifications' },
                { code: 'ACCOMMODATION', name: 'Hotel & Lodging' },
                { code: 'EVENT_PURCHASES', name: 'Event Purchases' },
                { code: 'OTHER', name: 'Miscellaneous & Other' },
              ]).map((cat) => (
                <option key={cat.code} value={cat.code} className="text-neutral-900 bg-white">
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
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white text-neutral-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
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
                  className="w-full px-4 py-2.5 border border-neutral-300 rounded-xl text-sm bg-white text-neutral-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
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

        {/* 1. Receipt Uploader Card */}
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 shadow-sm space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
              <UploadCloud size={18} className="text-emerald-600" />
              <span>Receipt Uploader *</span>
            </div>
            {file && (
              <span className="text-xs text-neutral-500 font-medium">
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </span>
            )}
          </div>

          {/* Dropzone */}
          <label className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${!file ? 'border-amber-300 hover:border-emerald-500 bg-amber-50/10' : 'border-neutral-300 hover:border-emerald-500 bg-neutral-50/50'}`}>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="text-center py-2 space-y-2">
              <div className="inline-flex p-2.5 bg-neutral-100 text-neutral-600 rounded-full">
                <UploadCloud size={20} />
              </div>
              <div>
                <p className="text-xs font-semibold text-neutral-700">
                  Drop invoice / receipt image or PDF *
                </p>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Supports PNG, JPG, and PDF receipt documents
                </p>
              </div>
            </div>
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
