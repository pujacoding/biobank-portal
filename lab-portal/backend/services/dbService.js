import pool from '../config/db.js';

/**
 * Parameterized PostgreSQL Query Runner
 * @param {string} sql 
 * @param {Array} params 
 * @returns {Promise<{rows: Array, rowCount: number, lastID: any}>}
 */
export async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  
  // Resolve generated keys if returning
  let lastID = null;
  if (res.rows && res.rows[0]) {
    lastID = res.rows[0].id || 
             res.rows[0].barcode_id || 
             res.rows[0].location_id || 
             res.rows[0].permission_id || 
             res.rows[0].role_id || 
             res.rows[0].template_id ||
             res.rows[0].activity_id || 
             null;
  }
  
  return {
    rows: res.rows,
    rowCount: res.rowCount,
    lastID
  };
}

/**
 * Get a connection client from the pool to execute transactional queries.
 * @returns {Promise<import('pg').PoolClient>}
 */
export async function getClient() {
  return await pool.connect();
}
