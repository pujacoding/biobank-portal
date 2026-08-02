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

    // Ensure "Specimen Type Master" permissions exist in database
    await pool.query(`
      INSERT INTO permissions (permission_name, module_name) VALUES
      ('View Specimen Types', 'Specimen Type Master'),
      ('Manage Specimen Types', 'Specimen Type Master')
      ON CONFLICT (permission_name) DO NOTHING;
    `);

    // Ensure they are mapped to Lab Admin (role_id = 2)
    await pool.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT 2, permission_id FROM permissions WHERE permission_name IN (
        'View Specimen Types', 'Manage Specimen Types'
      ) ON CONFLICT DO NOTHING;
    `);
    console.log("AURA DB: Action-based permissions for Specimen Type Master initialized.");

    // ==========================================
    // Create Redesigned Reports Tables & Seeds
    // ==========================================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS freezer_configurations (
        freezer_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        capacity INTEGER NOT NULL,
        temperature_setting REAL NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Active'
      );
      
      CREATE TABLE IF NOT EXISTS sample_processing (
        id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
        sample_id VARCHAR(255) NOT NULL,
        processing_step VARCHAR(255) NOT NULL,
        operator VARCHAR(255) NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        duration VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Completed'
      );
      
      CREATE TABLE IF NOT EXISTS qc_reports (
        sample_id VARCHAR(255) PRIMARY KEY,
        concentration REAL NOT NULL,
        purity REAL NOT NULL,
        qc_result VARCHAR(50) NOT NULL,
        qc_status VARCHAR(50) NOT NULL DEFAULT 'Verified',
        technician VARCHAR(255) NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS temperature_monitoring (
        id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
        freezer VARCHAR(255) NOT NULL,
        current_temp REAL NOT NULL,
        min_temp REAL NOT NULL,
        max_temp REAL NOT NULL,
        alarm_status VARCHAR(50) NOT NULL,
        recorded_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS lab_inventory (
        id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
        item_name VARCHAR(255) NOT NULL,
        available_quantity INTEGER NOT NULL,
        reserved_quantity INTEGER NOT NULL,
        minimum_quantity INTEGER NOT NULL,
        location VARCHAR(255) NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS disposals (
        id VARCHAR(255) PRIMARY KEY,
        sample_id VARCHAR(255) NOT NULL,
        reason TEXT NOT NULL,
        approved_by VARCHAR(255) NOT NULL,
        disposal_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
        user_name VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL,
        login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        logout_time TIMESTAMP,
        session_duration VARCHAR(100),
        performed_actions TEXT
      );
    `);
    console.log("AURA DB: Redesigned Reports tables verified.");

    // Seed freezer_configurations if empty
    const freezerCheck = await pool.query("SELECT COUNT(*) FROM freezer_configurations");
    if (parseInt(freezerCheck.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO freezer_configurations (freezer_id, name, capacity, temperature_setting, status) VALUES
        ('ULT-01', 'ULT Freezer 01 (Central Block)', 500, -80.0, 'Active'),
        ('ULT-02', 'ULT Freezer 02 (Central Block)', 500, -80.0, 'Active'),
        ('ULT-03', 'ULT Freezer 03 (Storage Wing)', 600, -80.4, 'Active'),
        ('LN2-01', 'LN2 Tank 01 (Cryo Yard)', 1000, -196.2, 'Active'),
        ('LN2-02', 'LN2 Tank 02 (Cryo Yard)', 1000, -196.0, 'Active'),
        ('FRZ-01', 'Standard Freezer 01', 300, -20.0, 'Active'),
        ('UPR-01', 'Upright Refrigerator 01', 200, 4.0, 'Active')
      `);
      console.log("AURA DB: Seeded freezer configurations.");
    }

    // Dynamic samples fetch to link processing/QC seeds safely
    const sampleIdsRes = await pool.query("SELECT id FROM samples LIMIT 30");
    const existingSampleIds = sampleIdsRes.rows.map(r => r.id);
    while (existingSampleIds.length < 30) {
      existingSampleIds.push(`AURA-SMP-2026-000${existingSampleIds.length + 1}`);
    }

    // Seed sample_processing if empty
    const processingCheck = await pool.query("SELECT COUNT(*) FROM sample_processing");
    if (parseInt(processingCheck.rows[0].count, 10) === 0) {
      const steps = ['Centrifugation', 'Extraction', 'Aliquotting', 'Purity Audit', 'Cryo-buffering'];
      const operators = ['Dr. Sarah Chen', 'Jane Doe', 'John Smith', 'Dr. Sarah Chen', 'Alex Johnson'];
      let queryStr = `INSERT INTO sample_processing (sample_id, processing_step, operator, start_time, end_time, duration, status) VALUES `;
      const queryValues = [];
      for (let i = 0; i < 30; i++) {
        const step = steps[i % steps.length];
        const operator = operators[i % operators.length];
        const durationSec = 1200 + i * 350;
        const durationMin = Math.round(durationSec / 60);
        const startTime = new Date(Date.now() - (30 - i) * 24 * 3600 * 1000);
        const endTime = new Date(startTime.getTime() + durationSec * 1000);
        const status = i % 15 === 0 ? 'Failed' : 'Completed';
        
        queryValues.push(`('${existingSampleIds[i]}', '${step}', '${operator}', '${startTime.toISOString()}', '${endTime.toISOString()}', '${durationMin} mins', '${status}')`);
      }
      await pool.query(queryStr + queryValues.join(','));
      console.log("AURA DB: Seeded sample processing records.");
    }

    // Seed qc_reports if empty
    const qcCheck = await pool.query("SELECT COUNT(*) FROM qc_reports");
    if (parseInt(qcCheck.rows[0].count, 10) === 0) {
      let queryStr = `INSERT INTO qc_reports (sample_id, concentration, purity, qc_result, qc_status, technician) VALUES `;
      const queryValues = [];
      for (let i = 0; i < 30; i++) {
        const conc = parseFloat((25.5 + i * 4.2).toFixed(2));
        const purity = parseFloat((1.75 + (i % 3) * 0.05).toFixed(2));
        const qcResult = purity >= 1.8 && purity <= 1.95 ? 'Passed' : (i % 10 === 0 ? 'Failed' : 'Passed');
        const qcStatus = i % 12 === 0 ? 'Pending' : 'Verified';
        const tech = i % 2 === 0 ? 'Alex Johnson' : 'Jane Doe';
        queryValues.push(`('${existingSampleIds[i]}', ${conc}, ${purity}, '${qcResult}', '${qcStatus}', '${tech}')`);
      }
      await pool.query(queryStr + queryValues.join(','));
      console.log("AURA DB: Seeded QC reports.");
    }

    // Seed temperature_monitoring if empty
    const tempCheck = await pool.query("SELECT COUNT(*) FROM temperature_monitoring");
    if (parseInt(tempCheck.rows[0].count, 10) === 0) {
      const freezers = ['ULT-01', 'ULT-02', 'ULT-03', 'LN2-01', 'LN2-02', 'FRZ-01', 'UPR-01'];
      let queryStr = `INSERT INTO temperature_monitoring (freezer, current_temp, min_temp, max_temp, alarm_status, recorded_time) VALUES `;
      const queryValues = [];
      for (let i = 0; i < 35; i++) {
        const freezer = freezers[i % freezers.length];
        let current = -80.4;
        let min = -81.2;
        let max = -79.5;
        let alarm = 'Normal';
        
        if (freezer.startsWith('LN2')) {
          current = -196.2;
          min = -197.0;
          max = -195.5;
        } else if (freezer.startsWith('FRZ')) {
          current = -20.1;
          min = -21.0;
          max = -19.0;
        } else if (freezer.startsWith('UPR')) {
          current = 4.2;
          min = 3.5;
          max = 5.0;
        }
        
        if (i === 15) {
          current = -65.2;
          alarm = 'High Temp Warning';
        }
        
        const recordedTime = new Date(Date.now() - i * 4 * 3600 * 1000);
        queryValues.push(`('${freezer}', ${current}, ${min}, ${max}, '${alarm}', '${recordedTime.toISOString()}')`);
      }
      await pool.query(queryStr + queryValues.join(','));
      console.log("AURA DB: Seeded temperature logs.");
    }

    // Seed lab_inventory if empty
    const invCheck = await pool.query("SELECT COUNT(*) FROM lab_inventory");
    if (parseInt(invCheck.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO lab_inventory (item_name, available_quantity, reserved_quantity, minimum_quantity, location) VALUES
        ('Cryogenic Aliquot Vials (2.0mL)', 2500, 400, 1000, 'Consumable Cabinet A'),
        ('Microcentrifuge Tubes (1.5mL)', 5000, 0, 1500, 'Consumable Cabinet A'),
        ('Nuclease-Free Water (1L)', 12, 2, 4, 'Reagent Fridge R-01'),
        ('RNA Stabilization Buffer (250mL)', 8, 1, 2, 'Reagent Fridge R-01'),
        ('DNA Extraction Columns Kit (250 prep)', 15, 3, 5, 'Ambient Storage Shelf 2'),
        ('Qiagen RNAeasy extraction kit', 6, 1, 2, 'Ambient Storage Shelf 2'),
        ('Ethanol absolute (LIMS grade, 500mL)', 45, 5, 10, 'Flammables Cabinet F-01'),
        ('Isopropyl alcohol (LIMS grade, 500mL)', 30, 0, 8, 'Flammables Cabinet F-01'),
        ('96-Well Microplate racks', 120, 20, 40, 'Consumable Cabinet B'),
        ('Disposable Nitrile Gloves (Medium, 100pk)', 85, 10, 20, 'Intake Station Desk'),
        ('Disposable Nitrile Gloves (Large, 100pk)', 70, 5, 20, 'Intake Station Desk'),
        ('Pipette Tips (200uL filter barrier)', 3200, 200, 1000, 'Consumable Cabinet B'),
        ('Pipette Tips (1000uL filter barrier)', 2800, 0, 1000, 'Consumable Cabinet B'),
        ('PBS Buffer concentrate (10X, 1L)', 24, 4, 8, 'Reagent Fridge R-01'),
        ('Barcoded LIMS Cryo-labels (roll of 1000)', 18, 0, 5, 'Barcode Printer Desk'),
        ('PCR master mix (FastStart, 200 reactions)', 9, 2, 3, 'Reagent Freezer F-02'),
        ('Taq DNA Polymerase (500 units)', 14, 0, 4, 'Reagent Freezer F-02'),
        ('RNase inhibitor (40 U/uL, 2000 units)', 7, 1, 2, 'Reagent Freezer F-02'),
        ('Lysis buffer (AL, 250mL)', 11, 2, 4, 'Ambient Storage Shelf 3'),
        ('Qubit dsDNA HS Assay Kit (500 assay)', 5, 1, 2, 'Reagent Fridge R-01')
      `);
      console.log("AURA DB: Seeded lab inventory.");
    }

    // Seed disposals if empty
    const disposalCheck = await pool.query("SELECT COUNT(*) FROM disposals");
    if (parseInt(disposalCheck.rows[0].count, 10) === 0) {
      let queryStr = `INSERT INTO disposals (id, sample_id, reason, approved_by, disposal_date) VALUES `;
      const queryValues = [];
      const reasons = [
        'Failed QC concentration check',
        'Consent withdrawn by donor',
        'Sample container leakage or damage',
        'Exceeded maximum stability limit',
        'Compliance purge of historic samples'
      ];
      const approvers = ['Dr. Sarah Chen', 'Lab Administrator'];
      for (let i = 0; i < 15; i++) {
        const id = `DISP-${1000 + i}`;
        const sampleId = existingSampleIds[(i + 15) % existingSampleIds.length];
        const reason = reasons[i % reasons.length];
        const approvedBy = approvers[i % approvers.length];
        const date = new Date(Date.now() - (20 - i) * 24 * 3600 * 1000);
        queryValues.push(`('${id}', '${sampleId}', '${reason}', '${approvedBy}', '${date.toISOString()}')`);
      }
      await pool.query(queryStr + queryValues.join(','));
      console.log("AURA DB: Seeded disposals.");
    }

    // Seed user_sessions if empty
    const sessionCheck = await pool.query("SELECT COUNT(*) FROM user_sessions");
    if (parseInt(sessionCheck.rows[0].count, 10) === 0) {
      const usersList = ['Dr. Sarah Chen', 'Jane Doe', 'John Smith', 'Alex Johnson'];
      const rolesList = ['Lead Researcher', 'Lab Technician', 'Lab Technician', 'Quality Control Analyst'];
      let queryStr = `INSERT INTO user_sessions (user_name, role, login_time, logout_time, session_duration, performed_actions) VALUES `;
      const queryValues = [];
      for (let i = 0; i < 20; i++) {
        const name = usersList[i % usersList.length];
        const role = rolesList[i % rolesList.length];
        const loginTime = new Date(Date.now() - (25 - i) * 12 * 3600 * 1000);
        const durationMin = 45 + i * 22;
        const logoutTime = new Date(loginTime.getTime() + durationMin * 60 * 1000);
        const actions = `Login, View Dashboard, Query Cohorts, ${i % 3 === 0 ? 'Print Barcodes, Store Sample' : 'View Audit trail, Export reports'}, Logout`;
        queryValues.push(`('${name}', '${role}', '${loginTime.toISOString()}', '${logoutTime.toISOString()}', '${durationMin} mins', '${actions}')`);
      }
      await pool.query(queryStr + queryValues.join(','));
      console.log("AURA DB: Seeded user session activities.");
    }

  } catch (err) {
    console.error("AURA DB [FATAL] Database initialization failed:", err.message);
    throw err;
  }
}
