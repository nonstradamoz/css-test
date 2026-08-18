import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { Role } from '../types';

export const api = {
  // 1. Org & Members
  createOrganisation: async (data: { name: string; currency?: string }) => {
    const supabase = (await import('./supabase')).createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch('/api/createOrganisation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify(data)
    });
    
    const res = await response.json();
    if (!response.ok) throw new Error(res.error || 'Failed to create organisation');
    
    return res.data as { organisationId: string; organisation: any };
  },

  deleteOrganisation: async (data: { organisationId: string }) => {
    const supabase = (await import('./supabase')).createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch('/api/deleteOrganisation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify(data)
    });
    
    const res = await response.json();
    if (!response.ok) throw new Error(res.error || 'Failed to delete organisation');
    
    return res.data;
  },

  updateOrgSettings: async (data: { organisationId: string; settings: any }) => {
    const fn = httpsCallable(functions, 'updateOrgSettings');
    const res = await fn(data);
    return res.data;
  },

  inviteMember: async (data: { organisationId: string; email: string; role: Role }) => {
    const fn = httpsCallable(functions, 'inviteMember');
    const res = await fn(data);
    return res.data as { invitationId: string };
  },

  changeMemberRole: async (data: { organisationId: string; targetMemberId: string; newRole: Role }) => {
    const fn = httpsCallable(functions, 'changeMemberRole');
    const res = await fn(data);
    return res.data;
  },

  removeMember: async (data: { organisationId: string; targetMemberId: string }) => {
    const fn = httpsCallable(functions, 'removeMember');
    const res = await fn(data);
    return res.data;
  },

  // 2. Expense Lifecycle
  submitExpense: async (data: { organisationId: string; expenseId: string }) => {
    const supabase = (await import('./supabase')).createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch('/api/submitExpense', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify(data)
    });
    
    const res = await response.json();
    if (!response.ok) throw new Error(res.error || 'Failed to submit expense');
    
    return res.data as { success: boolean; status: string; isDuplicateWarning: boolean };
  },

  requestExpenseChanges: async (data: { organisationId: string; expenseId: string; reason: string }) => {
    const fn = httpsCallable(functions, 'requestExpenseChanges');
    const res = await fn(data);
    return res.data as { success: boolean; status: string };
  },

  resubmitExpense: async (data: {
    organisationId: string;
    expenseId: string;
    updates?: Record<string, any>;
  }) => {
    const fn = httpsCallable(functions, 'resubmitExpense');
    const res = await fn(data);
    return res.data as { success: boolean; status: string };
  },

  approveExpense: async (data: { organisationId: string; expenseId: string; reason?: string }) => {
    const supabase = (await import('./supabase')).createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch('/api/approveExpense', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify(data)
    });
    
    const res = await response.json();
    if (!response.ok) throw new Error(res.error || 'Failed to approve expense');
    
    return res.data as { success: boolean; status: string; approvalId: string };
  },

  rejectExpense: async (data: { organisationId: string; expenseId: string; reason: string }) => {
    const supabase = (await import('./supabase')).createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch('/api/rejectExpense', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify(data)
    });
    
    const res = await response.json();
    if (!response.ok) throw new Error(res.error || 'Failed to reject expense');
    
    return res.data as { success: boolean; status: string };
  },

  // 3. Reimbursements
  createReimbursement: async (data: {
    organisationId: string;
    expenseId: string;
    idempotencyKey: string;
    forcedOutcome?: 'SUCCESS' | 'FAILURE' | 'TIMEOUT';
  }) => {
    const supabase = (await import('./supabase')).createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch('/api/createReimbursement', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify(data)
    });
    
    const res = await response.json();
    if (!response.ok) throw new Error(res.error || 'Failed to process reimbursement');
    
    return res.data as {
      reimbursementId: string;
      status: string;
      expenseStatus: string;
      providerReference?: string;
      isIdempotentReplay?: boolean;
    };
  },

  retryRefund: async (data: {
    organisationId: string;
    reimbursementId: string;
    idempotencyKey: string;
    forcedOutcome?: 'SUCCESS' | 'FAILURE' | 'TIMEOUT';
  }) => {
    const fn = httpsCallable(functions, 'retryRefund');
    const res = await fn(data);
    return res.data as {
      reimbursementId: string;
      status: string;
      expenseStatus: string;
      providerReference?: string;
      isIdempotentReplay?: boolean;
    };
  },

  // 4. Receipts & Storage
  generateReceiptUploadUrl: async (data: {
    organisationId: string;
    expenseId: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    checksum: string;
  }) => {
    const supabase = (await import('./supabase')).createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch('/api/receipts/generateUploadUrl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify(data)
    });
    
    const res = await response.json();
    if (!response.ok) throw new Error(res.error || 'Failed to generate upload URL');
    
    return res.data as { uploadUrl: string; storageKey: string; receiptId: string };
  },

  confirmReceiptUpload: async (data: {
    organisationId: string;
    expenseId: string;
    receiptId: string;
    storageKey: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    checksum: string;
  }) => {
    const supabase = (await import('./supabase')).createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch('/api/receipts/confirmUpload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify(data)
    });
    
    const res = await response.json();
    if (!response.ok) throw new Error(res.error || 'Failed to confirm receipt upload');
    
    return res.data as any;
  },

  generateReceiptDownloadUrl: async (data: { organisationId: string; expenseId: string }) => {
    const supabase = (await import('./supabase')).createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch('/api/receipts/generateDownloadUrl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify(data)
    });
    
    const res = await response.json();
    if (!response.ok) throw new Error(res.error || 'Failed to generate download URL');
    
    return res.data as { downloadUrl: string; fileName: string; contentType: string };
  }
};
