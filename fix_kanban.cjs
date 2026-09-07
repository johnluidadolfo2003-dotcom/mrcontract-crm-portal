const fs = require('fs');
let text = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

const targetStr = `<div className="flex items-center gap-1.5"><Tag className="w-3 h-3 text-brand-orange"/>{resolveLeadSource(r, r.tabName || selectedTab)}{r.leadType ? \` • \${r.leadType}\` : ''}</div>
              </div>
            </div>
          ) : viewMode === 'compact' ? (`;

const replacement = `<div className="flex items-center gap-1.5"><Tag className="w-3 h-3 text-brand-orange"/>{resolveLeadSource(r, r.tabName || selectedTab)}{r.leadType ? \` • \${r.leadType}\` : ''}</div>
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

text = text.replace(targetStr, replacement);
fs.writeFileSync('src/pages/SpreadsheetPage.tsx', text);
