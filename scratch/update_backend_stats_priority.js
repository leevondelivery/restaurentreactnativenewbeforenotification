const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

const oldLoop = `    orders.forEach((ord) => {
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

const newLoop = `    orders.forEach((ord) => {
      const commRate = Number(ord.commissionRate ?? ord.commission ?? 5);

      let orderAmount = 0;

      if (ord.items && Array.isArray(ord.items) && ord.items.length > 0) {
        orderAmount = ord.items.reduce((sum, item) => {
          const rawP = Number(item.originalPrice ?? item.price ?? 0) || 0;
          const discP = commRate > 0
            ? rawP * (1 - commRate / 100)
            : (item.priceAfterCommission !== undefined ? Number(item.priceAfterCommission) || 0 : rawP);
          return sum + discP * (item.quantity || item.qty || 1);
        }, 0);
      }

      if (!orderAmount || isNaN(Number(orderAmount)) || Number(orderAmount) <= 0) {
        orderAmount =
          ord.totalPriceAfterCommission ??
          ord.netEarnings ??
          ord.totalEarnings ??
          ord.netAmount;
      }

      if (!orderAmount || isNaN(Number(orderAmount)) || Number(orderAmount) <= 0) {
        const grossP = Number(ord.totalPrice ?? ord.grandTotal ?? ord.amount ?? 0) || 0;
        orderAmount = commRate > 0 ? grossP * (1 - commRate / 100) : grossP;
      }

      const numAmount = Number(orderAmount) || 0;
      totalEarnings += numAmount;`;

if (code.includes(oldLoop)) {
  code = code.replace(oldLoop, newLoop);
  fs.writeFileSync(path, code, 'utf8');
  console.log('Successfully updated stats orderAmount calculation priority in server.js!');
} else {
  console.log('oldLoop string not matched in server.js');
}
