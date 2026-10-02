export function canonicalContactKey(lead: any): string {
  const phone = String(lead?.clientPhone || '').replace(/\D/g, '');
  if (phone.length >= 7) return `phone_${phone.slice(-10)}`;
  const email = String(lead?.clientEmail || '').trim().toLowerCase();
  if (email.includes('@')) return `email_${email}`;
  return `name_${String(lead?.clientName || '').trim().toLowerCase()}`;
}

export function reconcileIncomingLeadStatus(incoming: any[], savedLead: any, status: string): any[] {
  const key = canonicalContactKey(savedLead);
  if (key === 'name_') return incoming;
  const source = String(savedLead.leadSource || '').trim().toLowerCase();
  return incoming.map((lead) => {
    const leadSource = String(lead.leadSource || lead.webhookSource || '').trim().toLowerCase();
    return canonicalContactKey(lead) === key && leadSource === source
      ? { ...lead, status }
      : lead;
  });
}
