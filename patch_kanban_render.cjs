const fs = require('fs');
let code = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

const kanbanBlock = `
              ) : viewMode === 'kanban' ? (
                <div className="p-6 overflow-x-auto">
                  <div className="flex gap-4 min-w-max pb-4">
                    {LEAD_STATUS_OPTIONS.map(status => {
                      const colRows = filteredRows.filter(r => (r.status || 'New') === status);
                      if (colRows.length === 0) return null;
                      return (
                        <div key={status} className="w-80 bg-zinc-950/50 rounded-2xl border border-zinc-800/80 flex flex-col max-h-[70vh]">
                          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between sticky top-0 bg-zinc-950/80 backdrop-blur-md rounded-t-2xl z-10">
                            <h3 className="font-bold text-zinc-200 text-sm">{status}</h3>
                            <span className="text-xs font-black text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-full">{colRows.length}</span>
                          </div>
                          <div className="p-3 flex-1 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-zinc-800">
                            {colRows.map(r => {
                              const isOverdue = isFollowUpOverdue(r.status || '', r.timestamp);
                              return (
                                <div 
                                  key={r.rowIndex}
                                  onClick={() => setSelectedLead(r)}
                                  className={\`bg-zinc-900 border \${isOverdue ? 'border-orange-500/50' : 'border-zinc-700/50'} rounded-xl p-4 shadow-sm hover:border-emerald-500/50 transition-colors cursor-pointer group relative\`}
                                >
                                  {isOverdue && <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full animate-pulse border-2 border-zinc-900" />}
                                  <h4 className="font-bold text-zinc-100 mb-1">{r.clientName || 'Unnamed Client'}</h4>
                                  <div className="text-xs text-zinc-400 space-y-1">
                                    {r.clientPhone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3"/>{formatPhoneNumber(r.clientPhone)}</div>}
                                    {r.leadType && <div className="flex items-center gap-1.5"><Tag className="w-3 h-3"/>{r.leadType}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
`;

code = code.replace(
`              ) : viewMode === 'compact' ? (`,
kanbanBlock.trim() + `\n              ) : viewMode === 'compact' ? (`
);

fs.writeFileSync('src/pages/SpreadsheetPage.tsx', code);
