const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

// Find POST /api/pendingpayments
const oldPostPending = `app.post('/api/pendingpayments', async (req, res) => {
  try {
    const {
      restaurantId,
      restaurantName,
      grossTotal,
      grandTotal,
      commissionRate,
      totalCommissionCut,
      date,
      orderId,
    } = req.body;

    console.log('pendingpayments POST received:', req.body);

    if (!restaurantId) {
      return res.status(400).json({ success: false, error: 'restaurantId is required' });
    }

    const restIdStr = String(restaurantId);
    const grossTotalNum = Number(grossTotal) || 0;
    const grandTotalNum = Number(grandTotal) || 0;
    const commissionRateNum = Number(commissionRate) || 0;
    const totalCommissionCutNum = Number(totalCommissionCut) || 0;
    const dateStr = date || new Date().toISOString();
    const orderIdStr = String(orderId || '');
    const timeStr = new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const newTransaction = {
      orderId: orderIdStr,
      amount: grandTotalNum,
      grossTotal: grossTotalNum,
      commissionRate: commissionRateNum,
      totalCommissionCut: totalCommissionCutNum,
      date: dateStr,
      time: timeStr,
      status: req.body?.status || 'Pending Clearance',
    };

    // Find existing doc for this restaurant and increment totals, OR create fresh doc
    const updatedDoc = await PendingPayment.findOneAndUpdate(
      { restaurantId: restIdStr },
      {
        $inc: {
          grossTotal: grossTotalNum,
          grandTotal: grandTotalNum,
          totalCommissionCut: totalCommissionCutNum,
        },
        $set: {
          restaurantId: restIdStr,
          restaurantName: restaurantName || '',
          commissionRate: commissionRateNum,
        },
        $push: {
          transactions: {
            $each: [newTransaction],
            $position: 0,
          },
        },
      },
      { upsert: true, new: true, strict: false }
    );`;

const newPostPending = `app.post('/api/pendingpayments', async (req, res) => {
  try {
    const {
      restaurantId,
      restaurantName,
      grossTotal,
      grandTotal,
      commissionRate,
      totalCommissionCut,
    } = req.body;

    console.log('pendingpayments POST received:', req.body);

    if (!restaurantId) {
      return res.status(400).json({ success: false, error: 'restaurantId is required' });
    }

    const restIdStr = String(restaurantId);
    const grossTotalNum = Number(grossTotal) || 0;
    const grandTotalNum = Number(grandTotal) || 0;
    const commissionRateNum = Number(commissionRate) || 0;
    const totalCommissionCutNum = Number(totalCommissionCut) || 0;

    // Increment pending totals for the restaurant WITHOUT creating a transaction entry (transactions are created only when Admin pays out)
    const updatedDoc = await PendingPayment.findOneAndUpdate(
      { restaurantId: restIdStr },
      {
        $inc: {
          grossTotal: grossTotalNum,
          grandTotal: grandTotalNum,
          totalCommissionCut: totalCommissionCutNum,
        },
        $set: {
          restaurantId: restIdStr,
          restaurantName: restaurantName || '',
          commissionRate: commissionRateNum,
        },
      },
      { upsert: true, new: true, strict: false }
    );`;

if (code.includes(oldPostPending)) {
  code = code.replace(oldPostPending, newPostPending);
  fs.writeFileSync(path, code, 'utf8');
  console.log('Successfully updated pendingpayments POST route so transactions are NOT auto-created on order accept!');
} else {
  console.log('oldPostPending string not matched directly in server.js');
}
