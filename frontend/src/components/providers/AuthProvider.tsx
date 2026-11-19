'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Role } from '@/types';
import { api } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  role: Role | null;
  loading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  googleLogin: (payload: {
    id_token?: string;
    credential?: string;
    access_token?: string;
    code?: string;
    redirect_uri?: string;
    email?: string;
    full_name?: string;
  }) => Promise<void>;
  register: (payload: { email: string; password: string; full_name: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  login: async () => {},
  googleLogin: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = async () => {
    try {
      const currentUser = await api.auth.getMe();
      setUser(currentUser);
    } catch (e) {
      setUser(null);
      api.clearTokens();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (token) {
      refreshUser();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (credentials: { email: string; password: string }) => {
    setLoading(true);
    try {
      const res = await api.auth.login(credentials);
      setUser(res.user);
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = async (payload: {
    id_token?: string;
    credential?: string;
    access_token?: string;
    code?: string;
    redirect_uri?: string;
    email?: string;
    full_name?: string;
  }) => {
    setLoading(true);
    try {
      const res = await api.auth.googleLogin(payload);
      setUser(res.user);
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const register = async (payload: { email: string; password: string; full_name: string }) => {
    setLoading(true);
    try {
      await api.auth.register(payload);
      // Auto login after registration
      await login({ email: payload.email, password: payload.password });
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await api.auth.logout();
      setUser(null);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const role = user?.role || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        login,
        googleLogin,
        register,
        logout,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
