import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 15,
  idleTimeoutMillis: 300000,
  connectionTimeoutMillis: 20000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client:', err);
});

let keepAliveTimer = null;

/**
 * Periodically pings the database so Neon does not scale to zero
 * and at least one pooled TLS connection stays warm for fast OTP/API responses.
 */
export function startDbKeepAlive(intervalMs = 240000) {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(async () => {
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      console.warn('[DB KeepAlive] Ping failed:', err.message);
    }
  }, intervalMs);
  if (typeof keepAliveTimer.unref === 'function') {
    keepAliveTimer.unref();
  }
}

export default pool;