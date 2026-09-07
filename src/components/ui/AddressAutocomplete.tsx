import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface AddressAutocompleteProps {
 value: string;
 onChange: (value: string) => void;
 placeholder?: string;
 className?: string;
 required?: boolean;
 rows?: number;
 inputClassName?: string;
}

const US_STATE_MAP: Record<string, string> = {
 'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
 'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
 'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
 'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
 'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
 'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
};

function formatNominatimAddress(item: any, inputValue: string = ''): string {
 const addr = item?.address || {};

 // Extract house number & road from Nominatim or inputValue
 let houseNumber = addr.house_number || '';
 let road = addr.road || addr.street || addr.pedestrian || '';

 if ((!houseNumber || !road) && inputValue) {
 const firstComma = inputValue.indexOf(',');
 const streetCandidate = firstComma > 0 ? inputValue.substring(0, firstComma).trim() : inputValue.trim();
 if (streetCandidate) {
 if (!road) road = streetCandidate;
 else if (!houseNumber) {
 const matchNum = streetCandidate.match(/^(\d+[A-Za-z0-9\-\/]*)\s+/);
 if (matchNum) houseNumber = matchNum[1];
 else road = streetCandidate;
 }
 }
 }

 const street = [houseNumber, road].filter(Boolean).join(' ');

 // Extract city
 let city = addr.city || addr.town || addr.village || addr.suburb || addr.hamlet || '';
 if (!city && inputValue) {
 const parts = inputValue.split(',').map(s => s.trim());
 if (parts.length >= 2) city = parts[1];
 }

 // Extract state
 let state = '';
 const rawState = addr.state || '';
 const rawStateLower = rawState.toLowerCase().trim();
 if (US_STATE_MAP[rawStateLower]) {
 state = US_STATE_MAP[rawStateLower];
 } else if (rawState.length === 2) {
 state = rawState.toUpperCase();
 } else if (inputValue) {
 const parts = inputValue.split(',').map(s => s.trim());
 for (const p of parts) {
 const cleanP = p.replace(/\s+\d{5}(-\d{4})?$/, '').trim();
 const cleanPLower = cleanP.toLowerCase();
 if (US_STATE_MAP[cleanPLower]) {
 state = US_STATE_MAP[cleanPLower];
 break;
 }
 if (cleanP.length === 2 && cleanP === cleanP.toUpperCase()) {
 state = cleanP;
 break;
 }
 }
 }
 if (!state && rawState) {
 state = rawState.length > 2 ? rawState.substring(0, 2).toUpperCase() : rawState.toUpperCase();
 }

 // Extract postcode (ZIP)
 let postcode = '';
 const zipMatch = inputValue ? inputValue.match(/\b\d{5}(-\d{4})?\b/) : null;
 if (zipMatch) {
 postcode = zipMatch[0];
 } else {
 postcode = addr.postcode || '';
 }

 // Build final parts: [street, city, state, postcode]
 const parts: string[] = [];
 if (street) parts.push(street);
 if (city) parts.push(city);
 if (state) parts.push(state);
 if (postcode) parts.push(postcode);

 // Remove any duplicates or empty values
 const uniqueParts = parts.filter((p, idx) => p && parts.indexOf(p) === idx);

 if (uniqueParts.length > 0) {
 return uniqueParts.join(', ');
 }

 let display = item?.display_name || inputValue;
 display = display.replace(/,\s*(United States|USA)$/i, '');
 return display;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
 value,
 onChange,
 placeholder = 'e.g. 211 Park Place, Pittsburgh, PA, 15237',
 className = '',
 required = false,
 rows,
 inputClassName = '',
}) => {
 const [suggestions, setSuggestions] = useState<Array<{ display_name: string; formatted: string; lat: string; lon: string }>>([]);
 const [isLoading, setIsLoading] = useState(false);
 const [showDropdown, setShowDropdown] = useState(false);
 const containerRef = useRef<HTMLDivElement>(null);
 const timerRef = useRef<any>(null);

 useEffect(() => {
 const handleClickOutside = (e: MouseEvent) => {
 if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
 setShowDropdown(false);
 }
 };
 document.addEventListener('mousedown', handleClickOutside);
 return () => document.removeEventListener('mousedown', handleClickOutside);
 }, []);

 const handleInputChange = (text: string) => {
 onChange(text);
 if (timerRef.current) clearTimeout(timerRef.current);

 if (!text || text.trim().length < 3) {
 setSuggestions([]);
 setShowDropdown(false);
 return;
 }

 timerRef.current = setTimeout(async () => {
 setIsLoading(true);
 try {
 const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&addressdetails=1&limit=5`, {
 headers: {
 'Accept-Language': 'en',
 'User-Agent': 'MrContractApp/1.0'
 }
 });
 if (res.ok) {
 const data = await res.json();
 if (Array.isArray(data)) {
 const mapped = data.map(item => ({
 ...item,
 formatted: formatNominatimAddress(item, text)
 }));
 setSuggestions(mapped);
 setShowDropdown(mapped.length > 0);
 }
 }
 } catch (err) {
 console.warn('Address autocomplete fetch error:', err);
 } finally {
 setIsLoading(false);
 }
 }, 350);
 };

 const handleSelect = (item: { formatted: string }) => {
 onChange(item.formatted);
 setSuggestions([]);
 setShowDropdown(false);
 };

 return (
 <div ref={containerRef} className={`relative ${className}`}>
 {rows && rows > 1 ? (
 <textarea
 rows={rows}
 required={required}
 value={value}
 onChange={(e) => handleInputChange(e.target.value)}
 onFocus={() => {
 if (suggestions.length > 0) setShowDropdown(true);
 }}
 placeholder={placeholder}
 className={inputClassName}
 />
 ) : (
 <input
 type="text"
 required={required}
 value={value}
 onChange={(e) => handleInputChange(e.target.value)}
 onFocus={() => {
 if (suggestions.length > 0) setShowDropdown(true);
 }}
 placeholder={placeholder}
 className={inputClassName}
 />
 )}

 {isLoading && (
 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
 <Loader2 className="w-4 h-4 animate-spin"/>
 </div>
 )}

 {showDropdown && suggestions.length > 0 && (
 <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 animate-in fade-in slide-in-from-top-1">
 {suggestions.map((item, idx) => (
 <button
 key={idx}
 type="button"
 onClick={() => handleSelect(item)}
 className="w-full text-left px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors flex items-start gap-2.5 cursor-pointer"
 >
 <MapPin className="w-4 h-4 text-orange-500 shrink-0 mt-0.5"/>
 <span className="line-clamp-2">{item.formatted}</span>
 </button>
 ))}
 </div>
 )}
 </div>
 );
};
