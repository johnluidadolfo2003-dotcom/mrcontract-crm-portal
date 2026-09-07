import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppUser } from '../types';
import { getCachedActiveUser, setCachedActiveUser } from './activityLogger';

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

const USER_COLORS = [
  '#FF5500', // Brand Orange
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#06B6D4', // Cyan
  '#14B8A6', // Teal
  '#6366F1', // Indigo
];

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUserState] = useState<AppUser | null>(() => {
    try {
      if (localStorage.getItem('mrcontract_logged_out') === 'true') {
        return null;
      }
      // Require profile selection/creation on fresh session or shared link entry
      if (!sessionStorage.getItem('session_user_selected')) {
        return null;
      }
    } catch {}
    return getCachedActiveUser();
  });
  const [users, setUsers] = useState<AppUser[]>(() => {
    try {
      const cached = localStorage.getItem('mrcontract_users_cache');
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitchUserModalOpen, setIsSwitchUserModalOpen] = useState(false);
  const [isActivityLogModalOpen, setIsActivityLogModalOpen] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          setUsers(data.users);
          localStorage.setItem('mrcontract_users_cache', JSON.stringify(data.users));
          
          // If currentUser is set, refresh their details in case changed
          if (currentUser) {
            const matched = data.users.find((u: AppUser) => u.id === currentUser.id || u.name.toLowerCase() === currentUser.name.toLowerCase());
            if (matched) {
              setCurrentUserState(matched);
              setCachedActiveUser(matched);
            }
          }
          return;
        }
      }
    } catch (e) {
      console.warn('Could not fetch remote users, checking local cache:', e);
    }

    // Fallback to local cache
    try {
      const cached = localStorage.getItem('mrcontract_users_cache');
      if (cached) {
        setUsers(JSON.parse(cached));
      } else {
        const defaultUsers: AppUser[] = [];
        setUsers(defaultUsers);
      }
    } catch {}
  };

  useEffect(() => {
    fetchUsers().finally(() => setIsLoading(false));

    // Poll users every 60 seconds to sync across computers and workers
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchUsers();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const selectUser = (user: AppUser) => {
    try {
      localStorage.removeItem('mrcontract_logged_out');
      sessionStorage.setItem('session_user_selected', 'true');
    } catch {}
    const updated = {
      ...user,
      lastActiveAt: new Date().toISOString(),
    };
    setCurrentUserState(updated);
    setCachedActiveUser(updated);
    setIsSwitchUserModalOpen(false);

    // Notify server of active timestamp
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});
  };

  const addUser = async (name: string, color?: string): Promise<AppUser | null> => {
    if (!name.trim()) return null;
    const cleanName = name.trim();
    const assignedColor = color || USER_COLORS[users.length % USER_COLORS.length];

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, color: assignedColor }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          if (Array.isArray(data.users)) setUsers(data.users);
          selectUser(data.user);
          return data.user;
        }
      }
    } catch (e) {
      console.error('Failed to create user on server:', e);
    }

    // Fallback local user creation
    const newLocalUser: AppUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      color: assignedColor,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    const updatedUsers = [...users, newLocalUser];
    setUsers(updatedUsers);
    localStorage.setItem('mrcontract_users_cache', JSON.stringify(updatedUsers));
    selectUser(newLocalUser);
    return newLocalUser;
  };

  const updateUser = async (id: string, newName: string, newColor?: string): Promise<AppUser | null> => {
    if (!newName.trim()) return null;
    const cleanName = newName.trim();

    // 1. Optimistic update in state & cache
    let updatedUser: AppUser | null = null;
    setUsers((prev) => {
      const updated = prev.map((u) => {
        if (u.id === id || u.name.toLowerCase() === id.toLowerCase()) {
          updatedUser = {
            ...u,
            name: cleanName,
            ...(newColor ? { color: newColor } : {}),
            lastActiveAt: new Date().toISOString(),
          };
          return updatedUser;
        }
        return u;
      });
      try {
        localStorage.setItem('mrcontract_users_cache', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (currentUser && (currentUser.id === id || currentUser.name.toLowerCase() === id.toLowerCase())) {
      const newActive: AppUser = {
        ...currentUser,
        name: cleanName,
        ...(newColor ? { color: newColor } : {}),
      };
      setCurrentUserState(newActive);
      setCachedActiveUser(newActive);
    }

    // 2. Sync to server
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, color: newColor }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          if (Array.isArray(data.users)) setUsers(data.users);
          if (currentUser && (currentUser.id === id || currentUser.name.toLowerCase() === id.toLowerCase())) {
            setCurrentUserState(data.user);
            setCachedActiveUser(data.user);
          }
          return data.user;
        }
      }
    } catch (e) {
      console.error('Failed to update user on server:', e);
    }

    return updatedUser;
  };

  const deleteUser = async (id: string): Promise<boolean> => {
    // 1. Immediately update local state & cache for instant UI feedback
    setUsers(prev => {
      const updated = prev.filter(u => u.id !== id && u.name.toLowerCase() !== id.toLowerCase());
      try {
        localStorage.setItem('mrcontract_users_cache', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (currentUser?.id === id || currentUser?.name.toLowerCase() === id.toLowerCase()) {
      logoutUser();
    }

    // 2. Sync with server in background
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          setUsers(data.users);
          try {
            localStorage.setItem('mrcontract_users_cache', JSON.stringify(data.users));
          } catch {}
        }
      }
    } catch (e) {
      console.error('Failed to delete user on server:', e);
    }

    return true;
  };

  const logoutUser = () => {
    setCurrentUserState(null);
    setCachedActiveUser(null);
    try {
      localStorage.setItem('mrcontract_logged_out', 'true');
      sessionStorage.removeItem('session_user_selected');
    } catch {}
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
        users,
        isLoading,
        selectUser,
        addUser,
        updateUser,
        deleteUser,
        logoutUser,
        refreshUsers: fetchUsers,
        isSwitchUserModalOpen,
        setIsSwitchUserModalOpen,
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
