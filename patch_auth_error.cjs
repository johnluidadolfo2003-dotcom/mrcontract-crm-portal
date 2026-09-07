const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

code = code.replace(
`    msg.includes('403') ||
    msg.includes('401')`,
`    msg.includes('403') ||
    msg.includes('401') ||
    msg.includes('unauthenticated') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error')`
);

fs.writeFileSync('src/lib/firebase.ts', code);
