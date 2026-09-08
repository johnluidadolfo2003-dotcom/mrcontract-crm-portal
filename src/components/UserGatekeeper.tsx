import React, { useState, useEffect } from 'react';
import { useUser } from '../lib/userContext';
import { loadAppConfig, saveAppConfig, applyTheme } from '../config';
import { Shield, Sun, Moon, LogIn, AlertCircle, Loader2 } from 'lucide-react';

export const UserGatekeeper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isLoading, authError, loginWithGoogle } = useUser();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadAppConfig().theme || 'dark');
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    const config = loadAppConfig();
    saveAppConfig({ ...config, theme: next });
    applyTheme(next);
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await loginWithGoogle();
    } finally {
      setIsSigningIn(false);
    }
  };

  // If session is active and user is authorized, render the main app!
  if (currentUser) {
    return <>{children}</>;
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-[#07090E] text-zinc-100' : 'bg-zinc-50 text-zinc-900'} flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden selection:bg-[#FF5500] selection:text-white transition-colors`}>
      {/* Theme Toggle Button */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all shadow-sm cursor-pointer flex items-center justify-center min-w-[44px] min-h-[44px]"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="w-4 h-4 text-zinc-300" /> : <Moon className="w-4 h-4 text-zinc-700" />}
      </button>

      {/* Main Container */}
      <div className="w-full max-w-md z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-1.5 text-3xl font-black tracking-tight">
            <span className="text-zinc-900 dark:text-white">Mr.</span>
            <span className="text-[#FF5500]">Contract</span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm font-medium mt-1.5 tracking-wide">
            Contractor Lead & CRM Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl transition-colors text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-[#FF5500]/10 text-[#FF5500] flex items-center justify-center mx-auto shadow-inner">
            <Shield className="w-7 h-7 stroke-[2]" />
          </div>

          <div>
            <h2 className="text-xl font-black text-zinc-900 dark:text-white">Secure CRM Access</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Sign in with your authorized Google account to enter
            </p>
          </div>

          {/* Error Banner */}
          {authError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-left space-y-1 text-xs">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Access Unauthorized</span>
              </div>
              <p className="text-red-700 dark:text-red-300 font-medium leading-relaxed pl-6">
                {authError}
              </p>
            </div>
          )}

          {/* Loading / Action Section */}
          {isLoading ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin text-[#FF5500]" />
              <span className="text-xs font-semibold">Verifying session credentials...</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="w-full py-3.5 px-5 rounded-2xl bg-[#FF5500] hover:bg-[#e04b00] text-white font-black text-sm shadow-lg shadow-[#FF5500]/25 transition-all cursor-pointer flex items-center justify-center gap-3 disabled:opacity-60 active:scale-[0.98]"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#FFFFFF"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#FFFFFF"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FFFFFF"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#FFFFFF"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
          )}

          <div className="pt-2 text-[11px] text-zinc-500 dark:text-zinc-500 font-medium border-t border-zinc-100 dark:border-zinc-800">
            Protected CRM System • Restricted Access Only
          </div>
        </div>
      </div>
    </div>
  );
};
