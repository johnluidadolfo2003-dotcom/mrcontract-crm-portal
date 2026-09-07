const fs = require('fs');
let text = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

const regex = /: viewMode === 'kanban' \? \([\s\S]*?\) : viewMode === 'compact' \? \(/;

const kanbanContent = `: viewMode === 'kanban' ? (
              <div className="p-6 overflow-x-auto h-[calc(100vh-200px)] flex flex-col bg-zinc-950">
                <div className="flex gap-4 min-w-max pb-4 h-full">
                  {LEAD_STATUS_OPTIONS.map(status => {
                    const colRows = filteredRows.filter(r => (r.status || 'New') === status);
                    if (colRows.length === 0) return null;
                    return (
                      <div key={status} className="w-84 bg-zinc-900 rounded-2xl border border-zinc-800 flex flex-col h-full shadow-lg">
                        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 rounded-t-2xl z-10 shrink-0">
                          <h3 className="font-bold text-zinc-100 text-sm">{status}</h3>
                          <span className="text-xs font-black text-white bg-[#FF5500] px-2 py-0.5 rounded-full">{colRows.length}</span>
                        </div>
                        <div className="p-3 flex-1 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-zinc-800">
                          {colRows.map((r, rIdx) => {
                            const isOverdue = isFollowUpOverdue(r.status || '', r.timestamp);
                            const cardKey = \`\${r.tabName || selectedTab || 'lead'}_\${r.rowIndex !== undefined ? r.rowIndex : rIdx}_\${rIdx}\`;
                            return (
                              <div
                                key={cardKey}
                                onClick={() => setSelectedLead(r)}
                                className={\`bg-zinc-900 border \${isOverdue ? 'border-brand-orange/50' : 'border-zinc-700/50'} rounded-xl p-4 shadow-sm hover:border-brand-orange/50 transition-colors cursor-pointer group relative\`}
                              >
                                {isOverdue && <div className="absolute -top-1 -right-1 w-3 h-3 bg-brand-orange rounded-full animate-pulse border-2 border-zinc-900" />}
                                <h4 className="font-bold text-zinc-100 mb-1">{r.clientName || 'Unnamed Client'}</h4>
                                <div className="text-xs text-zinc-400 space-y-1">
                                  {r.clientPhone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{formatPhoneNumber(r.clientPhone)}</div>}
                                  <div className="flex items-center gap-1.5"><Tag className="w-3 h-3 text-brand-orange" />{resolveLeadSource(r, r.tabName || selectedTab)}{r.leadType ? \` • \${r.leadType}\` : ''}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : viewMode === 'compact' ? (`;

text = text.replace(regex, kanbanContent);
fs.writeFileSync('src/pages/SpreadsheetPage.tsx', text);
