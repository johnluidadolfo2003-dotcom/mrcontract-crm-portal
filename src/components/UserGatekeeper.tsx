import React, { useState, useEffect } from 'react';
import { useUser, ADMIN_EMAIL } from '../lib/userContext';
import { googleSignIn, signOutUser } from '../lib/firebase';
import { loadAppConfig, saveAppConfig, applyTheme } from '../config';
import { ShieldCheck, AlertCircle, Sun, Moon, Loader2, Lock } from 'lucide-react';

export const UserGatekeeper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isLoading } = useUser();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadAppConfig().theme || 'dark');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    const currentConfig = loadAppConfig();
    saveAppConfig({ ...currentConfig, theme: nextTheme });
    applyTheme(nextTheme);
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      const res = await googleSignIn(true);
      const user = res.user;
      const email = user?.email?.trim().toLowerCase();

      if (!user) {
        throw new Error('No user profile returned from Google sign-in.');
      }

      if (!ADMIN_EMAIL) {
        await signOutUser().catch(() => {});
        setAuthError(
          'Access restriction error: CRM_INITIAL_ADMIN_EMAIL is not configured in the environment.'
        );
        return;
      }

      if (!user.emailVerified) {
        await signOutUser().catch(() => {});
        setAuthError(
          `Google account "${user.email || 'unknown'}" is unverified. A verified Google email is required to access this CRM.`
        );
        return;
      }

      if (email !== ADMIN_EMAIL) {
        await signOutUser().catch(() => {});
        setAuthError(
          `Access Denied: Google account "${user.email || 'unknown'}" is not authorized. Only the designated administrator account (${ADMIN_EMAIL}) has access to Mr. Contract CRM.`
        );
        return;
      }
    } catch (err: any) {
      console.warn('Authentication attempt failed:', err);
      setAuthError(err?.message || 'Google sign-in could not be completed. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  // 1. Initial authentication loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-md bg-[#FF5500] flex items-center justify-center shadow-md animate-pulse">
            <span className="text-white font-black text-2xl leading-none tracking-tighter">M</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs font-bold mt-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#FF5500]" />
            <span>Verifying authorized CRM credentials...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. If authenticated and authorized, allow access to CRM application routes
  if (currentUser) {
    return <>{children}</>;
  }

  // 3. Unauthenticated / Unauthorized Gate Screen
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center p-4 relative selection:bg-[#FF5500]/20 selection:text-[#FF5500]">
      {/* Theme toggle in top right corner */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors duration-120 cursor-pointer shadow-xs min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#FF5500]"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <Moon className="w-4 h-4 text-zinc-300" />
        ) : (
          <Sun className="w-4 h-4 text-zinc-700" />
        )}
      </button>

      {/* Main Authentication Card */}
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-6 sm:p-8 shadow-xl space-y-6 text-center">
        {/* Header Branding */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-md bg-[#FF5500] flex items-center justify-center shadow-md">
            <span className="text-white font-black text-2xl leading-none tracking-tighter">M</span>
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              Mr. Contract CRM
            </h1>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mt-1">
              Restricted Workspace Portal
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs text-zinc-600 dark:text-zinc-400 flex items-center justify-center gap-2">
          <Lock className="w-3.5 h-3.5 text-[#FF5500] shrink-0" />
          <span>Single-account verified administrator access required</span>
        </div>

        {/* Error Banner */}
        {authError && (
          <div
            role="alert"
            className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-md text-xs text-red-600 dark:text-red-400 flex items-start gap-2.5 text-left"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Authentication Error</p>
              <p className="leading-relaxed">{authError}</p>
            </div>
          </div>
        )}

        {/* Google Sign-in Action */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 text-zinc-900 dark:text-white border border-zinc-300 dark:border-zinc-700 rounded-md font-bold text-sm shadow-xs transition-colors duration-120 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#FF5500]" />
                <span>Signing in with Google...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                <span>Sign in with Google</span>
              </>
            )}
          </button>
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Secured with Firebase Authentication & Firestore</span>
        </div>
      </div>
    </div>
  );
};
