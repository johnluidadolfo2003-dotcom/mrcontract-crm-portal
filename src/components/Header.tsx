import React from 'react';
import { Settings, LogOut, CheckCircle, AlertCircle, Sun, Moon } from 'lucide-react';
import { User } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
 user: User | null;
 onSignIn: () => void;
 onSignOut: () => void;
 onOpenSettings: () => void;
 isLoggingIn: boolean;
 theme?: 'dark' | 'light';
 onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
 user,
 onSignIn,
 onSignOut,
 onOpenSettings,
 isLoggingIn,
 theme = 'dark',
 onToggleTheme,
}) => {
 const navigate = useNavigate();

 return (
 <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-30 shadow-2xs">
 <div className="max-w-4xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2">
 {/* Left side: Logo */}
 <div className="flex items-center min-w-0">
 <button
 onClick={() => navigate('/')}
 className="flex items-center hover:opacity-90 transition-opacity cursor-pointer text-xl sm:text-2xl md:text-3xl font-black tracking-tight truncate"
 >
 <span className="text-black dark:text-white uppercase">LEAD MASTER LIST</span>
 </button>
 </div>

 {/* Right side controls: Theme Toggle, Connection indicator & Settings */}
 <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
 {/* Dark / Light Mode Toggle */}
 {onToggleTheme && (
 <button
 onClick={onToggleTheme}
 className="p-2 sm:p-2 text-zinc-600 dark:text-zinc-300 hover:text-black dark:hover:text-white bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-800 rounded-md transition-colors duration-120 cursor-pointer shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#FF5500]"
 title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
 aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
 >
 {theme === 'dark' ? (
 <Sun className="w-4 h-4 text-zinc-700 dark:text-zinc-300"/>
 ) : (
 <Moon className="w-4 h-4 text-zinc-700 dark:text-zinc-300"/>
 )}
 </button>
 )}


 </div>
 </div>
 </header>
 );
};

