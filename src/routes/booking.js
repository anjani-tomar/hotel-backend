import express from 'express';
import { pool } from '../index.js';

const router = express.Router();

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(v);
const isPhone = (v) => /^\+?\d{10,15}$/.test(v);


router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, phone, check_in as "checkIn", check_out as "checkOut", guests, room_type as "roomType", notes, created_at as "createdAt" FROM bookings ORDER BY created_at DESC'
    );
    return res.json({ items: rows });
  } catch (e) {
    console.error('GET /api/booking error', e);
    return res.status(500).json({ error: 'Failed to load' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, phone, checkIn, checkOut, guests, roomType, notes, amount } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!isEmail(email)) return res.status(400).json({ error: 'Valid email is required' });
    if (!isPhone(phone)) return res.status(400).json({ error: 'Valid phone is required' });
    if (!checkIn || !checkOut) return res.status(400).json({ error: 'Dates are required' });
    if (!guests || guests < 1) return res.status(400).json({ error: 'Guests must be >= 1' });
    const amt = Number(amount) || 0;

    const insert = `INSERT INTO bookings(name, email, phone, check_in, check_out, guests, room_type, notes, amount)
                    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
                    RETURNING id, created_at, amount`;
    const values = [
      name.trim(),
      email.trim().toLowerCase(),
      phone.trim(),
      checkIn,
      checkOut,
      Number(guests),
      roomType || null,
      notes || null,
      amt,
    ];
    const { rows } = await pool.query(insert, values);

    return res.json({ bookingId: String(rows[0].id), amount: Number(rows[0].amount) });
  } catch (e) {
    console.error('POST /api/booking error', e);
    return res.status(500).json({ error: 'Failed to create' });
  }
});

// Confirm payment for a booking
router.put('/:bookingId/confirmPayment', async (req, res) => {
  const { bookingId } = req.params;
  const { transactionId } = req.body || {};
  if (!bookingId) return res.status(400).json({ error: 'bookingId required' });
  try {
    // Mark booking as paid and store transaction id
    await pool.query(
      'UPDATE bookings SET paid = TRUE, transaction_id = $2 WHERE id = $1',
      [bookingId, transactionId || null]
    );
    // Update payment status if exists
    if (transactionId) {
      await pool.query(
        'UPDATE payments SET status = $2, updated_at = NOW() WHERE transaction_id = $1',
        [transactionId, 'SUCCESS']
      );
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/booking/:bookingId/confirmPayment error', e);
    return res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

export default router;
