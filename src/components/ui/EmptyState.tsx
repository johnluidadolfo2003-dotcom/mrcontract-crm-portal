import React from 'react';
import { Plus, FolderOpen } from 'lucide-react';

interface EmptyStateProps {
  tabName: string;
  onAdd: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ tabName, onAdd }) => {
  return (
    <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
      <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-200 dark:border-zinc-700/50 shadow-inner">
        <FolderOpen className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
      </div>
      <div className="space-y-1">
        <h3 className="text-zinc-900 dark:text-zinc-100 font-bold text-lg">No leads in "{tabName}"</h3>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-sm mx-auto">
          It's a little quiet here. Add your first lead to start building your pipeline for this source.
        </p>
      </div>
      <button
        onClick={onAdd}
        className="mt-2 px-6 py-2.5 bg-[#FF5500] hover:bg-[#E64D00] text-white font-bold text-sm rounded-lg inline-flex items-center gap-2 shadow-sm transition-all cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        <span>Add First Lead</span>
      </button>
    </div>
  );
};
