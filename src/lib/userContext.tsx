import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppUser } from '../types';
import { auth, googleSignIn, signOutUser } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

interface UserContextType {
  currentUser: AppUser | null;
  users: AppUser[];
  isLoading: boolean;
  selectUser: (user: AppUser) => void;
  addUser: (name: string, color?: string) => Promise<AppUser | null>;
  updateUser: (id: string, name: string, color?: string) => Promise<AppUser | null>;
  deleteUser: (id: string) => Promise<boolean>;
  logoutUser: () => void;
  refreshUsers: () => Promise<void>;
  isSwitchUserModalOpen: boolean;
  setIsSwitchUserModalOpen: (open: boolean) => void;
  isActivityLogModalOpen: boolean;
  setIsActivityLogModalOpen: (open: boolean) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);
const DEFAULT_ALLOWED_EMAILS = ['info@mrcontract.us', 'johnluidadolfo2003@gmail.com'];
const CONFIGURED_ADMIN_EMAIL = String(
  import.meta.env.VITE_CRM_INITIAL_ADMIN_EMAIL ||
  (import.meta as any).env?.CRM_INITIAL_ADMIN_EMAIL ||
  ''
).trim().toLowerCase();

export const ALLOWED_ADMIN_EMAILS: string[] = Array.from(
  new Set(
    [
      ...DEFAULT_ALLOWED_EMAILS,
      ...(CONFIGURED_ADMIN_EMAIL ? [CONFIGURED_ADMIN_EMAIL] : []),
    ]
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  )
);

export const ADMIN_EMAIL = CONFIGURED_ADMIN_EMAIL || ALLOWED_ADMIN_EMAILS[0] || 'info@mrcontract.us';

export function isAuthorizedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ALLOWED_ADMIN_EMAILS.includes(normalized);
}

function toAppUser(user: User): AppUser {
  return {
    id: user.uid,
    name: user.displayName || user.email || 'Administrator',
    color: '#FF5500',
    createdAt: user.metadata.creationTime || new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
}

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchUserModalOpen, setIsSwitchUserModalOpen] = useState(false);
  const [isActivityLogModalOpen, setIsActivityLogModalOpen] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }

      const email = user.email?.trim().toLowerCase();
      const isAuthorized = Boolean(
        user.emailVerified &&
        isAuthorizedAdminEmail(email)
      );

      if (isAuthorized) {
        setCurrentUser(toAppUser(user));
      } else {
        await signOutUser().catch(() => {});
        setCurrentUser(null);
      }
      setIsLoading(false);
    });
  }, []);

  const reject = async (): Promise<null> => { throw new Error('CRM profiles are managed by Google authentication.'); };
  const deleteUser = async (_id: string): Promise<boolean> => reject() as any;
  const logoutUser = () => { void signOutUser(); };

  return <UserContext.Provider value={{
    currentUser,
    users: currentUser ? [currentUser] : [],
    isLoading,
    selectUser: () => undefined,
    addUser: reject,
    updateUser: reject,
    deleteUser,
    logoutUser,
    refreshUsers: async () => undefined,
    isSwitchUserModalOpen,
    setIsSwitchUserModalOpen,
    isActivityLogModalOpen,
    setIsActivityLogModalOpen,
  }}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
};

export { googleSignIn };
