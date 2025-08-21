import express from 'express';
import { pool } from '../index.js';

const router = express.Router();

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(v);
const isPhone = (v) => /^\+?\d{10,15}$/.test(v);

router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, idImageUrl } = req.body || {};
    if (!firstName?.trim()) return res.status(400).json({ error: 'First name is required' });
    if (!lastName?.trim()) return res.status(400).json({ error: 'Last name is required' });
    if (!isEmail(email)) return res.status(400).json({ error: 'Valid email is required' });
    if (!isPhone(phone)) return res.status(400).json({ error: 'Valid phone is required' });

    const { rows } = await pool.query(
      `INSERT INTO lead_guests(first_name, last_name, email, phone, id_image_url)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id, created_at`,
      [firstName.trim(), lastName.trim(), email.trim().toLowerCase(), phone.trim(), idImageUrl || null]
    );

    return res.json({ ok: true, id: rows[0].id, createdAt: rows[0].created_at });
  } catch (e) {
    console.error('POST /api/lead-guest error', e);
    return res.status(500).json({ error: 'Failed to save lead guest' });
  }
});

export default router;
