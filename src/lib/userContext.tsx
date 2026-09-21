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
const ADMIN_EMAIL = String(import.meta.env.VITE_CRM_INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();

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

  useEffect(() => onAuthStateChanged(auth, (user) => {
    const email = user?.email?.trim().toLowerCase();
    setCurrentUser(user && user.emailVerified && ADMIN_EMAIL && email === ADMIN_EMAIL ? toAppUser(user) : null);
    setIsLoading(false);
  }), []);

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

export { ADMIN_EMAIL, googleSignIn };
