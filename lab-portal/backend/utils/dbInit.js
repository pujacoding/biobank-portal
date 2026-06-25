import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Bootstraps database: Runs PostgreSQL schema migrations and seeds if not already configured.
 */
export async function initDb() {
  try {
    console.log("AURA DB: Validating database state...");
    
    // Check if the 'labs' table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'labs'
      )
    `);
    
    const tablesExist = tableCheck.rows[0].exists;
    
    if (!tablesExist) {
      console.log("AURA DB: Schema tables not found. Initializing PostgreSQL migration...");
      
      const schemaPath = path.join(__dirname, '..', 'migrations', '01_schema.sql');
      const seedsPath = path.join(__dirname, '..', 'migrations', '02_seeds.sql');
      
      if (!fs.existsSync(schemaPath) || !fs.existsSync(seedsPath)) {
        throw new Error("Migration files not found in migrations/ directory.");
      }
      
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      const seedsSql = fs.readFileSync(seedsPath, 'utf8');
      
      // Execute migrations in a single multi-statement command block
      await pool.query(schemaSql);
      console.log("AURA DB: Schema tables and indexes created successfully.");
      
      await pool.query(seedsSql);
      console.log("AURA DB: Seed datasets successfully written to Neon.");
    } else {
      console.log("AURA DB: Schema tables found. Skipping migrations.");
      
      // Double check if database seeds are missing (e.g. empty users table)
      const userCountRes = await pool.query("SELECT COUNT(*) FROM users");
      if (parseInt(userCountRes.rows[0].count, 10) === 0) {
        console.log("AURA DB: Database is unseeded. Running seed script...");
        const seedsPath = path.join(__dirname, '..', 'migrations', '02_seeds.sql');
        const seedsSql = fs.readFileSync(seedsPath, 'utf8');
        await pool.query(seedsSql);
        console.log("AURA DB: Seeds applied successfully.");
      }
    }
  } catch (err) {
    console.error("AURA DB [FATAL] Database initialization failed:", err.message);
    throw err;
  }
}
