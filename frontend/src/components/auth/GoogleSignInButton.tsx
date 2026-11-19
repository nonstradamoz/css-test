'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { api } from '@/lib/api';
import { KeyRound, ExternalLink, Check, Settings2, X, AlertCircle } from 'lucide-react';

interface GoogleSignInButtonProps {
  mode?: 'signin' | 'signup';
  onError?: (err: string) => void;
}

declare global {
  interface Window {
    google?: any;
    gsiClientLoaded?: boolean;
  }
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  mode = 'signin',
  onError
}) => {
  const { googleLogin } = useAuth();
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [clientId, setClientId] = useState<string>('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configInputId, setConfigInputId] = useState('');
  const [configError, setConfigError] = useState<string | null>(null);
  const [currentOrigin, setCurrentOrigin] = useState<string>('');

  // 1. Resolve Google Client ID from environment, localStorage, or backend config
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentOrigin(window.location.origin);
      const envId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      const localId = localStorage.getItem('google_oauth_client_id');

      if (envId && envId.trim()) {
        setClientId(envId.trim());
      } else if (localId && localId.trim()) {
        setClientId(localId.trim());
      } else {
        // Query backend for configured client ID
        api.auth.getGoogleConfig()
          .then(res => {
            if (res.client_id && res.client_id.trim()) {
              setClientId(res.client_id.trim());
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  // 2. Dynamically load official Google Identity Services (GIS) SDK
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google?.accounts?.id || window.google?.accounts?.oauth2) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.gsiClientLoaded = true;
      setScriptLoaded(true);
    };
    script.onerror = () => {
      console.warn('Google Identity Services script failed to load.');
    };
    document.head.appendChild(script);
  }, []);

  // 3. Initialize Google Identity Services ID Token rendering if clientId is present
  useEffect(() => {
    if (!scriptLoaded || !clientId || !window.google?.accounts?.id || !buttonContainerRef.current) return;

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          if (response.credential) {
            setIsProcessing(true);
            try {
              await googleLogin({ credential: response.credential });
            } catch (err: any) {
              onError?.(err.message || 'Google Authentication failed');
            } finally {
              setIsProcessing(false);
            }
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Clear container and render official Google GIS Button
      buttonContainerRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(buttonContainerRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: mode === 'signup' ? 'signup_with' : 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 380,
      });
    } catch (err) {
      console.warn('Failed to render official Google button:', err);
    }
  }, [scriptLoaded, clientId, mode, googleLogin, onError]);

  // 4. Trigger Real Google OAuth 2.0 Popup Flow via Token Client
  const triggerGoogleOAuthPopup = useCallback((activeClientId: string) => {
    if (!window.google?.accounts?.oauth2) {
      onError?.('Google authentication library is initializing. Please try again in a moment.');
      return;
    }

    try {
      setIsProcessing(true);
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: activeClientId,
        scope: 'openid email profile',
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            setIsProcessing(false);
            onError?.(tokenResponse.error_description || tokenResponse.error || 'Google Sign-In was cancelled or failed.');
            return;
          }

          if (tokenResponse.access_token) {
            try {
              await googleLogin({ access_token: tokenResponse.access_token });
            } catch (err: any) {
              onError?.(err.message || 'Failed to authenticate Google account with server.');
            } finally {
              setIsProcessing(false);
            }
          }
        },
        error_callback: (err: any) => {
          setIsProcessing(false);
          console.warn('Google OAuth popup error:', err);
          onError?.(err.message || 'Google Sign-In popup could not be completed.');
        }
      });

      // Launch official Google popup window
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (e: any) {
      setIsProcessing(false);
      console.error('Failed to launch Google popup:', e);
      onError?.(e.message || 'Unable to start Google authentication popup.');
    }
  }, [googleLogin, onError]);

  // Handle Button Click
  const handleButtonClick = () => {
    if (!clientId) {
      // Prompt user to enter / configure Google OAuth Client ID
      setShowConfigModal(true);
      return;
    }

    triggerGoogleOAuthPopup(clientId);
  };

  // Save Client ID from setup modal and immediately initiate sign-in
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = configInputId.trim();
    if (!trimmed) {
      setConfigError('Please enter a valid Google OAuth Client ID.');
      return;
    }
    if (!trimmed.includes('.apps.googleusercontent.com') && trimmed.length < 20) {
      setConfigError('Google Client ID usually ends with ".apps.googleusercontent.com". Please check your credentials.');
      return;
    }

    localStorage.setItem('google_oauth_client_id', trimmed);
    setClientId(trimmed);
    setShowConfigModal(false);
    setConfigError(null);

    // Launch Google Sign In immediately with newly configured client ID
    setTimeout(() => {
      triggerGoogleOAuthPopup(trimmed);
    }, 200);
  };

  return (
    <div className="w-full space-y-3">
      {/* Official Google Identity Services Rendered Container (if Client ID present) */}
      {clientId && (
        <div className="flex justify-center w-full min-h-[44px]">
          <div ref={buttonContainerRef} className="w-full max-w-[380px] flex justify-center" />
        </div>
      )}

      {/* Modern High-Impact Google Auth Button */}
      {(!clientId || isProcessing) && (
        <button
          type="button"
          onClick={handleButtonClick}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-800 text-sm font-semibold rounded-xl border border-neutral-300 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
        >
          {/* Authentic Google G Logo */}
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>
            {isProcessing
              ? 'Authenticating with Google...'
              : mode === 'signup'
              ? 'Sign up with Google Account'
              : 'Sign in with Google Account'}
          </span>
        </button>
      )}

      {/* Config Button (optional gear to re-configure or check client ID) */}
      <div className="flex justify-between items-center text-[11px] text-neutral-500 px-1">
        <span>Google Single Sign-On (OAuth 2.0)</span>
        <button
          type="button"
          onClick={() => {
            setConfigInputId(clientId);
            setShowConfigModal(true);
          }}
          className="hover:text-neutral-300 transition-colors flex items-center gap-1 font-medium"
        >
          <Settings2 size={12} />
          {clientId ? 'Google Client ID Active' : 'Setup Client ID'}
        </button>
      </div>

      {/* Google OAuth Setup / Client ID Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-white space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Google OAuth Authentication</h3>
                  <p className="text-xs text-neutral-400">Connect to official Google Cloud Identity</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="text-xs text-neutral-300 space-y-2 bg-neutral-800/50 p-3.5 rounded-xl border border-neutral-700/50">
              <p className="font-semibold text-neutral-200">How to connect your Google Cloud Project:</p>
              <ol className="list-decimal list-inside space-y-1.5 text-neutral-400">
                <li>
                  Open{' '}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 underline inline-flex items-center gap-0.5"
                  >
                    Google Cloud Console <ExternalLink size={11} />
                  </a>
                </li>
                <li>Create an <strong>OAuth 2.0 Client ID</strong> (Web application)</li>
                <li>
                  Add Authorized JavaScript origin:
                  <code className="block mt-1 p-1 bg-black/60 rounded text-emerald-400 font-mono text-[11px] select-all">
                    {currentOrigin || 'http://localhost:3000'}
                  </code>
                </li>
                <li>Copy the <strong>Client ID</strong> and paste below.</li>
              </ol>
            </div>

            {configError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs text-red-400">
                <AlertCircle size={15} className="shrink-0" />
                <span>{configError}</span>
              </div>
            )}

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                  Google OAuth Client ID
                </label>
                <input
                  type="text"
                  required
                  value={configInputId}
                  onChange={(e) => setConfigInputId(e.target.value)}
                  placeholder="e.g. 123456789-xxxxxx.apps.googleusercontent.com"
                  className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-blue-900/30 flex items-center gap-2 transition-all"
                >
                  <Check size={14} />
                  Save & Sign In with Google
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
