import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

import contactRouter from './routes/contact.js';
import chatRouter from './routes/chat.js';
import bookingRouter from './routes/booking.js';
import suitesRouter from './routes/suites.js';
import leadGuestRouter from './routes/leadGuest.js';
import paymentRouter from './routes/payment.js';

// Robust env loading: try backend/.env and backend/.env.local, then repo-level fallbacks
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendDir, '.env') });
dotenv.config({ path: path.join(backendDir, '.env.local') });
// Optional repo root fallback
dotenv.config({ path: path.resolve(backendDir, '../.env') });
dotenv.config({ path: path.resolve(backendDir, '../.env.local') });

// Sanitize and support alternate var names once after loading
function sanitize(v) {
  if (typeof v !== 'string') return '';
  // Trim spaces and surrounding quotes
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

// Normalize Razorpay envs
process.env.RAZORPAY_KEY_ID = sanitize(process.env.RAZORPAY_KEY_ID || process.env.RZP_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID);
process.env.RAZORPAY_KEY_SECRET = sanitize(process.env.RAZORPAY_KEY_SECRET || process.env.RZP_KEY_SECRET);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json());
app.use(morgan('dev'));

// Log Razorpay configuration presence (masked)
const _rzpId = process.env.RAZORPAY_KEY_ID || '';
const _rzpSec = process.env.RAZORPAY_KEY_SECRET || '';
if (_rzpId && _rzpSec) {
  const masked = _rzpId.length > 8 ? _rzpId.slice(0, 8) + '…' : 'configured';
  console.log(`[startup] Razorpay keys detected (keyId: ${masked})`);
} else {
  console.warn('[startup] Razorpay keys not configured. Checked .env paths:',
    path.join(backendDir, '.env'), ',',
    path.join(backendDir, '.env.local'), ',',
    path.resolve(backendDir, '../.env'), ',',
    path.resolve(backendDir, '../.env.local')
  );
}

// Database (PostgreSQL)
const { Pool } = pkg;
// Build a valid Postgres connection string
let connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env;
  if (PGHOST && PGDATABASE && PGUSER && typeof PGPASSWORD === 'string') {
    const encUser = encodeURIComponent(PGUSER);
    const encPass = encodeURIComponent(PGPASSWORD);
    const port = PGPORT || 5432;
    connectionString = `postgres://${encUser}:${encPass}@${PGHOST}:${port}/${PGDATABASE}`;
  }
}

if (!connectionString) {
  console.error('Failed to start server: DATABASE_URL is not set and could not be constructed from PG* variables (PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD).');
  process.exit(1);
}

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // Render ke liye required
  },
});

async function createTables() {
  // Create tables if they don't exist
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS lead_guests (
        id SERIAL PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        id_image_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        check_in DATE NOT NULL,
        check_out DATE NOT NULL,
        guests INTEGER NOT NULL CHECK (guests >= 1),
        room_type TEXT,
        notes TEXT,
        amount NUMERIC NOT NULL DEFAULT 0,
        paid BOOLEAN NOT NULL DEFAULT FALSE,
        transaction_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        transaction_id TEXT PRIMARY KEY,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        method TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        amount NUMERIC NOT NULL,
        gateway TEXT,
        gateway_order_id TEXT,
        qr_image_url TEXT,
        currency TEXT DEFAULT 'INR',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      DO $$ BEGIN
        BEGIN
          ALTER TABLE bookings ADD COLUMN amount NUMERIC NOT NULL DEFAULT 0;
        EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN
          ALTER TABLE bookings ADD COLUMN paid BOOLEAN NOT NULL DEFAULT FALSE;
        EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN
          ALTER TABLE bookings ADD COLUMN transaction_id TEXT;
        EXCEPTION WHEN duplicate_column THEN NULL; END;
      END $$;
    `);
  } catch (err) {
    // If database does not exist, try to create it and retry once
    if (err && err.code === '3D000') {
      try {
        const url = new URL(connectionString);
        const targetDb = url.pathname?.replace(/^\//, '') || process.env.PGDATABASE;
        if (!targetDb) throw new Error('Target database name could not be determined');
        // connect to default 'postgres' database
        url.pathname = '/postgres';
        const adminPool = new Pool({
          connectionString: url.toString(),
          ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
        });
        const adminClient = await adminPool.connect();
        try {
          await adminClient.query(`CREATE DATABASE ${JSON.stringify(targetDb).slice(1, -1)};`);
        } catch (e) {
          // 42P04 = duplicate_database
          if (e.code !== '42P04') throw e;
        } finally {
          adminClient.release();
          await adminPool.end();
        }
        // retry original connection and table creation once
        client = await pool.connect();
        await client.query('SELECT 1');
        await client.query(`
          CREATE TABLE IF NOT EXISTS contacts (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS lead_guests (
            id SERIAL PRIMARY KEY,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            id_image_url TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS bookings (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            check_in DATE NOT NULL,
            check_out DATE NOT NULL,
            guests INTEGER NOT NULL CHECK (guests >= 1),
            room_type TEXT,
            notes TEXT,
            amount NUMERIC NOT NULL DEFAULT 0,
            paid BOOLEAN NOT NULL DEFAULT FALSE,
            transaction_id TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS payments (
            transaction_id TEXT PRIMARY KEY,
            booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
            method TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            amount NUMERIC NOT NULL,
            gateway TEXT,
            gateway_order_id TEXT,
            qr_image_url TEXT,
            currency TEXT DEFAULT 'INR',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          DO $$ BEGIN
            BEGIN
              ALTER TABLE bookings ADD COLUMN amount NUMERIC NOT NULL DEFAULT 0;
            EXCEPTION WHEN duplicate_column THEN NULL; END;
            BEGIN
              ALTER TABLE bookings ADD COLUMN paid BOOLEAN NOT NULL DEFAULT FALSE;
            EXCEPTION WHEN duplicate_column THEN NULL; END;
            BEGIN
              ALTER TABLE bookings ADD COLUMN transaction_id TEXT;
            EXCEPTION WHEN duplicate_column THEN NULL; END;
          END $$;
        `);
      } catch (inner) {
        throw inner;
      }
    } else {
      throw err;
    }
  } finally {
    if (client) client.release();
  }
}

// Routes
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/contact', contactRouter);
app.use('/api/chat', chatRouter);
app.use('/api/booking', bookingRouter);
app.use('/api/suites', suitesRouter);
app.use('/api/lead-guest', leadGuestRouter);
app.use('/api/payment', paymentRouter);

createTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
