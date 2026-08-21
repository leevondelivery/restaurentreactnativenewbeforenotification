const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

const oldCalc = `    const totalPrice = Number(src.totalPrice || 200);
    const commissionAmount = Number(((totalPrice * commRate) / 100).toFixed(2));
    const totalPriceAfterCommission = Number((totalPrice - commissionAmount).toFixed(2));
    const netEarnings = totalPriceAfterCommission;`;

const newCalc = `    let calculatedItemsNet = 0;
    if (src.items && Array.isArray(src.items) && src.items.length > 0) {
      calculatedItemsNet = src.items.reduce((acc, it) => {
        const rawP = Number(it.originalPrice ?? it.price ?? 0) || 0;
        const discP = commRate > 0
          ? rawP * (1 - commRate / 100)
          : (it.priceAfterCommission !== undefined ? Number(it.priceAfterCommission) || 0 : rawP);
        const qty = Number(it.quantity || it.qty || 1) || 1;
        return acc + (discP * qty);
      }, 0);
    }

    const totalPrice = Number(src.totalPrice || (calculatedItemsNet > 0 ? calculatedItemsNet : 200));
    const totalPriceAfterCommission = calculatedItemsNet > 0
      ? Number(calculatedItemsNet.toFixed(2))
      : Number((totalPrice * (1 - commRate / 100)).toFixed(2));
    const commissionAmount = Number((totalPrice - totalPriceAfterCommission).toFixed(2));
    const netEarnings = totalPriceAfterCommission;`;

if (code.includes(oldCalc)) {
  code = code.replace(oldCalc, newCalc);
  fs.writeFileSync(path, code, 'utf8');
  console.log('Successfully updated backend server.js item net price calculations!');
} else {
  console.log('oldCalc string not found in server.js');
}
