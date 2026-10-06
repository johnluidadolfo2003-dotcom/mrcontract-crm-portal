/** Fields required before a reviewed Thumbtack lead can be submitted. */
export function hasHouzzRequiredInfo(lead: any): boolean {
  return Boolean(
    String(lead?.clientName || '').trim() &&
    (String(lead?.clientPhone || '').trim() || String(lead?.clientEmail || '').trim()) &&
    String(lead?.address || '').trim() &&
    String(lead?.serviceNeeded || lead?.leadType || '').trim()
  );
}

export function hasHouzzSubmissionStarted(lead: any): boolean {
  const status = String(lead?.houzzStatus || lead?.houzzResult || '').toLowerCase();
  return status.startsWith('sending') || status.includes('accepted by zapier') ||
    status.includes('created in houzz pro') || status.startsWith('sent to ') ||
    ['sending', 'confirmed'].includes(lead?.houzzDispatchStatus);
}
