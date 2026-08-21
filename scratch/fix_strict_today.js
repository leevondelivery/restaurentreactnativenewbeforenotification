const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

const oldCheck = "if (isToday || orderDate >= startOfTodayLocal) {";
const newCheck = "if (isToday) {";

if (code.includes(oldCheck)) {
  code = code.replace(oldCheck, newCheck);
  fs.writeFileSync(path, code, 'utf8');
  console.log('Successfully updated server.js to use strict if (isToday) check!');
} else {
  console.log('oldCheck string not found or already updated');
}
