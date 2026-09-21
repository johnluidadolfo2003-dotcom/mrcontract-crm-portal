import { AppointmentFormData } from '../types';

export type DashboardRepresentativeCode = 'DG' | 'SB' | 'JS' | 'BK';

export interface DashboardAppointmentIdentity {
 representative: DashboardRepresentativeCode;
 clientName: string;
 serviceNeeded: string;
}

const REPRESENTATIVE_CODES: DashboardRepresentativeCode[] = ['DG', 'SB', 'JS', 'BK'];

function asRepresentativeCode(value?: string): DashboardRepresentativeCode | null {
 const normalized = String(value || '').trim().toUpperCase();
 return REPRESENTATIVE_CODES.includes(normalized as DashboardRepresentativeCode)
  ? normalized as DashboardRepresentativeCode
  : null;
}

export function resolveDashboardAppointmentIdentity(
 summary: string,
 formData: Partial<AppointmentFormData>
): DashboardAppointmentIdentity | null {
 const cleanSummary = String(summary || '').trim();
 const canonical = cleanSummary.match(
  /^(?:appt|appointment)\s*[-–—]\s*(DG|SB|JS|BK)\s*[-–—]\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/i
 );

 const representative =
  asRepresentativeCode(formData.salespersonCode) ||
  asRepresentativeCode(canonical?.[1]) ||
  asRepresentativeCode(
   cleanSummary.match(/(?:^|[-–—:(\s])(DG|SB|JS|BK)(?=$|[-–—:)\s])/i)?.[1]
  );
 if (!representative) return null;

 let clientName = String(formData.clientName || canonical?.[2] || '').trim();
 if (!clientName) {
  clientName = cleanSummary
   .replace(/^(?:appt|appointment|meeting)\s*[-–—:]?\s*/i, '')
   .replace(new RegExp(`(?:^|[-–—:]\\s*)${representative}(?:\\s*[-–—:]|$)`, 'i'), ' ')
   .replace(/\s*\([^)]+\)\s*$/, '')
   .trim();
 }
 if (!clientName) return null;

 const serviceNeeded = String(
  formData.serviceNeeded || canonical?.[3] || formData.leadType || 'Appointment'
 ).trim();

 return {
  representative,
  clientName,
  serviceNeeded: serviceNeeded || 'Appointment',
 };
}
