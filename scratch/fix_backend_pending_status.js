const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

const oldTxStatus = `    const newTransaction = {
      orderId: orderIdStr,
      amount: grandTotalNum,
      date: dateStr.split('T')[0],
      time: timeStr,
      status: 'Paid',
    };`;

const newTxStatus = `    const newTransaction = {
      orderId: orderIdStr,
      amount: grandTotalNum,
      grossTotal: grossTotalNum,
      commissionRate: commissionRateNum,
      totalCommissionCut: totalCommissionCutNum,
      date: dateStr,
      time: timeStr,
      status: req.body?.status || 'Pending Clearance',
    };`;

if (code.includes(oldTxStatus)) {
  code = code.replace(oldTxStatus, newTxStatus);
  fs.writeFileSync(path, code, 'utf8');
  console.log('Successfully updated server.js pendingpayments POST status to Pending Clearance!');
} else {
  console.log('oldTxStatus not matched directly in server.js');
}
