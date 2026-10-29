/** Shared by the browser and server so saved settings cannot hide standard sources. */
export const DEFAULT_LEAD_SOURCES = [
  'Angi',
  'Thumbtack',
  'Referral',
  'Big Fish',
  'Houzz Pro',
  'Home Launch',
  'Website',
  'Yard Sign',
  'Chimney Fixers',
  'Direct from Daniel',
  'Truck Sign',
  'Other',
];

export function isLeadSourceTab(name: string): boolean {
  if (typeof name !== 'string') return false;
  const clean = name.trim().toLowerCase();
  return Boolean(clean) && !clean.includes('summary') && !clean.includes('zapier');
}

const RETIRED_LEAD_SOURCE_KEYS = new Set(['roofr']);

export function normalizeLeadSource(value: string): string {
  const clean = String(value || '').trim();
  const key = clean.toLowerCase().replace(/[\s_-]+/g, '');
  if (RETIRED_LEAD_SOURCE_KEYS.has(key)) return 'Other';
  return DEFAULT_LEAD_SOURCES.find((source) => source.toLowerCase().replace(/[\s_-]+/g, '') === key) || clean;
}

export function mergeLeadSources(saved?: unknown): string[] {
  const sources = Array.isArray(saved) ? saved : [];
  const seen = new Set<string>();
  return [...DEFAULT_LEAD_SOURCES, ...sources]
    .filter((source): source is string => typeof source === 'string' && isLeadSourceTab(source))
    .map(normalizeLeadSource)
    .filter((source) => {
      const key = source.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Only query existing Sheet ranges; unused standard sources may have no tab yet. */
export function existingSheetTabs(requested: string[], available: string[]): string[] {
  const titles = new Map(available.map((title) => [title.trim().toLowerCase(), title]));
  return [...new Set(requested.map((title) => titles.get(String(title).trim().toLowerCase()))
    .filter((title): title is string => Boolean(title)))];
}
