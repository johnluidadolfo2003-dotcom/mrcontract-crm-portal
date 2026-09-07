const fs = require('fs');
let code = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

code = code.replace(
`                      const isUpdating = updatingRowKey === rowKey;

                      return (
                        <div
                          key={rowKey}
                          onClick={() => setSelectedLead(r)}
                          className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                        >`,
`                      const isUpdating = updatingRowKey === rowKey;
                      const isOverdue = isFollowUpOverdue(r.status || '', r.timestamp);

                      return (
                        <div
                          key={rowKey}
                          onClick={() => setSelectedLead(r)}
                          className={\`p-3 sm:p-4 flex items-center justify-between gap-3 transition-colors cursor-pointer \${isOverdue ? 'bg-orange-950/40 hover:bg-orange-900/40' : 'hover:bg-zinc-800/30'}\`}
                        >`
);

fs.writeFileSync('src/pages/SpreadsheetPage.tsx', code);
