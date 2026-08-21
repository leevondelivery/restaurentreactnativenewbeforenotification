const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

const code = fs.readFileSync(path, 'utf8');
const lines = code.split('\n');
console.log(lines.slice(1440, 1510).join('\n'));
