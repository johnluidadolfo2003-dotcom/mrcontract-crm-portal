const fs = require('fs');
let content = fs.readFileSync('src/components/ui/LeadDrawer.tsx', 'utf8');
content = content.replace(/<\/div>(\s*(?:type=|onClick=|disabled=|className=))/g, '<button$1');
fs.writeFileSync('src/components/ui/LeadDrawer.tsx', content);
