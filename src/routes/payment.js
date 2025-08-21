import express from 'express';
import crypto from 'crypto';
import https from 'https';
import { pool } from '../index.js';

const router = express.Router();

// Helper to generate transaction IDs
function genTxnId() {
  return 'txn_' + crypto.randomBytes(8).toString('hex');
}

// Normalize amount to number (smallest unit or major depending on your convention)
function toNumber(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// Create payment order for card/upi_qr
router.post('/order', async (req, res) => {
  try {
    const { bookingId, method, gateway } = req.body || {};
    if (!bookingId) return res.status(400).json({ error: 'bookingId required' });
    if (!method) return res.status(400).json({ error: 'method required' });

    // Get booking amount
    const bq = await pool.query('SELECT id, amount FROM bookings WHERE id = $1', [bookingId]);
    if (!bq.rows.length) return res.status(404).json({ error: 'booking not found' });
    const amount = toNumber(bq.rows[0].amount);

    const transactionId = genTxnId();
    let qrImageUrl = null;
    let gatewayOrderId = null;
    let paymentGateway = gateway || (method === 'card' ? 'razorpay' : 'upi');

    if (method === 'upi_qr') {
      // Generate a UPI intent string. In production, use your VPA and amount in rupees.
      // Note: Adjust amount to rupees if your DB stores paise.
      const rupees = (amount >= 100 ? (amount / 100).toFixed(2) : amount.toFixed(2));
      const upiIntent = `upi://pay?pa=yourvpa@bank&pn=LuxuryStay&am=${rupees}&cu=INR&tn=Booking%20${bookingId}&tr=${transactionId}`;
      // Use a free QR image service so frontend can display it directly
      qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(upiIntent)}`;
      gatewayOrderId = transactionId;
    } else if (method === 'card' && paymentGateway === 'razorpay') {
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;

      console.log(process.env.RAZORPAY_KEY_SECRET, "process.env.RAZORPAY_KEY_SECRET")
      
      if (!keyId || !keySecret) {
        const missing = [];
        if (!keyId) missing.push('RAZORPAY_KEY_ID');
        if (!keySecret) missing.push('RAZORPAY_KEY_SECRET');
        console.error('Razorpay keys not configured. Missing:', missing.join(','));
        return res.status(500).json({ error: 'Razorpay keys not configured', missing });
      }

      const orderPayload = {
        amount: amount, // paise
        currency: 'INR',
        receipt: String(bookingId),
        notes: { bookingId: String(bookingId) },
        payment_capture: 1,
      };

      const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

      const rpBody = await new Promise((resolve, reject) => {
        const reqOpts = {
          method: 'POST',
          hostname: 'api.razorpay.com',
          path: '/v1/orders',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
          },
        };
        const rq = https.request(reqOpts, (rs) => {
          let data = '';
          rs.on('data', (chunk) => (data += chunk));
          rs.on('end', () => {
            try {
              const parsed = data ? JSON.parse(data) : {};
              if (rs.statusCode && rs.statusCode >= 200 && rs.statusCode < 300) return resolve(parsed);
              const err = new Error('Razorpay order create failed');
              err.statusCode = rs.statusCode;
              err.body = parsed;
              return reject(err);
            } catch (e) {
              return reject(e);
            }
          });
        });
        rq.on('error', reject);
        rq.write(JSON.stringify(orderPayload));
        rq.end();
      }).catch((e) => {
        console.error('Razorpay order create failed', e.statusCode || '', e.body || e.message);
        throw e;
      });

      gatewayOrderId = rpBody.id;
    }

    await pool.query(
      `INSERT INTO payments(transaction_id, booking_id, method, status, amount, gateway, gateway_order_id, qr_image_url)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [transactionId, bookingId, method, 'PENDING', amount, paymentGateway, gatewayOrderId, qrImageUrl]
    );

    const resp = { transactionId, amount };
    if (qrImageUrl) resp.qrImageUrl = qrImageUrl;
    if (paymentGateway === 'razorpay') {
      const keyId = process.env.RAZORPAY_KEY_ID;
      if (!keyId) {
        return res.status(500).json({ error: 'Razorpay key not configured', missing: ['RAZORPAY_KEY_ID'] });
      }
      resp.razorpay = {
        keyId,
        orderId: gatewayOrderId,
        currency: 'INR',
        notes: { bookingId: String(bookingId) },
      };
    }

    return res.json(resp);
  } catch (e) {
    console.error('POST /api/payment/order error', e);
    return res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// Poll payment status
router.get('/status/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  if (!transactionId) return res.status(400).json({ error: 'transactionId required' });
  try {
    const { rows } = await pool.query('SELECT status FROM payments WHERE transaction_id = $1', [transactionId]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    return res.json({ status: rows[0].status });
  } catch (e) {
    console.error('GET /api/payment/status error', e);
    return res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;
