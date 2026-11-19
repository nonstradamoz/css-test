'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { api } from '@/lib/api';

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

  // 1. Check for configured Google Client ID from environment or backend
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const envId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      const localId = localStorage.getItem('google_oauth_client_id');

      if (envId && envId.trim()) {
        setClientId(envId.trim());
      } else if (localId && localId.trim()) {
        setClientId(localId.trim());
      } else {
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

  // 2. Load Google Identity Services SDK if Client ID is configured
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

  // 3. Render official Google GIS button if Client ID exists
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

  // 4. Handle Google Sign-In Click
  const handleGoogleClick = useCallback(() => {
    // If client ID is present on frontend, use Google OAuth Token Client popup
    if (clientId && window.google?.accounts?.oauth2) {
      try {
        setIsProcessing(true);
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: async (tokenResponse: any) => {
            if (tokenResponse.error) {
              setIsProcessing(false);
              onError?.(tokenResponse.error_description || tokenResponse.error || 'Google Sign-In was cancelled.');
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
            console.warn('Google OAuth error:', err);
            onError?.(err.message || 'Google Sign-In failed.');
          }
        });

        tokenClient.requestAccessToken({ prompt: 'consent' });
        return;
      } catch (e: any) {
        console.warn('Failed to launch GIS popup, falling back to backend redirect:', e);
      }
    }

    // Direct redirect to backend Google OAuth initiation route
    setIsProcessing(true);
    window.location.href = api.auth.getGoogleAuthUrl();
  }, [clientId, googleLogin, onError]);

  return (
    <div className="w-full">
      {/* Official Google Identity Services Rendered Container */}
      {clientId && (
        <div className="flex justify-center w-full min-h-[44px]">
          <div ref={buttonContainerRef} className="w-full max-w-[380px] flex justify-center" />
        </div>
      )}

      {/* Styled Google Auth Button */}
      {(!clientId || isProcessing) && (
        <button
          type="button"
          onClick={handleGoogleClick}
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
              ? 'Connecting to Google...'
              : mode === 'signup'
              ? 'Sign up with Google Account'
              : 'Sign in with Google Account'}
          </span>
        </button>
      )}
    </div>
  );
};
