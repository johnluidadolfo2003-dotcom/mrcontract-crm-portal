export function formatPhoneNumber(phone: string): string {
 if (!phone) return phone;
 
 // Strip all non-digits
 const cleaned = ('' + phone).replace(/\D/g, '');
 
 // Format based on length
 if (cleaned.length === 10) {
 return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
 } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
 return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 11)}`;
 }
 
 return phone; // Return original if it doesn't match standard lengths
}

export function formatName(name: string): string {
 if (!name) return name;
 return name.replace(/\b\w/g, (char) => char.toUpperCase());
}

export interface LeadAgeInfo {
 days: number;
 label: string;
 category: 'fresh' | 'active' | 'aging' | 'stale';
}

export function calculateLeadAge(timestamp?: string, appointmentDate?: string): LeadAgeInfo {
 const dateStr = timestamp || appointmentDate;
 if (!dateStr) {
 return { days: 0, label: 'Today', category: 'fresh' };
 }

 try {
 const date = new Date(dateStr);
 if (isNaN(date.getTime())) {
 return { days: 0, label: 'Today', category: 'fresh' };
 }
 const now = new Date();
 const diffTime = Math.max(0, now.getTime() - date.getTime());
 const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));

 let label = 'Today';
 if (days === 1) label = '1d ago';
 else if (days > 1 && days < 7) label = `${days}d ago`;
 else if (days >= 7 && days < 30) label = `${Math.floor(days / 7)}w ago`;
 else if (days >= 30) label = `${Math.floor(days / 30)}m ago`;

 let category: LeadAgeInfo['category'] = 'fresh';
 if (days >= 3 && days <= 7) category = 'active';
 else if (days > 7 && days <= 14) category = 'aging';
 else if (days > 14) category = 'stale';

 return { days, label, category };
 } catch (e) {
 return { days: 0, label: 'Today', category: 'fresh' };
 }
}

export interface FollowUpOverdueInfo {
 isOverdue: boolean;
 daysOverdue: number;
 label: string;
}

export function isFollowUpOverdue(status: string, timestamp?: string): boolean {
 return checkFollowUpOverdue(status, timestamp).isOverdue;
}

export function checkFollowUpOverdue(status: string, timestamp?: string): FollowUpOverdueInfo {
 if (!timestamp) return { isOverdue: false, daysOverdue: 0, label: '' };
 
 const normStatus = (status || '').trim().toLowerCase();
 
 // Won/Lost statuses don't need follow-ups
 if (normStatus.includes('won') || normStatus.includes('lost') || normStatus.includes('bad lead')) {
 return { isOverdue: false, daysOverdue: 0, label: '' };
 }

 try {
 const createdDate = new Date(timestamp);
 if (isNaN(createdDate.getTime())) {
 return { isOverdue: false, daysOverdue: 0, label: '' };
 }
 const now = new Date();
 const diffHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
 const diffDays = Math.floor(diffHours / 24);

 let maxThresholdHours = 48; // default 2 days

 if (normStatus === 'new' || normStatus === 'new lead' || !normStatus) {
 maxThresholdHours = 24; // 1 day for new leads
 } else if (normStatus.includes('3 day')) {
 maxThresholdHours = 72; // 3 days
 } else if (normStatus.includes('7 day')) {
 maxThresholdHours = 168; // 7 days
 } else if (normStatus.includes('15 day')) {
 maxThresholdHours = 360; // 15 days
 } else if (normStatus.includes('30 day')) {
 maxThresholdHours = 720; // 30 days
 } else if (normStatus.includes('90 day')) {
 maxThresholdHours = 2160; // 90 days
 } else if (normStatus.includes('estimating')) {
 maxThresholdHours = 72; // 3 days for estimating
 } else if (normStatus.includes('estimate sent')) {
 maxThresholdHours = 96; // 4 days after estimate
 }

 if (diffHours > maxThresholdHours) {
 const daysOver = Math.max(1, Math.floor((diffHours - maxThresholdHours) / 24));
 return {
 isOverdue: true,
 daysOverdue: daysOver,
 label: `${daysOver}d overdue`,
 };
 }
 } catch (e) {
 // fallthrough
 }

 return { isOverdue: false, daysOverdue: 0, label: '' };
}

export interface LeadActivity {
 id: string;
 leadKey: string;
 type: 'call' | 'email' | 'text' | 'meeting' | 'note' | 'status_change';
  gmailMessageId?: string;
 message: string;
 timestamp: string;
 author?: string;
}

export function getLeadActivities(leadKey: string): LeadActivity[] {
 if (!leadKey) return [];
 try {
 const raw = localStorage.getItem(`mrcontract_lead_activities_${leadKey}`);
 if (!raw) return [];
 return JSON.parse(raw);
 } catch (e) {
 return [];
 }
}

export function addLeadActivity(leadKey: string, activity: Omit<LeadActivity, 'id' | 'timestamp'>): LeadActivity[] {
 if (!leadKey) return [];
 const existing = getLeadActivities(leadKey);
 const newActivity: LeadActivity = {
 ...activity,
 id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
 timestamp: new Date().toISOString(),
 };
 const updated = [newActivity, ...existing];
 try {
 localStorage.setItem(`mrcontract_lead_activities_${leadKey}`, JSON.stringify(updated));
 } catch (e) {
 console.error('Failed to save lead activity:', e);
 }
 return updated;
}

export interface EstimateFollowUpInfo {
  hasKnownEstimateDate: boolean;
 dayCount: number; // 1, 2, 3, 4... Day count starting from day estimate was sent
 targetScriptDay: number; // 3, 7, 15, 30, 90
 estimateSentDate: Date | null;
 formattedSentDate: string;
 isFollowUpDue: boolean;
 followUpMilestone: string; // e.g."3-Day Follow-Up","7-Day Follow-Up", etc.
 daysSinceSent: number;
 stageBadgeText: string;
}

export function getEstimateFollowUpInfo(lead: {
 id?: string;
 rowIndex?: number;
 clientName?: string;
 clientPhone?: string;
 clientEmail?: string;
 status?: string;
 timestamp?: string;
 appointmentDate?: string;
 notes?: string;
 estimateSentAt?: string | number | Date;
 rawValues?: any[];
} | null | undefined): EstimateFollowUpInfo {
  if (!lead) {
    return {
      dayCount: 0,
      hasKnownEstimateDate: false,
      targetScriptDay: 3,
      estimateSentDate: null,
      formattedSentDate: 'Estimate date needed',
      isFollowUpDue: false,
      followUpMilestone: '3-Day Follow-Up',
      daysSinceSent: 0,
      stageBadgeText: 'Estimate date needed',
    };
  }

 const leadKey = lead.id || lead.clientPhone || lead.clientEmail || lead.clientName || (lead.rowIndex !== undefined ? `row_${lead.rowIndex}` : '');
 const activities = leadKey ? getLeadActivities(leadKey) : [];

 let sentDate: Date | null = null;

 // 1. Check explicit estimateSentAt property
 if (lead.estimateSentAt) {
 const d = new Date(lead.estimateSentAt);
 if (!isNaN(d.getTime())) {
 sentDate = d;
 }
 }

 // 2. Check activity timeline for when status changed strictly to"Estimate Sent"
 if (!sentDate) {
 const estimateActivity = activities.find(
 (a: any) =>
 a.type === 'status_change' && 
 ((a.newValue && String(a.newValue).toLowerCase().includes('estimate sent')) || (a.message && a.message.toLowerCase().includes('status changed to"estimate sent"')))
 );

 if (estimateActivity && estimateActivity.timestamp) {
 const d = new Date(estimateActivity.timestamp);
 if (!isNaN(d.getTime())) {
 sentDate = d;
 }
 }
 }

 // 3. Check notes for explicit estimate sent date pattern (e.g."Estimate sent: 08/25/2026")
 if (!sentDate && lead.notes) {
 const match = lead.notes.match(/(?:estimate sent|est sent|estimate date|est date)[:\s]+([0-9]{1,2}[/-][0-9]{1,2}(?:[/-][0-9]{2,4})?)/i);
 if (match && match[1]) {
 const d = new Date(match[1]);
 if (!isNaN(d.getTime())) {
 sentDate = d;
 }
 }
 }

 // 4. Do NOT fallback to entry/appointment dates - if unknown, mark as Estimate date needed
  const statusStr = (lead.status || "").toLowerCase().trim();
  let dayCount = 0;
  let daysSinceSent = 0;
  const hasKnownEstimateDate = Boolean(sentDate);

  if (sentDate) {
    const now = new Date();
    const sentZero = new Date(sentDate.getFullYear(), sentDate.getMonth(), sentDate.getDate()).getTime();
    const nowZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.max(0, Math.floor((nowZero - sentZero) / (1000 * 60 * 60 * 24)));
    daysSinceSent = diffDays;
    dayCount = diffDays;
  } else {
    dayCount = -1;
    daysSinceSent = -1;
  }

  // Determine target script milestone
  let targetScriptDay = 3;
  let followUpMilestone = "3-Day Follow-Up";

  if (!hasKnownEstimateDate) {
    targetScriptDay = 3;
    followUpMilestone = "Estimate Date Needed";
  } else if (daysSinceSent < 3) {
    targetScriptDay = 3;
    followUpMilestone = "Estimate Sent (Awaiting Day 3)";
  } else if (daysSinceSent < 7) {
    targetScriptDay = 3;
    followUpMilestone = "3-Day Follow-Up";
  } else if (daysSinceSent < 15) {
    targetScriptDay = 7;
    followUpMilestone = "7-Day Follow-Up";
  } else if (daysSinceSent < 30) {
    targetScriptDay = 15;
    followUpMilestone = "15-Day Follow-Up";
  } else if (daysSinceSent < 90) {
    targetScriptDay = 30;
    followUpMilestone = "30-Day Follow-Up";
  } else {
    targetScriptDay = 90;
    followUpMilestone = "Past 90 days Follow UP";
  }

  let stageBadgeText = "Estimate date needed";
  if (hasKnownEstimateDate) {
    if (daysSinceSent === 0) {
      stageBadgeText = "Sent Today";
    } else if (daysSinceSent === 1) {
      stageBadgeText = "1 Day Since Sent";
    } else if (daysSinceSent === 2) {
      stageBadgeText = "2 Days Since Sent";
    } else if (daysSinceSent === 3) {
      stageBadgeText = "3-Day Follow-Up Due";
    } else if (daysSinceSent === 7) {
      stageBadgeText = "7-Day Follow-Up Due";
    } else if (daysSinceSent === 15) {
      stageBadgeText = "15-Day Follow-Up Due";
    } else if (daysSinceSent === 30) {
      stageBadgeText = "30-Day Follow-Up Due";
    } else if (daysSinceSent >= 90) {
      stageBadgeText = `${daysSinceSent} Days • Past 90 Days`;
    } else {
      stageBadgeText = `${daysSinceSent} Days Since Sent`;
    }
  }

  const formattedSentDate = sentDate
    ? sentDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Estimate date needed";

  return {
    dayCount: hasKnownEstimateDate ? dayCount : 0,
    hasKnownEstimateDate,
    targetScriptDay,
    estimateSentDate: sentDate,
    formattedSentDate,
    isFollowUpDue: hasKnownEstimateDate && dayCount >= 3,
    followUpMilestone,
    daysSinceSent: hasKnownEstimateDate ? daysSinceSent : 0,
    stageBadgeText,
  };
};

export function getFollowUpTimingIndicator(info: {
  dayCount: number;
  estimateSentDate: Date | null;
  targetScriptDay?: number;
}): { text: string; variant: "due" | "overdue" | "future" } {
  const { dayCount, estimateSentDate } = info;
  if (!estimateSentDate || isNaN(estimateSentDate.getTime())) {
    return { text: "Estimate date needed", variant: "future" };
  }
const milestones = [3, 7, 15, 30, 90];

 // If dayCount matches milestone exactly
 if (milestones.includes(dayCount)) {
 return { text: 'Due today', variant: 'due' };
 }

 if (estimateSentDate && !isNaN(estimateSentDate.getTime())) {
 if (dayCount < 3) {
 const dueDate = new Date(estimateSentDate);
 dueDate.setDate(dueDate.getDate() + 3);
 const monthName = dueDate.toLocaleString('en-US', { month: 'short' });
 const dayNum = dueDate.getDate();
 return { text: `Due ${monthName} ${dayNum}`, variant: 'future' };
 }

 if (dayCount > 3 && dayCount < 7) {
 const overdueDays = dayCount - 3;
 if (overdueDays <= 2) {
 return { text: `${overdueDays} day${overdueDays > 1 ? 's' : ''} overdue`, variant: 'overdue' };
 }
 const dueDate = new Date(estimateSentDate);
 dueDate.setDate(dueDate.getDate() + 7);
 const monthName = dueDate.toLocaleString('en-US', { month: 'short' });
 const dayNum = dueDate.getDate();
 return { text: `Due ${monthName} ${dayNum}`, variant: 'future' };
 }

 if (dayCount > 7 && dayCount < 15) {
 const overdueDays = dayCount - 7;
 if (overdueDays <= 2) {
 return { text: `${overdueDays} day${overdueDays > 1 ? 's' : ''} overdue`, variant: 'overdue' };
 }
 const dueDate = new Date(estimateSentDate);
 dueDate.setDate(dueDate.getDate() + 15);
 const monthName = dueDate.toLocaleString('en-US', { month: 'short' });
 const dayNum = dueDate.getDate();
 return { text: `Due ${monthName} ${dayNum}`, variant: 'future' };
 }

 if (dayCount > 15 && dayCount < 30) {
 const overdueDays = dayCount - 15;
 if (overdueDays <= 3) {
 return { text: `${overdueDays} days overdue`, variant: 'overdue' };
 }
 const dueDate = new Date(estimateSentDate);
 dueDate.setDate(dueDate.getDate() + 30);
 const monthName = dueDate.toLocaleString('en-US', { month: 'short' });
 const dayNum = dueDate.getDate();
 return { text: `Due ${monthName} ${dayNum}`, variant: 'future' };
 }

 if (dayCount > 30 && dayCount < 90) {
 const overdueDays = dayCount - 30;
 if (overdueDays <= 5) {
 return { text: `${overdueDays} days overdue`, variant: 'overdue' };
 }
 const dueDate = new Date(estimateSentDate);
 dueDate.setDate(dueDate.getDate() + 90);
 const monthName = dueDate.toLocaleString('en-US', { month: 'short' });
 const dayNum = dueDate.getDate();
 return { text: `Due ${monthName} ${dayNum}`, variant: 'future' };
 }

 if (dayCount > 90) {
 const overdueDays = dayCount - 90;
 return { text: `${overdueDays} days overdue`, variant: 'overdue' };
 }
 }

 if (dayCount > 3) {
 return { text: `${dayCount - 3} days overdue`, variant: 'overdue' };
 }
 return { text: 'Due in 3 days', variant: 'future' };
}

export function isMeetingScheduledStatus(status?: string, leadSource?: string): boolean {
 if (leadSource) {
 const src = leadSource.toLowerCase().trim();
 if (src.includes('referral')) {
 if (status) {
 const s = status.toLowerCase().trim();
 if (
 s.includes('cancel') ||
 s.includes('lost') ||
 s.includes('bad lead') ||
 s.includes('duplicate') ||
 s.includes('spam')
 ) {
 return false;
 }
 }
 return true;
 }
 }
 if (!status) return false;
 const s = status.toLowerCase().trim();
 if (s.includes('referral')) {
 if (
 s.includes('cancel') ||
 s.includes('lost') ||
 s.includes('bad lead') ||
 s.includes('duplicate') ||
 s.includes('spam')
 ) {
 return false;
 }
 return true;
 }
 if (
 s.includes('cancel') ||
 s.includes('lost') ||
 s.includes('bad lead') ||
 s.includes('duplicate') ||
 s.includes('spam')
 ) {
 return false;
 }
 return (
 s === 'meeting scheduled' ||
 s === 'scheduled' ||
 s === 'meeting' ||
 s === 'appointment' ||
 s === 'appt' ||
 s === 'booked' ||
 s === 'confirmed' ||
 s.includes('meeting') ||
 s.includes('schedul') ||
 s.includes('appointment') ||
 s.includes('appt') ||
 s.includes('booked') ||
 s.includes('booking') ||
 s.includes('site visit') ||
 s.includes('consultation') ||
 s.includes('estimate sched') ||
 s.includes('referral')
 );
}export function isFollowUpStatus(status?: string): boolean {
 if (!status) return false;
 const s = status.toLowerCase().trim();
 // 'followed up' is distinct from the follow-up pipeline as per user request
 if (s === 'followed up') return false;
 
 return (
 s.includes('follow') ||
 s.includes('estimating') ||
 s.includes('estimate sent') ||
 s.includes('3 day') ||
 s.includes('7 day') ||
 s.includes('15 day') ||
 s.includes('30 day') ||
 s.includes('90 day') ||
 s.includes('past 90') ||
 s.includes('day 3') ||
 s.includes('day 7') ||
 s.includes('day 15') ||
 s.includes('day 30') ||
 s.includes('day 90')
 );
}


