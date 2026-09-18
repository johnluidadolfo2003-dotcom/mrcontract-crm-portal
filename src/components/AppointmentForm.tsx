import React, { useState, useEffect, useRef } from 'react';
import {
 User,
 Calendar,
 Clock,
 Briefcase,
 Phone,
 Mail,
 MapPin,
 Tag,
 FileText,
 CalendarPlus,
 AlertCircle,
 CalendarDays,
 Eye,
 Edit3,
 X,
 CheckCircle2,
 Image as ImageIcon,
 Layers,
 MessageSquarePlus,
 Loader2,
 Camera,
 ChevronDown,
 Copy,
 Check,
 RotateCcw,
 Send,
 Upload,
  Link as LinkIcon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { AppointmentFormData, AppConfig } from '../types';
import { DEFAULT_LEAD_SOURCES, DEFAULT_LEAD_TYPES, isLeadSourceTab } from '../config';
import { AddressAutocomplete } from './ui/AddressAutocomplete';
import {
 getCachedCalendarEvents,
 isSameSalesperson,
 getTimezoneOffsetString,
 parseCalendarEventToFormData,
 parseDateTimeFromISO,
 fetchAllGoogleCalendarEvents,
 formatTime12Hour,
} from '../lib/calendar';

interface AppointmentFormProps {
 config: AppConfig;
 onSubmit: (formData: AppointmentFormData, eventId?: string | null) => void;
 isSubmitting: boolean;
 initialFormData?: AppointmentFormData | null;
 editingEventId?: string | null;
 onClearLoadedEvent?: () => void;
}

const compressImage = (file: File): Promise<File> => {
 return new Promise((resolve) => {
 // Instant exit if image is under 300KB
 if (file.size <= 300 * 1024) {
 return resolve(file);
 }

 let timer = setTimeout(() => {
 resolve(file);
 }, 1800);

 try {
 // Use createImageBitmap if supported for instant async decoding
 if ('createImageBitmap' in window) {
 createImageBitmap(file)
 .then((bitmap) => {
 clearTimeout(timer);
 const canvas = document.createElement('canvas');
 let width = bitmap.width || 800;
 let height = bitmap.height || 600;
 const max_dim = 1024;
 if (width > max_dim || height > max_dim) {
 if (width > height) {
 height = Math.round((height * max_dim) / width);
 width = max_dim;
 } else {
 width = Math.round((width * max_dim) / height);
 height = max_dim;
 }
 }
 canvas.width = width;
 canvas.height = height;
 const ctx = canvas.getContext('2d');
 if (!ctx) return resolve(file);
 ctx.drawImage(bitmap, 0, 0, width, height);
 canvas.toBlob(
 (blob) => {
 if (blob) {
 resolve(new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' }));
 } else {
 resolve(file);
 }
 },
 'image/jpeg',
 0.72
 );
 })
 .catch(() => {
 // Fallback to Image
 fallbackCompress(file, timer, resolve);
 });
 } else {
 fallbackCompress(file, timer, resolve);
 }
 } catch (err) {
 clearTimeout(timer);
 resolve(file);
 }
 });
};

const fallbackCompress = (file: File, timer: any, resolve: (f: File) => void) => {
 try {
 const img = new Image();
 const url = URL.createObjectURL(file);
 img.onload = () => {
 clearTimeout(timer);
 try {
 URL.revokeObjectURL(url);
 const canvas = document.createElement('canvas');
 let width = img.width || 800;
 let height = img.height || 600;
 const max_dim = 1024;
 if (width > max_dim || height > max_dim) {
 if (width > height) {
 height = Math.round((height * max_dim) / width);
 width = max_dim;
 } else {
 width = Math.round((width * max_dim) / height);
 height = max_dim;
 }
 }
 canvas.width = width;
 canvas.height = height;
 const ctx = canvas.getContext('2d');
 if (!ctx) return resolve(file);
 ctx.drawImage(img, 0, 0, width, height);
 canvas.toBlob(
 (blob) => {
 if (blob) {
 resolve(new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' }));
 } else {
 resolve(file);
 }
 },
 'image/jpeg',
 0.72
 );
 } catch (err) {
 resolve(file);
 }
 };
 img.onerror = () => {
 clearTimeout(timer);
 try { URL.revokeObjectURL(url); } catch (_) {}
 resolve(file);
 };
 img.src = url;
 } catch (err) {
 clearTimeout(timer);
 resolve(file);
 }
};

const calculateTwoHoursLater = (timeStr: string): string => {
 if (!timeStr || !timeStr.includes(':')) return '11:00';
 const [hStr, mStr] = timeStr.split(':');
 let h = parseInt(hStr, 10);
 if (isNaN(h)) return '11:00';
 h = (h + 2) % 24;
 const newH = String(h).padStart(2, '0');
 const newM = mStr || '00';
 return `${newH}:${newM}`;
};

const AVAILABILITY_REPRESENTATIVES = ['DG', 'SB', 'JS', 'BK'] as const;
const HOUR_ROW_HEIGHT = 64;

function dateKeyFromParts(year: number, monthIndex: number, day: number): string {
 return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysToDateKey(dateKey: string, amount: number): string {
 const date = new Date(`${dateKey}T12:00:00`);
 date.setDate(date.getDate() + amount);
 return dateKeyFromParts(date.getFullYear(), date.getMonth(), date.getDate());
}

function calendarMonthDays(dateKey: string): Array<{ key: string; day: number; inMonth: boolean }> {
 const selected = new Date(`${dateKey}T12:00:00`);
 const year = selected.getFullYear();
 const month = selected.getMonth();
 const firstWeekday = new Date(year, month, 1).getDay();
 const daysInMonth = new Date(year, month + 1, 0).getDate();
 const previousMonthDays = new Date(year, month, 0).getDate();
 const cells: Array<{ key: string; day: number; inMonth: boolean }> = [];

 for (let offset = firstWeekday - 1; offset >= 0; offset -= 1) {
  const date = new Date(year, month - 1, previousMonthDays - offset);
  cells.push({
   key: dateKeyFromParts(date.getFullYear(), date.getMonth(), date.getDate()),
   day: date.getDate(),
   inMonth: false,
  });
 }
 for (let day = 1; day <= daysInMonth; day += 1) {
  cells.push({ key: dateKeyFromParts(year, month, day), day, inMonth: true });
 }
 while (cells.length % 7 !== 0 || cells.length < 42) {
  const nextDay = cells.length - firstWeekday - daysInMonth + 1;
  const date = new Date(year, month + 1, nextDay);
  cells.push({
   key: dateKeyFromParts(date.getFullYear(), date.getMonth(), date.getDate()),
   day: date.getDate(),
   inMonth: false,
  });
 }
 return cells;
}

export const AppointmentForm: React.FC<AppointmentFormProps> = ({
 config,
 onSubmit,
 isSubmitting,
 initialFormData,
 editingEventId,
 onClearLoadedEvent,
}) => {
 const activeSources = (config.leadSources?.length ? config.leadSources : DEFAULT_LEAD_SOURCES).filter(isLeadSourceTab);
 const activeTypes = config.leadTypes?.length ? config.leadTypes : DEFAULT_LEAD_TYPES;

 const todayStr = new Date().toISOString().split('T')[0];

 const defaultState: AppointmentFormData = {
 clientName: '',
 appointmentDate: todayStr,
 startTime: '09:00',
 endTime: '11:00',
 salespersonCode: '', // Default empty so they have to choose
 clientPhone: '',
 clientEmail: '',
 address: '',
 leadSource: activeSources[0] || 'Angi',
 leadType: activeTypes[0] || 'Direct',
 serviceNeeded: '',
 notes: '',
 };

 const [formData, setFormData] = useState<AppointmentFormData>(
 initialFormData || defaultState
 );

 useEffect(() => {
 if (initialFormData) {
 setFormData(prev => ({
 ...prev,
 ...initialFormData,
 }));
 }
 }, [initialFormData]);

 const [validationError, setValidationError] = useState<string | null>(null);
 const [showAvailability, setShowAvailability] = useState(false);
 const [availabilityDate, setAvailabilityDate] = useState(
  initialFormData?.appointmentDate || defaultState.appointmentDate
 );
 const [availabilityEvents, setAvailabilityEvents] = useState<any[]>([]);
 const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
 const [availabilityError, setAvailabilityError] = useState<string | null>(null);

 const loadAvailability = async () => {
  if (!showAvailability) return;
  setIsLoadingAvailability(true);
  setAvailabilityError(null);
  try {
   const anchor = new Date(`${availabilityDate}T12:00:00Z`).getTime();
   const events = await fetchAllGoogleCalendarEvents({
    timeMin: new Date(anchor - 36 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(anchor + 36 * 60 * 60 * 1000).toISOString(),
   });
   setAvailabilityEvents(events);
  } catch (error: any) {
   setAvailabilityError(error?.message || 'Could not load Calendar availability.');
  } finally {
   setIsLoadingAvailability(false);
  }
 };

 useEffect(() => {
  if (!showAvailability) return;
  loadAvailability();
 }, [showAvailability, availabilityDate]);

 const seenAvailabilityEvents = new Set<string>();
 const availabilityAppointments = availabilityEvents
  .map((event) => {
   const summary = String(event?.summary || '').trim();
   const canonicalRepresentative = summary.match(
    /^(?:appt|appointment)\s*[-–—]\s*(DG|SB|JS|BK)\s*[-–—]/i
   )?.[1]?.toUpperCase();

   const parsed = parseCalendarEventToFormData(event, config).formData;
   const representative = String(canonicalRepresentative || parsed.salespersonCode || '').trim().toUpperCase();

   const startISO = String(event?.start?.dateTime || event?.start?.date || '');
   const endISO = String(event?.end?.dateTime || event?.end?.date || '');
   const targetTimeZone = config.timeZone || 'America/New_York';
   const parsedStart = parseDateTimeFromISO(startISO, targetTimeZone);
   const parsedEnd = parseDateTimeFromISO(endISO, targetTimeZone);

   if (
    parsedStart.date !== availabilityDate ||
    !AVAILABILITY_REPRESENTATIVES.includes(representative as any)
   ) return null;

   // The same invited appointment can appear in the main and a shared
   // calendar. Use Google's iCalUID to show it only once.
   const duplicateKey = String(
    event?.iCalUID || `${summary}|${startISO}|${endISO}|${representative}`
   ).toLowerCase();
   if (seenAvailabilityEvents.has(duplicateKey)) return null;
   seenAvailabilityEvents.add(duplicateKey);

   const startParts = String(parsedStart.time || '00:00').split(':').map(Number);
   const endParts = String(parsedEnd.time || parsedStart.time || '00:00').split(':').map(Number);
   const startMinutes = Math.max(0, Math.min(1439, (startParts[0] || 0) * 60 + (startParts[1] || 0)));

   // Preserve Google's exact event duration. Most appointments are two hours,
   // but the UI must also display shorter or longer Calendar events accurately.
   const absoluteStart = Date.parse(startISO);
   const absoluteEnd = Date.parse(endISO);
   const exactDurationMinutes =
    Number.isFinite(absoluteStart) && Number.isFinite(absoluteEnd) && absoluteEnd > absoluteStart
     ? Math.round((absoluteEnd - absoluteStart) / 60000)
     : 0;
   const parsedEndMinutes = Math.max(0, Math.min(1440, (endParts[0] || 0) * 60 + (endParts[1] || 0)));
   const endMinutes = exactDurationMinutes > 0
    ? Math.min(1440, startMinutes + exactDurationMinutes)
    : (parsedEndMinutes > startMinutes ? parsedEndMinutes : Math.min(1440, startMinutes + 60));

   return {
    id: `${event.calendarId || 'primary'}:${event.id || event.iCalUID || summary}`,
    representative,
    clientName: parsed.clientName || summary || 'Busy',
    serviceNeeded: parsed.serviceNeeded || '',
    startTime: parsedStart.time,
    endTime: parsedEnd.time,
    startMinutes,
    endMinutes,
   };
  })
  .filter(Boolean) as Array<{
   id: string;
   representative: string;
   clientName: string;
   serviceNeeded: string;
   startTime: string;
   endTime: string;
   startMinutes: number;
   endMinutes: number;
  }>;

 const selectedAvailabilityDate = new Date(`${availabilityDate}T12:00:00`);
 const availabilityMonthLabel = selectedAvailabilityDate.toLocaleDateString('en-US', {
  month: 'long',
  year: 'numeric',
 });
 const availabilityDayLabel = selectedAvailabilityDate.toLocaleDateString('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
 });
 const availabilityMonthCells = calendarMonthDays(availabilityDate);

 
 // Smart Extraction & Copy Client Link State
 const [isExtracting, setIsExtracting] = useState(false);
 const [pasteText, setPasteText] = useState('');
 const [showPasteBox, setShowPasteBox] = useState(false);
 const [copiedLink, setCopiedLink] = useState(false);
 const [showCopyNotification, setShowCopyNotification] = useState(false);
 const fileInputRef = useRef<HTMLInputElement>(null);
 const cameraInputRef = useRef<HTMLInputElement>(null);
 const addressRef = useRef<HTMLTextAreaElement>(null);

 const handleCopyClientLink = () => {
 const url = 'https://bit.ly/Client_Info_FORM';
 if (navigator.clipboard && navigator.clipboard.writeText) {
 navigator.clipboard.writeText(url);
 } else {
 const textarea = document.createElement('textarea');
 textarea.value = url;
 document.body.appendChild(textarea);
 textarea.select();
 document.execCommand('copy');
 document.body.removeChild(textarea);
 }
 setCopiedLink(true);
 setShowCopyNotification(true);
 setTimeout(() => {
 setCopiedLink(false);
 }, 3000);
 setTimeout(() => {
 setShowCopyNotification(false);
 }, 4500);
 };

 const handleClearForm = () => {
 setFormData(defaultState);
 setValidationError(null);
 if (onClearLoadedEvent) onClearLoadedEvent();
 };

 // Sync when initialFormData changes (e.g. when selected from calendar)
 useEffect(() => {
 if (initialFormData) {
 setFormData(initialFormData);
 }
 }, [initialFormData]);

 useEffect(() => {
 if (!activeSources.includes(formData.leadSource) && activeSources.length > 0) {
 setFormData(prev => ({ ...prev, leadSource: activeSources[0] }));
 }
 if (!activeTypes.includes(formData.leadType) && activeTypes.length > 0) {
 setFormData(prev => ({ ...prev, leadType: activeTypes[0] }));
 }
 }, [config, activeSources, activeTypes]);

 useEffect(() => {
 if (addressRef.current) {
 addressRef.current.style.height = 'auto';
 addressRef.current.style.height = `${Math.max(38, addressRef.current.scrollHeight)}px`;
 }
 }, [formData.address]);

 const handleChange = (
 field: keyof AppointmentFormData,
 value: string
 ) => {
 if (field === 'startTime') {
 const autoEndTime = calculateTwoHoursLater(value);
 setFormData((prev) => ({
 ...prev,
 startTime: value,
 endTime: autoEndTime,
 }));
 } else {
 setFormData((prev) => ({ ...prev, [field]: value }));
 }
 if (validationError) setValidationError(null);
 };

 const handleExtractText = async () => {
 if (!pasteText.trim()) return;
 setIsExtracting(true);
 setValidationError(null);
 try {
 const res = await fetch('/api/extract-text', {
 method: 'POST',
 cache: 'no-store',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ text: pasteText })
 });
 const data = await res.json().catch(() => ({}));
 if (data.warning) {
 setValidationError(data.warning);
 }
 const matchedTextSource = data.leadSource ? activeSources.find(s => s.toLowerCase() === data.leadSource.toLowerCase()) : null;
 setFormData(prev => ({
 ...prev,
 clientName: data.clientName || prev.clientName,
 clientPhone: data.clientPhone || prev.clientPhone,
 clientEmail: data.clientEmail || prev.clientEmail,
 address: data.address || prev.address,
 leadSource: matchedTextSource || prev.leadSource,
 notes: data.notes ? (prev.notes ? prev.notes + '\n' + data.notes : data.notes) : prev.notes
 }));
 setPasteText('');
 setShowPasteBox(false);
 } catch (err: any) {
 console.warn('Text extraction fallback:', err);
 setValidationError('Text processed via smart local parser.');
 } finally {
 setIsExtracting(false);
 }
 };

 const handleExtractImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;
 setIsExtracting(true);
 setValidationError(null);
 try {
 const compressedFile = await compressImage(file).catch(() => file);
 const formDataUpload = new FormData();
 formDataUpload.append('image', compressedFile);
 const res = await fetch('/api/extract-image', {
 method: 'POST',
 cache: 'no-store',
 body: formDataUpload
 });
 const data = await res.json().catch(() => ({
 warning: 'Image uploaded. Please enter details below.',
 notes: '**Uploaded Appointment Image**\n- Image attached.'
 }));
 if (data.warning) {
 setValidationError(data.warning);
 }
 const matchedImgSource = data.leadSource ? activeSources.find(s => s.toLowerCase() === data.leadSource.toLowerCase()) : null;
 setFormData(prev => ({
 ...prev,
 clientName: data.clientName || prev.clientName,
 clientPhone: data.clientPhone || prev.clientPhone,
 clientEmail: data.clientEmail || prev.clientEmail,
 address: data.address || prev.address,
 leadSource: matchedImgSource || prev.leadSource,
 notes: data.notes ? (prev.notes ? prev.notes + '\n' + data.notes : data.notes) : (prev.notes ? prev.notes + '\n**Uploaded Appointment Image**\n- Image attached.' : '**Uploaded Appointment Image**\n- Image attached.')
 }));
 } catch (err: any) {
 console.warn('Image extraction fallback:', err);
 setValidationError('Image uploaded. Please enter details below.');
 setFormData(prev => ({
 ...prev,
 notes: prev.notes ? prev.notes + '\n**Uploaded Appointment Image**\n- Image attached.' : '**Uploaded Appointment Image**\n- Image attached.'
 }));
 } finally {
 setIsExtracting(false);
 if (e.target) e.target.value = '';
 }
 };

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();

 if (!formData.clientName.trim()) {
 setValidationError('Please enter the Name.');
 return;
 }
 if (!formData.appointmentDate) {
 setValidationError('Please select an Appointment Date.');
 return;
 }
 if (!formData.startTime || !formData.endTime) {
 setValidationError('Please specify both Start Time and End Time.');
 return;
 }
 if (!formData.salespersonCode) {
 setValidationError('Please select a Salesperson.');
 return;
 }
 if (!formData.clientPhone.trim()) {
 setValidationError('Please enter the Phone Number.');
 return;
 }
 if (!formData.address.trim()) {
 setValidationError('Please enter the Address.');
 return;
 }
 if (
 formData.clientEmail &&
 formData.clientEmail.trim() &&
 !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(formData.clientEmail.trim())
 ) {
 setValidationError('Please enter a valid Email address (e.g. name@domain.com) or leave it blank.');
 return;
 }

 // Check for salesperson schedule conflict in cached appointments
 try {
 const cachedEvents = getCachedCalendarEvents();
 if (
 Array.isArray(cachedEvents) &&
 cachedEvents.length > 0 &&
 formData.salespersonCode &&
 formData.appointmentDate &&
 formData.startTime &&
 formData.endTime
 ) {
 const targetTz = config.timeZone || 'America/New_York';
 const startOffset = getTimezoneOffsetString(formData.appointmentDate, formData.startTime, targetTz);
 const endOffset = getTimezoneOffsetString(formData.appointmentDate, formData.endTime, targetTz);
 const reqStart = new Date(`${formData.appointmentDate}T${formData.startTime}:00${startOffset}`).getTime();
 const reqEnd = new Date(`${formData.appointmentDate}T${formData.endTime}:00${endOffset}`).getTime();

 if (!isNaN(reqStart) && !isNaN(reqEnd) && reqStart < reqEnd) {
 const overlap = cachedEvents.find((evt: any) => {
 if (evt.status === 'cancelled' || evt.id === editingEventId) return false;
 const eStartStr = evt.start?.dateTime || evt.start?.date;
 const eEndStr = evt.end?.dateTime || evt.end?.date;
 if (!eStartStr || !eEndStr) return false;
 const eStart = new Date(eStartStr).getTime();
 const eEnd = new Date(eEndStr).getTime();
 if (isNaN(eStart) || isNaN(eEnd)) return false;

 if (eStart < reqEnd && eEnd > reqStart) {
 const parsed = parseCalendarEventToFormData(evt, config);
 return isSameSalesperson(formData.salespersonCode, parsed.formData.salespersonCode);
 }
 return false;
 });

 if (overlap) {
 setValidationError('This salesperson already has an appointment at this time.');
 return;
 }
 }
 }
 } catch (checkErr) {
 console.warn('Pre-validation overlap check note:', checkErr);
 }

 setValidationError(null);
 onSubmit(formData, editingEventId);
 };

 // Shared input style for perfect alignment, height, clean borders and text-base (16px) to prevent mobile browser auto-zoom on focus
 const inputStyle =
"w-full min-w-0 px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:border-brand-orange focus:ring-1 focus:ring-brand-orange focus:outline-none text-base font-semibold text-zinc-900 dark:text-white transition-all";
 
 const labelStyle ="block text-[11px] sm:text-xs font-bold text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider text-wrap leading-tight";

 return (
 <div className={`w-full gap-4 ${showAvailability ? 'grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(680px,1.1fr)]' : 'max-w-4xl mx-auto'}`}>
 <div className="bg-white dark:bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-xl transition-all space-y-4 sm:space-y-5 w-full min-w-0">
 <form onSubmit={handleSubmit} className="space-y-4 w-full">
 {/* Import Details Bar */}
 <div className="bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-3.5 sm:p-4 space-y-3">
 {/* Top Header Row */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
 <FileText className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400"/>
 Import details
 </span>
 {isExtracting && (
 <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-orange">
 <Loader2 className="w-3 h-3 animate-spin text-brand-orange"/>
 Scanning details...
 </span>
 )}
 </div>

 {/* Quick Tools & Clear Form */}
 <div className="flex items-center gap-2">
 <button
 type="button"
 onClick={handleClearForm}
 className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-medium flex items-center gap-1 cursor-pointer mr-1"
 title="Clear all form fields"
 >
 <RotateCcw className="w-3 h-3 text-zinc-500"/>
 <span>Clear form</span>
 </button>

 <button
 type="button"
 onClick={() => setShowAvailability((current) => !current)}
 title={showAvailability ? 'Close salesperson availability' : 'Check salesperson availability'}
 className={`w-8 h-8 border rounded-lg transition-all cursor-pointer flex items-center justify-center shadow-2xs ${
  showAvailability
   ? 'bg-[#FF5500] border-[#FF5500] text-white'
   : 'bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
 }`}
 >
 <Calendar className="w-4 h-4"/>
 </button>

 <button
 type="button"
 onClick={handleCopyClientLink}
 title="Copy Client Form Link"
 className="w-8 h-8 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-all cursor-pointer flex items-center justify-center text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white shadow-2xs"
 >
 {copiedLink ? (
 <Check className="w-4 h-4 text-emerald-400"/>
 ) : (
 <Copy className="w-4 h-4"/>
 )}
 </button>
 </div>
 </div>

 {/* Compact, labeled action buttons with consistent brand styling */}
 <div className="flex items-center gap-2 flex-wrap">
 {/* Paste Text */}
 <button
 type="button"
 onClick={() => setShowPasteBox(!showPasteBox)}
 disabled={isExtracting}
 className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
 showPasteBox
 ? 'bg-brand-orange/15 border-brand-orange text-brand-orange'
 : 'bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700/70 hover:border-zinc-300 dark:hover:border-zinc-600'
 }`}
 >
 <FileText className={`w-3.5 h-3.5 ${showPasteBox ? 'text-brand-orange' : 'text-zinc-500 dark:text-zinc-400'}`} />
 <span>Paste text</span>
 </button>

 {/* Upload Screenshot / Image */}
 <button
 type="button"
 onClick={() => fileInputRef.current?.click()}
 disabled={isExtracting}
 className="px-3 py-2 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/70 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
 >
 <Upload className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400"/>
 <span>Upload image</span>
 </button>
 <input 
 type="file"
 accept="image/*,.heic,.heif,.heics,.heifs,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff"
 className="hidden"
 ref={fileInputRef}
 onChange={handleExtractImage}
 />

 {/* Take Photo (Mobile / Touch friendly) */}
 <button
 type="button"
 onClick={() => cameraInputRef.current?.click()}
 disabled={isExtracting}
 className="px-3 py-2 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/70 hover:border-zinc-300 dark:hover:border-zinc-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
 >
 <Camera className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400"/>
 <span>Take photo</span>
 </button>
 <input 
 type="file"
 accept="image/*,.heic,.heif,.heics,.heifs,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff"
 capture="environment"
 className="hidden"
 ref={cameraInputRef}
 onChange={handleExtractImage}
 />
 </div>

 {/* Copy Notification Alert */}
 {showCopyNotification && (
 <div className="bg-brand-orange border border-brand-orange-dark text-white text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-1 shadow-md">
 <div className="flex items-center gap-2">
 <CheckCircle2 className="w-4.5 h-4.5 text-white shrink-0"/>
 <span>Client form link copied to clipboard! (bit.ly/Client_Info_FORM)</span>
 </div>
 <button
 type="button"
 onClick={() => setShowCopyNotification(false)}
 className="text-white hover:text-zinc-200 p-0.5 cursor-pointer"
 >
 <X className="w-4 h-4"/>
 </button>
 </div>
 )}

 {/* Text Paste Box */}
 {showPasteBox && (
 <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-2">
 <textarea
 placeholder="Paste raw text message, Angi lead notification, email, or chat snippet here..."
 rows={3}
 value={pasteText}
 onChange={(e) => setPasteText(e.target.value)}
 className="w-full px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-700/80 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-orange transition-all resize-none"
 />
 <div className="flex items-center justify-end gap-2">
 <button
 type="button"
 onClick={() => setShowPasteBox(false)}
 className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white font-semibold cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={handleExtractText}
 disabled={!pasteText.trim() || isExtracting}
 className="px-4 py-1.5 bg-[#FF5500] hover:bg-[#E64D00]-dark disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
 >
 {isExtracting ? (
 <Loader2 className="w-3.5 h-3.5 animate-spin"/>
 ) : (
 <Send className="w-3.5 h-3.5"/>
 )}
 <span>Import Details</span>
 </button>
 </div>
 </div>
 )}
 </div>

 {/* Editing pre-scheduled event indicator */}
 {editingEventId && (
 <div className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl p-3 text-xs font-semibold flex items-center justify-between animate-in fade-in duration-150">
 <div className="flex items-center space-x-2">
 <Edit3 className="w-4 h-4 text-[#FF5500] shrink-0"/>
 <span>Editing pre-scheduled item from Google Calendar. Modify any missing info below to finalize.</span>
 </div>
 {onClearLoadedEvent && (
 <button
 type="button"
 onClick={onClearLoadedEvent}
 className="text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white font-bold flex items-center gap-1 bg-white dark:bg-zinc-700 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-600 cursor-pointer"
 >
 <X className="w-3.5 h-3.5"/>
 <span>Reset</span>
 </button>
 )}
 </div>
 )}

 {/* Validation Banner */}
 {validationError && (
 <div className="bg-red-950/80 border border-red-800 text-red-200 rounded-xl p-2.5 text-xs font-semibold flex items-center space-x-2 animate-in fade-in duration-150">
 <AlertCircle className="w-4 h-4 text-red-400 shrink-0"/>
 <span>{validationError}</span>
 </div>
 )}

 {/* Main Dark Form Container */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4 overflow-hidden">
 
 {/* ROW 1: Name (50%), Phone (25%), Salesperson (25%) */}
 <div className="grid grid-cols-2 sm:grid-cols-12 gap-3.5 min-w-0">
 <div className="col-span-2 sm:col-span-6 space-y-1.5 min-w-0">
 <label className={labelStyle}>
 <User className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 Name
 </label>
 <input
 type="text"
 required
 value={formData.clientName}
 onChange={(e) => handleChange('clientName', e.target.value)}
 className={inputStyle}
 />
 </div>

 <div className="col-span-1 sm:col-span-3 space-y-1.5 min-w-0">
 <label className={labelStyle}>
 <Phone className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 Phone
 </label>
 <input
 type="tel"
 required
 value={formData.clientPhone}
 onChange={(e) => handleChange('clientPhone', e.target.value)}
 className={inputStyle}
 />
 </div>

 <div className="col-span-1 sm:col-span-3 space-y-1.5 min-w-0">
 <label className={labelStyle}>
 <Briefcase className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 Salesperson
 </label>
 <div className="relative">
 <div className={`${inputStyle} flex items-center justify-between pointer-events-none pr-2`}>
 <span className="truncate text-zinc-950 dark:text-white font-semibold">
 {formData.salespersonCode ? (
 formData.salespersonCode
 ) : (
 <span className="text-zinc-500 font-normal">Select...</span>
 )}
 </span>
 <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0 ml-1"/>
 </div>
 <select
 value={formData.salespersonCode}
 onChange={(e) => handleChange('salespersonCode', e.target.value)}
 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
 required
 >
 <option value=""disabled className="bg-white dark:bg-zinc-900 text-zinc-500">Select...</option>
 {config.salespeople.map((sp) => (
 <option key={sp.id} value={sp.code} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
 {sp.name}
 </option>
 ))}
 </select>
 </div>
 </div>
 </div>

 {/* ROW 2: Email & Address */}
 <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 min-w-0">
 <div className="col-span-1 sm:col-span-6 space-y-1.5 min-w-0">
 <label className={labelStyle}>
 <Mail className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 Email
 </label>
 <input
 type="email"
 value={formData.clientEmail}
 onChange={(e) => handleChange('clientEmail', e.target.value)}
 className={inputStyle}
 />
 </div>

 <div className="col-span-1 sm:col-span-6 space-y-1.5 min-w-0">
 <label className={labelStyle}>
 <MapPin className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 Address
 </label>
 <AddressAutocomplete
 rows={1}
 required
 value={formData.address}
 onChange={(val) => handleChange('address', val)}
 placeholder="e.g. 123 Main St, Pittsburgh, PA"
 inputClassName={`${inputStyle} text-base sm:text-xs leading-normal py-2 px-3 resize-none overflow-hidden min-h-[38px]`}
 />
 </div>
 </div>

 {/* ROW 3: Appointment Date, Start Time, End Time (3 Equal Columns) */}
 <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 min-w-0">
 <div className="space-y-1.5 min-w-0">
 <label className={labelStyle}>
 <Calendar className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 Appt. Date
 </label>
 <input
 type="date"
 required
 value={formData.appointmentDate}
 onChange={(e) => handleChange('appointmentDate', e.target.value)}
 className={`${inputStyle} px-2 sm:px-3`}
 />
 </div>

 <div className="space-y-1.5 min-w-0">
 <label className={labelStyle}>
 <Clock className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 Start Time
 </label>
 <input
 type="time"
 required
 value={formData.startTime}
 onChange={(e) => handleChange('startTime', e.target.value)}
 className={`${inputStyle} px-2 sm:px-3`}
 />
 </div>

 <div className="space-y-1.5 min-w-0">
 <label className={labelStyle}>
 <Clock className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 End Time
 </label>
 <input
 type="time"
 required
 value={formData.endTime}
 onChange={(e) => handleChange('endTime', e.target.value)}
 className={`${inputStyle} px-2 sm:px-3`}
 />
 </div>
 </div>

 {/* ROW 4: Lead Source, Lead Type, & Service Needed */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2.5 border-t border-zinc-200 dark:border-zinc-800">
 {/* Lead Source */}
 <div className="space-y-1.5 min-w-0">
 <label className={labelStyle}>
 <Tag className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 Lead Source
 </label>
 <div className="relative">
 <div className={`${inputStyle} flex items-center justify-between pointer-events-none pr-2`}>
 <span className="truncate text-zinc-950 dark:text-white font-semibold">
 {formData.leadSource ? (
 formData.leadSource
 ) : (
 <span className="text-zinc-500 font-normal">Select...</span>
 )}
 </span>
 <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0 ml-1"/>
 </div>

  {/* Houzz Project Link */}
  <div className="space-y-1.5 min-w-0">
  <label className={labelStyle}>
  <LinkIcon className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
  Houzz Project Link
  </label>
  <input
  type="text"
  placeholder="https://..."
  value={formData.houzzProjectLink || ''}
  onChange={(e) => handleChange('houzzProjectLink', e.target.value)}
  className={inputStyle}
  />
  </div>
 <select
 value={formData.leadSource}
 onChange={(e) => handleChange('leadSource', e.target.value)}
 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
 >
 <option value=""disabled className="bg-white dark:bg-zinc-900 text-zinc-500">Select...</option>
 {activeSources.map((source) => (
 <option key={source} value={source} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
 {source}
 </option>
 ))}
 </select>
 </div>
 </div>

 {/* Lead Type */}
 <div className="space-y-1.5 min-w-0">
 <label className={labelStyle}>
 <Tag className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 Type
 </label>
 <div className="relative">
 <div className={`${inputStyle} flex items-center justify-between pointer-events-none pr-2`}>
 <span className="truncate text-zinc-950 dark:text-white font-semibold">
 {formData.leadType ? (
 formData.leadType
 ) : (
 <span className="text-zinc-500 font-normal">Select...</span>
 )}
 </span>
 <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0 ml-1"/>
 </div>
 <select
 value={formData.leadType}
 onChange={(e) => handleChange('leadType', e.target.value)}
 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
 >
 <option value=""disabled className="bg-white dark:bg-zinc-900 text-zinc-500">Select...</option>
 {activeTypes.map((type) => (
 <option key={type} value={type} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
 {type}
 </option>
 ))}
 </select>
 </div>
 </div>

 {/* Service Needed */}
 <div className="space-y-1.5 min-w-0">
 <label className={labelStyle}>
 <Briefcase className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 Service Needed
 </label>
 <input
 type="text"
 placeholder="e.g. Chimney Repair"
 value={formData.serviceNeeded || ''}
 onChange={(e) => handleChange('serviceNeeded', e.target.value)}
 className={inputStyle}
 />
 </div>
 </div>

 {/* ROW 5: Notes */}
 <div className="space-y-1.5 pt-2.5 border-t border-zinc-200 dark:border-zinc-800">
 <label className={labelStyle}>
 <FileText className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:inline"/>
 Notes
 </label>
 <textarea
 rows={2.5 as any}
 value={formData.notes}
 onChange={(e) => handleChange('notes', e.target.value)}
 className={`${inputStyle} text-sm leading-relaxed font-sans whitespace-pre-wrap resize-y min-h-[56px]`}
 placeholder=""
 />
 </div>
 </div>

 {/* CREATE / UPDATE APPOINTMENT BUTTON */}
 <div className="pt-1 flex flex-col items-center">
 <button
 type="submit"
 disabled={isSubmitting}
 className="w-full py-3.5 bg-[#FF5500] hover:bg-[#E64D00] text-white font-black text-sm uppercase tracking-wider rounded-lg  transition-all flex items-center justify-center space-x-2.5 group disabled:opacity-50 cursor-pointer"
 >
 {isSubmitting ? (
 <>
 <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
 <span>{editingEventId ? 'Updating Calendar Event...' : 'Creating Appointment...'}</span>
 </>
 ) : (
 <>
 {editingEventId ? (
 <>
 <CheckCircle2 className="w-5 h-5 text-white"/>
 <span>UPDATE & COMPLETE APPOINTMENT</span>
 </>
 ) : (
 <>
 <CalendarPlus className="w-5 h-5 group- transition-transform text-white"/>
 <span>CREATE APPOINTMENT</span>
 </>
 )}
 </>
 )}
 </button>
 </div>
 </form>
 </div>

 {showAvailability && (
  <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl overflow-hidden min-w-0">
   <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
    <div>
     <h3 className="text-sm font-black text-zinc-900 dark:text-white">Salesperson Availability</h3>
     <p className="text-[11px] text-zinc-500 mt-0.5">Google Calendar · viewing only</p>
    </div>
    <div className="flex items-center gap-2">
     <button
      type="button"
      onClick={loadAvailability}
      disabled={isLoadingAvailability}
      title="Refresh availability"
      className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 disabled:opacity-50"
     >
      <RefreshCw className={`w-4 h-4 ${isLoadingAvailability ? 'animate-spin text-[#FF5500]' : ''}`} />
     </button>
     <button
      type="button"
      onClick={() => setShowAvailability(false)}
      title="Close availability"
      className="w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300"
     >
      <X className="w-4 h-4" />
     </button>
    </div>
   </div>

   <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
    <div className="flex items-center justify-between mb-3">
     <button
      type="button"
      onClick={() => {
       const date = new Date(`${availabilityDate}T12:00:00`);
       date.setMonth(date.getMonth() - 1, 1);
       setAvailabilityDate(dateKeyFromParts(date.getFullYear(), date.getMonth(), 1));
      }}
      className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
     >
      <ChevronLeft className="w-4 h-4" />
     </button>
     <span className="text-xs font-black text-zinc-900 dark:text-white">{availabilityMonthLabel}</span>
     <button
      type="button"
      onClick={() => {
       const date = new Date(`${availabilityDate}T12:00:00`);
       date.setMonth(date.getMonth() + 1, 1);
       setAvailabilityDate(dateKeyFromParts(date.getFullYear(), date.getMonth(), 1));
      }}
      className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
     >
      <ChevronRight className="w-4 h-4" />
     </button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center">
     {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
      <div key={day} className="text-[9px] uppercase font-bold text-zinc-400 py-1">{day}</div>
     ))}
     {availabilityMonthCells.map((cell) => (
      <button
       type="button"
       key={cell.key}
       onClick={() => setAvailabilityDate(cell.key)}
       className={`h-8 rounded-lg text-xs font-bold transition-colors ${
        cell.key === availabilityDate
         ? 'bg-[#FF5500] text-white'
         : cell.inMonth
          ? 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          : 'text-zinc-300 dark:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'
       }`}
      >
       {cell.day}
      </button>
     ))}
    </div>
    <div className="flex items-center justify-between mt-3">
     <button type="button" onClick={() => setAvailabilityDate(addDaysToDateKey(availabilityDate, -1))} className="text-[10px] font-bold text-zinc-500 hover:text-[#FF5500]">Previous day</button>
     <p className="text-xs font-black text-zinc-900 dark:text-white">{availabilityDayLabel}</p>
     <button type="button" onClick={() => setAvailabilityDate(addDaysToDateKey(availabilityDate, 1))} className="text-[10px] font-bold text-zinc-500 hover:text-[#FF5500]">Next day</button>
    </div>
   </div>

   {availabilityError && (
    <div className="m-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-bold">
     {availabilityError}
    </div>
   )}

   <div className="overflow-auto max-h-[58vh]">
    <div className="min-w-[650px]">
     <div className="sticky top-0 z-20 flex bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
      <div className="w-16 shrink-0 p-2 text-[10px] font-bold text-zinc-400">Time</div>
      {AVAILABILITY_REPRESENTATIVES.map((representative) => (
       <div key={representative} className="flex-1 min-w-0 p-2 text-center text-xs font-black text-zinc-900 dark:text-white border-l border-zinc-200 dark:border-zinc-800">
        {representative}
       </div>
      ))}
     </div>

     <div className="flex">
      <div className="w-16 shrink-0">
       {Array.from({ length: 24 }, (_, hour) => (
        <div key={hour} style={{ height: HOUR_ROW_HEIGHT }} className="border-b border-zinc-200 dark:border-zinc-800 pr-2 pt-1 text-right text-[9px] font-semibold text-zinc-400">
         {formatTime12Hour(`${String(hour).padStart(2, '0')}:00`)}
        </div>
       ))}
      </div>
      <div className="grid grid-cols-4 flex-1">
       {AVAILABILITY_REPRESENTATIVES.map((representative) => (
        <div
         key={representative}
         className="relative border-l border-zinc-200 dark:border-zinc-800"
         style={{ height: 24 * HOUR_ROW_HEIGHT }}
        >
         {Array.from({ length: 24 }, (_, hour) => (
          <div
           key={hour}
           className="absolute left-0 right-0 border-b border-zinc-200 dark:border-zinc-800"
           style={{ top: hour * HOUR_ROW_HEIGHT, height: HOUR_ROW_HEIGHT }}
          />
         ))}
         {availabilityAppointments
          .filter((appointment) => appointment.representative === representative)
          .map((appointment) => (
           <div
            key={appointment.id}
            className="absolute left-1 right-1 z-10 rounded-lg border border-[#FF5500]/40 bg-[#FF5500]/15 dark:bg-[#FF5500]/20 px-2 py-1 overflow-hidden shadow-sm"
            style={{
             top: (appointment.startMinutes / 60) * HOUR_ROW_HEIGHT + 2,
             height: Math.max(30, ((appointment.endMinutes - appointment.startMinutes) / 60) * HOUR_ROW_HEIGHT - 4),
            }}
            title={`${appointment.clientName} · ${formatTime12Hour(appointment.startTime)}–${formatTime12Hour(appointment.endTime)}`}
           >
            <p className="text-[10px] font-black text-zinc-900 dark:text-white truncate">{appointment.clientName}</p>
            <p className="text-[9px] font-bold text-[#E64D00] dark:text-orange-300 truncate">
             {formatTime12Hour(appointment.startTime)}–{formatTime12Hour(appointment.endTime)}
            </p>
            {appointment.serviceNeeded && <p className="text-[9px] text-zinc-600 dark:text-zinc-300 truncate">{appointment.serviceNeeded}</p>}
           </div>
          ))}
        </div>
       ))}
      </div>
     </div>
    </div>
   </div>
  </section>
 )}
 </div>
 );
};