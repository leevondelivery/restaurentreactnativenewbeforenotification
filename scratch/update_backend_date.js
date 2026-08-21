const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

const oldDateStr = "const rawDateStr = ord.orderDate || ord.createdAt || ord.date;";
const newDateStr = "const rawDateStr = ord.acceptedAt || ord.orderDate || ord.createdAt || ord.date;";

if (code.includes(oldDateStr)) {
  code = code.replace(oldDateStr, newDateStr);
  fs.writeFileSync(path, code, 'utf8');
  console.log('Updated rawDateStr in server.js to include acceptedAt!');
} else {
  console.log('rawDateStr already updated or not found');
}
