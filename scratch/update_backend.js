const fs = require('fs');

const backendPath = 'D:\\restuarentbackendbeforenotification\\server.js';

if (!fs.existsSync(backendPath)) {
  console.error('Backend path not found:', backendPath);
  process.exit(1);
}

let content = fs.readFileSync(backendPath, 'utf8');

// Replace message block in sendFCMOrderNotification to be a data-only FCM payload
// Data-only FCM payloads prevent Firebase Native SDK from creating a duplicate default notification!
const targetStr = `const message = {
        token: fcmToken,`;

if (content.includes(targetStr)) {
  const oldMessageBlock = content.substring(
    content.indexOf(targetStr),
    content.indexOf('const response = await firebaseAdmin.messaging().send(message);')
  );

  const newMessageBlock = `const message = {
        token: fcmToken,
        data: {
          title: '🔔 NEW ORDER RECEIVED!',
          body: \`Order #\${orderId} - Total Amount: ₹\${amount}\`,
          orderId: String(orderId),
          totalPrice: String(amount),
          grandTotal: String(amount),
          restaurantId: String(targetRestId),
          sound: 'ordernotification',
          channelId: 'order_incoming_channel_v5',
          type: 'NEW_ORDER_ALERT',
        },
        android: {
          priority: 'high',
          directBootOk: true,
          ttl: 0,
        },
      };

      `;

  content = content.replace(oldMessageBlock, newMessageBlock);
  fs.writeFileSync(backendPath, content, 'utf8');
  console.log('SUCCESSFULLY updated server.js to DATA-ONLY payload (removes duplicate notification)!');
} else {
  console.log('Target string not found in server.js');
}
