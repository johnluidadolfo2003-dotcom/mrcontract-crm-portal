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

const files = walk('./src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Find pattern like: bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800/900 dark:hover:bg-zinc-700/800
  // text-slate-xxx dark:text-zinc-xxx border border-slate-xxx dark:border-zinc-xxx
  
  content = content.replace(/bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200/g, 'bg-transparent hover:bg-slate-50 dark:hover:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300');
  
  content = content.replace(/bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700/g, 'bg-transparent border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-slate-700 dark:text-zinc-300');

  content = content.replace(/bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-200 .*? border border-slate-200 dark:border-zinc-800/g, 'bg-transparent border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-slate-700 dark:text-zinc-300');

  content = content.replace(/bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300/g, 'bg-transparent border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-slate-700 dark:text-zinc-300');
  
  content = content.replace(/bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/g, 'bg-transparent border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-slate-700 dark:text-zinc-300');

  content = content.replace(/bg-zinc-800 hover:bg-zinc-700 text-zinc-300/g, 'bg-transparent border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-slate-700 dark:text-zinc-300');
  
  content = content.replace(/bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white/g, 'bg-transparent border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-300');
  
  content = content.replace(/bg-slate-100 hover:bg-slate-200 text-slate-800 dark:text-zinc-200/g, 'bg-transparent border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-slate-700 dark:text-zinc-300');
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content);
  }
});
