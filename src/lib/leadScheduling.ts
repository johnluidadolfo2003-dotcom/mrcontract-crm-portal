import type { AppointmentFormData } from '../types';
import type { SheetRowRecord } from './sheets';

export function isFollowedUpStage(status?: string | null): boolean {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ') === 'followed up';
}

export function buildSheetLeadAppointmentPrefill(
  row: SheetRowRecord,
  options: {
    today: string;
    selectedTab?: string;
    defaultLeadSource?: string;
    defaultLeadType?: string;
  }
): AppointmentFormData {
  const selectedSource = options.selectedTab && options.selectedTab !== 'ALL'
    ? options.selectedTab
    : '';
  const sourceTabName = row.tabName || row.leadSource || selectedSource || options.defaultLeadSource || 'Angi';
  const serviceNeeded = row.serviceNeeded || row.leadType || options.defaultLeadType || 'Direct';

  return {
    clientName: row.clientName || '',
    appointmentDate: row.appointmentDate || options.today,
    startTime: row.startTime || '09:00',
    endTime: row.endTime || '11:00',
    salespersonCode: row.salespersonCode || '',
    clientPhone: row.clientPhone || '',
    clientEmail: row.clientEmail || '',
    address: row.address || '',
    leadSource: row.leadSource || sourceTabName,
    leadType: serviceNeeded,
    serviceNeeded,
    leadFee: row.leadFee || '',
    notes: row.notes || '',
    status: row.status || 'Followed Up',
    sourceRowIndex: row.rowIndex,
    sourceStatusColIndex: row.statusColIndex,
    sourceTabName,
  };
}
