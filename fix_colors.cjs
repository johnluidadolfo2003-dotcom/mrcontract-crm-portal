const fs = require('fs');
let content = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

const replacement = `const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'New': {
    bg: 'bg-slate-100 dark:bg-zinc-800/80',
    text: 'text-slate-800 dark:text-zinc-200 font-extrabold',
    border: 'border-slate-300 dark:border-zinc-700',
    dot: 'bg-slate-500',
  },
  'Followed Up': {
    bg: 'bg-slate-100 dark:bg-zinc-800/80',
    text: 'text-slate-800 dark:text-zinc-200 font-extrabold',
    border: 'border-slate-300 dark:border-zinc-700',
    dot: 'bg-slate-500',
  },
  'Meeting Scheduled': {
    bg: 'bg-emerald-100 dark:bg-emerald-950/80',
    text: 'text-emerald-950 dark:text-emerald-100 font-extrabold',
    border: 'border-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  '3 day Follow UP': {
    bg: 'bg-slate-100 dark:bg-zinc-800/80',
    text: 'text-slate-800 dark:text-zinc-200 font-extrabold',
    border: 'border-slate-300 dark:border-zinc-700',
    dot: 'bg-slate-500',
  },
  '7 day Follow UP': {
    bg: 'bg-slate-100 dark:bg-zinc-800/80',
    text: 'text-slate-800 dark:text-zinc-200 font-extrabold',
    border: 'border-slate-300 dark:border-zinc-700',
    dot: 'bg-slate-500',
  },
  '15 day Follow UP': {
    bg: 'bg-slate-100 dark:bg-zinc-800/80',
    text: 'text-slate-800 dark:text-zinc-200 font-extrabold',
    border: 'border-slate-300 dark:border-zinc-700',
    dot: 'bg-slate-500',
  },
  '30 day Follow UP': {
    bg: 'bg-amber-100 dark:bg-amber-950/80',
    text: 'text-amber-950 dark:text-amber-100 font-extrabold',
    border: 'border-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  'Past 90 days Follow UP': {
    bg: 'bg-red-100 dark:bg-red-950/80',
    text: 'text-red-950 dark:text-red-100 font-extrabold',
    border: 'border-red-300 dark:border-red-800',
    dot: 'bg-red-500',
  },
  'Won': {
    bg: 'bg-emerald-600 dark:bg-emerald-600',
    text: 'text-white font-black',
    border: 'border-emerald-700 dark:border-emerald-500',
    dot: 'bg-white',
  },
  'Won Job': {
    bg: 'bg-emerald-600 dark:bg-emerald-600',
    text: 'text-white font-black',
    border: 'border-emerald-700 dark:border-emerald-500',
    dot: 'bg-white',
  },
  'Dead': {
    bg: 'bg-slate-200 dark:bg-zinc-800',
    text: 'text-slate-600 dark:text-zinc-400 font-black',
    border: 'border-slate-300 dark:border-zinc-700',
    dot: 'bg-slate-500',
  }
};`;

const regex = /const STATUS_COLORS: Record<string, \{ bg: string; text: string; border: string; dot: string \}> = \{[\s\S]*?'Dead': \{[^}]+\}[ \n\t]*\};/;
content = content.replace(regex, replacement);

fs.writeFileSync('src/pages/SpreadsheetPage.tsx', content);
