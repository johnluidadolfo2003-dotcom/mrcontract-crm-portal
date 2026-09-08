import React, { useState, useEffect } from 'react';
import { useUser } from '../lib/userContext';
import { loadAppConfig, saveAppConfig, applyTheme } from '../config';
import { User, UserPlus, ArrowRight, Check, Plus, Trash2, ShieldCheck, Sun, Moon, Pencil } from 'lucide-react';
import { AppUser } from '../types';

const PRESET_COLORS = [
  { bg: '#FF5500', name: 'Orange' },
  { bg: '#3B82F6', name: 'Blue' },
  { bg: '#10B981', name: 'Emerald' },
  { bg: '#8B5CF6', name: 'Purple' },
  { bg: '#EC4899', name: 'Pink' },
  { bg: '#F59E0B', name: 'Amber' },
  { bg: '#06B6D4', name: 'Cyan' },
];

export const UserGatekeeper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, users, selectUser, addUser, updateUser, deleteUser, isLoading } = useUser();
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#FF5500');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Editing state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#FF5500');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadAppConfig().theme || 'dark');
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);

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

  // If user is already logged in, render the app!
  if (currentUser) {
    return <>{children}</>;
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim()) {
      setErrorMsg('Please enter a name');
      return;
    }
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const created = await addUser(newUserName.trim(), selectedColor);
      if (created) {
        setNewUserName('');
        setIsAddingUser(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (e: React.MouseEvent, u: AppUser) => {
    e.stopPropagation();
    setEditingUserId(u.id);
    setEditName(u.name);
    setEditColor(u.color || '#FF5500');
    setIsAddingUser(false);
  };

  const handleSaveEdit = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editName.trim()) return;
    setIsSavingEdit(true);
    try {
      await updateUser(id, editName.trim(), editColor);
      setEditingUserId(null);
      setEditName('');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setUserToDelete({ id, name });
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-[#07090E] text-zinc-100' : 'bg-zinc-50 text-zinc-900'} flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden selection:bg-[#FF5500] selection:text-white transition-colors`}>
      {/* Theme Toggle Button in top right */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all shadow-sm cursor-pointer flex items-center justify-center min-w-[44px] min-h-[44px]"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="w-4 h-4 text-zinc-700 dark:text-zinc-300" /> : <Moon className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />}
      </button>

      {/* Main Card Container */}
      <div className="w-full max-w-xl z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-1.5 text-2xl sm:text-3xl font-black tracking-tight">
            <span className="text-zinc-900 dark:text-white">Mr.</span>
            <span className="text-[#FF5500]">Contract</span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm font-medium mt-1.5 tracking-wide">
            Select your profile to start working
          </p>
        </div>

        {/* User Profiles Grid Box */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-xl transition-colors">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-zinc-200 dark:border-zinc-800/80">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#FF5500]" />
              <span className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Team Profiles</span>
            </div>
            {!isAddingUser && (
              <button
                type="button"
                onClick={() => {
                  setIsAddingUser(true);
                  setEditingUserId(null);
                  setErrorMsg('');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF5500]/10 hover:bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/20 text-xs font-bold transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Add User</span>
              </button>
            )}
          </div>

          {/* Add User Form Section */}
          {isAddingUser && (
            <form onSubmit={handleCreateUser} className="mb-6 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">New Team Member</span>
                <button
                  type="button"
                  onClick={() => setIsAddingUser(false)}
                  className="text-xs text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div>
                <input
                  type="text"
                  autoFocus
                  placeholder="Enter user name (e.g. Alex)"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/80 focus:border-[#FF5500] rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/20 font-bold transition-all"
                />
                {errorMsg && <p className="text-xs text-red-500 dark:text-red-400 mt-1.5 font-medium">{errorMsg}</p>}
              </div>

              {/* Color picker pills */}
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-2">Avatar Color</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.bg}
                      type="button"
                      onClick={() => setSelectedColor(c.bg)}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                        selectedColor === c.bg ? 'scale-110 ring-2 ring-zinc-900 dark:ring-white shadow-md' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.bg }}
                      title={c.name}
                    >
                      {selectedColor === c.bg && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !newUserName.trim()}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#FF5500] hover:bg-[#e04b00] disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  {isSubmitting ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Create & Enter</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* User List Cards */}
          {isLoading && users.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-500 gap-2">
              <div className="w-6 h-6 border-2 border-[#FF5500] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold">Loading profiles...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 dark:text-zinc-500">
              <p className="text-sm font-medium mb-3">No profiles added yet.</p>
              <button
                type="button"
                onClick={() => setIsAddingUser(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF5500] text-white text-xs font-black hover:bg-[#e04b00] transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Add First User</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
              {users.map((u) => {
                const isEditingThis = editingUserId === u.id;
                const initial = u.name ? u.name.trim().charAt(0).toUpperCase() : 'U';

                if (isEditingThis) {
                  return (
                    <form
                      key={u.id}
                      onSubmit={(e) => handleSaveEdit(e, u.id)}
                      className="col-span-1 sm:col-span-2 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-[#FF5500]/40 space-y-3 shadow-md"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                          <Pencil className="w-3.5 h-3.5 text-[#FF5500]" />
                          <span>Edit Profile Name</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingUserId(null)}
                          className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>

                      <div>
                        <input
                          type="text"
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Enter user name"
                          className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl px-3.5 py-2 text-sm text-zinc-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-[#FF5500]/30"
                        />
                      </div>

                      <div className="pt-1 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingUserId(null)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingEdit || !editName.trim()}
                          className="px-4 py-1.5 bg-[#FF5500] hover:bg-[#e04b00] disabled:opacity-50 text-white text-xs font-black rounded-lg shadow cursor-pointer transition-all"
                        >
                          {isSavingEdit ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </form>
                  );
                }

                return (
                  <div
                    key={u.id}
                    onClick={() => selectUser(u)}
                    className="group relative p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/75 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 cursor-pointer flex items-center justify-between shadow-xs hover:shadow-xl"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Avatar Circle */}
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-md shrink-0 group- transition-transform bg-[#FF5500]"
                      >
                        {initial}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-950 dark:group-hover:text-white truncate block">
                            {u.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-500 font-medium block truncate mt-0.5">
                          {u.lastActiveAt ? `Active ${new Date(u.lastActiveAt).toLocaleDateString()}` : 'Ready to work'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={(e) => handleStartEdit(e, u)}
                        className="p-2 text-zinc-400 hover:text-[#FF5500] dark:text-zinc-500 dark:hover:text-[#FF5500] hover:bg-[#FF5500]/10 rounded-xl transition-all cursor-pointer"
                        title="Edit profile name"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      {/* Enter Arrow */}
                      <div className="w-8 h-8 rounded-xl bg-zinc-200 dark:bg-zinc-900 group-hover:bg-[#FF5500] text-zinc-600 dark:text-zinc-500 group-hover:text-white flex items-center justify-center transition-all shrink-0">
                        <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, u.id, u.name)}
                        className="p-2 text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                        title="Remove user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Info Footer */}
          <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-500 font-medium">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              <span>Synced across all computers</span>
            </span>
            <span>No password required</span>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900 dark:text-white">Delete Profile</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Are you sure you want to remove <span className="font-bold text-zinc-800 dark:text-zinc-200">"{userToDelete.name}"</span>? This cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteUser(userToDelete.id);
                  setUserToDelete(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-lg shadow-red-600/20 transition-all cursor-pointer"
              >
                Delete Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
