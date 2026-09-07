const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const regex = /msg\.includes\('401'\) \|\|[\s\S]*?msg\.includes\('credential'\)/;
code = code.replace(regex, 
`msg.includes('401') ||
    msg.includes('unauthenticated') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('credential')`);

fs.writeFileSync('src/lib/firebase.ts', code);
