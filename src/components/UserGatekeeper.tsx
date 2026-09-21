import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, loadAppConfig } from '../config';

/**
 * Temporary access mode: Google sign-in is intentionally disabled.
 * Restore the authentication gate using the prompt in AUTH_RESTORE_PROMPT.md
 * when the single-account login requirement should be re-enabled.
 */
export const UserGatekeeper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadAppConfig().theme || 'dark');

  useEffect(() => applyTheme(theme), [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return <div className={`${theme === 'dark' ? 'dark' : ''} min-h-screen`}>
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Dark mode' : 'Light mode'}
      aria-label={theme === 'dark' ? 'Dark mode' : 'Light mode'}
      className="fixed right-6 top-6 z-50 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
    >
      {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
    {children}
  </div>;
};
