export const ALWAYS_INVITED_SALES_EMAILS = ['dan@mrcontract.us', 'sam@mrcontract.us'] as const;

export interface AppointmentGuest {
  email: string;
  [key: string]: unknown;
}

export function includeSalesTeamGuests(guests: AppointmentGuest[] = []): AppointmentGuest[] {
  const byEmail = new Map<string, AppointmentGuest>();
  for (const guest of guests) {
    const email = String(guest?.email || '').trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, { ...guest, email });
  }
  for (const email of ALWAYS_INVITED_SALES_EMAILS) {
    if (!byEmail.has(email)) byEmail.set(email, { email });
  }
  return [...byEmail.values()];
}

export function isAlwaysInvitedSalesEmail(email: string): boolean {
  return ALWAYS_INVITED_SALES_EMAILS.some((required) => required === email.trim().toLowerCase());
}
