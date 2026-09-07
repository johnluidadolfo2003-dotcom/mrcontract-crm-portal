const fs = require('fs');
const lines = fs.readFileSync('src/components/ui/LeadDrawer.tsx', 'utf8').split('\n');

let balance = 0;
let output = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('isEditing ?') || line.includes('activeTab ===') || line.includes(') : (')) {
    output.push(`${i+1}: ${line.trim()}`);
  }
}
console.log(output.join('\n'));
