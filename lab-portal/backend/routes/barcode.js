import express from 'express';
import bwipjs from 'bwip-js';
import { query } from '../database.js';
import { authenticateToken, requirePermission } from './auth.js';

const router = express.Router();

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

// Helper to log activities
async function logActivity(req, actionType, moduleName, entityType, entityId, oldVal, newVal) {
  try {
    const performer = await query(`
      SELECT u.name, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = ?
    `, [req.user.userId]);

    const user = performer.rows[0] || { name: "System", role: "Super Admin", lab_name: "Aura Biobank Admin Center" };
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";

    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.userId, user.name, user.role, user.lab_name || "Aura Biobank Admin Center",
      moduleName, actionType, entityType, String(entityId),
      oldVal ? JSON.stringify(oldVal) : null,
      newVal ? JSON.stringify(newVal) : null,
      clientIp
    ]);
  } catch (err) {
    console.error("Activity log insert failed in barcode.js:", err);
  }
}

// 1. GET /api/barcode/dashboard - Retrieve telemetry metrics
router.get('/dashboard', authenticateToken, requirePermission('View Sample', 'Sample Management'), async (req, res) => {
  try {
    let totalGeneratedSql = "SELECT COUNT(*) as count FROM barcodes b";
    let totalPrintedSql = "SELECT COALESCE(SUM(b.print_count), 0) as count FROM barcodes b";
    let totalReprintedSql = "SELECT COUNT(*) as count FROM barcode_audit ba";
    let totalGeneratedParams = [];
    let totalPrintedParams = [];
    let totalReprintedParams = [];

    if (req.user.labId) {
      totalGeneratedSql += " JOIN samples s ON b.sample_id = s.id WHERE b.status = 'Active' AND s.lab_id = ?";
      totalGeneratedParams.push(req.user.labId);
      
      totalPrintedSql += " JOIN samples s ON b.sample_id = s.id WHERE s.lab_id = ?";
      totalPrintedParams.push(req.user.labId);

      totalReprintedSql += " JOIN samples s ON ba.sample_id = s.id WHERE ba.action_type = 'Barcode Reprinted' AND s.lab_id = ?";
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
    if (req.user.labId) {
      pendingSql += " AND s.lab_id = ?";
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
    console.error("Error fetching barcode dashboard metrics:", error);
    res.status(500).json({ error: "Internal server error while fetching metrics" });
  }
});

// 2. GET /api/barcode/history - Barcode history ledger
router.get('/history', authenticateToken, requirePermission('Print QR', 'QR Management'), async (req, res) => {
  try {
    let sql = `
      SELECT b.barcode_id, b.sample_id, b.barcode_value, b.barcode_type, b.generated_at, b.print_count, b.status,
             b.qr_code_base64, b.code128_base64,
             u.name as generated_by_name,
             (SELECT MAX(action_timestamp) 
              FROM barcode_audit ba 
              WHERE ba.barcode_id = b.barcode_id AND ba.action_type IN ('Barcode Printed', 'Barcode Reprinted')) as last_printed_at
      FROM barcodes b
      LEFT JOIN users u ON b.generated_by = u.id
    `;
    const params = [];
    if (req.user.labId) {
      sql += ` JOIN samples s ON b.sample_id = s.id WHERE s.lab_id = ?`;
      params.push(req.user.labId);
    }
    sql += ` ORDER BY b.generated_at DESC`;

    const result = await query(sql, params);

    res.json({
      success: true,
      history: result.rows
    });
  } catch (error) {
    console.error("Error fetching barcode history directory:", error);
    res.status(500).json({ error: "Internal server error while retrieving history" });
  }
});

// 3. POST /api/barcode/generate - Generate and Map Barcode for Sample
router.post('/generate', authenticateToken, requirePermission('Generate QR', 'QR Management'), async (req, res) => {
  try {
    const { sample_id } = req.body;
    if (!sample_id) {
      return res.status(400).json({ error: "Sample ID is required" });
    }

    let sql = `
      SELECT s.*, c.verification_status as consent_status 
      FROM samples s
      LEFT JOIN consent c ON s.consent_id = c.id
      WHERE s.id = ?
    `;
    const params = [sample_id];
    if (req.user.labId) {
      sql += " AND s.lab_id = ?";
      params.push(req.user.labId);
    }
    const sampleCheck = await query(sql, params);

    if (sampleCheck.rows.length === 0) {
      return res.status(404).json({ error: "Sample profile not found or access denied" });
    }

    const sample = sampleCheck.rows[0];

    if (sample.consent_status !== 'Submitted' && sample.consent_status !== 'Verified') {
      return res.status(400).json({ 
        error: "Barcode generation blocked: Sample does not have submitted or verified consent authorization."
      });
    }

    const activeBarcodeCheck = await query(
      "SELECT * FROM barcodes WHERE sample_id = ? AND status = 'Active'",
      [sample_id]
    );

    if (activeBarcodeCheck.rows.length > 0) {
      return res.status(400).json({ 
        error: "Barcode already generated and active for this sample. Use Regenerate if replacement is required.",
        barcode: activeBarcodeCheck.rows[0]
      });
    }

    const barcode_value = sample_id;
    const scanUrl = `http://localhost:5173/?scan=${sample_id}`;
    const qrPng = await generateBarcodeBuffer('qrcode', scanUrl, { height: 40, width: 40 });
    const code128Png = await generateBarcodeBuffer('code128', barcode_value, { height: 12, includetext: true, textxalign: 'center' });

    const qr_code_base64 = 'data:image/png;base64,' + qrPng.toString('base64');
    const code128_base64 = 'data:image/png;base64,' + code128Png.toString('base64');

    // Clean up any existing barcodes for this sample/value first to prevent UNIQUE constraint failure
    await query("DELETE FROM barcodes WHERE barcode_value = ? OR sample_id = ?", [barcode_value, sample_id]);

    const insertResult = await query(`
      INSERT INTO barcodes (
        sample_id, barcode_value, barcode_type, generated_by, print_count, status, qr_code_base64, code128_base64
      ) VALUES (?, ?, ?, ?, 1, 'Active', ?, ?)
    `, [sample_id, barcode_value, 'Standard', req.user.userId, qr_code_base64, code128_base64]);


    const barcode_id = insertResult.lastID || null;
    let final_barcode_id = barcode_id;
    if (!final_barcode_id) {
      const getNewBarcode = await query("SELECT barcode_id FROM barcodes WHERE sample_id = ? AND status = 'Active'", [sample_id]);
      final_barcode_id = getNewBarcode.rows[0]?.barcode_id;
    }

    await query("UPDATE samples SET status = 'Barcode Generated', barcode_status = 'Generated' WHERE id = ?", [sample_id]);

    await query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
      VALUES (?, ?, 'Barcode Generated', 'Initial barcode generation', ?)
    `, [sample_id, final_barcode_id, req.user.userId]);

    // Log to user_activity_logs
    await logActivity(req, 'CREATE', 'QR Management', 'Barcode', final_barcode_id, null, {
      sample_id, barcode_value, print_count: 1, status: 'Active'
    });

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
    console.error("Error generating barcode:", error);
    res.status(500).json({ error: "Internal server error during barcode generation" });
  }
});

// 4. POST /api/barcode/print - Print Active Barcode
router.post('/print', authenticateToken, requirePermission('Print QR', 'QR Management'), async (req, res) => {
  try {
    const { sample_id } = req.body;
    if (!sample_id) {
      return res.status(400).json({ error: "Sample ID is required." });
    }

    let sql = `
      SELECT b.* FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE b.sample_id = ? AND b.status = 'Active'
    `;
    const params = [sample_id];
    if (req.user.labId) {
      sql += " AND s.lab_id = ?";
      params.push(req.user.labId);
    }
    const barcodeCheck = await query(sql, params);

    if (barcodeCheck.rows.length === 0) {
      return res.status(404).json({ error: "No active barcode label mapping found for this sample or access denied." });
    }

    const barcode = barcodeCheck.rows[0];

    await query(
      "UPDATE barcodes SET print_count = print_count + 1 WHERE barcode_id = ?",
      [barcode.barcode_id]
    );

    await query(
      "UPDATE samples SET barcode_status = 'Generated', status = 'Barcode Generated' WHERE id = ?",
      [sample_id]
    );

    await query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
      VALUES (?, ?, 'Barcode Printed', 'Printed active barcode label', ?)
    `, [sample_id, barcode.barcode_id, req.user.userId]);

    // Log to user_activity_logs
    await logActivity(req, 'PRINT', 'QR Management', 'Barcode', barcode.barcode_id, barcode, {
      ...barcode, print_count: barcode.print_count + 1
    });

    res.json({
      success: true,
      message: "Print logged successfully",
      barcode: {
        ...barcode,
        print_count: barcode.print_count + 1
      }
    });
  } catch (error) {
    console.error("Error during print logging:", error);
    res.status(500).json({ error: "Internal server error during barcode print execution" });
  }
});

// 5. POST /api/barcode/reprint - Reprint Active Barcode
router.post('/reprint', authenticateToken, requirePermission('Reprint QR', 'QR Management'), async (req, res) => {
  try {
    const { sample_id, reason } = req.body;
    if (!sample_id) {
      return res.status(400).json({ error: "Sample ID is required." });
    }
    const reprintReason = reason || "Reprint requested from View Samples";

    let sql = `
      SELECT b.* FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE b.sample_id = ? AND b.status = 'Active'
    `;
    const params = [sample_id];
    if (req.user.labId) {
      sql += " AND s.lab_id = ?";
      params.push(req.user.labId);
    }
    const barcodeCheck = await query(sql, params);

    if (barcodeCheck.rows.length === 0) {
      return res.status(404).json({ error: "No active barcode label mapping found for this sample or access denied." });
    }

    const barcode = barcodeCheck.rows[0];

    await query(
      "UPDATE barcodes SET print_count = print_count + 1 WHERE barcode_id = ?",
      [barcode.barcode_id]
    );

    await query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
      VALUES (?, ?, 'Barcode Reprinted', ?, ?)
    `, [sample_id, barcode.barcode_id, reprintReason.trim(), req.user.userId]);

    // Log to user_activity_logs
    await logActivity(req, 'PRINT', 'QR Management', 'Barcode', barcode.barcode_id, barcode, {
      ...barcode, print_count: barcode.print_count + 1, reprint_reason: reprintReason
    });

    res.json({
      success: true,
      message: "Reprint logged successfully",
      barcode: {
        ...barcode,
        print_count: barcode.print_count + 1
      }
    });
  } catch (error) {
    console.error("Error during reprint logging:", error);
    res.status(500).json({ error: "Internal server error during barcode reprint execution" });
  }
});

// 6. POST /api/barcode/regenerate - Regenerate Barcode (Admin Lock check)
router.post('/regenerate', authenticateToken, async (req, res) => {
  try {
    // Verification: Super Admin (role_id=1) or Lab Admin (role_id=2) only
    const userRoleCheck = await query("SELECT role_id FROM users WHERE id = ?", [req.user.userId]);
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

    let sql = `
      SELECT b.* FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE b.sample_id = ? AND b.status = 'Active'
    `;
    const params = [sample_id];
    if (req.user.labId) {
      sql += " AND s.lab_id = ?";
      params.push(req.user.labId);
    }
    const activeCheck = await query(sql, params);

    if (activeCheck.rows.length === 0) {
      return res.status(404).json({ error: "No active barcode found to regenerate or access denied." });
    }

    const oldBarcode = activeCheck.rows[0];

    await query(`
      INSERT INTO barcode_history (
        sample_id, barcode_id, barcode_value, generated_at, generated_by, print_count, status, replaced_by, reason, qr_code_base64, code128_base64
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      oldBarcode.sample_id, oldBarcode.barcode_id, oldBarcode.barcode_value, 
      oldBarcode.generated_at, oldBarcode.generated_by, oldBarcode.print_count, 
      oldBarcode.status, req.user.userId, reason.trim(), oldBarcode.qr_code_base64, oldBarcode.code128_base64
    ]);

    await query(
      "UPDATE barcodes SET status = 'Inactive' WHERE barcode_id = ?",
      [oldBarcode.barcode_id]
    );

    const historyCountRes = await query(
      "SELECT COUNT(*) as count FROM barcode_history WHERE sample_id = ?",
      [sample_id]
    );
    const revIndex = parseInt(historyCountRes.rows[0].count, 10); 
    const newBarcodeValue = `${sample_id}-R${revIndex}`;

    const scanUrl = `http://localhost:5173/?scan=${sample_id}`;
    const qrPng = await generateBarcodeBuffer('qrcode', scanUrl, { height: 40, width: 40 });
    const code128Png = await generateBarcodeBuffer('code128', newBarcodeValue, { height: 12, includetext: true, textxalign: 'center' });

    const qr_code_base64 = 'data:image/png;base64,' + qrPng.toString('base64');
    const code128_base64 = 'data:image/png;base64,' + code128Png.toString('base64');

    const insertResult = await query(`
      INSERT INTO barcodes (
        sample_id, barcode_value, barcode_type, generated_by, print_count, status, qr_code_base64, code128_base64
      ) VALUES (?, ?, ?, ?, 1, 'Active', ?, ?)
    `, [sample_id, newBarcodeValue, 'Standard', req.user.userId, qr_code_base64, code128_base64]);

    const new_barcode_id = insertResult.lastID || null;
    let final_new_id = new_barcode_id;
    if (!final_new_id) {
      const getNewBarcode = await query("SELECT barcode_id FROM barcodes WHERE sample_id = ? AND status = 'Active'", [sample_id]);
      final_new_id = getNewBarcode.rows[0]?.barcode_id;
    }

    await query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
      VALUES (?, ?, 'Barcode Regenerated', ?, ?)
    `, [sample_id, final_new_id, reason.trim(), req.user.userId]);

    await query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
      VALUES (?, ?, 'Barcode Generated', 'Initial barcode generation for regenerated label', ?)
    `, [sample_id, final_new_id, req.user.userId]);

    // Log regeneration to user_activity_logs
    await logActivity(req, 'UPDATE', 'QR Management', 'Barcode', final_new_id, oldBarcode, {
      barcode_id: final_new_id, sample_id, barcode_value: newBarcodeValue, status: 'Active', reason: reason.trim()
    });

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
    console.error("Error during barcode regeneration:", error);
    res.status(500).json({ error: "Internal server error during barcode regeneration" });
  }
});

// 7. GET /api/barcode/:sample_id - Fetch active barcode for a sample
router.get('/:sample_id', authenticateToken, requirePermission('View Sample', 'Sample Management'), async (req, res) => {
  try {
    const { sample_id } = req.params;

    let sql = `
      SELECT b.* FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE b.sample_id = ? AND b.status = 'Active'
    `;
    const params = [sample_id];
    if (req.user.labId) {
      sql += " AND s.lab_id = ?";
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
    console.error("Error fetching active barcode:", error);
    res.status(500).json({ error: "Internal server error retrieving active barcode" });
  }
});

export default router;
