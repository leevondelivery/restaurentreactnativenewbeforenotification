const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

// Find and replace the $push transactions block in POST /api/pendingpayments
const targetBlock = `        $set: {
          restaurantId: restIdStr,
          restaurantName: restaurantName || '',
          commissionRate: commissionRateNum,
        },
        $push: {
          transactions: {
            $each: [newTransaction],
            $position: 0,
          },
        },`;

const replacementBlock = `        $set: {
          restaurantId: restIdStr,
          restaurantName: restaurantName || '',
          commissionRate: commissionRateNum,
        },`;

if (code.includes(targetBlock)) {
  code = code.replace(targetBlock, replacementBlock);
  fs.writeFileSync(path, code, 'utf8');
  console.log('Successfully removed auto-transaction creation from POST /api/pendingpayments!');
} else {
  console.log('targetBlock not matched directly in server.js');
}
