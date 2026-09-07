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
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace scaling and rotation utilities
  const badClasses = [
    /active:scale-[a-zA-Z0-9\[\].-]+/g,
    /hover:scale-[a-zA-Z0-9\[\].-]+/g,
    /group-hover:scale-[a-zA-Z0-9\[\].-]+/g,
    /hover:-translate-y-[a-zA-Z0-9\[\].-]+/g,
    /group-hover:-translate-y-[a-zA-Z0-9\[\].-]+/g,
    /group-hover:rotate-[a-zA-Z0-9\[\].-]+/g,
    /hover:rotate-[a-zA-Z0-9\[\].-]+/g,
  ];

  let modified = content;
  badClasses.forEach(regex => {
    modified = modified.replace(regex, '');
  });
  
  // Cleanup multiple spaces inside quotes that might have been left
  modified = modified.replace(/ +"/g, '"').replace(/" +/g, '"').replace(/  +/g, ' ');

  if (modified !== content) {
    fs.writeFileSync(file, modified);
  }
});
