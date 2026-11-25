'use client';

import React, { useState, useMemo } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Vendor, VendorCreate, VendorBankDetails, Expense } from '@/types';
import { GroupedExpenseSections } from '@/components/expenses/GroupedSectionWrapper';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Building2,
  Plus,
  Landmark,
  UploadCloud,
  Scan,
  CheckCircle2,
  AlertTriangle,
  Search,
  Edit3,
  Trash2,
  FileText,
  Sparkles,
  ShieldCheck,
  X,
  CreditCard,
  Phone,
  Mail
} from 'lucide-react';
import Link from 'next/link';

type TabKey = 'submit' | 'profiles' | 'bills';

const EMPTY_BANK: VendorBankDetails = {
  account_holder_name: '',
  bank_name: '',
  bank_address: '',
  account_number: '',
  ifsc_code: '',
  upi_id: ''
};

export default function VendorsPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('submit');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Vendors & Categories Queries
  const [vendorSearch, setVendorSearch] = useState('');
  const { data: vendors = [], isLoading: isLoadingVendors, refetch: refetchVendors } = useQuery({
    queryKey: ['vendors-list', vendorSearch],
    queryFn: () => api.vendors.list({ search: vendorSearch || undefined }),
    enabled: role === 'ADMIN'
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-active'],
    queryFn: () => api.categories.list()
  });

  const { data: sysSettings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api.settings.get()
  });
  const isAiEnabled = sysSettings?.ai_receipt_extractor_enabled ?? true;

  const { data: vendorBills = [], isLoading: isLoadingBills, refetch: refetchBills } = useQuery({
    queryKey: ['vendor-bills-list'],
    queryFn: () => api.expenses.list({ vendor_only: true }),
    enabled: role === 'ADMIN'
  });

  // ==================== VENDOR PROFILE MODAL STATE ====================
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [vName, setVName] = useState('');
  const [vContact, setVContact] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vGstin, setVGstin] = useState('');
  const [vPan, setVPan] = useState('');
  const [vPanDocUrl, setVPanDocUrl] = useState('');
  const [isUploadingVendorPan, setIsUploadingVendorPan] = useState(false);
  const [vAddress, setVAddress] = useState('');
  const [vCategory, setVCategory] = useState('SUPPLIES');
  const [vBank, setVBank] = useState<VendorBankDetails>({ ...EMPTY_BANK });
  const [isSavingVendor, setIsSavingVendor] = useState(false);

  const openCreateVendorModal = () => {
    setEditingVendor(null);
    setVName('');
    setVContact('');
    setVEmail('');
    setVPhone('');
    setVGstin('');
    setVPan('');
    setVPanDocUrl('');
    setVAddress('');
    setVCategory(categories[0]?.code || 'SUPPLIES');
    setVBank({ ...EMPTY_BANK });
    setShowVendorModal(true);
  };

  const openEditVendorModal = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setVName(vendor.name);
    setVContact(vendor.contact_person || '');
    setVEmail(vendor.email || '');
    setVPhone(vendor.phone || '');
    setVGstin(vendor.gstin || '');
    setVPan(vendor.pan || '');
    setVPanDocUrl(vendor.pan_document_url || '');
    setVAddress(vendor.address || '');
    setVCategory(vendor.default_category || 'SUPPLIES');
    setVBank({
      account_holder_name: vendor.bank_details?.account_holder_name || '',
      bank_name: vendor.bank_details?.bank_name || '',
      bank_address: vendor.bank_details?.bank_address || '',
      account_number: vendor.bank_details?.account_number || '',
      ifsc_code: vendor.bank_details?.ifsc_code || '',
      upi_id: vendor.bank_details?.upi_id || ''
    });
    setShowVendorModal(true);
  };

  const handleVendorPanUpload = async (file: File) => {
    setIsUploadingVendorPan(true);
    setBanner(null);
    try {
      const res = await api.receipts.uploadFile(file);
      setVPanDocUrl(res.url);
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to upload vendor PAN document.' });
    } finally {
      setIsUploadingVendorPan(false);
    }
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    if (!vPan.trim() || vPan.trim().length < 10) {
      setBanner({ type: 'error', text: 'A valid 10-character PAN number is compulsory for vendor profiles.' });
      return;
    }
    if (!vPanDocUrl.trim()) {
      setBanner({ type: 'error', text: 'Please upload the vendor PAN card document or image.' });
      return;
    }

    setIsSavingVendor(true);
    try {
      const payload: VendorCreate = {
        name: vName.trim(),
        contact_person: vContact.trim() || undefined,
        email: vEmail.trim() || undefined,
        phone: vPhone.trim() || undefined,
        gstin: vGstin.trim() || undefined,
        pan: vPan.trim().toUpperCase(),
        pan_document_url: vPanDocUrl.trim(),
        address: vAddress.trim() || undefined,
        default_category: vCategory || undefined,
        bank_details: {
          account_holder_name: vBank.account_holder_name.trim(),
          bank_name: vBank.bank_name.trim(),
          bank_address: vBank.bank_address?.trim() || undefined,
          account_number: vBank.account_number.trim(),
          ifsc_code: vBank.ifsc_code.trim().toUpperCase(),
          upi_id: vBank.upi_id?.trim() || undefined
        }
      };

      if (editingVendor) {
        await api.vendors.update(editingVendor.id, payload);
        setBanner({ type: 'success', text: `Vendor profile "${payload.name}" updated.` });
      } else {
        const created = await api.vendors.create(payload);
        setSelectedVendorId(created.id);
        if (created.default_category) setBillCategory(created.default_category);
        setBanner({ type: 'success', text: `Vendor profile "${created.name}" created with banking details.` });
      }

      setShowVendorModal(false);
      await refetchVendors();
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to save vendor profile.' });
    } finally {
      setIsSavingVendor(false);
    }
  };

  const handleDeleteVendor = async (vendor: Vendor) => {
    try {
      await api.vendors.delete(vendor.id);
      setBanner({ type: 'success', text: `Vendor "${vendor.name}" deactivated/removed.` });
      if (selectedVendorId === vendor.id) setSelectedVendorId('');
      await refetchVendors();
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to remove vendor.' });
    }
  };

  // ==================== SUBMIT VENDOR BILL STATE ====================
  const activeVendors = useMemo(() => vendors.filter((v) => v.is_active), [vendors]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const selectedVendor = useMemo(
    () => vendors.find((v) => v.id === selectedVendorId) || null,
    [vendors, selectedVendorId]
  );

  const [billFile, setBillFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [extractedMeta, setExtractedMeta] = useState<Record<string, any> | null>(null);

  const [billTitle, setBillTitle] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [billCategory, setBillCategory] = useState('SUPPLIES');
  const [billAmount, setBillAmount] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [billDescription, setBillDescription] = useState('');
  const [autoApproveBill, setAutoApproveBill] = useState(true);
  const [isSubmittingBill, setIsSubmittingBill] = useState(false);

  // Dynamic Category Details State (ACCOMMODATION, TRAINING, TRAVEL)
  const [hotelName, setHotelName] = useState('');
  const [hotelLocation, setHotelLocation] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [hotelContact, setHotelContact] = useState('');

  const [certName, setCertName] = useState('');
  const [certInstitute, setCertInstitute] = useState('');
  const [certEnrollDate, setCertEnrollDate] = useState('');
  const [certType, setCertType] = useState('Professional Course');

  const [travelMode, setTravelMode] = useState('Flight');
  const [travelStartDate, setTravelStartDate] = useState('');
  const [travelEndDate, setTravelEndDate] = useState('');
  const [boardingPoint, setBoardingPoint] = useState('');
  const [arrivalPoint, setArrivalPoint] = useState('');

  const handleVendorChange = (id: string) => {
    setSelectedVendorId(id);
    const v = vendors.find((item) => item.id === id);
    if (v?.default_category) {
      setBillCategory(v.default_category);
    }
  };

  const handleBillFileSelect = async (file: File) => {
    setBillFile(file);
    setBanner(null);
    if (!isAiEnabled) return;

    setIsScanning(true);
    try {
      const analysis = await api.receipts.analyze(file);
      setExtractedMeta(analysis as any);
      if (analysis.amount && !billAmount) setBillAmount(String(analysis.amount));
      if (analysis.invoice_number && !invoiceNumber) setInvoiceNumber(analysis.invoice_number);
      if (analysis.expense_date && analysis.date_verified) setBillDate(analysis.expense_date.split('T')[0]);
      if (analysis.merchant_name && !billTitle) {
        setBillTitle(`Vendor Invoice - ${analysis.merchant_name}${analysis.invoice_number ? ` (#${analysis.invoice_number})` : ''}`);
      }
    } catch {
      // Allow manual entry if scan fails
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmitVendorBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    if (!selectedVendorId) {
      setBanner({ type: 'error', text: 'Please select a Vendor Profile before submitting.' });
      return;
    }
    if (!billFile) {
      setBanner({ type: 'error', text: 'Please attach the vendor invoice or bill document.' });
      return;
    }
    const parsedAmt = parseFloat(billAmount);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      setBanner({ type: 'error', text: 'Please enter a valid positive bill amount.' });
      return;
    }

    setIsSubmittingBill(true);
    try {
      const uploadRes = await api.receipts.uploadFile(billFile);

      const finalTitle = invoiceNumber.trim() && !billTitle.includes(invoiceNumber.trim())
        ? `${billTitle.trim()} (Inv: ${invoiceNumber.trim()})`
        : billTitle.trim();

      const catDetails: Record<string, any> = {};
      if (invoiceNumber.trim()) catDetails.invoice_number = invoiceNumber.trim();
      if (billCategory === 'ACCOMMODATION') {
        catDetails.hotel_name = hotelName.trim();
        catDetails.hotel_location = hotelLocation.trim();
        catDetails.check_in = checkIn;
        catDetails.check_out = checkOut;
        if (hotelContact.trim()) catDetails.contact_number = hotelContact.trim();
      } else if (billCategory === 'TRAINING') {
        catDetails.certification_name = certName.trim();
        catDetails.institute = certInstitute.trim();
        catDetails.enrollment_date = certEnrollDate;
        catDetails.certification_type = certType;
      } else if (billCategory === 'TRAVEL') {
        catDetails.travel_mode = travelMode;
        catDetails.start_date = travelStartDate;
        catDetails.end_date = travelEndDate;
        catDetails.boarding_point = boardingPoint.trim();
        catDetails.arrival_point = arrivalPoint.trim();
      }

      await api.expenses.create(
        {
          title: finalTitle,
          description: billDescription.trim() || `Vendor Bill for ${selectedVendor?.name}`,
          category: billCategory,
          amount: parsedAmt,
          currency: sysSettings?.default_currency || 'INR',
          expense_date: new Date(`${billDate}T12:00:00Z`).toISOString(),
          receipt_url: uploadRes.url,
          receipt_hash: undefined,
          extracted_metadata: extractedMeta || undefined,
          category_details: Object.keys(catDetails).length > 0 ? catDetails : undefined,
          vendor_id: selectedVendorId,
          auto_approve_vendor_bill: autoApproveBill
        },
        true
      );

      // Reset form
      setBillFile(null);
      setExtractedMeta(null);
      setBillTitle('');
      setInvoiceNumber('');
      setBillAmount('');
      setBillDescription('');
      setHotelName('');
      setHotelLocation('');
      setCheckIn('');
      setCheckOut('');
      setHotelContact('');
      setCertName('');
      setCertInstitute('');
      setCertEnrollDate('');
      setTravelStartDate('');
      setTravelEndDate('');
      setBoardingPoint('');
      setArrivalPoint('');

      await Promise.all([
        refetchBills(),
        queryClient.invalidateQueries({ queryKey: ['expenses-list'] }),
        queryClient.invalidateQueries({ queryKey: ['pending-reviews'] }),
        queryClient.invalidateQueries({ queryKey: ['pending-approvals'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      ]);

      setBanner({
        type: 'success',
        text: autoApproveBill
          ? `Vendor bill submitted and approved for payout to ${selectedVendor?.name}.`
          : `Vendor bill submitted for review.`
      });
      setActiveTab('bills');
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to submit vendor bill.' });
    } finally {
      setIsSubmittingBill(false);
    }
  };

  if (role !== 'ADMIN') {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-3">
        <ShieldCheck size={36} className="mx-auto text-brand-500" />
        <h1 className="text-xl font-bold text-neutral-900">Admin Access Required</h1>
        <p className="text-sm text-neutral-500">
          Only corporate administrators can create vendor profiles and submit vendor bills.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Vendor Bills & Profiles</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-brand-50 text-brand-700 border border-brand-200">
              Admin Portal
            </span>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Manage vendor profiles with verified banking details and submit vendor invoices for payout.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateVendorModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors self-start sm:self-auto"
        >
          <Plus size={16} />
          New Vendor Profile
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="inline-flex rounded-xl bg-neutral-100 p-1 border border-neutral-200 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab('submit')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'submit' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Submit Vendor Bill
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('profiles')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'profiles' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Vendor Profiles ({vendors.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bills')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'bills' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Vendor Bills History ({vendorBills.length})
        </button>
      </div>

      {banner && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-2.5 text-sm ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {banner.type === 'success' ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertTriangle size={18} className="shrink-0" />}
          <span className="flex-1">{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} className="text-xs font-semibold opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* ==================== TAB 1: SUBMIT VENDOR BILL ==================== */}
      {activeTab === 'submit' && (
        <form onSubmit={handleSubmitVendorBill} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Vendor Selection + Bill Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Vendor Selector */}
            <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                  <Building2 size={18} className="text-brand-600" />
                  <span>1. Select Vendor Profile *</span>
                </div>
                <button
                  type="button"
                  onClick={openCreateVendorModal}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                >
                  <Plus size={14} /> Add Vendor
                </button>
              </div>

              <select
                required
                value={selectedVendorId}
                onChange={(e) => handleVendorChange(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              >
                <option value="">-- Choose a Vendor Profile --</option>
                {activeVendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.gstin ? `(${v.gstin})` : ''} — {v.bank_details?.bank_name}
                  </option>
                ))}
              </select>

              {activeVendors.length === 0 && !isLoadingVendors && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No active vendor profiles found. Click <strong>+ Add Vendor</strong> to create your first vendor with banking details.
                </p>
              )}
            </div>

            {/* Step 2: Invoice Upload */}
            <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                  <Scan size={18} className="text-brand-600" />
                  <span>2. Vendor Invoice / Bill Document *</span>
                </div>
                {isAiEnabled && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 inline-flex items-center gap-1">
                    <Sparkles size={11} /> AI Auto-Fill Active
                  </span>
                )}
              </div>

              <label className="block border-2 border-dashed border-neutral-300 hover:border-brand-400 rounded-xl p-6 text-center cursor-pointer transition-colors bg-neutral-50/50">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleBillFileSelect(f);
                  }}
                />
                {isScanning ? (
                  <div className="py-2 text-xs font-semibold text-brand-600">
                    Analyzing vendor invoice...
                  </div>
                ) : billFile ? (
                  <div className="py-1 space-y-1">
                    <FileText size={24} className="mx-auto text-brand-600" />
                    <p className="text-xs font-bold text-neutral-800">{billFile.name}</p>
                    <p className="text-[11px] text-neutral-500">{(billFile.size / 1024).toFixed(0)} KB · Click to replace</p>
                  </div>
                ) : (
                  <div className="py-2 space-y-1.5">
                    <UploadCloud size={22} className="mx-auto text-neutral-400" />
                    <p className="text-xs font-semibold text-neutral-700">Drop vendor invoice or click to upload *</p>
                    <p className="text-[11px] text-neutral-400">Supports PDF, PNG, JPG</p>
                  </div>
                )}
              </label>
            </div>

            {/* Step 3: Bill Details */}
            <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
              <div className="text-sm font-bold text-neutral-900">3. Invoice Details</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">Bill Title / Purpose *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cloud Hosting Services - Nov 2026"
                    value={billTitle}
                    onChange={(e) => setBillTitle(e.target.value)}
                    className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">Invoice / Bill Number</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-0891"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">Category *</label>
                  <select
                    value={billCategory}
                    onChange={(e) => setBillCategory(e.target.value)}
                    className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    {categories.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                    {categories.length === 0 && <option value="SUPPLIES">Supplies</option>}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">Amount ({sysSettings?.default_currency || 'INR'}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">Bill Date *</label>
                  <input
                    type="date"
                    required
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">Description / Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Additional notes for accounting or audit trail..."
                    value={billDescription}
                    onChange={(e) => setBillDescription(e.target.value)}
                    className="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
              </div>

              {/* Dynamic Mandatory Category Details */}
              {billCategory === 'ACCOMMODATION' && (
                <div className="bg-brand-50/40 border border-brand-200/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900">Hotel & Lodging Details *</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-brand-100 text-brand-800 rounded-full">Mandatory</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Hotel Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Grand Hyatt"
                        value={hotelName}
                        onChange={(e) => setHotelName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Hotel Location *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Mumbai"
                        value={hotelLocation}
                        onChange={(e) => setHotelLocation(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Check-in Date & Time *</label>
                      <input
                        type="datetime-local"
                        required
                        value={checkIn}
                        onChange={(e) => setCheckIn(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Check-out Date & Time *</label>
                      <input
                        type="datetime-local"
                        required
                        value={checkOut}
                        onChange={(e) => setCheckOut(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Hotel Contact Number (Optional)</label>
                      <input
                        type="tel"
                        placeholder="e.g. +91 22 6676 1234"
                        value={hotelContact}
                        onChange={(e) => setHotelContact(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {billCategory === 'TRAINING' && (
                <div className="bg-brand-50/40 border border-brand-200/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900">Training & Certification Details *</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-brand-100 text-brand-800 rounded-full">Mandatory</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Certification Name *</label>
                      <input
                        type="text"
                        required
                        value={certName}
                        onChange={(e) => setCertName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Platform / Institute *</label>
                      <input
                        type="text"
                        required
                        value={certInstitute}
                        onChange={(e) => setCertInstitute(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Enrollment Date *</label>
                      <input
                        type="date"
                        required
                        value={certEnrollDate}
                        onChange={(e) => setCertEnrollDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Type of Certification *</label>
                      <select
                        value={certType}
                        onChange={(e) => setCertType(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      >
                        <option value="Professional Course">Professional Course</option>
                        <option value="Technical Training">Technical Training</option>
                        <option value="Industry Accreditation">Industry Accreditation</option>
                        <option value="Certification Exam">Certification Exam</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {billCategory === 'TRAVEL' && (
                <div className="bg-brand-50/40 border border-brand-200/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900">Travel & Commute Details *</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-brand-100 text-brand-800 rounded-full">Mandatory</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Mode of Travel *</label>
                      <select
                        value={travelMode}
                        onChange={(e) => setTravelMode(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      >
                        <option value="Flight">Flight</option>
                        <option value="Train">Train</option>
                        <option value="Bus">Bus</option>
                        <option value="Cab / Taxi">Cab / Taxi</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Start Date *</label>
                      <input
                        type="date"
                        required
                        value={travelStartDate}
                        onChange={(e) => setTravelStartDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">End Date *</label>
                      <input
                        type="date"
                        required
                        value={travelEndDate}
                        onChange={(e) => setTravelEndDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Boarding Point *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. DEL / Mumbai Central"
                        value={boardingPoint}
                        onChange={(e) => setBoardingPoint(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-neutral-600 mb-1">Arrival Point *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. BLR / Bengaluru"
                        value={arrivalPoint}
                        onChange={(e) => setArrivalPoint(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2.5 pt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoApproveBill}
                  onChange={(e) => setAutoApproveBill(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs font-medium text-neutral-700">
                  Approve immediately for vendor payout (skip Tier 1/2 review queue)
                </span>
              </label>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingBill || !selectedVendorId || !billFile}
                  className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmittingBill ? 'Submitting Vendor Bill...' : 'Submit Vendor Bill'}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live Vendor Banking Details Preview */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm space-y-4 sticky top-20">
              <div className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                <Landmark size={18} className="text-brand-600" />
                <span>Vendor Payout Account</span>
              </div>

              {selectedVendor ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-brand-50/70 border border-brand-200/70">
                    <p className="text-sm font-bold text-neutral-900">{selectedVendor.name}</p>
                    {selectedVendor.gstin && (
                      <p className="text-xs text-brand-700 font-medium mt-0.5">GSTIN: {selectedVendor.gstin}</p>
                    )}
                    {selectedVendor.pan && (
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-neutral-700 font-mono">PAN: {selectedVendor.pan}</p>
                        {selectedVendor.pan_document_url && (
                          <a
                            href={selectedVendor.pan_document_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-brand-600 hover:underline"
                          >
                            View PAN Doc ↗
                          </a>
                        )}
                      </div>
                    )}
                    {selectedVendor.contact_person && (
                      <p className="text-xs text-neutral-600 mt-1">Contact: {selectedVendor.contact_person}</p>
                    )}
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-neutral-100">
                      <span className="text-neutral-500">Account Holder</span>
                      <span className="font-semibold text-neutral-900">{selectedVendor.bank_details?.account_holder_name || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-neutral-100">
                      <span className="text-neutral-500">Bank Name</span>
                      <span className="font-semibold text-neutral-900">{selectedVendor.bank_details?.bank_name || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-neutral-100">
                      <span className="text-neutral-500">Account Number</span>
                      <span className="font-mono font-semibold text-neutral-900">{selectedVendor.bank_details?.account_number || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-neutral-100">
                      <span className="text-neutral-500">IFSC Code</span>
                      <span className="font-mono font-semibold text-neutral-900">{selectedVendor.bank_details?.ifsc_code || '—'}</span>
                    </div>
                    {selectedVendor.bank_details?.upi_id && (
                      <div className="flex justify-between py-1.5 border-b border-neutral-100">
                        <span className="text-neutral-500">UPI ID</span>
                        <span className="font-mono font-semibold text-neutral-900">{selectedVendor.bank_details.upi_id}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditVendorModal(selectedVendor)}
                    className="w-full py-2 border border-neutral-200 hover:bg-neutral-50 rounded-xl text-xs font-semibold text-neutral-700 transition-colors"
                  >
                    Edit Vendor Banking Details
                  </button>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-neutral-400 space-y-2">
                  <CreditCard size={28} className="mx-auto text-neutral-300" />
                  <p>Select a vendor profile to preview their verified payout banking details.</p>
                </div>
              )}
            </div>
          </div>
        </form>
      )}

      {/* ==================== TAB 2: VENDOR PROFILES DIRECTORY ==================== */}
      {activeTab === 'profiles' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-sm flex items-center gap-3">
            <Search size={16} className="text-neutral-400" />
            <input
              type="text"
              placeholder="Search vendors by name, GSTIN, email, or contact..."
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              className="w-full text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none"
            />
          </div>

          {isLoadingVendors ? (
            <div className="p-12 text-center text-sm text-neutral-500">Loading vendor profiles...</div>
          ) : vendors.length === 0 ? (
            <div className="bg-white rounded-2xl border border-neutral-200/80 p-12 text-center space-y-3">
              <Building2 size={34} className="mx-auto text-neutral-300" />
              <p className="text-base font-bold text-neutral-900">No vendor profiles yet</p>
              <p className="text-xs text-neutral-500">Create vendor profiles to save banking details and streamline bill payouts.</p>
              <button
                type="button"
                onClick={openCreateVendorModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold"
              >
                <Plus size={14} /> Create First Vendor
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vendors.map((v) => (
                <div key={v.id} className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-sm space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-neutral-900">{v.name}</h3>
                        {v.gstin && <p className="text-xs font-mono text-brand-700">GSTIN: {v.gstin}</p>}
                        {v.pan && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs font-mono text-neutral-600">PAN: {v.pan}</p>
                            {v.pan_document_url && (
                              <a
                                href={v.pan_document_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-semibold text-brand-600 hover:underline"
                              >
                                View PAN ↗
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        v.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                      }`}>
                        {v.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {(v.email || v.phone) && (
                      <div className="text-xs text-neutral-500 space-y-1">
                        {v.email && <p className="flex items-center gap-1.5"><Mail size={12} /> {v.email}</p>}
                        {v.phone && <p className="flex items-center gap-1.5"><Phone size={12} /> {v.phone}</p>}
                      </div>
                    )}

                    <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100 text-xs space-y-1">
                      <p className="font-semibold text-neutral-700 flex items-center gap-1.5">
                        <Landmark size={13} className="text-brand-600" />
                        {v.bank_details?.bank_name}
                      </p>
                      <p className="text-neutral-500 font-mono">A/C: {v.bank_details?.account_number}</p>
                      <p className="text-neutral-500 font-mono">IFSC: {v.bank_details?.ifsc_code}</p>
                      {v.bank_details?.upi_id && <p className="text-neutral-500 font-mono">UPI: {v.bank_details.upi_id}</p>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-neutral-100 gap-2">
                    <button
                      type="button"
                      onClick={() => { handleVendorChange(v.id); setActiveTab('submit'); }}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Submit Bill →
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditVendorModal(v)}
                        className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg"
                        title="Edit Vendor"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteVendor(v)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Deactivate / Delete Vendor"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: SUBMITTED VENDOR BILLS ==================== */}
      {activeTab === 'bills' && (
        isLoadingBills ? (
          <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-12 text-center text-sm text-neutral-500">
            Loading vendor bills...
          </div>
        ) : vendorBills.length === 0 ? (
          <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-16 text-center space-y-2">
            <FileText size={32} className="mx-auto text-neutral-300" />
            <p className="text-sm font-bold text-neutral-900">No vendor bills submitted yet</p>
            <p className="text-xs text-neutral-500">Submitted vendor invoices will appear here.</p>
          </div>
        ) : (
          <GroupedExpenseSections
            expenses={vendorBills}
            renderItems={(items) => (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50/75 border-b border-neutral-200 text-xs text-neutral-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Bill Title</th>
                      <th className="px-6 py-3.5">Vendor</th>
                      <th className="px-6 py-3.5">Date</th>
                      <th className="px-6 py-3.5">Amount</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {items.map((bill: Expense & { vendor_name?: string | null }) => (
                      <tr key={bill.id} className="hover:bg-neutral-50/60 transition-colors">
                        <td className="px-6 py-4 font-semibold text-neutral-900">{bill.title}</td>
                        <td className="px-6 py-4 text-xs font-medium text-brand-700">{bill.vendor_name || bill.submitter_name}</td>
                        <td className="px-6 py-4 text-xs text-neutral-500">{formatDate(bill.expense_date)}</td>
                        <td className="px-6 py-4 font-semibold text-neutral-900">{formatCurrency(bill.amount, bill.currency)}</td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                            {bill.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link href={`/expenses/${bill.id}`} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                            View / Payout →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          />
        )
      )}

      {/* ==================== CREATE / EDIT VENDOR MODAL ==================== */}
      {showVendorModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-lg font-bold text-neutral-900">
                {editingVendor ? 'Edit Vendor Profile' : 'Create New Vendor Profile'}
              </h3>
              <button type="button" onClick={() => setShowVendorModal(false)} className="text-neutral-400 hover:text-neutral-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveVendor} className="space-y-5">
              {/* Business Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Vendor Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Vendor / Company Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Acme Cloud Solutions Pvt Ltd"
                      value={vName}
                      onChange={(e) => setVName(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={vContact}
                      onChange={(e) => setVContact(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={vEmail}
                      onChange={(e) => setVEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={vPhone}
                      onChange={(e) => setVPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">GSTIN</label>
                    <input
                      type="text"
                      placeholder="e.g. 29ABCDE1234F1Z5"
                      value={vGstin}
                      onChange={(e) => setVGstin(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">PAN Number *</label>
                    <input
                      type="text"
                      required
                      minLength={10}
                      maxLength={20}
                      placeholder="ABCDE1234F"
                      value={vPan}
                      onChange={(e) => setVPan(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm uppercase font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      PAN Card Document / Image (Compulsory) *
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-neutral-300 hover:border-brand-400 rounded-xl text-xs font-semibold text-neutral-700 bg-neutral-50 cursor-pointer">
                        <UploadCloud size={15} className="text-brand-600" />
                        <span>
                          {isUploadingVendorPan
                            ? 'Uploading PAN...'
                            : vPanDocUrl
                            ? 'PAN Document Attached (Click to replace)'
                            : 'Upload PAN Card (PDF / PNG / JPG)'}
                        </span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleVendorPanUpload(f);
                          }}
                        />
                      </label>
                      {vPanDocUrl && (
                        <a
                          href={vPanDocUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 bg-brand-50 text-brand-700 border border-brand-200 rounded-xl text-xs font-semibold hover:bg-brand-100 shrink-0"
                        >
                          View PAN ↗
                        </a>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Default Category</label>
                    <select
                      value={vCategory}
                      onChange={(e) => setVCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm"
                    >
                      {categories.map((c) => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                      {categories.length === 0 && <option value="SUPPLIES">Supplies</option>}
                    </select>
                  </div>
                </div>
              </div>

              {/* Banking Details */}
              <div className="space-y-3 pt-2 border-t border-neutral-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-700 flex items-center gap-1.5">
                  <Landmark size={14} /> Vendor Banking Details (Required)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Account Holder Name *</label>
                    <input
                      type="text"
                      required
                      value={vBank.account_holder_name}
                      onChange={(e) => setVBank({ ...vBank, account_holder_name: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Bank Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. HDFC Bank"
                      value={vBank.bank_name}
                      onChange={(e) => setVBank({ ...vBank, bank_name: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Account Number *</label>
                    <input
                      type="text"
                      required
                      value={vBank.account_number}
                      onChange={(e) => setVBank({ ...vBank, account_number: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">IFSC Code *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. HDFC0001234"
                      value={vBank.ifsc_code}
                      onChange={(e) => setVBank({ ...vBank, ifsc_code: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm uppercase font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">Bank Address / Branch</label>
                    <input
                      type="text"
                      placeholder="e.g. Koramangala Branch, Bengaluru"
                      value={vBank.bank_address || ''}
                      onChange={(e) => setVBank({ ...vBank, bank_address: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">UPI ID (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. vendor@okhdfcbank"
                      value={vBank.upi_id || ''}
                      onChange={(e) => setVBank({ ...vBank, upi_id: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowVendorModal(false)}
                  className="px-4 py-2 border border-neutral-200 text-neutral-700 rounded-xl text-xs font-semibold hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingVendor}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {isSavingVendor ? 'Saving...' : editingVendor ? 'Save Changes' : 'Create Vendor Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
