const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

// 1. Replace commRate line in accept-order route to fetch restaurant's commission from restuarentusers collection
const oldAcceptComm = `    const commRate = Number(commissionRate ?? commission ?? src.commissionRate ?? src.commission ?? 5);`;

const newAcceptComm = `    const targetRestIdStr = String(src.restaurantId || src.restId || req.body?.restaurantId || req.body?.restId || '').trim();
    let restUserComm = null;
    if (db && targetRestIdStr) {
      try {
        let restUserQuery = {
          $or: [
            { restId: targetRestIdStr },
            { restaurantId: targetRestIdStr },
            { restaurant_id: targetRestIdStr },
            { _id: targetRestIdStr },
          ],
        };
        if (mongoose.Types.ObjectId.isValid(targetRestIdStr)) {
          restUserQuery.$or.push({ _id: new mongoose.Types.ObjectId(targetRestIdStr) });
        }
        const restUserDoc = await db.collection('restuarentusers').findOne(restUserQuery);
        if (restUserDoc) {
          const foundVal = restUserDoc.commission ?? restUserDoc.commissionRate ?? restUserDoc.commission_rate ?? restUserDoc.commissionPercent;
          if (foundVal !== undefined && foundVal !== null && foundVal !== '' && !isNaN(Number(foundVal))) {
            restUserComm = Number(foundVal);
          }
        }
      } catch (e) {
        console.warn('Error fetching restaurant commission from restuarentusers collection:', e.message);
      }
    }

    const commRate = Number(
      restUserComm ?? commissionRate ?? commission ?? src.commissionRate ?? src.commission ?? 5
    );`;

if (code.includes(oldAcceptComm)) {
  code = code.replace(oldAcceptComm, newAcceptComm);
  console.log('Successfully updated accept-order to fetch commission from restuarentusers MongoDB collection!');
} else {
  console.log('Warning: oldAcceptComm not matched directly');
}

fs.writeFileSync(path, code, 'utf8');
console.log('Done updating server.js!');
