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
  let matches = content.match(/<(button|a)[^>]+className=["'][^"']+["'][^>]*>/g);
  if (matches) {
    matches.forEach(m => {
      // Only print if it contains bg- or border- or rounded-
      if (m.includes('bg-') || m.includes('border-') || m.includes('rounded-')) {
        console.log(`${file}: ${m.substring(0, 150).replace(/\s+/g, ' ')}...`);
      }
    });
  }
});
