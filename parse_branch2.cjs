const fs = require('fs');
const lines = fs.readFileSync('src/components/ui/LeadDrawer.tsx', 'utf8').split('\n');

let balance = 0;
for (let i = 569; i < 707; i++) {
  const line = lines[i];
  const opens = (line.match(/<div(\s|>)/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  balance += opens;
  balance -= closes;
  console.log(`${i+1}: ${balance} | ${line.trim()}`);
}
