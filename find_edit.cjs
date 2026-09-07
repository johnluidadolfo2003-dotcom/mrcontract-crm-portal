const fs = require('fs');
const content = fs.readFileSync('src/components/ui/LeadDrawer.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.includes('Edit') || line.includes('edit')) {
    console.log(`${i+1}: ${line.trim()}`);
  }
});
