const fs = require('fs');
const content = fs.readFileSync('src/components/ui/LeadDrawer.tsx', 'utf8');

let stack = [];
for (let i = 0; i < content.length; i++) {
  if (content[i] === '{') stack.push('{');
  if (content[i] === '}') {
    if (stack.length === 0) {
      console.log('Unbalanced } at index', i);
      let line = content.substring(0, i).split('\n').length;
      console.log('Line', line);
      break;
    }
    stack.pop();
  }
}
console.log('Stack length', stack.length);
