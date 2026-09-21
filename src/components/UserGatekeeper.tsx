import React, { useEffect, useState } from 'react';
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

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  if (currentUser) return <>{children}</>;

  return <div className={`${theme === 'dark' ? 'dark bg-[#07090E] text-zinc-100' : 'bg-zinc-50 text-zinc-900'} min-h-screen flex items-center justify-center p-6`}>
    <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center shadow-xl">
      <h1 className="text-2xl font-black">Mr. <span className="text-[#FF5500]">Contract</span></h1>
      <p className="mt-3 text-sm text-zinc-500">Sign in with the verified CRM administrator Google account.</p>
      {authError && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{authError}</p>}
      <button type="button" onClick={signIn} className="mt-6 w-full rounded-xl bg-[#FF5500] px-4 py-3 text-sm font-bold text-white">Continue with Google</button>
      <button type="button" onClick={() => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); }} className="mt-4 text-xs text-zinc-500">Toggle theme</button>
    </div>
  </div>;
};
