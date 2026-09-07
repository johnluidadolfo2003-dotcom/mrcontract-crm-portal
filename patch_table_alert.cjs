const fs = require('fs');
let code = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

code = code.replace(
`                        const isUpdating = updatingRowKey === rowKey;

                        return (
                          <tr
                            key={rowKey}
                            className="hover:bg-zinc-800/40 transition-colors group"
                          >`,
`                        const isUpdating = updatingRowKey === rowKey;
                        const isOverdue = isFollowUpOverdue(r.status || '', r.timestamp);

                        return (
                          <tr
                            key={rowKey}
                            onClick={() => setSelectedLead(r)}
                            className={\`transition-colors cursor-pointer group \${isOverdue ? 'bg-orange-950/40 hover:bg-orange-900/40' : 'hover:bg-zinc-800/40'}\`}
                          >`
);

// We need to stopPropagation on inputs inside the tr
code = code.replace(
`                              <select
                                value={selectedStatus}
                                disabled={isUpdating}
                                onChange={(e) => handleStatusChange(r, e.target.value)}`,
`                              <select
                                value={selectedStatus}
                                disabled={isUpdating}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => handleStatusChange(r, e.target.value)}`
);

code = code.replace(
`                              <button
                                onClick={() => handleScheduleFromRow(r)}
                                className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-emerald-600 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
                                title="Schedule on Calendar"
                              >`,
`                              <button
                                onClick={(e) => { e.stopPropagation(); handleScheduleFromRow(r); }}
                                className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-emerald-600 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
                                title="Schedule on Calendar"
                              >`
);

fs.writeFileSync('src/pages/SpreadsheetPage.tsx', code);
