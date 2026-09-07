const fs = require('fs');
let code = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

code = code.replace(
`  const [isInitializingTabs, setIsInitializingTabs] = useState(false);`,
`  const [isInitializingTabs, setIsInitializingTabs] = useState(false);
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);`
);

const oldToggle = 
`                {/* View Mode Toggle: Compact (Name & Status) vs Table */}
                <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-xl p-0.5">
                  <button
                    onClick={() => setViewMode('compact')}
                    className={\`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer \${
                      viewMode === 'compact'
                        ? 'bg-zinc-700 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }\`}
                    title="Compact view (Client Name & Status only)"
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                    <span>Clean View</span>
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={\`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer \${
                      viewMode === 'table'
                        ? 'bg-zinc-700 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }\`}
                    title="Full detailed spreadsheet columns"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span>Table</span>
                  </button>
                </div>`;

const newToggle =
`                {/* View Mode Dropdown Toggle */}
                <div className="relative">
                  <button
                    onClick={() => setIsViewDropdownOpen(!isViewDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 rounded-xl font-bold text-xs transition-colors shadow-sm focus:outline-none cursor-pointer"
                    title="Change Data View"
                  >
                    {viewMode === 'compact' && <LayoutList className="w-4 h-4 text-emerald-400" />}
                    {viewMode === 'table' && <TableIcon className="w-4 h-4 text-emerald-400" />}
                    {viewMode === 'kanban' && <Columns3 className="w-4 h-4 text-emerald-400" />}
                    <span>
                      {viewMode === 'compact' ? 'Clean View' : viewMode === 'table' ? 'Table View' : 'Board View'}
                    </span>
                    <ChevronDown className={\`w-3.5 h-3.5 text-zinc-400 transition-transform \${isViewDropdownOpen ? 'rotate-180' : ''}\`} />
                  </button>
                  
                  {isViewDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setIsViewDropdownOpen(false)}
                      />
                      <div className="absolute top-full left-0 mt-1.5 w-40 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-20 py-1 overflow-hidden animate-in fade-in slide-in-from-top-2">
                        <button
                          onClick={() => {
                            setViewMode('compact');
                            setIsViewDropdownOpen(false);
                          }}
                          className={\`w-full text-left px-3 py-2 text-xs font-bold flex items-center gap-2 hover:bg-zinc-700 transition-colors cursor-pointer \${viewMode === 'compact' ? 'text-emerald-400' : 'text-zinc-200'}\`}
                        >
                          <LayoutList className="w-4 h-4" />
                          Clean View
                        </button>
                        <button
                          onClick={() => {
                            setViewMode('kanban');
                            setIsViewDropdownOpen(false);
                          }}
                          className={\`w-full text-left px-3 py-2 text-xs font-bold flex items-center gap-2 hover:bg-zinc-700 transition-colors cursor-pointer \${viewMode === 'kanban' ? 'text-emerald-400' : 'text-zinc-200'}\`}
                        >
                          <Columns3 className="w-4 h-4" />
                          Board View
                        </button>
                        <button
                          onClick={() => {
                            setViewMode('table');
                            setIsViewDropdownOpen(false);
                          }}
                          className={\`w-full text-left px-3 py-2 text-xs font-bold flex items-center gap-2 hover:bg-zinc-700 transition-colors cursor-pointer \${viewMode === 'table' ? 'text-emerald-400' : 'text-zinc-200'}\`}
                        >
                          <TableIcon className="w-4 h-4" />
                          Table View
                        </button>
                      </div>
                    </>
                  )}
                </div>`;

code = code.replace(oldToggle, newToggle);
fs.writeFileSync('src/pages/SpreadsheetPage.tsx', code);
