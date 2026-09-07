const fs = require('fs');
const lines = fs.readFileSync('src/components/ui/LeadDrawer.tsx', 'utf8').split('\n');

let balance = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // match exact opening and closing tags to be safe
  const opens = (line.match(/<div(\s|>)/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  balance += opens;
  balance -= closes;
  if (balance < 0) {
    console.log(`Negative balance at line ${i+1}: ${balance}`);
    break;
  }
}
console.log('Final balance:', balance);
