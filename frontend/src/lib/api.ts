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
  BankDetails
} from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

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
      search?: string;
      sort_by?: string;
      sort_order?: string;
    }): Promise<Expense[]> => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.category) query.set('category', params.category);
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
    }
  };

  // ==================== APPROVALS ====================
  public approvals = {
    listPending: async (params?: {
      search?: string;
      category?: string;
      sort_by?: string;
      sort_order?: string;
    }): Promise<Expense[]> => {
      const query = new URLSearchParams();
      if (params?.search) query.set('search', params.search);
      if (params?.category) query.set('category', params.category);
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

    create: async (expenseId: string, idempotencyKey: string): Promise<Reimbursement> => {
      return this.request<Reimbursement>('/reimbursements', {
        method: 'POST',
        body: JSON.stringify({ expense_id: expenseId, idempotency_key: idempotencyKey })
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

    create: async (data: { email: string; password: string; full_name: string; role: Role; bank_details?: BankDetails }): Promise<User> => {
      return this.request<User>('/users', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    update: async (userId: string, data: { role?: Role; is_active?: boolean; full_name?: string; bank_details?: BankDetails }): Promise<User> => {
      return this.request<User>(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },

    updateMyProfile: async (data: { full_name?: string; password?: string; bank_details?: BankDetails }): Promise<User> => {
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
      const presigned = await this.receipts.getPresignedUpload({
        filename: file.name,
        content_type: file.type || 'image/jpeg',
        file_size_bytes: file.size
      });

      let targetUrl = presigned.upload_url;
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        const backendOrigin = API_BASE.replace('/api/v1', '');
        targetUrl = `${backendOrigin}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
      }

      // Direct upload to Cloudflare R2 or local storage fallback via PUT
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

      return {
        url: presigned.public_url,
        key: presigned.key
      };
    }
  };
}

export const api = new ApiClient();
