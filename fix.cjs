const fs = require('fs');
let text = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');
text = text.replace(/className="inline-flex items-center gap-1 text-xs font-bold px-2\.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-orange-500\/30 hover:border-orange-500\/50 text-orange-400 hover:text-orange-300 transition-all cursor-pointer shadow-xs" >/g, '>');
fs.writeFileSync('src/pages/SpreadsheetPage.tsx', text);
