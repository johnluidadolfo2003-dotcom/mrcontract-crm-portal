const fs = require('fs');
let text = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

const regex = /{checkFollowUpOverdue\(r\.status \|\| '', r\.timestamp\)\.isOverdue && \([\s\S]*?{\/\* STATUS & ACTION \*\/}/;

const replacement = `{checkFollowUpOverdue(r.status || '', r.timestamp).isOverdue && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-wider bg-rose-600 text-white animate-pulse flex items-center gap-0.5 sm:gap-1">
                          <AlertTriangle className="w-2.5 h-2.5"/> OVERDUE ({checkFollowUpOverdue(r.status || '', r.timestamp).daysOverdue}d)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* STATUS & ACTION */}`;

text = text.replace(regex, replacement);
fs.writeFileSync('src/pages/SpreadsheetPage.tsx', text);
