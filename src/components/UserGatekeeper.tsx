import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useUser, ADMIN_EMAIL, googleSignIn } from '../lib/userContext';
import { signOutUser, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { applyTheme, loadAppConfig } from '../config';

export const UserGatekeeper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isLoading } = useUser();
  const [authError, setAuthError] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadAppConfig().theme || 'dark');

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => onAuthStateChanged(auth, (user) => {
    if (user && (!user.emailVerified || user.email?.trim().toLowerCase() !== ADMIN_EMAIL)) {
      setAuthError('This Google account is not authorized to access Mr. Contract CRM.');
      void signOutUser();
    }
  }), []);

  const signIn = async () => {
    setAuthError('');
    try {
      const result = await googleSignIn(true);
      if (!result.user.emailVerified || result.user.email?.trim().toLowerCase() !== ADMIN_EMAIL) {
        await signOutUser();
        setAuthError('Only the verified CRM administrator account is allowed.');
      }
    } catch (error: any) {
      setAuthError(error?.message || 'Google sign-in failed.');
    }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  if (currentUser) return <>{children}</>;

  return <div className={`${theme === 'dark' ? 'dark bg-[#07090E] text-zinc-100' : 'bg-zinc-50 text-zinc-900'} min-h-screen flex items-center justify-center p-6`}>
    <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center shadow-xl">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Dark mode' : 'Light mode'}
          aria-label={theme === 'dark' ? 'Dark mode' : 'Light mode'}
          className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>
      </div>
      <h1 className="text-2xl font-black">Mr. <span className="text-[#FF5500]">Contract</span></h1>
      <p className="mt-3 text-sm text-zinc-500">Sign in with the verified CRM administrator Google account.</p>
      {authError && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{authError}</p>}
      <button type="button" onClick={signIn} className="mt-6 w-full rounded-xl bg-[#FF5500] px-4 py-3 text-sm font-bold text-white">Continue with Google</button>
    </div>
  </div>;
};
