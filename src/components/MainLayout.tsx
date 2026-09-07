import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { SettingsModal } from './SettingsModal';
import { SwitchUserModal } from './SwitchUserModal';
import { ActivityLogModal } from './ActivityLogModal';
import { AppConfig, AppointmentFormData, GoogleCalendarEventPayload } from '../types';
import { loadAppConfig, saveAppConfig, applyTheme, fetchAndSyncServerConfig } from '../config';
import { useUser } from '../lib/userContext';
import { getNewLeads } from '../lib/newLeads';
import { getScheduledClients } from '../lib/scheduledClients';
import {
  LayoutGrid,
  User,
  Clock,
  CalendarClock,
  Settings,
  Sun,
  Moon,
  Plus
} from 'lucide-react';

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useUser();
  const [config, setConfig] = useState<AppConfig>(loadAppConfig);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [newLeadsCount, setNewLeadsCount] = useState(() => getNewLeads().length);

  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    applyTheme(config.theme);
    fetchAndSyncServerConfig().then((serverCfg) => {
      if (serverCfg) {
        setConfig(serverCfg);
        applyTheme(serverCfg.theme);
      }
    });
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      setNewLeadsCount(getNewLeads().length);
    };
    window.addEventListener('storage', handleStorageChange);
    const interval = setInterval(() => {
      setNewLeadsCount(getNewLeads().length);
    }, 3000);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const handleSaveConfig = (newCfg: AppConfig) => {
    setConfig(newCfg);
    saveAppConfig(newCfg);
    applyTheme(newCfg.theme);
  };

  const handleToggleTheme = () => {
    const nextTheme = config.theme === 'dark' ? 'light' : 'dark';
    const newCfg = { ...config, theme: nextTheme as 'dark' | 'light' };
    handleSaveConfig(newCfg);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors selection:bg-[#FF5500]/20 selection:text-[#FF5500]">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-3 text-sm font-bold ${
            toastMessage.type === 'success'
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-zinc-800'
              : 'bg-red-600 text-white border-red-500'
          }`}>
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main App Shell */}
      <div className="flex-1 flex min-h-0 relative">
        <Sidebar
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          isMobileOpen={isMobileSidebarOpen}
          setIsMobileOpen={setIsMobileSidebarOpen}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
          {/* Top Header Bar with Theme & Quick Actions */}
          <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-black text-base sm:text-lg tracking-tight uppercase">
                LEAD MASTER LIST
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleTheme}
                className="p-2.5 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 transition-all cursor-pointer flex items-center justify-center"
                title={config.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label="Toggle Theme"
              >
                {config.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2.5 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 transition-all cursor-pointer flex items-center justify-center"
                title="Settings"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto min-h-0">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-lg border-t border-zinc-200 dark:border-zinc-800 px-2 py-1.5 flex items-center justify-around shadow-lg">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-colors min-w-[54px] min-h-[48px] ${
              isActive
                ? 'text-[#FF5500] font-black'
                : 'text-zinc-500 dark:text-zinc-400 font-medium'
            }`
          }
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] tracking-tight mt-0.5">Overview</span>
        </NavLink>

        <NavLink
          to="/new"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-colors min-w-[54px] min-h-[48px] relative ${
              isActive
                ? 'text-[#FF5500] font-black'
                : 'text-zinc-500 dark:text-zinc-400 font-medium'
            }`
          }
        >
          <div className="relative">
            <User className="w-5 h-5" />
            {newLeadsCount > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 min-w-[18px] h-4.5 rounded-full bg-[#FF5500] text-white text-xs font-black flex items-center justify-center">
                {newLeadsCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">New</span>
        </NavLink>

        <NavLink
          to="/leads?status=Followed Up"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-colors min-w-[54px] min-h-[48px] ${
              isActive
                ? 'text-[#FF5500] font-black'
                : 'text-zinc-500 dark:text-zinc-400 font-medium'
            }`
          }
        >
          <Clock className="w-5 h-5" />
          <span className="text-[10px] tracking-tight mt-0.5">Followed Up</span>
        </NavLink>

        <NavLink
          to="/scheduled-clients"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-colors min-w-[54px] min-h-[48px] ${
              isActive
                ? 'text-[#FF5500] font-black'
                : 'text-zinc-500 dark:text-zinc-400 font-medium'
            }`
          }
        >
          <CalendarClock className="w-5 h-5" />
          <span className="text-[10px] tracking-tight mt-0.5">Scheduled</span>
        </NavLink>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-colors min-w-[54px] min-h-[48px] text-zinc-500 dark:text-zinc-400 font-medium cursor-pointer"
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] tracking-tight mt-0.5">Settings</span>
        </button>
      </div>

      {/* Global Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={handleSaveConfig}
        initialTab="general"
        initialSubTab="connections"
      />
      <SwitchUserModal />
      <ActivityLogModal />
    </div>
  );
};
