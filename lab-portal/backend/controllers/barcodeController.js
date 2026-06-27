import bwipjs from 'bwip-js';
import { query, getClient } from '../services/dbService.js';

const generateBarcodeBuffer = (bcid, text, options = {}) => {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer({
      bcid,
      text,
      scale: 3,
      ...options
    }, (err, png) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
};

/**
 * Helper to log user compliance activities
 */
async function logActivity(client, userId, actionType, moduleName, entityType, entityId, oldVal, newVal, headers, socket) {
  const performer = await client.query(`
    SELECT u.name, r.role_name as role, l.name as lab_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.role_id
    LEFT JOIN labs l ON u.lab_id = l.id
    WHERE u.id = $1
  `, [userId]);

  const user = performer.rows[0] || { name: "System", role: "Super Admin", lab_name: "Aura Biobank Admin Center" };
  const clientIp = headers['x-forwarded-for'] || socket.remoteAddress || "";

  await client.query(`
    INSERT INTO user_activity_logs (
      user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [
    userId, user.name, user.role, user.lab_name || "Aura Biobank Admin Center",
    moduleName, actionType, entityType, String(entityId),
    oldVal ? JSON.stringify(oldVal) : null,
    newVal ? JSON.stringify(newVal) : null,
    clientIp
  ]);
}

/**
 * Get dashboard telemetry metrics
 */
export async function getDashboard(req, res, next) {
  try {
    let totalGeneratedSql = "SELECT COUNT(*) as count FROM barcodes b";
    let totalPrintedSql = "SELECT COALESCE(SUM(b.print_count), 0) as count FROM barcodes b";
    let totalReprintedSql = "SELECT COUNT(*) as count FROM barcode_audit ba";
    const totalGeneratedParams = [];
    const totalPrintedParams = [];
    const totalReprintedParams = [];

    if (req.user.labId && req.user.role !== 'Super Admin') {
      totalGeneratedSql += " JOIN samples s ON b.sample_id = s.id WHERE b.status = 'Active' AND s.lab_id = $1";
      totalGeneratedParams.push(req.user.labId);
      
      totalPrintedSql += " JOIN samples s ON b.sample_id = s.id WHERE s.lab_id = $1";
      totalPrintedParams.push(req.user.labId);

      totalReprintedSql += " JOIN samples s ON ba.sample_id = s.id WHERE ba.action_type = 'Barcode Reprinted' AND s.lab_id = $1";
      totalReprintedParams.push(req.user.labId);
    } else {
      totalGeneratedSql += " WHERE b.status = 'Active'";
      totalReprintedSql += " WHERE ba.action_type = 'Barcode Reprinted'";
    }

    const totalGeneratedRes = await query(totalGeneratedSql, totalGeneratedParams);
    const totalPrintedRes = await query(totalPrintedSql, totalPrintedParams);
    const totalReprintedRes = await query(totalReprintedSql, totalReprintedParams);
    
    let pendingSql = `
      SELECT COUNT(*) as count 
      FROM samples s
      WHERE s.status = 'Consent Verified'
        AND NOT EXISTS (
          SELECT 1 FROM barcodes b 
          WHERE b.sample_id = s.id AND b.status = 'Active'
        )
    `;
    const pendingParams = [];
    if (req.user.labId && req.user.role !== 'Super Admin') {
      pendingSql += " AND s.lab_id = $1";
      pendingParams.push(req.user.labId);
    }
    const pendingRes = await query(pendingSql, pendingParams);

    res.json({
      success: true,
      metrics: {
        totalGenerated: parseInt(totalGeneratedRes.rows[0].count, 10),
        totalPrinted: parseInt(totalPrintedRes.rows[0].count, 10),
        totalReprinted: parseInt(totalReprintedRes.rows[0].count, 10),
        pendingGeneration: parseInt(pendingRes.rows[0].count, 10)
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Fetch barcode history ledger
 */
export async function getHistory(req, res, next) {
  try {
    let sql = `
      SELECT b.barcode_id, b.sample_id, b.barcode_value, b.barcode_type, b.generated_at, b.print_count, b.status,
             b.qr_code_base64, b.code128_base64,
             u.name as generated_by_name,
             s.consent_status,
             (SELECT MAX(action_timestamp) 
              FROM barcode_audit ba 
              WHERE ba.barcode_id = b.barcode_id AND ba.action_type IN ('Barcode Printed', 'Barcode Reprinted')) as last_printed_at
      FROM barcodes b
      LEFT JOIN users u ON b.generated_by = u.id
      LEFT JOIN samples s ON b.sample_id = s.id
    `;
    const params = [];
    if (req.user.labId && req.user.role !== 'Super Admin') {
      sql += ` WHERE s.lab_id = $1`;
      params.push(req.user.labId);
    }
    sql += ` ORDER BY b.generated_at DESC`;

    const result = await query(sql, params);

    res.json({
      success: true,
      history: result.rows
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Generate barcode mapping for sample (Transactional)
 */
export async function generateBarcode(req, res, next) {
  const client = await getClient();
  try {
    const { sample_id } = req.body;
    if (!sample_id) {
      return res.status(400).json({ error: "Sample ID is required" });
    }

    await client.query('BEGIN');

    let sql = `
      SELECT s.*, COALESCE(c.verification_status, s.consent_status) as consent_status, st.specimen_code
      FROM samples s
      LEFT JOIN consent c ON s.consent_id = c.id
      LEFT JOIN specimen_types st ON s.specimen_type_id = st.id
      WHERE s.id = $1
    `;
    const params = [sample_id];
    if (req.user.labId && req.user.role !== 'Super Admin') {
      sql += " AND s.lab_id = $2";
      params.push(req.user.labId);
    }
    const sampleCheck = await client.query(sql, params);

    if (sampleCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Sample profile not found or access denied" });
    }

    const sample = sampleCheck.rows[0];

    if (sample.consent_status !== 'Submitted' && sample.consent_status !== 'Verified') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: "Barcode generation blocked: Sample does not have submitted or verified consent authorization."
      });
    }

    const activeBarcodeCheck = await client.query(
      "SELECT * FROM barcodes WHERE sample_id = $1 AND status = 'Active'",
      [sample_id]
    );

    if (activeBarcodeCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: "Barcode already generated and active for this sample. Use Regenerate if replacement is required.",
        barcode: activeBarcodeCheck.rows[0]
      });
    }

    const specimenCode = sample.specimen_code || 'SMP';
    const sampleIdParts = sample_id.split('-');
    const year = sampleIdParts[2] || new Date().getFullYear();
    const seqStr = sampleIdParts[3] || '000001';
    const seqNum = parseInt(seqStr, 10);
    const barcode_value = `${specimenCode}-${year}-${String(seqNum).padStart(4, '0')}`;

    const scanUrl = `http://localhost:5173/?scan=${sample_id}`;
    const qrPng = await generateBarcodeBuffer('qrcode', scanUrl, { height: 40, width: 40 });
    const code128Png = await generateBarcodeBuffer('code128', barcode_value, { height: 12, includetext: true, textxalign: 'center' });

    const qr_code_base64 = 'data:image/png;base64,' + qrPng.toString('base64');
    const code128_base64 = 'data:image/png;base64,' + code128Png.toString('base64');

    // Clean up existing duplicates
    await client.query("DELETE FROM barcodes WHERE barcode_value = $1 OR sample_id = $2", [barcode_value, sample_id]);

    const insertResult = await client.query(`
      INSERT INTO barcodes (
        sample_id, barcode_value, barcode_type, generated_by, print_count, status, qr_code_base64, code128_base64
      ) VALUES ($1, $2, $3, $4, 1, 'Active', $5, $6) RETURNING barcode_id
    `, [sample_id, barcode_value, 'Standard', req.user.userId, qr_code_base64, code128_base64]);

    const final_barcode_id = insertResult.rows[0]?.barcode_id;

    await client.query("UPDATE samples SET status = 'Barcode Generated', barcode_status = 'Generated' WHERE id = $1", [sample_id]);

    await client.query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
      VALUES ($1, $2, 'Barcode Generated', 'Initial barcode generation', $3)
    `, [sample_id, final_barcode_id, req.user.userId]);

    await logActivity(client, req.user.userId, 'CREATE', 'QR Management', 'Barcode', final_barcode_id, null, {
      sample_id, barcode_value, print_count: 1, status: 'Active'
    }, req.headers, req.socket);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      barcode: {
        barcode_id: final_barcode_id,
        sample_id,
        barcode_value,
        print_count: 1,
        status: 'Active',
        qr_code_base64,
        code128_base64
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Record barcode print event (Transactional)
 */
export async function printBarcode(req, res, next) {
  const client = await getClient();
  try {
    const { sample_id } = req.body;
    if (!sample_id) {
      return res.status(400).json({ error: "Sample ID is required." });
    }

    await client.query('BEGIN');

    let sql = `
      SELECT b.* FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE b.sample_id = $1 AND b.status = 'Active'
    `;
    const params = [sample_id];
    if (req.user.labId && req.user.role !== 'Super Admin') {
      sql += " AND s.lab_id = $2";
      params.push(req.user.labId);
    }
    const barcodeCheck = await client.query(sql, params);

    if (barcodeCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "No active barcode label mapping found for this sample or access denied." });
    }

    const barcode = barcodeCheck.rows[0];

    await client.query(
      "UPDATE barcodes SET print_count = print_count + 1 WHERE barcode_id = $1",
      [barcode.barcode_id]
    );

    await client.query(
      "UPDATE samples SET barcode_status = 'Generated', status = 'Barcode Generated' WHERE id = $1",
      [sample_id]
    );

    await client.query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
      VALUES ($1, $2, 'Barcode Printed', 'Printed active barcode label', $3)
    `, [sample_id, barcode.barcode_id, req.user.userId]);

    await logActivity(client, req.user.userId, 'PRINT', 'QR Management', 'Barcode', barcode.barcode_id, barcode, {
      ...barcode, print_count: barcode.print_count + 1
    }, req.headers, req.socket);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: "Print logged successfully",
      barcode: {
        ...barcode,
        print_count: barcode.print_count + 1
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Record barcode reprint event (Transactional)
 */
export async function reprintBarcode(req, res, next) {
  const client = await getClient();
  try {
    const { sample_id, reason } = req.body;
    if (!sample_id) {
      return res.status(400).json({ error: "Sample ID is required." });
    }
    const reprintReason = reason || "Reprint requested from View Samples";

    await client.query('BEGIN');

    let sql = `
      SELECT b.*, s.consent_status FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE b.sample_id = $1 AND b.status = 'Active'
    `;
    const params = [sample_id];
    if (req.user.labId && req.user.role !== 'Super Admin') {
      sql += " AND s.lab_id = $2";
      params.push(req.user.labId);
    }
    const barcodeCheck = await client.query(sql, params);

    if (barcodeCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "No active barcode label mapping found for this sample or access denied." });
    }

    if (barcodeCheck.rows[0].consent_status === 'Withdrawn') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Reprint Blocked: Sample has withdrawn consent." });
    }

    const barcode = barcodeCheck.rows[0];

    await client.query(
      "UPDATE barcodes SET print_count = print_count + 1 WHERE barcode_id = $1",
      [barcode.barcode_id]
    );

    await client.query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
      VALUES ($1, $2, 'Barcode Reprinted', $3, $4)
    `, [sample_id, barcode.barcode_id, reprintReason.trim(), req.user.userId]);

    await logActivity(client, req.user.userId, 'PRINT', 'QR Management', 'Barcode', barcode.barcode_id, barcode, {
      ...barcode, print_count: barcode.print_count + 1, reprint_reason: reprintReason
    }, req.headers, req.socket);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: "Reprint logged successfully",
      barcode: {
        ...barcode,
        print_count: barcode.print_count + 1
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Regenerate active barcode mapping (Transactional)
 */
export async function regenerateBarcode(req, res, next) {
  const client = await getClient();
  try {
    const userRoleCheck = await client.query("SELECT role_id FROM users WHERE id = $1", [req.user.userId]);
    const roleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);
    
    if (roleId !== 1 && roleId !== 2) {
      return res.status(403).json({ error: "Access denied. Only Lab Admins can regenerate barcodes." });
    }

    const { sample_id, reason } = req.body;
    if (!sample_id) {
      return res.status(400).json({ error: "Sample ID is required." });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "A valid reason for regeneration is required." });
    }

    await client.query('BEGIN');

    let sql = `
      SELECT b.*, s.consent_status FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE b.sample_id = $1 AND b.status = 'Active'
    `;
    const params = [sample_id];
    if (req.user.labId && req.user.role !== 'Super Admin') {
      sql += " AND s.lab_id = $2";
      params.push(req.user.labId);
    }
    const activeCheck = await client.query(sql, params);

    if (activeCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "No active barcode found to regenerate or access denied." });
    }

    if (activeCheck.rows[0].consent_status === 'Withdrawn') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Regeneration Blocked: Sample has withdrawn consent." });
    }

    const oldBarcode = activeCheck.rows[0];

    // Archive current barcode into history table
    await client.query(`
      INSERT INTO barcode_history (
        sample_id, barcode_id, barcode_value, generated_at, generated_by, print_count, status, replaced_by, reason, qr_code_base64, code128_base64
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      oldBarcode.sample_id, oldBarcode.barcode_id, oldBarcode.barcode_value, 
      oldBarcode.generated_at, oldBarcode.generated_by, oldBarcode.print_count, 
      oldBarcode.status, req.user.userId, reason.trim(), oldBarcode.qr_code_base64, oldBarcode.code128_base64
    ]);

    // Deactivate previous barcode record
    await client.query(
      "UPDATE barcodes SET status = 'Inactive' WHERE barcode_id = $1",
      [oldBarcode.barcode_id]
    );

    // Compute revision value
    const historyCountRes = await client.query(
      "SELECT COUNT(*) as count FROM barcode_history WHERE sample_id = $1",
      [sample_id]
    );
    const revIndex = parseInt(historyCountRes.rows[0].count, 10); 

    // Retrieve specimen_code to construct the new barcode value consistently
    const sampleSpecimenRes = await client.query(`
      SELECT s.*, st.specimen_code
      FROM samples s
      LEFT JOIN specimen_types st ON s.specimen_type_id = st.id
      WHERE s.id = $1
    `, [sample_id]);

    let baseBarcodeValue = sample_id;
    if (sampleSpecimenRes.rows.length > 0) {
      const sampleObj = sampleSpecimenRes.rows[0];
      const specimenCode = sampleObj.specimen_code || 'SMP';
      const sampleIdParts = sample_id.split('-');
      const year = sampleIdParts[2] || new Date().getFullYear();
      const seqStr = sampleIdParts[3] || '000001';
      const seqNum = parseInt(seqStr, 10);
      baseBarcodeValue = `${specimenCode}-${year}-${String(seqNum).padStart(4, '0')}`;
    }
    const newBarcodeValue = `${baseBarcodeValue}-R${revIndex}`;

    const scanUrl = `http://localhost:5173/?scan=${sample_id}`;
    const qrPng = await generateBarcodeBuffer('qrcode', scanUrl, { height: 40, width: 40 });
    const code128Png = await generateBarcodeBuffer('code128', newBarcodeValue, { height: 12, includetext: true, textxalign: 'center' });

    const qr_code_base64 = 'data:image/png;base64,' + qrPng.toString('base64');
    const code128_base64 = 'data:image/png;base64,' + code128Png.toString('base64');

    // Create new barcode record (print_count = 1)
    const insertResult = await client.query(`
      INSERT INTO barcodes (
        sample_id, barcode_value, barcode_type, generated_by, print_count, status, qr_code_base64, code128_base64
      ) VALUES ($1, $2, $3, $4, 1, 'Active', $5, $6) RETURNING barcode_id
    `, [sample_id, newBarcodeValue, 'Standard', req.user.userId, qr_code_base64, code128_base64]);

    const final_new_id = insertResult.rows[0]?.barcode_id;

    // Log audits
    await client.query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
      VALUES ($1, $2, 'Barcode Regenerated', $3, $4)
    `, [sample_id, final_new_id, reason.trim(), req.user.userId]);

    await client.query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
      VALUES ($1, $2, 'Barcode Generated', 'Initial barcode generation for regenerated label', $3)
    `, [sample_id, final_new_id, req.user.userId]);

    await logActivity(client, req.user.userId, 'UPDATE', 'QR Management', 'Barcode', final_new_id, oldBarcode, {
      barcode_id: final_new_id, sample_id, barcode_value: newBarcodeValue, status: 'Active', reason: reason.trim()
    }, req.headers, req.socket);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: "Barcode label regenerated successfully",
      barcode: {
        barcode_id: final_new_id,
        sample_id,
        barcode_value: newBarcodeValue,
        print_count: 1,
        status: 'Active',
        qr_code_base64,
        code128_base64
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Retrieve active barcode for a specific sample ID
 */
export async function getActiveBarcode(req, res, next) {
  try {
    const { sample_id } = req.params;

    let sql = `
      SELECT b.* FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE b.sample_id = $1 AND b.status = 'Active'
    `;
    const params = [sample_id];
    if (req.user.labId && req.user.role !== 'Super Admin') {
      sql += " AND s.lab_id = $2";
      params.push(req.user.labId);
    }
    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No active barcode label mapping found for this specimen ID or access denied" });
    }

    res.json({
      success: true,
      barcode: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
}
