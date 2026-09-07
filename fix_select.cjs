const fs = require('fs');
let content = fs.readFileSync('src/components/ui/LeadDrawer.tsx', 'utf8');
content = content.replace('</select></div>', '</select>');
fs.writeFileSync('src/components/ui/LeadDrawer.tsx', content);
