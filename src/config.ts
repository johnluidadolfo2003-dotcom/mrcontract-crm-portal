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

export const DEFAULT_ZAPIER_WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/28623037/4hml53j/';

export const DEFAULT_CONFIG: AppConfig = {
 salespeople: DEFAULT_SALESPEOPLE,
 leadSources: DEFAULT_LEAD_SOURCES,
 leadTypes: DEFAULT_LEAD_TYPES,
 timeZone: 'America/New_York',
 theme: 'light',
 spreadsheetId: '1arAGlZO9VyY1St_ywT9ZtEaKyLaFfr3RIzw0-ebhJX0',
 spreadsheetName: 'Lead Master List',
 sheetTabName: 'Angi',
 autoSyncToSheets: true,
 houzzWebhookUrl: DEFAULT_ZAPIER_WEBHOOK_URL,
};

const STORAGE_KEY = 'masonry_appointment_config';

export function applyTheme(theme?: 'dark' | 'light'): void {
 const currentTheme = theme || loadAppConfig().theme || 'light';
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
 // Clean up legacy spreadsheet keys if present in localStorage
 if (parsed.spreadsheetId || parsed.spreadsheetUrl || parsed.spreadsheetName) {
 delete parsed.spreadsheetId;
 delete parsed.spreadsheetUrl;
 delete parsed.spreadsheetName;
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
 theme: parsed.theme || 'light',
 spreadsheetId: 'env',
 spreadsheetName: 'Google Sheets (Environment Configured)',
 sheetTabName: parsed.sheetTabName || 'Angi',
 autoSyncToSheets: parsed.autoSyncToSheets !== undefined ? parsed.autoSyncToSheets : true,
 houzzWebhookUrl: (parsed.houzzWebhookUrl && parsed.houzzWebhookUrl.trim()) ? parsed.houzzWebhookUrl.trim() : DEFAULT_CONFIG.houzzWebhookUrl,
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
 // Strip spreadsheet ID and URL so they are never saved to browser storage
 const sanitized = { ...config };
 delete (sanitized as any).spreadsheetId;
 delete (sanitized as any).spreadsheetUrl;
 delete (sanitized as any).spreadsheetName;

 localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
 applyTheme(config.theme);
 // Sync to server so other laptops/users share the webhook/config
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
 houzzWebhookUrl: (serverCfg.houzzWebhookUrl && serverCfg.houzzWebhookUrl.trim()) 
 || (local.houzzWebhookUrl && local.houzzWebhookUrl.trim()) 
 || DEFAULT_ZAPIER_WEBHOOK_URL,
 };
 localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
 applyTheme(merged.theme);
 return merged;
 }
 }
 } catch {}
 return loadAppConfig();
}
