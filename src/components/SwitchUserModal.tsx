import React, { useState, useEffect } from 'react';
import { useUser } from '../lib/userContext';
import { X, Check, ArrowRight, Trash2, Plus, Users, Pencil } from 'lucide-react';
import { AppUser } from '../types';

const PRESET_COLORS = [
  '#FF5500',
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#06B6D4',
];

export const SwitchUserModal: React.FC = () => {
  const {
    currentUser,
    users,
    selectUser,
    addUser,
    updateUser,
    deleteUser,
    isSwitchUserModalOpen,
    setIsSwitchUserModalOpen,
    logoutUser,
  } = useUser();

  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#FF5500');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit user state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#FF5500');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!isSwitchUserModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSwitchUserModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSwitchUserModalOpen, setIsSwitchUserModalOpen]);

  useEffect(() => {
    const handleOpen = () => setIsSwitchUserModalOpen(true);
    window.addEventListener('open_switch_user_modal', handleOpen);
    return () => window.removeEventListener('open_switch_user_modal', handleOpen);
  }, [setIsSwitchUserModalOpen]);

  if (!isSwitchUserModalOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await addUser(name.trim(), color);
      setName('');
      setIsAdding(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (e: React.MouseEvent, u: AppUser) => {
    e.stopPropagation();
    setEditingUserId(u.id);
    setEditName(u.name);
    setEditColor(u.color || '#FF5500');
    setIsAdding(false);
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditName('');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md w-full max-w-lg p-4 sm:p-5 shadow-lg relative max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#FF5500]/10 flex items-center justify-center text-[#FF5500]">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">Worker Profiles</h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Switch profile or edit your user name</p>
            </div>
          </div>
          <button
            onClick={() => setIsSwitchUserModalOpen(false)}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors duration-120"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {isAdding ? (
            <form onSubmit={handleAdd} className="p-3 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Add New Team Member</span>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors duration-120 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <input
                type="text"
                autoFocus
                placeholder="User name (e.g. Alex)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 h-[34px] text-xs text-zinc-900 dark:text-white font-bold outline-none focus:ring-1 focus:ring-[#FF5500]"
              />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-1">Avatar Color</span>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-5 h-5 rounded-md transition-opacity duration-120 cursor-pointer flex items-center justify-center ${
                        color === c ? 'ring-2 ring-zinc-900 dark:ring-white' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {color === c && <Check className="w-3 h-3 text-white stroke-[3]" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-1 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="px-3 h-[34px] bg-[#FF5500] hover:bg-[#e04b00] disabled:opacity-50 text-white text-xs font-bold rounded-md cursor-pointer transition-colors duration-120"
                >
                  {isSubmitting ? 'Adding...' : 'Create & Switch'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(true);
                  setEditingUserId(null);
                }}
                className="flex items-center gap-1.5 px-2.5 h-[34px] rounded-md bg-[#FF5500]/10 hover:bg-[#FF5500]/20 text-[#FF5500] text-xs font-bold transition-colors duration-120 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Add User</span>
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            {users.map((u) => {
              const isEditingThis = editingUserId === u.id;
              const isActive = currentUser?.id === u.id || currentUser?.name.toLowerCase() === u.name.toLowerCase();
              const initial = u.name ? u.name.trim().charAt(0).toUpperCase() : 'U';

              if (isEditingThis) {
                return (
                  <form
                    key={u.id}
                    onSubmit={(e) => handleSaveEdit(e, u.id)}
                    className="p-3 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-[#FF5500]/40 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5 text-[#FF5500]" />
                        <span>Edit Name & Profile</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer transition-colors duration-120"
                      >
                        Cancel
                      </button>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-1">
                        User Name
                      </label>
                      <input
                        type="text"
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Enter your name"
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 h-[34px] text-xs text-zinc-900 dark:text-white font-bold outline-none focus:ring-1 focus:ring-[#FF5500]"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-1">Avatar Color</span>
                      <div className="flex gap-2">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`w-5 h-5 rounded-md transition-opacity duration-120 cursor-pointer flex items-center justify-center ${
                              editColor === c ? 'ring-2 ring-zinc-900 dark:ring-white' : 'opacity-70 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: c }}
                          >
                            {editColor === c && <Check className="w-3 h-3 text-white stroke-[3]" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="px-3 h-[34px] rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors duration-120 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingEdit || !editName.trim()}
                        className="px-3 h-[34px] bg-[#FF5500] hover:bg-[#e04b00] disabled:opacity-50 text-white text-xs font-bold rounded-md cursor-pointer transition-colors duration-120 flex items-center gap-1.5"
                      >
                        {isSavingEdit ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                );
              }

              return (
                <div
                  key={u.id}
                  onClick={() => selectUser(u)}
                  className={`p-2.5 rounded-md border transition-colors duration-120 cursor-pointer flex items-center justify-between group ${
                    isActive
                      ? 'bg-[#FF5500]/10 border-[#FF5500]'
                      : 'bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-xs shrink-0 bg-[#FF5500]"
                    >
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                          {u.name}
                        </span>
                        {isActive && (
                          <span className="px-1.5 py-0.5 rounded-md bg-[#FF5500] text-white text-[10px] font-bold uppercase tracking-wider tabular-nums">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block truncate tabular-nums">
                        {u.lastActiveAt ? `Last active ${new Date(u.lastActiveAt).toLocaleDateString()}` : 'Team Member'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Edit Name Button */}
                    <button
                      type="button"
                      onClick={(e) => handleStartEdit(e, u)}
                      className="p-1.5 text-zinc-400 hover:text-[#FF5500] dark:text-zinc-500 dark:hover:text-[#FF5500] hover:bg-[#FF5500]/10 rounded-md transition-colors duration-120 cursor-pointer"
                      title="Edit user name"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {/* Switch Indicator */}
                    {!isActive && (
                      <div className="w-6 h-6 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-[#FF5500] group-hover:text-white flex items-center justify-center transition-colors duration-120">
                        <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                      </div>
                    )}

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUserToDelete({ id: u.id, name: u.name });
                      }}
                      className="p-1.5 text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors duration-120 cursor-pointer"
                      title="Remove user"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              logoutUser();
              setIsSwitchUserModalOpen(false);
            }}
            className="text-xs text-red-500 hover:text-red-600 font-bold transition-colors duration-120 cursor-pointer"
          >
            Log Out Current Profile
          </button>
          <button
            type="button"
            onClick={() => setIsSwitchUserModalOpen(false)}
            className="px-3 h-[34px] bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors duration-120 cursor-pointer flex items-center justify-center"
          >
            Close
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {userToDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 rounded-md">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-4 max-w-sm w-full shadow-lg text-center space-y-3">
            <div className="w-10 h-10 rounded-md bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Delete Profile</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Are you sure you want to remove <span className="font-bold text-zinc-800 dark:text-zinc-200">"{userToDelete.name}"</span>? This cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="flex-1 h-[34px] rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors duration-120 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteUser(userToDelete.id);
                  setUserToDelete(null);
                }}
                className="flex-1 h-[34px] rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors duration-120 cursor-pointer"
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
