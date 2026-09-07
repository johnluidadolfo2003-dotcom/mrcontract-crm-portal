const fs = require('fs');
let text = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

const regex = /{\/\* Action Buttons: Houzz Pro & Schedule \*\/}\n\s*\)}\n\s*<button/g;

const replacement = `{/* Action Buttons */}
                  <td className="py-3 px-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button`;

text = text.replace(regex, replacement);
fs.writeFileSync('src/pages/SpreadsheetPage.tsx', text);
