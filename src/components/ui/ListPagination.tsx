import React, { useState } from 'react';

export function getPageWindow(total: number, requestedPage: number, pageSize = 50) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(requestedPage, pages));
  return { page, pages, start: (page - 1) * pageSize, end: Math.min(page * pageSize, total) };
}

export function usePaginatedList<T>(items: T[], filterKey: string, pageSize = 50) {
  const [selection, setSelection] = useState({ filterKey, page: 1 });
  const { page, pages, start, end } = getPageWindow(items.length, selection.filterKey === filterKey ? selection.page : 1, pageSize);
  const setPage = (next: number) => setSelection({ filterKey, page: Math.max(1, Math.min(next, pages)) });
  return {
    visibleItems: items.slice(start, end),
    pagination: { page, pages, total: items.length, pageSize, setPage },
  };
}

export function ListPagination({ page, pages, total, pageSize, setPage }: {
  page: number; pages: number; total: number; pageSize: number; setPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Lead list pages" className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs text-zinc-600 dark:text-zinc-300">
      <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
      <div className="flex items-center gap-3">
        <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 disabled:opacity-40">Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" disabled={page === pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 disabled:opacity-40">Next</button>
      </div>
    </nav>
  );
}
