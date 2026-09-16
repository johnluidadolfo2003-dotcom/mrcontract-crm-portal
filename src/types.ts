export type LeadSource = string;
export type LeadType = string;

export const LEAD_STATUS_OPTIONS = [
 'New',
 'Followed Up',
 'Meeting Scheduled',
 'Estimate Sent',
 '3 day Follow UP',
 '7 day Follow UP',
 '15 day Follow UP',
 '30 day Follow UP',
 'Past 90 days Follow UP',
 'Won Job',
 'Lost Job (For Refund)',
 'Lost Job (Nonrefundable)',
] as const;

export type LeadStatus = (typeof LEAD_STATUS_OPTIONS)[number] | string;

export interface SalespersonOption {
 id: string;
 code: string; // e.g."DG","SB","RT","JS"
 name: string; // e.g."Daniel Grider (DG)","Steve Brown (SB)"
}

export interface AppointmentFormData {
 clientName: string;
 appointmentDate: string; // YYYY-MM-DD
 startTime: string; // HH:mm
 endTime: string; // HH:mm
 salespersonCode: string;
 salespersonName?: string;
 clientPhone: string;
 clientEmail: string;
 address: string;
 leadSource: string;
 leadType: string;
 notes: string;
 status?: string;
 serviceNeeded?: string;
 leadFee?: string;
 calendarEventId?: string;
 calendarHtmlLink?: string;
  houzzProjectLink?: string;
 // Original New-lead identity. These fields let scheduling update the exact
 // spreadsheet row instead of appending a duplicate appointment row.
 sourceLeadId?: string;
 sourceRowIndex?: number;
 sourceStatusColIndex?: number;
 sourceTabName?: string;
}

export interface AppConfig {
 salespeople: SalespersonOption[];
 leadSources: string[];
 leadTypes: string[];
 timeZone: string;
 theme?: 'dark' | 'light';
 calendarId?: string;
 spreadsheetId?: string;
 spreadsheetName?: string;
 sheetTabName?: string;
 autoSyncToSheets?: boolean;
 houzzWebhookUrl?: string;
 autoSendToHouzz?: boolean;
}

export interface GoogleCalendarEventPayload {
 summary: string;
 location: string;
 description: string;
 start: {
 dateTime: string;
 timeZone: string;
 };
 end: {
 dateTime: string;
 timeZone: string;
 };
 attendees: { email: string }[];
}

export interface CreatedCalendarEvent {
 id: string;
 htmlLink: string;
 summary: string;
 start: string;
 end: string;
}

export interface AppUser {
 id: string;
 name: string;
 code?: string;
 color?: string;
 role?: 'admin' | 'manager' | 'staff' | string;
 createdAt: string;
 lastActiveAt?: string;
}

export interface SyncStatusInfo {
 sheets?: 'synced' | 'pending' | 'failed' | 'idle';
 sheetsError?: string;
 calendar?: 'synced' | 'pending' | 'failed' | 'idle';
 calendarError?: string;
 houzz?: 'synced' | 'pending' | 'failed' | 'idle';
 houzzError?: string;
 lastSyncedAt?: string;
}

export interface ActivityLog {
 id: string;
 timestamp: string;
 userId: string;
 userName: string;
 userColor?: string;
 actionType: 'status_change' | 'add_lead' | 'update_lead' | 'schedule_client' | 'call' | 'sms' | 'note' | 'delete_lead' | 'restore_lead' | 'general';
 clientName?: string;
 clientPhone?: string;
 tabName?: string;
 details: string;
 oldValue?: string;
 newValue?: string;
 leadId?: string;
}

export interface LeadItem {
 id: string; // Permanent Lead ID (e.g. UUID)
 sourceEventId?: string; // Webhook unique idempotency key
 clientName: string;
 clientPhone: string;
 clientEmail?: string;
 address?: string;
 leadSource?: string;
 tabName?: string;
 serviceNeeded?: string;
 leadFee?: string;
 notes?: string;
 status: LeadStatus;
 
 // Workflows & Assignment
 ownerId?: string; // AppUser ID
 ownerName?: string; // AppUser display name or code (e.g.,"SB","DG")
 nextAction?: string; // e.g."Call to confirm estimate","Send 3-day follow-up text"
 nextActionDate?: string; // YYYY-MM-DD
 
 // Follow-up Tracking
 estimateSentAt?: string; // ISO String when estimate was sent
 appointmentDate?: string; // YYYY-MM-DD
 appointmentTime?: string; // e.g."10:00 AM - 12:00 PM"
 
 // Sync Diagnostics
 syncStatus?: SyncStatusInfo;

 // Versioning & Conflict Protection
 version?: number;
 updatedAt?: string;
 updatedBy?: string;
 createdAt?: string;

 // Trash & Recovery
 isDeleted?: boolean;
 deletedAt?: string;
 deletedBy?: string;
 deletionReason?: string;

 // Legacy & Compatibility Fields
 rowIndex?: number;
 rawValues?: any[];
 calendarEventId?: string;
 calendarHtmlLink?: string;
}

export interface TaskItem {
 id: string;
 leadId: string;
 clientName: string;
 clientPhone: string;
 clientEmail?: string;
 title: string;
 category: 'appointment' | 'follow_up_3d' | 'follow_up_7d' | 'new_lead' | 'custom_action';
 dueDate: string; // YYYY-MM-DD or formatted date
 dueTime?: string;
 assignedRep?: string;
 isOverdue?: boolean;
 status: string;
 leadSource?: string;
}
