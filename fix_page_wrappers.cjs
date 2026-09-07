const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src/pages');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Replace wrapper classes
  // bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 font-sans antialiased pb-20 selection:bg-brand-orange selection:text-white relative
  content = content.replace(/className="flex-1 min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 font-sans antialiased pb-([0-9]+) selection:bg-brand-orange selection:text-white relative"/g, 'className="flex-1 relative pb-$1"');
  
  content = content.replace(/className="flex-1 min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 font-sans antialiased pb-([0-9]+) relative selection:bg-\[#FF5500\] selection:text-white"/g, 'className="flex-1 relative pb-$1"');
  
  content = content.replace(/className="flex-1 min-h-screen bg-\[#F8FAFC\] dark:bg-\[#0B0F17\] text-slate-900 dark:text-zinc-100 font-sans antialiased pb-([0-9]+) relative selection:bg-\[#FF5500\] selection:text-white"/g, 'className="flex-1 relative pb-$1"');

  // Remove the ambient gradient divs
  content = content.replace(/\{\/\* Top Ambient Orange Gradient Glow \*\/\}\n\s*<div className="absolute top-0 left-0 right-0 h-[0-9]+ bg-gradient-to-b from-brand-orange\/[0-9]+ via-brand-orange\/[0-9]+ to-transparent pointer-events-none z-0"\/>/g, '');

  if (content !== originalContent) {
    fs.writeFileSync(file, content);
  }
});
