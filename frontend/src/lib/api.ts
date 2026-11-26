import {
  User,
  Expense,
  ExpenseCreate,
  ExpenseUpdate,
  ExpenseApproval,
  ApprovalDecision,
  Reimbursement,
  ReimbursementStatus,
  SystemSettings,
  AuditLog,
  PresignedUploadResponse,
  ExpenseStatus,
  Role,
  Category,
  CategoryCreate,
  CategoryUpdate,
  ReceiptAnalysisResponse,
  ForensicsPreviewResponse,
  BankDetails,
  NotificationItem,
  NotificationListResponse,
  Vendor,
  VendorCreate,
  VendorUpdate
} from '../types';

function getNormalizedApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const clean = raw.trim().replace(/\/+$/, '');
  if (!clean.endsWith('/api/v1')) {
    if (clean.endsWith('/api')) {
      return `${clean}/v1`;
    }
    return `${clean}/api/v1`;
  }
  return clean;
}

const API_BASE = getNormalizedApiBase();

class ApiClient {
  private getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('access_token');
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refresh_token');
  }

  public setTokens(accessToken: string, refreshToken: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  }

  public clearTokens() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryOnAuth = true
  ): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const token = this.getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response = await fetch(url, { ...options, headers });

    // Handle 401 token refresh
    if (response.status === 401 && retryOnAuth && this.getRefreshToken()) {
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: this.getRefreshToken() })
        });

        if (refreshRes.ok) {
          const data = await refreshRes.json();
          this.setTokens(data.access_token, data.refresh_token);
          headers['Authorization'] = `Bearer ${data.access_token}`;
          response = await fetch(url, { ...options, headers });
        } else {
          this.clearTokens();
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
          }
        }
      } catch (e) {
        this.clearTokens();
      }
    }

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        let rateMsg = retryAfter
          ? `Too many requests. Please wait ${retryAfter} seconds and try again.`
          : 'Too many requests. Please wait a moment and try again.';
        try {
          const errData = await response.json();
          if (errData?.detail) rateMsg = errData.detail;
        } catch (_) {}
        throw new Error(rateMsg);
      }
      let errorMsg = `API Request failed (${response.status})`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.detail || errorData.error || errorMsg;
      } catch (_) {}
      throw new Error(errorMsg);
    }

    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  // ==================== AUTH ====================
  public auth = {
    login: async (credentials: { email: string; password: string }) => {
      const data = await this.request<{
        access_token: string;
        refresh_token: string;
        user: User;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
      }, false);
      this.setTokens(data.access_token, data.refresh_token);
      return data;
    },

    register: async (payload: { email: string; password: string; full_name: string; role?: Role }) => {
      return this.request<User>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      }, false);
    },

    getGoogleConfig: async () => {
      return this.request<{ client_id: string; is_configured: boolean }>('/auth/google/config', {}, false);
    },

    getGoogleAuthUrl: () => `${API_BASE}/auth/google/login`,

    googleLogin: async (payload: {
      id_token?: string;
      credential?: string;
      access_token?: string;
      code?: string;
      redirect_uri?: string;
      email?: string;
      full_name?: string;
    }) => {
      const data = await this.request<{
        access_token: string;
        refresh_token: string;
        user: User;
      }>('/auth/google', {
        method: 'POST',
        body: JSON.stringify(payload)
      }, false);
      this.setTokens(data.access_token, data.refresh_token);
      return data;
    },

    logout: async () => {
      const refreshToken = this.getRefreshToken();
      try {
        if (refreshToken) {
          await this.request('/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ refresh_token: refreshToken })
          });
        }
      } finally {
        this.clearTokens();
      }
    },

    getMe: async (): Promise<User> => {
      return this.request<User>('/auth/me');
    }
  };

  // ==================== EXPENSES ====================
  public expenses = {
    list: async (params?: {
      status?: ExpenseStatus;
      category?: string;
      vendor_only?: boolean;
      vendor_id?: string;
      search?: string;
      sort_by?: string;
      sort_order?: string;
    }): Promise<Expense[]> => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.category) query.set('category', params.category);
      if (params?.vendor_only) query.set('vendor_only', 'true');
      if (params?.vendor_id) query.set('vendor_id', params.vendor_id);
      if (params?.search) query.set('search', params.search);
      if (params?.sort_by) query.set('sort_by', params.sort_by);
      if (params?.sort_order) query.set('sort_order', params.sort_order);
      const qs = query.toString();
      return this.request<Expense[]>(`/expenses${qs ? `?${qs}` : ''}`);
    },

    get: async (id: string): Promise<Expense> => {
      return this.request<Expense>(`/expenses/${id}`);
    },

    create: async (data: ExpenseCreate, submitNow = false): Promise<Expense> => {
      return this.request<Expense>(`/expenses?submit_now=${submitNow}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    update: async (id: string, data: ExpenseUpdate): Promise<Expense> => {
      return this.request<Expense>(`/expenses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },

    submit: async (id: string): Promise<Expense> => {
      return this.request<Expense>(`/expenses/${id}/submit`, {
        method: 'POST'
      });
    },

    forensicsPreview: async (data: {
      amount: number;
      expense_date: string;
      category: string;
      receipt_hash?: string;
      line_items?: any[];
    }): Promise<ForensicsPreviewResponse> => {
      return this.request<ForensicsPreviewResponse>('/expenses/forensics-preview', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    delete: async (id: string): Promise<void> => {
      return this.request<void>(`/expenses/${id}`, {
        method: 'DELETE'
      });
    },

    exportCsvUrl: (params?: {
      status?: ExpenseStatus;
      category?: string;
      search?: string;
      sort_by?: string;
      sort_order?: string;
    }): string => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.category) query.set('category', params.category);
      if (params?.search) query.set('search', params.search);
      if (params?.sort_by) query.set('sort_by', params.sort_by);
      if (params?.sort_order) query.set('sort_order', params.sort_order);
      const qs = query.toString();
      return `${API_BASE}/expenses/export${qs ? `?${qs}` : ''}`;
    },

    exportXlsxUrl: (params?: {
      status?: ExpenseStatus;
      category?: string;
      search?: string;
      sort_by?: string;
      sort_order?: string;
    }): string => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.category) query.set('category', params.category);
      if (params?.search) query.set('search', params.search);
      if (params?.sort_by) query.set('sort_by', params.sort_by);
      if (params?.sort_order) query.set('sort_order', params.sort_order);
      const qs = query.toString();
      return `${API_BASE}/expenses/export${qs ? `?${qs}` : ''}`;
    },

    exportCsv: async (params?: {
      status?: ExpenseStatus;
      category?: string;
      search?: string;
      sort_by?: string;
      sort_order?: string;
    }): Promise<Blob> => {
      return this.expenses.exportXlsx(params);
    },

    exportXlsx: async (params?: {
      status?: ExpenseStatus;
      category?: string;
      search?: string;
      sort_by?: string;
      sort_order?: string;
    }): Promise<Blob> => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.category) query.set('category', params.category);
      if (params?.search) query.set('search', params.search);
      if (params?.sort_by) query.set('sort_by', params.sort_by);
      if (params?.sort_order) query.set('sort_order', params.sort_order);
      const qs = query.toString();

      const token = this.getAccessToken();
      const res = await fetch(`${API_BASE}/expenses/export${qs ? `?${qs}` : ''}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) {
        let msg = 'Failed to export expenses report';
        try {
          const err = await res.json();
          msg = err.detail || msg;
        } catch (_) {}
        throw new Error(msg);
      }
      return res.blob();
    }
  };

  // ==================== APPROVALS ====================
  public approvals = {
    listPending: async (params?: {
      search?: string;
      category?: string;
      tier?: number;
      sort_by?: string;
      sort_order?: string;
    }): Promise<Expense[]> => {
      const query = new URLSearchParams();
      if (params?.search) query.set('search', params.search);
      if (params?.category) query.set('category', params.category);
      if (params?.tier) query.set('tier', String(params.tier));
      if (params?.sort_by) query.set('sort_by', params.sort_by);
      if (params?.sort_order) query.set('sort_order', params.sort_order);
      const qs = query.toString();
      return this.request<Expense[]>(`/approvals/pending${qs ? `?${qs}` : ''}`);
    },

    review: async (
      expenseId: string,
      action: { decision: ApprovalDecision; comments?: string; audit_exemption_reason?: string }
    ): Promise<Expense> => {
      return this.request<Expense>(`/approvals/${expenseId}/review`, {
        method: 'POST',
        body: JSON.stringify(action)
      });
    }
  };

  // ==================== NOTIFICATIONS ====================
  public notifications = {
    list: async (limit = 30): Promise<NotificationListResponse> => {
      return this.request<NotificationListResponse>(`/notifications?limit=${limit}`);
    },

    getUnreadCount: async (): Promise<{ unread_count: number }> => {
      return this.request<{ unread_count: number }>('/notifications/unread-count');
    },

    markAsRead: async (notificationId: string): Promise<NotificationItem> => {
      return this.request<NotificationItem>(`/notifications/${notificationId}/read`, {
        method: 'PATCH'
      });
    },

    markAllAsRead: async (): Promise<{ unread_count: number }> => {
      return this.request<{ unread_count: number }>('/notifications/mark-all-read', {
        method: 'POST'
      });
    }
  };

  // ==================== VENDORS ====================
  public vendors = {
    list: async (params?: { search?: string; active_only?: boolean }): Promise<Vendor[]> => {
      const query = new URLSearchParams();
      if (params?.search) query.set('search', params.search);
      if (params?.active_only) query.set('active_only', 'true');
      const qs = query.toString();
      return this.request<Vendor[]>(`/vendors${qs ? `?${qs}` : ''}`);
    },

    get: async (vendorId: string): Promise<Vendor> => {
      return this.request<Vendor>(`/vendors/${vendorId}`);
    },

    create: async (data: VendorCreate): Promise<Vendor> => {
      return this.request<Vendor>('/vendors', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    update: async (vendorId: string, data: VendorUpdate): Promise<Vendor> => {
      return this.request<Vendor>(`/vendors/${vendorId}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },

    delete: async (vendorId: string): Promise<void> => {
      return this.request<void>(`/vendors/${vendorId}`, {
        method: 'DELETE'
      });
    }
  };

  // ==================== REIMBURSEMENTS ====================
  public reimbursements = {
    list: async (params?: {
      status?: ReimbursementStatus;
      search?: string;
      sort_by?: string;
      sort_order?: string;
    }): Promise<Reimbursement[]> => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.search) query.set('search', params.search);
      if (params?.sort_by) query.set('sort_by', params.sort_by);
      if (params?.sort_order) query.set('sort_order', params.sort_order);
      const qs = query.toString();
      return this.request<Reimbursement[]>(`/reimbursements${qs ? `?${qs}` : ''}`);
    },

    create: async (expenseId: string, idempotencyKey: string, transactionId?: string): Promise<Reimbursement> => {
      return this.request<Reimbursement>('/reimbursements', {
        method: 'POST',
        body: JSON.stringify({
          expense_id: expenseId,
          idempotency_key: idempotencyKey,
          transaction_id: transactionId || undefined
        })
      });
    },

    retry: async (reimbursementId: string): Promise<Reimbursement> => {
      return this.request<Reimbursement>(`/reimbursements/${reimbursementId}/retry`, {
        method: 'POST'
      });
    }
  };

  // ==================== CATEGORIES ====================
  public categories = {
    list: async (): Promise<Category[]> => {
      return this.request<Category[]>('/categories');
    },

    listAll: async (): Promise<Category[]> => {
      return this.request<Category[]>('/categories/all');
    },

    create: async (data: CategoryCreate): Promise<Category> => {
      return this.request<Category>('/categories', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    update: async (id: string, data: CategoryUpdate): Promise<Category> => {
      return this.request<Category>(`/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },

    delete: async (id: string): Promise<{ message: string; is_active?: boolean }> => {
      return this.request<{ message: string; is_active?: boolean }>(`/categories/${id}`, {
        method: 'DELETE'
      });
    }
  };

  // ==================== USERS (ADMIN) ====================
  public users = {
    list: async (): Promise<User[]> => {
      return this.request<User[]>('/users');
    },

    create: async (data: {
      email: string;
      password: string;
      full_name: string;
      role: Role;
      bank_details?: BankDetails;
      pan_number?: string;
      pan_document_url?: string;
    }): Promise<User> => {
      return this.request<User>('/users', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    update: async (userId: string, data: {
      role?: Role;
      is_active?: boolean;
      full_name?: string;
      bank_details?: BankDetails;
      pan_number?: string;
      pan_document_url?: string;
    }): Promise<User> => {
      return this.request<User>(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },

    updateMyProfile: async (data: {
      full_name?: string;
      password?: string;
      bank_details?: BankDetails;
      pan_number?: string;
      pan_document_url?: string;
    }): Promise<User> => {
      return this.request<User>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    }
  };

  // ==================== SETTINGS ====================
  public settings = {
    get: async (): Promise<SystemSettings> => {
      return this.request<SystemSettings>('/settings');
    },

    update: async (data: Partial<SystemSettings>): Promise<SystemSettings> => {
      return this.request<SystemSettings>('/settings', {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    }
  };

  // ==================== AUDIT LOGS ====================
  public auditLogs = {
    list: async (params?: { entity_type?: string; action?: string; limit?: number; offset?: number }): Promise<AuditLog[]> => {
      const query = new URLSearchParams();
      if (params?.entity_type) query.set('entity_type', params.entity_type);
      if (params?.action) query.set('action', params.action);
      if (params?.limit) query.set('limit', params.limit.toString());
      if (params?.offset) query.set('offset', params.offset.toString());
      const qs = query.toString();
      return this.request<AuditLog[]>(`/audit-logs${qs ? `?${qs}` : ''}`);
    }
  };

  // ==================== RECEIPTS & STORAGE ====================
  public receipts = {
    analyze: async (file: File): Promise<ReceiptAnalysisResponse> => {
      const formData = new FormData();
      formData.append('file', file);

      const token = this.getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/receipts/analyze`, {
        method: 'POST',
        headers,
        body: formData
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: 'Failed to analyze receipt image.' }));
        throw new Error(error.detail || 'Receipt AI analysis failed.');
      }

      return res.json();
    },

    getPresignedUpload: async (payload: { filename: string; content_type: string; file_size_bytes: number }): Promise<PresignedUploadResponse> => {
      return this.request<PresignedUploadResponse>('/receipts/presigned-upload', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    uploadFile: async (file: File): Promise<{ url: string; key: string }> => {
      const backendOrigin = API_BASE.replace('/api/v1', '');

      // 1. Direct multipart upload to backend (reliable across local & Render deployments)
      try {
        const formData = new FormData();
        formData.append('file', file);

        const token = this.getAccessToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}/receipts/upload`, {
          method: 'POST',
          headers,
          body: formData
        });

        if (res.ok) {
          const data = await res.json();
          let fileUrl: string = data.url;
          if (fileUrl) {
            if (fileUrl.includes('localhost:8000') && !backendOrigin.includes('localhost:8000')) {
              fileUrl = fileUrl.replace('http://localhost:8000', backendOrigin);
            } else if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
              fileUrl = `${backendOrigin}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
            }
          }
          return { url: fileUrl, key: data.key };
        }
      } catch (directErr) {
        console.warn('Direct backend upload failed, falling back to presigned upload:', directErr);
      }

      // 2. Presigned PUT fallback
      const presigned = await this.receipts.getPresignedUpload({
        filename: file.name,
        content_type: file.type || 'image/jpeg',
        file_size_bytes: file.size
      });

      let targetUrl = presigned.upload_url;
      if (targetUrl.includes('localhost:8000') && !backendOrigin.includes('localhost:8000')) {
        targetUrl = targetUrl.replace('http://localhost:8000', backendOrigin);
      } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = `${backendOrigin}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
      }

      // Direct upload to storage via PUT
      const uploadRes = await fetch(targetUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'image/jpeg'
        },
        body: file
      });

      if (!uploadRes.ok) {
        throw new Error(`Failed to upload receipt file to storage (HTTP ${uploadRes.status}).`);
      }

      let publicUrl = presigned.public_url;
      if (publicUrl.includes('localhost:8000') && !backendOrigin.includes('localhost:8000')) {
        publicUrl = publicUrl.replace('http://localhost:8000', backendOrigin);
      } else if (!publicUrl.startsWith('http://') && !publicUrl.startsWith('https://')) {
        publicUrl = `${backendOrigin}${publicUrl.startsWith('/') ? '' : '/'}${publicUrl}`;
      }

      return {
        url: publicUrl,
        key: presigned.key
      };
    },

    openFile: async (rawUrl: string): Promise<void> => {
      if (!rawUrl) return;
      const backendOrigin = API_BASE.replace('/api/v1', '');
      let targetUrl = rawUrl;
      if (targetUrl.includes('localhost:8000') && !backendOrigin.includes('localhost:8000')) {
        targetUrl = targetUrl.replace('http://localhost:8000', backendOrigin);
      } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = `${backendOrigin}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
      }

      const token = this.getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(targetUrl, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to open document (HTTP ${res.status})`);
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
    }
  };
}

export const api = new ApiClient();
