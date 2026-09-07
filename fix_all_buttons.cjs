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

  // 1. Standardize corner radii on buttons.
  // We'll look for `<button ... className="..."` and replace radii inside.
  // We can do this with a replace function matching <button> and <a> tags that look like buttons.
  
  content = content.replace(/<(button|a)([^>]+className=["'])([^"']*)(["'])/gi, (match, tag, beforeClass, classList, afterClass) => {
    // Replace radii
    classList = classList.replace(/\brounded-(2xl|3xl|xl|full)\b/g, 'rounded-lg');
    
    // Replace heavy shadows with shadow-sm
    classList = classList.replace(/\bshadow-(lg|md|xl|2xl)\b/g, 'shadow-sm');
    classList = classList.replace(/\bshadow-[a-z0-9-]+\/[0-9]+\b/g, ''); // remove colored shadows

    // Standardize solid primary button colors (make them solid orange)
    // Primary button heuristic: contains bg-[#FF5500] or from-orange
    if (classList.includes('bg-[#FF5500]') || classList.includes('bg-brand-orange') || classList.includes('from-orange')) {
      // Clean up gradients
      classList = classList.replace(/\bbg-gradient-to-[a-z]+\b/g, '');
      classList = classList.replace(/\bfrom-[a-z0-9#-]+\b/g, '');
      classList = classList.replace(/\bvia-[a-z0-9#-]+\b/g, '');
      classList = classList.replace(/\bto-[a-z0-9#-]+\b/g, '');
      classList = classList.replace(/\bhover:from-[a-z0-9#-]+\b/g, '');
      classList = classList.replace(/\bhover:via-[a-z0-9#-]+\b/g, '');
      classList = classList.replace(/\bhover:to-[a-z0-9#-]+\b/g, '');
      
      // Ensure solid orange
      if (!classList.includes('bg-[#FF5500]') && !classList.includes('bg-brand-orange')) {
        classList = 'bg-[#FF5500] hover:bg-[#E64D00] text-white ' + classList;
      }
      
      // Replace arbitrary bg hover if not standard
      classList = classList.replace(/\bhover:bg-[#a-zA-Z0-9]+\b/g, 'hover:bg-[#E64D00]');
      
      // Ensure text-white
      if (!classList.includes('text-white')) {
        classList += ' text-white';
      }
    }
    
    // Cleanup double spaces
    classList = classList.replace(/\s+/g, ' ').trim();
    
    return `<${tag}${beforeClass}${classList}${afterClass}`;
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content);
  }
});
