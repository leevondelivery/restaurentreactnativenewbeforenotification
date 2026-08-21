const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

// 1. Replace default commission rate 12 with 5 in accept-order route if not set
const oldCommLine = "const commRate = Number(commissionRate ?? commission ?? src.commissionRate ?? src.commission ?? 12);";
const newCommLine = "const commRate = Number(commissionRate ?? commission ?? src.commissionRate ?? src.commission ?? 5);";

if (code.includes(oldCommLine)) {
  code = code.replace(oldCommLine, newCommLine);
  console.log('Replaced default commissionRate from 12 to 5 in accept-order');
}

// 2. Replace orderAmount calculation loop in stats route
const oldStatsLoop = `    orders.forEach((ord) => {
      let orderAmount =
        ord.netEarnings ??
        ord.totalEarnings ??
        ord.totalPriceAfterCommission ??
        ord.netAmount ??
        ord.totalPrice ??
        0;

      if (!orderAmount && ord.items && Array.isArray(ord.items)) {
        orderAmount = ord.items.reduce((sum, item) => {
          const p = item.priceAfterCommission ?? item.price ?? item.originalPrice ?? 0;
          return sum + p * (item.quantity || 1);
        }, 0);
      }

      const numAmount = Number(orderAmount) || 0;
      totalEarnings += numAmount;`;

const newStatsLoop = `    orders.forEach((ord) => {
      const commRate = Number(ord.commissionRate ?? ord.commission ?? 5);

      let orderAmount =
        ord.totalPriceAfterCommission ??
        ord.netEarnings ??
        ord.totalEarnings ??
        ord.netAmount;

      if (orderAmount === undefined || orderAmount === null || isNaN(Number(orderAmount)) || Number(orderAmount) <= 0) {
        if (ord.items && Array.isArray(ord.items) && ord.items.length > 0) {
          orderAmount = ord.items.reduce((sum, item) => {
            const rawP = Number(item.originalPrice ?? item.price ?? 0) || 0;
            const discP = commRate > 0
              ? rawP * (1 - commRate / 100)
              : (item.priceAfterCommission !== undefined ? Number(item.priceAfterCommission) || 0 : rawP);
            return sum + discP * (item.quantity || item.qty || 1);
          }, 0);
        }
      }

      if (orderAmount === undefined || orderAmount === null || isNaN(Number(orderAmount)) || Number(orderAmount) <= 0) {
        const grossP = Number(ord.totalPrice ?? ord.grandTotal ?? ord.amount ?? 0) || 0;
        orderAmount = commRate > 0 ? grossP * (1 - commRate / 100) : grossP;
      }

      const numAmount = Number(orderAmount) || 0;
      totalEarnings += numAmount;`;

if (code.includes(oldStatsLoop)) {
  code = code.replace(oldStatsLoop, newStatsLoop);
  console.log('Successfully updated stats calculation loop in server.js');
} else {
  console.log('Warning: oldStatsLoop exact string not matched');
}

fs.writeFileSync(path, code, 'utf8');
console.log('Done updating server.js!');
