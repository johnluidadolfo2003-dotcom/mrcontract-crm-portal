// Data-result events update local state. Only explicit mutations refresh remote
// data; treating fetch results as refresh requests creates a feedback loop.
export function subscribeDashboardUpdates(
  target: EventTarget,
  onNewLeads: (event: Event) => void,
  onScheduledClients: (event: Event) => void,
  refresh: (event: Event) => void,
): () => void {
  target.addEventListener('new_leads_updated', onNewLeads);
  target.addEventListener('scheduled_clients_updated', onScheduledClients);
  target.addEventListener('dashboard_data_refresh', refresh);
  return () => {
    target.removeEventListener('new_leads_updated', onNewLeads);
    target.removeEventListener('scheduled_clients_updated', onScheduledClients);
    target.removeEventListener('dashboard_data_refresh', refresh);
  };
}
