import express from 'express';
import { query } from '../database.js';
import { authenticateToken, requirePermission } from './auth.js';
import bwipjs from 'bwip-js';

const router = express.Router();

const generateSubjectId = () => 'SUBJ-' + Math.random().toString(36).substring(2, 8).toUpperCase();

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

// Register New Sample Endpoint
router.post('/register', authenticateToken, requirePermission('Create Sample', 'Sample Management'), async (req, res) => {
  try {
    const { gender, age, specimen_type, sample_volume, consent_template_id, consent_template_ids, container_type, container_count } = req.body;

    if (!gender || !age || !specimen_type || !sample_volume) {
      return res.status(400).json({ error: "Missing required fields for subject or specimen information" });
    }

    let selectedIds = [];
    if (Array.isArray(consent_template_ids)) {
      selectedIds = consent_template_ids;
    } else if (consent_template_id) {
      selectedIds = [consent_template_id];
    }

    if (selectedIds.length === 0) {
      return res.status(400).json({ error: "Consent template selection is required before sample registration." });
    }

    const firstTemplateId = selectedIds[0];

    const numericAge = parseInt(age, 10);
    const numericVolume = parseFloat(sample_volume);

    if (isNaN(numericAge) || numericAge < 0 || numericAge > 120) {
      return res.status(400).json({ error: "Invalid age format" });
    }
    if (isNaN(numericVolume) || numericVolume <= 0) {
      return res.status(400).json({ error: "Sample volume must be greater than zero" });
    }

    const allowedSpecimens = ["Whole Blood", "Serum", "Plasma", "Saliva", "Urine", "Tissue"];
    if (!allowedSpecimens.includes(specimen_type)) {
      return res.status(400).json({ error: `Specimen type must be one of: ${allowedSpecimens.join(', ')}` });
    }

    // Resolve consent template details
    const templateResult = await query("SELECT version FROM consent_templates WHERE template_id = ?", [firstTemplateId]);
    if (templateResult.rows.length === 0) {
      return res.status(400).json({ error: "Invalid consent template selected." });
    }
    const consent_version = templateResult.rows[0].version;

    const subject_id = req.body.subject_id || generateSubjectId();
    
    // Generate sequential Sample ID: AURA-SMP-YYYY-XXXXXX
    const currentYear = new Date().getFullYear();
    const countCheck = await query(
      "SELECT COUNT(*) as count FROM samples WHERE id LIKE ?", 
      [`AURA-SMP-${currentYear}-%`]
    );
    const nextNum = parseInt(countCheck.rows[0].count, 10) + 1;
    const sample_id = `AURA-SMP-${currentYear}-${String(nextNum).padStart(6, '0')}`;
    
    const now = new Date();
    const localDate = now.toLocaleDateString('en-CA'); 
    const localTime = now.toTimeString().split(' ')[0]; 
    const collection_datetime = `${localDate} ${localTime}`;

    const collector_id = req.user.userId;
    const lab_id = req.user.labId;

    // Fetch user details for audit logging
    const userResult = await query(`
      SELECT u.name, r.role_name as role
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE u.id = ?
    `, [collector_id]);
    
    const userRow = userResult.rows[0] || { name: "System", role: "Collection Staff" };
    const collectorName = userRow.name;
    const collectorRole = userRow.role;

    let labName = "Aura Biobank Admin Center";
    if (lab_id) {
      const labNameRes = await query("SELECT name FROM labs WHERE id = ?", [lab_id]);
      if (labNameRes.rows.length > 0) {
        labName = labNameRes.rows[0].name;
      }
    }
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";

    const finalContainerType = container_type || 'Tube';
    const finalContainerCount = container_count ? parseInt(container_count, 10) : 1;

    // Insert sample details with consent version details, no barcode generated at this point
    await query(
      `INSERT INTO samples (
        id, subject_id, gender, age, specimen_type, sample_volume, container_type, container_count,
        collection_date, collection_time, collection_datetime, lab_id, collector_id, 
        consent_id, consent_status, barcode_status, status, consent_version, consent_template_id, consent_template_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, 'Pending', 'Unassigned', 'Collected', ?, ?, ?)`,
      [
        sample_id, subject_id, gender, numericAge, specimen_type, numericVolume, finalContainerType, finalContainerCount,
        localDate, localTime, collection_datetime, lab_id, collector_id, consent_version,
        firstTemplateId, JSON.stringify(selectedIds)
      ]
    );

    // Register Log in user_activity_logs
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (?, ?, ?, ?, 'Sample Management', 'CREATE', 'Sample', ?, null, ?, ?)
    `, [
      collector_id, collectorName, collectorRole, labName, sample_id,
      `Registered sample ${sample_id} (Subject: ${subject_id}, Specimen: ${specimen_type}, Consent Version: ${consent_version}).`,
      clientIp
    ]);

    res.status(201).json({
      success: true,
      message: "Sample registered successfully",
      sample: {
        id: sample_id,
        subject_id,
        gender,
        age: numericAge,
        specimen_type,
        sample_volume: numericVolume,
        container_type: finalContainerType,
        container_count: finalContainerCount,
        collection_date: localDate,
        collection_time: localTime,
        collection_datetime,
        status: 'Collected',
        consent_status: 'Pending',
        barcode_status: 'Unassigned',
        lab_id,
        collector_name: collectorName,
        collector_role: collectorRole,
        consent_version,
        consent_template_id: firstTemplateId,
        consent_template_ids: selectedIds
      }
    });
  } catch (error) {
    console.error("Error registering sample:", error);
    res.status(500).json({ error: "Internal server error during sample registration" });
  }
});

// View Samples List
router.get('/', authenticateToken, requirePermission('View Sample', 'Sample Management'), async (req, res) => {
  try {
    const userCheck = await query("SELECT role_id FROM users WHERE id = ?", [req.user.userId]);
    const userRoleId = parseInt(userCheck.rows[0]?.role_id, 10);

    let sql = `
      SELECT s.*, 
             u.name as collector_name, 
             l.name as lab_name,
             COALESCE(c.verification_status, s.consent_status) as consent_status,
             COALESCE(c.consent_version, s.consent_version) as consent_version,
             c.consent_date,
             c.document_url,
             c.withdrawn_at,
             c.withdrawn_by,
             c.submitted_by,
             c.submitted_date,
             c.consent_type,
             b.barcode_value as barcode_text,
             b.qr_code_base64,
             b.code128_base64
      FROM samples s
      LEFT JOIN users u ON s.collector_id = u.id
      LEFT JOIN labs l ON s.lab_id = l.id
      LEFT JOIN consent c ON s.consent_id = c.id
      LEFT JOIN barcodes b ON s.id = b.sample_id AND b.status = 'Active'
    `;
    const params = [];

    // Business Rules:
    // 1. Collection Staff (role_id = 4) can only view their own samples
    // 2. Others (like Lab Tech / Courier / Biobank Staff) only see samples of their own lab, except Super Admin (role_id = 1)
    if (userRoleId === 4) {
      sql += " WHERE s.lab_id = ? AND s.collector_id = ?";
      params.push(req.user.labId, req.user.userId);
    } else if (req.user.labId) {
      sql += " WHERE s.lab_id = ?";
      params.push(req.user.labId);
    }

    sql += " ORDER BY s.created_at DESC";

    const result = await query(sql, params);
    res.json({
      success: true,
      samples: result.rows
    });
  } catch (error) {
    console.error("Error retrieving samples:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/samples/audit/:id - Retrieve history tracking logs for a specimen
router.get('/audit/:id', authenticateToken, requirePermission('View Sample', 'Sample Management'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Select from barcode_audit joined with users details
    const result = await query(`
      SELECT ba.audit_id, ba.action_type, ba.reason, ba.action_timestamp,
             u.name as performed_by_name, r.role_name as performed_by_role
      FROM barcode_audit ba
      LEFT JOIN users u ON ba.performed_by = u.id
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE ba.sample_id = ?
      ORDER BY ba.action_timestamp DESC
    `, [id]);

    res.json({
      success: true,
      logs: result.rows
    });
  } catch (error) {
    console.error("Error retrieving sample audit trace:", error);
    res.status(500).json({ error: "Internal server error retrieving history logs" });
  }
});

// GET /api/samples/public/:id - Public specimen tracking details (Bypasses JWT auth)
router.get('/public/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT s.id, s.specimen_type, s.sample_volume, s.collection_date, s.collection_time, s.status,
             l.name as lab_name, l.location_address as lab_location
      FROM samples s
      LEFT JOIN labs l ON s.lab_id = l.id
      WHERE s.id = ?
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Specimen tracking ID not found in system directory" });
    }

    res.json({
      success: true,
      sample: result.rows[0]
    });
  } catch (error) {
    console.error("Error retrieving public specimen details:", error);
    res.status(500).json({ error: "Internal server error during tracking retrieval" });
  }
});

export default router;
