import React from 'react';
import { Loader2 } from 'lucide-react';

export const SkeletonTable = () => {
  return (
    <div className="py-4">
      <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-950/80 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-zinc-500">
        <span className="flex-1">NAME</span>
        <div className="flex items-center gap-3 sm:gap-6 justify-end">
          <span className="w-36 sm:w-48 text-left">STATUS</span>
          <span className="w-24 sm:w-28 text-center sm:text-right">SCHEDULED</span>
        </div>
      </div>
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-3 sm:p-4 flex items-center justify-between gap-3 animate-pulse">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0"></div>
              <div className="min-w-0 flex-1">
                <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-32 mb-1.5"></div>
                <div className="h-3 bg-zinc-200/60 dark:bg-zinc-800/50 rounded w-24"></div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <div className="w-36 sm:w-48 h-8 rounded-xl bg-zinc-200 dark:bg-zinc-800"></div>
              <div className="w-24 sm:w-28 h-8 rounded-xl bg-zinc-200 dark:bg-zinc-800"></div>
            </div>
          </div>
        ))}
      </div>
      <div className="py-8 text-center flex flex-col items-center justify-center gap-2 text-zinc-500">
        <Loader2 className="w-5 h-5 text-[#FF5500] animate-spin" />
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Loading data...</span>
      </div>
    </div>
  );
};
