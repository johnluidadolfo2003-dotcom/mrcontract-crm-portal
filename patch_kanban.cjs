const fs = require('fs');
let code = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

// Add Kanban to viewMode state type
code = code.replace(
`  const [viewMode, setViewMode] = useState<'compact' | 'table'>('compact');`,
`  const [viewMode, setViewMode] = useState<'compact' | 'table' | 'kanban'>('compact');`
);

// Add Kanban icon
code = code.replace(
`import {
  FileSpreadsheet,`,
`import {
  FileSpreadsheet,
  Columns3,`
);

// Add Kanban toggle button
code = code.replace(
`                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={\`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer \${
                      viewMode === 'table'
                        ? 'bg-zinc-700 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }\`}
                    title="Full Data Table"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Table</span>
                  </button>
                </div>`,
`                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={\`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer \${
                      viewMode === 'table'
                        ? 'bg-zinc-700 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }\`}
                    title="Full Data Table"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Table</span>
                  </button>
                  <button
                    onClick={() => setViewMode('kanban')}
                    className={\`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer \${
                      viewMode === 'kanban'
                        ? 'bg-zinc-700 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }\`}
                    title="Visual Pipeline Board"
                  >
                    <Columns3 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Board</span>
                  </button>
                </div>`
);

fs.writeFileSync('src/pages/SpreadsheetPage.tsx', code);
