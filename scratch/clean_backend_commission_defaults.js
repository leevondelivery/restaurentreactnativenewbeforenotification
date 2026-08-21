const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

// Replace any hardcoded ?? 12 fallbacks with ?? 0 or dynamic lookup
code = code.replace(/ord\.commissionRate \?\? ord\.commission \?\? 12/g, 'ord.commissionRate ?? ord.commission ?? 0');
code = code.replace(/src\.commission \?\? req\.body\?\.commission \?\? 12/g, 'src.commission ?? req.body?.commission ?? 0');

fs.writeFileSync(path, code, 'utf8');
console.log('Successfully removed hardcoded 12 commission fallbacks in server.js!');
