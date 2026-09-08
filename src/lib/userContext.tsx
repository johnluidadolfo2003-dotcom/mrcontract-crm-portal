import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppUser } from '../types';
import { googleSignIn, signOutUser as firebaseSignOut } from './firebase';

interface UserContextType {
  currentUser: AppUser | null;
  users: AppUser[];
  isLoading: boolean;
  authError: string | null;
  loginWithGoogle: () => Promise<void>;
  logoutUser: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  isActivityLogModalOpen: boolean;
  setIsActivityLogModalOpen: (open: boolean) => void;
  // Compatibility fields
  isUsersAccessModalOpen?: boolean;
  setIsUsersAccessModalOpen?: (open: boolean) => void;
  isSwitchUserModalOpen?: boolean;
  setIsSwitchUserModalOpen?: (open: boolean) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isActivityLogModalOpen, setIsActivityLogModalOpen] = useState(false);

  const checkSession = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setCurrentUser(data.user);
          setAuthError(null);
          return;
        }
      }
    } catch (err) {
      console.warn('Session check failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const loginWithGoogle = async () => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const { idToken } = await googleSignIn();
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const errMsg = data.error || 'Your Google account is not authorized to access this CRM. Contact an administrator.';
        setAuthError(errMsg);
        setCurrentUser(null);
        await firebaseSignOut().catch(() => {});
        return;
      }

      setCurrentUser(data.user);
      setAuthError(null);
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      if (err?.message && !err.message.includes('popup-closed-by-user')) {
        setAuthError(err.message || 'Failed to sign in with Google.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logoutUser = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      await firebaseSignOut().catch(() => {});
    } finally {
      setCurrentUser(null);
      setAuthError(null);
    }
  };

  const refreshUsers = async () => {
    await checkSession();
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
        users: currentUser ? [currentUser] : [],
        isLoading,
        authError,
        loginWithGoogle,
        logoutUser,
        refreshUsers,
        isUsersAccessModalOpen: false,
        setIsUsersAccessModalOpen: () => {},
        isSwitchUserModalOpen: false,
        setIsSwitchUserModalOpen: () => {},
        isActivityLogModalOpen,
        setIsActivityLogModalOpen,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
