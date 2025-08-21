import express from 'express';
import { pool } from '../index.js';

const router = express.Router();

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(v);
}

function isPhone(v) {
  return /^\+?\d{10,15}$/.test(v);
}

router.post('/', async (req, res) => {
  try {
    const { name, email, phone, description } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!isEmail(email)) return res.status(400).json({ error: 'Valid email is required' });
    if (!isPhone(phone)) return res.status(400).json({ error: 'Valid phone is required' });

    const q = `INSERT INTO contacts(name, email, phone, description) VALUES($1,$2,$3,$4) RETURNING id, created_at`;
    const { rows } = await pool.query(q, [name.trim(), email.trim().toLowerCase(), phone.trim(), description || null]);

    return res.json({ ok: true, message: 'Contact submitted', id: rows[0].id, createdAt: rows[0].created_at });
  } catch (e) {
    console.error('POST /api/contact error', e);
    return res.status(500).json({ error: 'Failed to process contact' });
  }
});

// List contacts (for verification/admin)
router.get('/', async (_req, res) => {
  try {
    const q = `SELECT id, name, email, phone, description, created_at FROM contacts ORDER BY created_at DESC LIMIT 100`;
    const { rows } = await pool.query(q);
    return res.json({ ok: true, items: rows });
  } catch (e) {
    console.error('GET /api/contact error', e);
    return res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

export default router;
