export interface NewLeadSortable {
 newestOrder?: number;
 createdAt?: string;
 rowIndex?: number;
}

export function getLeadOrderValue(lead: NewLeadSortable): number {
 const explicitOrder = Number(lead.newestOrder || 0);
 if (Number.isFinite(explicitOrder) && explicitOrder > 0) return explicitOrder;

 const parsedTime = new Date(String(lead.createdAt || '')).getTime();
 return Number.isFinite(parsedTime) && parsedTime > 0 ? parsedTime : 0;
}

export function compareNewestLeads(a: NewLeadSortable, b: NewLeadSortable): number {
 const orderDifference = getLeadOrderValue(b) - getLeadOrderValue(a);
 if (orderDifference !== 0) return orderDifference;

 // Google Sheets appends new records to the bottom. Use row index only as a
 // final same-timestamp fallback; server-issued newestOrder remains primary.
 return Number(b.rowIndex || 0) - Number(a.rowIndex || 0);
}
