const fs = require('fs');
let content = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

const replacement = `                                  className={\`text-[10px] font-bold px-2 py-0.5 rounded-md border \${
                                    info.dayCount === 30
                                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-800'
                                      : info.dayCount >= 90
                                      ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-200 border-red-300 dark:border-red-800'
                                      : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700'
                                  }\`}`;

// Be careful, we replace exactly the block
const regex = /className=\{`text-\[10px\] font-bold px-2 py-0\.5 rounded-md border \$\{\s*info\.dayCount === 3[\s\S]*?: 'bg-zinc-800\/90 text-zinc-300 border-zinc-700'\s*\}`\}/;
content = content.replace(regex, replacement);

fs.writeFileSync('src/pages/SpreadsheetPage.tsx', content);
