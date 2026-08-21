const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

const oldFallback = `      // If still 0 and targetRestId is generic or single restaurant setup, fallback to all docs
      if (orders.length === 0 && allDocs.length > 0) {
        orders = allDocs;
      }`;

const newFallback = `      // Do not fallback to allDocs if targetRestId is specified and has 0 orders`;

if (code.includes(oldFallback)) {
  code = code.replace(oldFallback, newFallback);
  fs.writeFileSync(path, code, 'utf8');
  console.log('Successfully removed invalid fallback in server.js stats route!');
} else {
  console.log('Fallback already removed or not matched exactly');
}
