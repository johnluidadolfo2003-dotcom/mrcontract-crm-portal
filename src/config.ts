import { AppConfig, SalespersonOption } from './types';

export const DEFAULT_SALESPEOPLE: SalespersonOption[] = [
  { id: 'sp_dg', code: 'DG', name: 'Daniel Grider (DG)' },
];

export const US_TIME_ZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET - Eastern)' },
  { value: 'America/Chicago', label: 'Central Time (CT - Central)' },
  { value: 'America/Denver', label: 'Mountain Time (MT - Mountain)' },
  { value: 'America/Phoenix', label: 'Mountain Time - Arizona (No DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT - Pacific)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT - Alaska)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT - Hawaii)' },
];

export const DEFAULT_LEAD_SOURCES = [
  'Angi',
  'Thumbtack',
  'Referral',
  'Big Fish',
  'Houzz Pro',
  'Roof R',
  'Home Launch',
  'Website',
  'Yard Sign',
  'Other',
];
export const DEFAULT_LEAD_TYPES = ['Direct', 'Other'];

export function isLeadSourceTab(name: string): boolean {
  if (!name) return false;
  const clean = name.trim().toLowerCase();
  if (clean === 'summary' || clean === 'zapier' || clean.includes('summary') || clean.includes('zapier')) {
    return false;
  }
  return true;
}

export const DEFAULT_ZAPIER_WEBHOOK_URL = '';

export const DEFAULT_CONFIG: AppConfig = {
  salespeople: DEFAULT_SALESPEOPLE,
  leadSources: DEFAULT_LEAD_SOURCES,
  leadTypes: DEFAULT_LEAD_TYPES,
  timeZone: 'America/New_York',
  theme: 'dark',
  spreadsheetId: '1arAGlZO9VyY1St_ywT9ZtEaKyLaFfr3RIzw0-ebhJX0',
  spreadsheetName: 'Lead Master List',
  sheetTabName: 'Angi',
  autoSyncToSheets: true,
  autoSendToHouzz: false,
};

const STORAGE_KEY = 'masonry_appointment_config';

export function applyTheme(theme?: 'dark' | 'light'): void {
  const currentTheme = theme || loadAppConfig().theme || 'dark';
  if (currentTheme === 'light') {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }
}

export function loadAppConfig(): AppConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Clean up legacy spreadsheet keys and webhook URLs if present in localStorage
      if (parsed.spreadsheetId || parsed.spreadsheetUrl || parsed.spreadsheetName || parsed.houzzWebhookUrl || parsed.webhookUrl) {
        delete parsed.spreadsheetId;
        delete parsed.spreadsheetUrl;
        delete parsed.spreadsheetName;
        delete parsed.houzzWebhookUrl;
        delete parsed.webhookUrl;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        } catch {}
      }

      // Ensure all standard lead sources are present without Summary or Zapier
      const mergedLeadSources = Array.from(
        new Set([...DEFAULT_LEAD_SOURCES, ...(parsed.leadSources || [])])
      ).filter(isLeadSourceTab);
      let loadedSalespeople = parsed.salespeople || DEFAULT_SALESPEOPLE;
      loadedSalespeople = loadedSalespeople
        .map((sp: any) => ({
          id: sp.id || String(Date.now()),
          code: sp.code || 'DG',
          name: sp.name || 'Salesperson',
        }));
      if (loadedSalespeople.length === 0) {
        loadedSalespeople = DEFAULT_SALESPEOPLE;
      }

      const loaded: AppConfig = {
        ...DEFAULT_CONFIG,
        ...parsed,
        salespeople: loadedSalespeople,
        leadSources: mergedLeadSources,
        leadTypes: parsed.leadTypes && parsed.leadTypes.length > 0 ? parsed.leadTypes : DEFAULT_LEAD_TYPES,
        timeZone: parsed.timeZone || 'America/New_York',
        theme: parsed.theme || 'dark',
        spreadsheetId: 'env',
        spreadsheetName: 'Google Sheets (Environment Configured)',
        sheetTabName: parsed.sheetTabName || 'Angi',
        autoSyncToSheets: parsed.autoSyncToSheets !== undefined ? parsed.autoSyncToSheets : true,
        autoSendToHouzz: parsed.autoSendToHouzz !== undefined ? parsed.autoSendToHouzz : false,
      };
      applyTheme(loaded.theme);
      return loaded;
    }
  } catch (err) {
    console.error('Failed to load config from storage:', err);
  }
  applyTheme(DEFAULT_CONFIG.theme);
  return DEFAULT_CONFIG;
}

export function saveAppConfig(config: AppConfig): void {
  try {
    // Strip spreadsheet credentials and webhook URLs so they are never saved to browser storage or config.json
    const sanitized = { ...config };
    delete (sanitized as any).spreadsheetId;
    delete (sanitized as any).spreadsheetUrl;
    delete (sanitized as any).spreadsheetName;
    delete (sanitized as any).houzzWebhookUrl;
    delete (sanitized as any).webhookUrl;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    applyTheme(config.theme);
    // Sync settings to server
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitized),
    }).catch(() => {});
  } catch (err) {
    console.error('Failed to save config to storage:', err);
  }
}

export async function fetchAndSyncServerConfig(): Promise<AppConfig> {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const serverCfg = await res.json();
      if (serverCfg && Object.keys(serverCfg).length > 0) {
        const local = loadAppConfig();
        const merged = {
          ...local,
          ...serverCfg,
        };
        delete (merged as any).houzzWebhookUrl;
        delete (merged as any).webhookUrl;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        applyTheme(merged.theme);
        return merged;
      }
    }
  } catch {}
  return loadAppConfig();
}
