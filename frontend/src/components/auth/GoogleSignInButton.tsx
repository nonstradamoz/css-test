'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';

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
  const [showDemoSelector, setShowDemoSelector] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  // 1. Dynamically load official Google Identity Services (GIS) SDK
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google?.accounts?.id) {
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

    return () => {
      // Don't remove script to allow caching across routes
    };
  }, []);

  // 2. Initialize and render official Google GIS Button if client ID is configured
  useEffect(() => {
    if (!scriptLoaded || !window.google?.accounts?.id || !buttonContainerRef.current) return;

    // If client ID is present, initialize real Google Sign-In
    if (clientId) {
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

        // Clear previous buttons
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
        console.warn('Failed to initialize Google button:', err);
      }
    }
  }, [scriptLoaded, clientId, mode, googleLogin, onError]);

  // Handle direct click when using custom button or demo accounts
  const handleNativeOrDemoClick = () => {
    if (clientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt();
        return;
      } catch (e) {
        console.warn('Prompt error:', e);
      }
    }
    // If no Client ID configured in environment yet, open clean Google Account Chooser
    setShowDemoSelector(true);
  };

  const handleSelectDemoAccount = async (email: string, name: string) => {
    setShowDemoSelector(false);
    setIsProcessing(true);
    try {
      await googleLogin({
        email,
        full_name: name
      });
    } catch (err: any) {
      onError?.(err.message || 'Google Sign-in failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Container where official Google GIS renders if Client ID is configured */}
      {clientId && <div ref={buttonContainerRef} className="flex justify-center w-full min-h-[44px]" />}

      {/* Styled Standard Google Button (visible when no client ID is set or as instant fallback) */}
      {(!clientId || !scriptLoaded) && (
        <button
          type="button"
          onClick={handleNativeOrDemoClick}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-700 text-sm font-semibold rounded-xl border border-neutral-300 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
        >
          {/* Official Google Multicolor G Logo */}
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
              ? 'Connecting with Google...'
              : mode === 'signup'
              ? 'Sign up with Google'
              : 'Sign in with Google'}
          </span>
        </button>
      )}

      {/* Account Picker Modal if running in local sandbox without a live Google Client ID */}
      {showDemoSelector && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl text-neutral-900 space-y-4">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <div>
                <h3 className="text-base font-bold text-neutral-900">Choose a Google Account</h3>
                <p className="text-xs text-neutral-500">to continue to ClearSpend</p>
              </div>
            </div>

            <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => handleSelectDemoAccount('john.employee@gmail.com', 'Johnathan Doe')}
                className="w-full p-3.5 flex items-center gap-3 text-left hover:bg-neutral-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm">
                  JD
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Johnathan Doe</p>
                  <p className="text-xs text-neutral-500">john.employee@gmail.com</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDemoAccount('admin.corp@gmail.com', 'System Admin')}
                className="w-full p-3.5 flex items-center gap-3 text-left hover:bg-neutral-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-sm">
                  SA
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">System Admin</p>
                  <p className="text-xs text-neutral-500">admin.corp@gmail.com</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectDemoAccount('reviewer.finance@gmail.com', 'Finance Reviewer')}
                className="w-full p-3.5 flex items-center gap-3 text-left hover:bg-neutral-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-sm">
                  FR
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Finance Reviewer</p>
                  <p className="text-xs text-neutral-500">reviewer.finance@gmail.com</p>
                </div>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowDemoSelector(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
