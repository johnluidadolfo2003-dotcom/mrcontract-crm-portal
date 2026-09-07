const fs = require('fs');
let code = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

code = code.replace(
`                        <div
                          key={rowKey}
                          className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-zinc-800/30 transition-colors"
                        >`,
`                        <div
                          key={rowKey}
                          onClick={() => setSelectedLead(r)}
                          className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                        >`
);

code = code.replace(
`                            {/* Status Selector Dropdown */}
                            <div className="relative w-36 sm:w-48">`,
`                            {/* Status Selector Dropdown */}
                            <div className="relative w-36 sm:w-48" onClick={(e) => e.stopPropagation()}>`
);

code = code.replace(
`                            {/* "SCHEDULED" Button */}
                            <button
                              onClick={() => handleScheduleFromRow(r)}`,
`                            {/* "SCHEDULED" Button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleScheduleFromRow(r); }}`
);

fs.writeFileSync('src/pages/SpreadsheetPage.tsx', code);
