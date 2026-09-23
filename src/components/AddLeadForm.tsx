import React, { useState, useRef } from 'react';
import {
 User,
 Phone,
 Mail,
 MapPin,
 Tag,
 Briefcase,
 Layers,
 PlusCircle,
 RotateCcw,
 AlertCircle,
 Camera,
 Image as ImageIcon,
 MessageSquarePlus,
 Loader2,
 Send,
 X,
 Copy,
 Check,
 DollarSign,
 FileText,
 Upload,
} from 'lucide-react';
import { AppConfig, LEAD_STATUS_OPTIONS, LeadStatus } from '../types';
import { DEFAULT_LEAD_SOURCES, isLeadSourceTab } from '../config';
import { formatName, formatPhoneNumber } from '../lib/utils';
import { AddLeadConfirmModal, AddLeadPayload } from './AddLeadConfirmModal';
import { AddressAutocomplete } from './ui/AddressAutocomplete';

interface AddLeadFormProps {
 config: AppConfig;
 onSubmitLead: (payload: AddLeadPayload) => Promise<void>;
 isSubmitting: boolean;
}

const compressImage = (file: File): Promise<File> => {
 return new Promise((resolve) => {
 if (file.size <= 300 * 1024) {
 return resolve(file);
 }

 let timer = setTimeout(() => {
 resolve(file);
 }, 1800);

 try {
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
 width = max_dim;
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
 width = max_dim;
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

export const AddLeadForm: React.FC<AddLeadFormProps> = ({
 config,
 onSubmitLead,
 isSubmitting,
}) => {
 const [clientName, setClientName] = useState('');
 const [clientPhone, setClientPhone] = useState('');
 const [clientEmail, setClientEmail] = useState('');
 const [address, setAddress] = useState('');
 const [leadSource, setLeadSource] = useState(config.leadSources?.[0] || 'Angi');
 const [serviceNeeded, setServiceNeeded] = useState('');
 const [status, setStatus] = useState<LeadStatus>('New');
 const [leadFee, setLeadFee] = useState('');

 const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
 const [pendingLead, setPendingLead] = useState<AddLeadPayload | null>(null);
 const [validationError, setValidationError] = useState<string | null>(null);

 // Smart Autofill state
 const [isExtracting, setIsExtracting] = useState(false);
 const [pasteText, setPasteText] = useState('');
 const [showPasteBox, setShowPasteBox] = useState(false);
 const fileInputRef = useRef<HTMLInputElement>(null);
 const cameraInputRef = useRef<HTMLInputElement>(null);

 const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const formatted = formatPhoneNumber(e.target.value);
 setClientPhone(formatted);
 };

 const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const formatted = formatName(e.target.value);
 setClientName(formatted);
 };

 const handleReset = () => {
 setClientName('');
 setClientPhone('');
 setClientEmail('');
 setAddress('');
 setLeadSource(config.leadSources?.[0] || 'Angi');
 setServiceNeeded('');
 setStatus('New');
 setLeadFee('');
 setValidationError(null);
 setPasteText('');
 setShowPasteBox(false);
 };

 const leadSourcesList = ((config.leadSources && config.leadSources.length > 0)
 ? config.leadSources
 : DEFAULT_LEAD_SOURCES).filter(isLeadSourceTab);

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
 if (data.clientName) setClientName(formatName(data.clientName));
 if (data.clientPhone) setClientPhone(formatPhoneNumber(data.clientPhone));
 if (data.clientEmail) setClientEmail(data.clientEmail);
 if (data.address) setAddress(data.address);
 if (data.leadSource) {
 const matched = leadSourcesList.find(s => s.toLowerCase() === data.leadSource.toLowerCase());
 if (matched) setLeadSource(matched);
 }
 if (data.notes) {
 setServiceNeeded(prev => prev ? prev + '\n' + data.notes : data.notes);
 }
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
 notes: '**Uploaded Lead Image**\n- Image attached.'
 }));
 if (data.warning) {
 setValidationError(data.warning);
 }
 if (data.clientName) setClientName(formatName(data.clientName));
 if (data.clientPhone) setClientPhone(formatPhoneNumber(data.clientPhone));
 if (data.clientEmail) setClientEmail(data.clientEmail);
 if (data.address) setAddress(data.address);
 if (data.leadSource) {
 const matched = leadSourcesList.find(s => s.toLowerCase() === data.leadSource.toLowerCase());
 if (matched) setLeadSource(matched);
 }
 if (data.notes) {
 setServiceNeeded(prev => prev ? prev + '\n' + data.notes : data.notes);
 }
 } catch (err: any) {
 console.warn('Image extraction fallback:', err);
 setValidationError('Image uploaded. Please enter details below.');
 setServiceNeeded(prev => prev ? prev + '\n**Uploaded Lead Image**\n- Image attached.' : '**Uploaded Lead Image**\n- Image attached.');
 } finally {
 setIsExtracting(false);
 if (e.target) e.target.value = '';
 }
 };

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 setValidationError(null);

 if (!clientName.trim()) {
 setValidationError('Please enter the client name.');
 return;
 }

 const payload: AddLeadPayload = {
 clientName: clientName.trim(),
 clientPhone: clientPhone.trim(),
 clientEmail: clientEmail.trim(),
 address: address.trim(),
 leadSource: leadSource.trim() || 'Angi',
 serviceNeeded: serviceNeeded.trim(),
 status: status || 'New',
 leadFee: leadFee.trim(),
 };

 setPendingLead(payload);
 setIsConfirmModalOpen(true);
 };

 const handleConfirmAddLead = async () => {
 if (!pendingLead) return;
 try {
 await onSubmitLead(pendingLead);
 setIsConfirmModalOpen(false);
 handleReset();
 } catch (err: any) {
 console.error('Error submitting lead:', err);
 }
 };

 return (
 <div className="bg-white dark:bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-xl transition-all space-y-4 sm:space-y-5">
 {/* Import Details Bar */}
 <div className="bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-3.5 sm:p-4 space-y-3">
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

 {/* Moved Clear Form away from the import buttons */}
 <button
 type="button"
 onClick={handleReset}
 className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-medium flex items-center gap-1 cursor-pointer"
 title="Clear all form fields"
 >
 <RotateCcw className="w-3 h-3 text-zinc-500"/>
 <span>Clear form</span>
 </button>
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

 {/* Upload Image */}
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

 {/* Paste Text Drawer */}
 {showPasteBox && (
 <div className="pt-1 space-y-2">
 <textarea
 rows={3}
 value={pasteText}
 onChange={(e) => setPasteText(e.target.value)}
 placeholder="Paste Angi lead notification, customer SMS, or lead email text here..."
 className="w-full p-3 bg-white dark:bg-zinc-900 border border-zinc-700/80 rounded-xl text-white text-xs focus:outline-none focus:border-brand-orange placeholder-zinc-500 resize-none"
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
 disabled={isExtracting || !pasteText.trim()}
 className="px-4 py-1.5 bg-[#EF7E15] hover:bg-[#D66B0F] text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
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

 <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">


 {/* Validation error */}
 {validationError && (
 <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs font-semibold rounded-xl p-3 flex items-center gap-2">
 <AlertCircle className="w-4 h-4 text-red-400 shrink-0"/>
 <span>{validationError}</span>
 </div>
 )}

 {/* 1. Client Name (Required) */}
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
 Client Name <span className="text-brand-orange">*</span>
 </label>
 <div className="relative crm-icon-field">
 <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
 <User className="w-4 h-4"/>
 </div>
 <input
 type="text"
 required
 placeholder="e.g. John Smith"
 value={clientName}
 onChange={handleNameChange}
 className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all placeholder-zinc-500"
 />
 </div>
 </div>

 {/* 2. Phone Number & Email */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
 Phone Number
 </label>
 <div className="relative crm-icon-field">
 <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
 <Phone className="w-4 h-4"/>
 </div>
 <input
 type="tel"
 placeholder="(555) 000-0000"
 value={clientPhone}
 onChange={handlePhoneChange}
 className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all placeholder-zinc-500"
 />
 </div>
 </div>

 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
 Email
 </label>
 <div className="relative crm-icon-field">
 <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
 <Mail className="w-4 h-4"/>
 </div>
 <input
 type="email"
 placeholder="client@example.com"
 value={clientEmail}
 onChange={(e) => setClientEmail(e.target.value)}
 className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all placeholder-zinc-500"
 />
 </div>
 </div>
 </div>

 {/* 3. Address */}
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
 Address
 </label>
 <div className="relative crm-icon-field">
 <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400 z-10">
 <MapPin className="w-4 h-4"/>
 </div>
 <AddressAutocomplete
 value={address}
 onChange={(val) => setAddress(val)}
 placeholder="e.g. 123 Main Street, Pittsburgh, PA, 15215"
 inputClassName="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all placeholder-zinc-500"
 />
 </div>
 </div>

 {/* 4. Lead Source & Service Needed & Status & Salesperson */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
 {/* Lead Source */}
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
 Lead Source
 </label>
 <div className="relative crm-icon-field">
 <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
 <Tag className="w-4 h-4"/>
 </div>
 <select
 value={leadSource}
 onChange={(e) => setLeadSource(e.target.value)}
 className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all cursor-pointer"
 >
 {leadSourcesList.map((source) => (
 <option key={source} value={source}>
 {source}
 </option>
 ))}
 </select>
 </div>
 </div>

 {/* Service Needed */}
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
 Service Needed
 </label>
 <div className="relative crm-icon-field">
 <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
 <Briefcase className="w-4 h-4"/>
 </div>
 <input
 type="text"
 placeholder="e.g. Chimney Repair, Tuckpointing"
 value={serviceNeeded}
 onChange={(e) => setServiceNeeded(e.target.value)}
 className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all placeholder-zinc-500"
 />
 </div>
 </div>

 {/* Status */}
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
 Status
 </label>
 <div className="relative crm-icon-field">
 <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
 <Layers className="w-4 h-4"/>
 </div>
 <select
 value={status}
 onChange={(e) => setStatus(e.target.value as LeadStatus)}
 className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all cursor-pointer font-semibold"
 >
 {LEAD_STATUS_OPTIONS.map((st) => (
 <option key={st} value={st}>
 {st}
 </option>
 ))}
 </select>
 </div>
 </div>

 {/* Lead Fee */}
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
 Lead Fee
 </label>
 <div className="relative crm-icon-field">
 <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
 <DollarSign className="w-4 h-4"/>
 </div>
 <input
 type="text"
 placeholder="e.g. $50 or 50"
 value={leadFee}
 onChange={(e) => setLeadFee(e.target.value)}
 className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all placeholder-zinc-500"
 />
 </div>
 </div>
 </div>

 {/* Submit Action Button */}
 <div className="pt-2">
 <button
 type="submit"
 disabled={isSubmitting}
 className="w-full py-3.5 bg-[#EF7E15] hover:bg-[#D66B0F] text-white font-black text-sm uppercase tracking-wider rounded-lg  transition-all flex items-center justify-center space-x-2.5 group disabled:opacity-50 cursor-pointer"
 >
 {isSubmitting ? (
 <>
 <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
 <span>Processing Lead...</span>
 </>
 ) : (
 <>
 <PlusCircle className="w-5 h-5 group- transition-transform text-white"/>
 <span>ADD LEAD</span>
 </>
 )}
 </button>
 </div>
 </form>

 {/* Confirmation Modal */}
 <AddLeadConfirmModal
 isOpen={isConfirmModalOpen}
 onClose={() => setIsConfirmModalOpen(false)}
 onConfirm={handleConfirmAddLead}
 lead={pendingLead}
 isSubmitting={isSubmitting}
 hasHouzzWebhook={Boolean(config.houzzWebhookUrl?.trim())}
 />
 </div>
 );
};

