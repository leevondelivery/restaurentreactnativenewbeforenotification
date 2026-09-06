const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

const oldUpdateRoute = `      await db.collection('acceptedorders').updateMany(
        { $or: [{ _id: queryId }, { _id: targetOrderId }, { orderId: targetOrderId }] },
        { $set: updateFields, $unset: { remainingPrepTimeMins: "" } }
      );`;

const newUpdateRoute = `      await db.collection('acceptedorders').updateMany(
        { $or: [{ _id: queryId }, { _id: targetOrderId }, { orderId: targetOrderId }] },
        { $set: updateFields, $unset: { remainingPrepTimeMins: "" } }
      );
      await db.collection('acceptedbyrestorents').updateMany(
        { $or: [{ _id: queryId }, { _id: targetOrderId }, { orderId: targetOrderId }] },
        { $set: updateFields, $unset: { remainingPrepTimeMins: "" } }
      );`;

if (code.includes(oldUpdateRoute)) {
  code = code.replace(oldUpdateRoute, newUpdateRoute);
  console.log('Successfully updated /api/orders/update-status route in server.js');
} else {
  console.log('Could not match oldUpdateRoute pattern');
}

const oldTimerCode = `      await db.collection('acceptedorders').updateMany(queryFilter, { $set: updatePayload, $unset: { remainingPrepTimeMins: "" } });`;

const newTimerCode = `      await db.collection('acceptedorders').updateMany(queryFilter, { $set: updatePayload, $unset: { remainingPrepTimeMins: "" } });
      await db.collection('acceptedbyrestorents').updateMany(queryFilter, { $set: updatePayload, $unset: { remainingPrepTimeMins: "" } });`;

if (code.includes(oldTimerCode)) {
  code = code.replace(oldTimerCode, newTimerCode);
  console.log('Successfully updated backend timer interval in server.js');
} else {
  console.log('Could not match oldTimerCode pattern');
}

fs.writeFileSync(path, code, 'utf8');
console.log('Backend server.js update complete.');
