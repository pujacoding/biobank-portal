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

    // Always sync/update the specimen_types table to make sure it matches the 27 production categories
    console.log("AURA DB: Syncing specimen types list...");
    await pool.query("DELETE FROM specimen_types");
    await pool.query(`
      INSERT INTO specimen_types (id, specimen_code, specimen_name, category, status) VALUES
      (1, 'BLD', 'Blood', 'Blood', 'Active'),
      (2, 'SRM', 'Serum', 'Blood', 'Active'),
      (3, 'PLSM', 'Plasma', 'Blood', 'Active'),
      (4, 'BFC', 'Buffy Coat', 'Blood', 'Active'),
      (5, 'PBMC', 'PBMC', 'Blood', 'Active'),
      (6, 'URN', 'Urine', 'Urine', 'Active'),
      (7, 'STL', 'Stool', 'Stool', 'Active'),
      (8, 'SLV', 'Saliva', 'Saliva', 'Active'),
      (9, 'BCS', 'Buccal Swab', 'Swab', 'Active'),
      (10, 'SPT', 'Sputum', 'Swab', 'Active'),
      (11, 'NPS', 'Nasopharyngeal Swab', 'Swab', 'Active'),
      (12, 'TSS', 'Tissue', 'Tissue', 'Active'),
      (13, 'FFPE', 'FFPE Tissue', 'Tissue', 'Active'),
      (14, 'FRT', 'Fresh Tissue', 'Tissue', 'Active'),
      (15, 'FZT', 'Frozen Tissue', 'Tissue', 'Active'),
      (16, 'BMA', 'Bone Marrow Aspirate', 'Fluid', 'Active'),
      (17, 'CSF', 'CSF', 'Fluid', 'Active'),
      (18, 'PLF', 'Pleural Fluid', 'Fluid', 'Active'),
      (19, 'ASF', 'Ascitic Fluid', 'Fluid', 'Active'),
      (20, 'SYF', 'Synovial Fluid', 'Fluid', 'Active'),
      (21, 'SMN', 'Semen', 'Fluid', 'Active'),
      (22, 'DNA', 'DNA', 'Molecular', 'Active'),
      (23, 'RNA', 'RNA', 'Molecular', 'Active'),
      (24, 'CLL', 'Cell Line', 'Cellular', 'Active'),
      (25, 'SCP', 'Stem Cell Product', 'Cellular', 'Active'),
      (26, 'EXO', 'Exosome', 'Molecular', 'Active'),
      (27, 'OTH', 'Other', 'Other', 'Active')
      ON CONFLICT (id) DO UPDATE SET 
        specimen_code = EXCLUDED.specimen_code, 
        specimen_name = EXCLUDED.specimen_name, 
        category = EXCLUDED.category, 
        status = EXCLUDED.status;
    `);
    await pool.query("SELECT setval(pg_get_serial_sequence('specimen_types', 'id'), COALESCE(MAX(id), 1)) FROM specimen_types;");
    console.log("AURA DB: Specimen types sync completed.");

    // Ensure Barcode Manager schema migrations and permissions are applied
    const barcodeMigrationPath = path.join(__dirname, '..', 'migrations', '03_barcode_manager.sql');
    if (fs.existsSync(barcodeMigrationPath)) {
      const barcodeMigrationSql = fs.readFileSync(barcodeMigrationPath, 'utf8');
      await pool.query(barcodeMigrationSql);
      console.log("AURA DB: Barcode Manager migration & permissions verified.");
    }

    // Ensure hot-path performance indexes exist
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
      CREATE INDEX IF NOT EXISTS idx_samples_lab_id ON samples (lab_id);
      CREATE INDEX IF NOT EXISTS idx_samples_collector_id ON samples (collector_id);
      CREATE INDEX IF NOT EXISTS idx_samples_collection_date ON samples (collection_date);
      CREATE INDEX IF NOT EXISTS idx_samples_created_at ON samples (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_samples_status ON samples (status);
      CREATE INDEX IF NOT EXISTS idx_shipment_samples_sample_id ON shipment_samples (sample_id);
      CREATE INDEX IF NOT EXISTS idx_shipments_origin_lab_id ON shipments (origin_lab_id);
      CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON shipments (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_consent_subject_id ON consent (subject_id);
    `);

    // Synchronize stored sample coordinates into barcodes table
    await pool.query(`
      UPDATE barcodes b
      SET storage_location = s.location,
          status = CASE WHEN b.status = 'VOIDED' THEN 'VOIDED' ELSE 'STORED' END
      FROM samples s
      WHERE b.sample_id = s.id 
        AND s.location IS NOT NULL 
        AND s.status = 'Stored' 
        AND (b.storage_location IS NULL OR b.storage_location != s.location);
    `);

  } catch (err) {
    console.error("AURA DB [FATAL] Database initialization failed:", err);
    throw err;
  }
}
