import express from 'express';
import bwipjs from 'bwip-js';
import { query } from '../database.js';
import { authenticateToken, requirePermission } from './auth.js';

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

const router = express.Router();
const generateConsentId = () => 'CNS-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

// Helper to check user permission dynamically
async function checkUserPermission(userId, permissionName) {
  try {
    const userCheck = await query("SELECT role_id FROM users WHERE id = ?", [userId]);
    if (userCheck.rows.length === 0) return false;
    const roleId = parseInt(userCheck.rows[0].role_id, 10);
    if (roleId === 1) return true; // Super Admin bypass

    const permCheck = await query(`
      SELECT 1 FROM user_permissions up
      JOIN permissions p ON up.permission_id = p.permission_id
      WHERE up.user_id = ? AND p.permission_name = ?
      UNION
      SELECT 1 FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.permission_id
      WHERE rp.role_id = ? AND p.permission_name = ?
    `, [userId, permissionName, roleId, permissionName]);

    return permCheck.rows.length > 0;
  } catch (err) {
    console.error("Helper permission check failed:", err);
    return false;
  }
}

// GET active consent templates for dropdown selection (anyone authenticated)
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const result = await query("SELECT * FROM consent_templates WHERE status = 'Active' ORDER BY consent_name ASC");
    res.json({ success: true, templates: result.rows });
  } catch (error) {
    console.error("Error fetching active templates:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET all consent templates (Super Admin only)
router.get('/templates/all', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: "Access Denied: Only Super Admin can view all templates." });
    }
    const result = await query("SELECT * FROM consent_templates ORDER BY created_at DESC");
    res.json({ success: true, templates: result.rows });
  } catch (error) {
    console.error("Error fetching all templates:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST create consent template (Super Admin only)
router.post('/templates', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: "Access Denied: Only Super Admin can manage templates." });
    }
    const { name, code, summary, details, version, effective_date, status } = req.body;
    if (!name || !code || !summary || !details || !version) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const insertResult = await query(
      `INSERT INTO consent_templates (consent_name, consent_code, consent_summary, consent_details, version, effective_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, code, summary, details, version, effective_date || new Date().toLocaleDateString('en-CA'), status || 'Active']
    );

    const newId = insertResult.lastID;

    // Log action to user_activity_logs
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (?, ?, ?, ?, 'Consent Management', 'CREATE', 'Consent Template', ?, null, ?, ?)
    `, [
      req.user.userId, req.user.name || "Super Admin", req.user.role, "Aura Biobank Admin Center",
      String(newId), `Created consent template ${name} (${code}) version ${version}.`,
      clientIp
    ]);

    res.status(201).json({ success: true, template_id: newId });
  } catch (error) {
    console.error("Error creating template:", error);
    if (error.message && error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: "Consent code must be unique." });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT update consent template (Super Admin only)
router.put('/templates/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: "Access Denied: Only Super Admin can manage templates." });
    }
    const { id } = req.params;
    const { name, code, summary, details, version, effective_date, status } = req.body;

    if (!name || !code || !summary || !details || !version) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get old template details for audit
    const oldCheck = await query("SELECT * FROM consent_templates WHERE template_id = ?", [id]);
    if (oldCheck.rows.length === 0) {
      return res.status(404).json({ error: "Template not found" });
    }
    const oldVal = oldCheck.rows[0];

    await query(
      `UPDATE consent_templates 
       SET consent_name = ?, consent_code = ?, consent_summary = ?, consent_details = ?, version = ?, effective_date = ?, status = ?
       WHERE template_id = ?`,
      [name, code, summary, details, version, effective_date, status, id]
    );

    // Log action to user_activity_logs
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (?, ?, ?, ?, 'Consent Management', 'UPDATE', 'Consent Template', ?, ?, ?, ?)
    `, [
      req.user.userId, req.user.name || "Super Admin", req.user.role, "Aura Biobank Admin Center",
      String(id), JSON.stringify(oldVal), `Updated consent template ${name} (${code}) version ${version}.`,
      clientIp
    ]);

    res.json({ success: true, message: "Template updated successfully" });
  } catch (error) {
    console.error("Error updating template:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Submit Consent details for a registered sample
router.post('/submit', authenticateToken, requirePermission('Create Consent', 'Consent Management'), async (req, res) => {
  try {
    const { sample_id, consent_version, consent_date, document_name, status } = req.body;

    if (!sample_id || !consent_version || !consent_date || !document_name) {
      return res.status(400).json({ error: "Missing required fields for consent submission" });
    }

    const finalStatus = status === 'Draft' ? 'Draft' : 'Submitted';

    // Check if sample exists
    const sampleCheck = await query("SELECT * FROM samples WHERE id = ?", [sample_id]);
    if (sampleCheck.rows.length === 0) {
      return res.status(404).json({ error: "Sample not found" });
    }

    const sample = sampleCheck.rows[0];

    // Check if sample already has verified consent
    if (sample.consent_id) {
      const existingConsent = await query("SELECT verification_status FROM consent WHERE id = ?", [sample.consent_id]);
      if (existingConsent.rows[0]?.verification_status === 'Verified') {
        return res.status(400).json({ error: "This sample already has verified consent." });
      }
    }

    // Resolve consent template name to store as consent_type
    let consentType = "General Biobank Consent";
    if (sample.consent_template_ids) {
      try {
        const ids = JSON.parse(sample.consent_template_ids);
        if (Array.isArray(ids) && ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          const templatesRes = await query(`SELECT consent_name FROM consent_templates WHERE template_id IN (${placeholders})`, ids);
          if (templatesRes.rows.length > 0) {
            consentType = templatesRes.rows.map(t => t.consent_name).join(', ');
          }
        }
      } catch (e) {
        console.error("Failed to parse consent_template_ids for consent_type:", e);
      }
    } else if (sample.consent_template_id) {
      const templateRes = await query("SELECT consent_name FROM consent_templates WHERE template_id = ?", [sample.consent_template_id]);
      if (templateRes.rows.length > 0) {
        consentType = templateRes.rows[0].consent_name;
      }
    }

    // Fetch user details for audit log and submitted_by
    const userResult = await query(`
      SELECT u.name, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = ?
    `, [req.user.userId]);
    const userRow = userResult.rows[0] || { name: "System", role: "Lab Technician", lab_name: "" };
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";

    // Generate new Consent ID
    const consent_id = generateConsentId();
    const mockDocumentUrl = `/uploads/consent/${consent_id}_${document_name}`;
    const submittedDate = new Date().toLocaleDateString('en-CA');

    // Create consent record
    await query(
      `INSERT INTO consent (id, subject_id, consent_version, consent_date, document_url, verification_status, submitted_by, submitted_date, consent_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [consent_id, sample.subject_id, consent_version, consent_date, mockDocumentUrl, finalStatus, userRow.name, submittedDate, consentType]
    );

    // Link consent to sample and transition consent_status to finalStatus (Draft or Submitted)
    await query(
      "UPDATE samples SET consent_id = ?, consent_status = ? WHERE id = ?",
      [consent_id, finalStatus, sample_id]
    );

    // Audit log to user_activity_logs
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (?, ?, ?, ?, 'Consent Management', 'CREATE', 'Consent', ?, null, ?, ?)
    `, [
      req.user.userId, userRow.name, userRow.role, userRow.lab_name || "Aura Biobank Admin Center", consent_id,
      `Created consent ${consent_id} (status: ${finalStatus}, type: ${consentType}) for sample ${sample_id}.`,
      clientIp
    ]);

    res.status(201).json({
      success: true,
      message: finalStatus === 'Draft' 
        ? "Consent saved as Draft successfully."
        : "Consent document submitted successfully. QR/Barcode generation is locked until consent verification.",
      consent: {
        id: consent_id,
        subject_id: sample.subject_id,
        consent_version,
        consent_date,
        document_url: mockDocumentUrl,
        verification_status: finalStatus,
        submitted_by: userRow.name,
        submitted_date: submittedDate,
        consent_type: consentType
      }
    });
  } catch (error) {
    console.error("Error submitting consent:", error);
    res.status(500).json({ error: "Internal server error during consent submission" });
  }
});

// POST /transition - Transition consent from Draft to Submitted (Super Admin only)
router.post('/transition', authenticateToken, async (req, res) => {
  try {
    const { consent_id } = req.body;

    if (!consent_id) {
      return res.status(400).json({ error: "Consent ID is required" });
    }

    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: "Access Denied: Only Super Admin is authorized to transition Draft consents to Submitted status." });
    }

    // Check if consent exists
    const consentCheck = await query("SELECT * FROM consent WHERE id = ?", [consent_id]);
    if (consentCheck.rows.length === 0) {
      return res.status(404).json({ error: "Consent record not found" });
    }

    const consent = consentCheck.rows[0];
    if (consent.verification_status !== 'Draft') {
      return res.status(400).json({ error: "Only consents in 'Draft' status can be transitioned." });
    }

    // Fetch user details for audit logging
    const userResult = await query(`
      SELECT u.name, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = ?
    `, [req.user.userId]);
    const userRow = userResult.rows[0] || { name: "System", role: "Super Admin", lab_name: "" };
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
    const submittedDate = new Date().toLocaleDateString('en-CA');

    // Update consent verification status to 'Submitted'
    await query(
      "UPDATE consent SET verification_status = 'Submitted', submitted_by = ?, submitted_date = ? WHERE id = ?",
      [userRow.name, submittedDate, consent_id]
    );

    // Update samples table
    await query(
      "UPDATE samples SET consent_status = 'Submitted' WHERE consent_id = ?",
      [consent_id]
    );

    // Audit log
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (?, ?, ?, ?, 'Consent Management', 'UPDATE', 'Consent', ?, 'Draft', 'Submitted', ?)
    `, [req.user.userId, userRow.name, userRow.role, userRow.lab_name || "Aura Biobank Admin Center", consent_id, clientIp]);

    res.json({
      success: true,
      message: `Consent ${consent_id} transitioned successfully to 'Submitted'.`
    });
  } catch (error) {
    console.error("Error transitioning consent:", error);
    res.status(500).json({ error: "Internal server error during consent transition" });
  }
});


// Verify Consent (Restricted by custom dynamic action-based permissions)
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const { consent_id, verification_status } = req.body;

    if (!consent_id || !verification_status) {
      return res.status(400).json({ error: "Consent ID and verification status are required" });
    }

    if (verification_status !== 'Verified' && verification_status !== 'Rejected') {
      return res.status(400).json({ error: "Verification status must be 'Verified' or 'Rejected'" });
    }

    // Check if consent exists
    const consentCheck = await query("SELECT * FROM consent WHERE id = ?", [consent_id]);
    if (consentCheck.rows.length === 0) {
      return res.status(404).json({ error: "Consent record not found" });
    }

    const oldConsent = consentCheck.rows[0];
    const currentStatus = oldConsent.verification_status;

    // Role-restriction: ONLY Super Admin can verify/reject Draft consents directly
    if (currentStatus === 'Draft' && req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: "Access Denied: Only Super Admin is authorized to verify or reject Draft consents directly." });
    }

    // Dynamic Permission Checks (if not Super Admin):
    const requiredPermissionName = verification_status === 'Verified' ? 'Verify Consent' : 'Reject Consent';
    const isAuthorized = await checkUserPermission(req.user.userId, requiredPermissionName);

    if (!isAuthorized) {
      return res.status(403).json({ 
        error: `Access Denied: Required permission: '${requiredPermissionName}' in module 'Consent Management'` 
      });
    }

    // Update consent verification status
    await query(
      "UPDATE consent SET verification_status = ? WHERE id = ?",
      [verification_status, consent_id]
    );

    // Fetch linked sample
    const sampleCheck = await query("SELECT * FROM samples WHERE consent_id = ?", [consent_id]);
    const sample = sampleCheck.rows[0];

    // Fetch operator details for audit log
    const userResult = await query(`
      SELECT u.name, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = ?
    `, [req.user.userId]);
    const userRow = userResult.rows[0] || { name: "System", role: "Lab Technician", lab_name: "" };
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
    const actionType = verification_status === 'Verified' ? 'APPROVE' : 'REJECT';

    let final_barcode_id = null;
    let qr_code_base64 = '';
    let code128_base64 = '';
    let barcode_value = '';

    if (sample && verification_status === 'Verified') {
      await query(
        "UPDATE samples SET consent_status = 'Verified', barcode_status = 'Generated', status = 'Barcode Generated' WHERE consent_id = ?"
      , [consent_id]);

      // Generate barcode on the fly
      const sample_id = sample.id;
      barcode_value = sample_id;
      const scanUrl = `http://localhost:5173/?scan=${sample_id}`;

      // Generate barcodes (QR Code encodes scanUrl, Code128 encodes barcode_value)
      const qrPng = await generateBarcodeBuffer('qrcode', scanUrl, { height: 40, width: 40 });
      const code128Png = await generateBarcodeBuffer('code128', barcode_value, { height: 12, includetext: true, textxalign: 'center' });

      qr_code_base64 = 'data:image/png;base64,' + qrPng.toString('base64');
      code128_base64 = 'data:image/png;base64,' + code128Png.toString('base64');

      // Clean up any existing barcodes for this sample/value first to prevent UNIQUE constraint failure
      await query("DELETE FROM barcodes WHERE barcode_value = ? OR sample_id = ?", [barcode_value, sample_id]);

      // Create active barcode record (print_count = 1)
      const insertBarcode = await query(`
        INSERT INTO barcodes (
          sample_id, barcode_value, barcode_type, generated_by, print_count, status, qr_code_base64, code128_base64
        ) VALUES (?, ?, 'Standard', ?, 1, 'Active', ?, ?)
      `, [sample_id, barcode_value, req.user.userId, qr_code_base64, code128_base64]);


      final_barcode_id = insertBarcode.lastID || null;
      if (!final_barcode_id) {
        const getNewBarcode = await query("SELECT barcode_id FROM barcodes WHERE sample_id = ? AND status = 'Active'", [sample_id]);
        final_barcode_id = getNewBarcode.rows[0]?.barcode_id;
      }

      // Insert initial generation action to barcode_audit
      await query(`
        INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
        VALUES (?, ?, 'Barcode Generated', 'Initial barcode generation upon consent verification', ?)
      `, [sample_id, final_barcode_id, req.user.userId]);

      // Log barcode creation
      await query(`
        INSERT INTO user_activity_logs (
          user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
        ) VALUES (?, ?, ?, ?, 'QR Management', 'CREATE', 'Barcode', ?, null, ?, ?)
      `, [
        req.user.userId, userRow.name, userRow.role, userRow.lab_name || "Aura Biobank Admin Center",
        String(final_barcode_id), `Generated active barcode ${barcode_value} for sample ${sample_id} upon consent verification.`,
        clientIp
      ]);

    } else if (sample && verification_status === 'Rejected') {
      await query(
        "UPDATE samples SET consent_status = 'Rejected', barcode_status = 'Unassigned', status = 'Collected' WHERE consent_id = ?"
      , [consent_id]);
    }

    // Audit log for consent status transition
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (?, ?, ?, ?, 'Consent Management', ?, 'Consent', ?, ?, ?, ?)
    `, [
      req.user.userId, userRow.name, userRow.role, userRow.lab_name || "Aura Biobank Admin Center", 
      actionType, consent_id, JSON.stringify(oldConsent), JSON.stringify({ ...oldConsent, verification_status }),
      clientIp
    ]);

    res.json({
      success: true,
      message: `Consent verification status updated to ${verification_status}. Barcode generated: ${verification_status === 'Verified'}`
    });
  } catch (error) {
    console.error("Error verifying consent:", error);
    res.status(500).json({ error: "Internal server error during verification" });
  }
});

// POST /withdraw - Withdraw patient consent and deactivate any active barcodes
router.post('/withdraw', authenticateToken, requirePermission('Verify Consent', 'Consent Management'), async (req, res) => {
  try {
    const { sample_id } = req.body;

    if (!sample_id) {
      return res.status(400).json({ error: "Sample ID is required" });
    }

    // Role restriction check
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: "Access Denied: Only Super Admin is authorized to withdraw patient consent." });
    }

    // Check if sample exists
    const sampleCheck = await query("SELECT * FROM samples WHERE id = ?", [sample_id]);
    if (sampleCheck.rows.length === 0) {
      return res.status(404).json({ error: "Sample not found" });
    }

    const sample = sampleCheck.rows[0];

    if (!sample.consent_id) {
      return res.status(400).json({ error: "This sample does not have an associated consent record to withdraw." });
    }

    // Fetch operator details for activity logging
    const userResult = await query(`
      SELECT u.name, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = ?
    `, [req.user.userId]);
    const userRow = userResult.rows[0] || { name: "System", role: "Super Admin", lab_name: "" };
    
    const now = new Date();
    const withdrawnAt = `${now.toLocaleDateString('en-CA')} ${now.toTimeString().split(' ')[0]}`;
    const withdrawnByName = userRow.name || "Super Admin";

    // Update consent verification status to 'Withdrawn'
    await query(
      "UPDATE consent SET verification_status = 'Withdrawn', withdrawn_at = ?, withdrawn_by = ? WHERE id = ?",
      [withdrawnAt, withdrawnByName, sample.consent_id]
    );

    // Update sample consent status to 'Withdrawn', barcode status to 'Unassigned', and sample status to 'Collected'
    await query(
      "UPDATE samples SET consent_status = 'Withdrawn', barcode_status = 'Unassigned', status = 'Collected' WHERE id = ?",
      [sample_id]
    );

    // Deactivate active barcodes associated with this sample
    await query(
      "UPDATE barcodes SET status = 'Inactive' WHERE sample_id = ? AND status = 'Active'",
      [sample_id]
    );

    // Fetch the deactivated barcode ID if any, for auditing
    const barcodeCheck = await query(
      "SELECT barcode_id FROM barcodes WHERE sample_id = ? AND status = 'Inactive' ORDER BY generated_at DESC LIMIT 1",
      [sample_id]
    );

    if (barcodeCheck.rows.length > 0) {
      const barcodeId = barcodeCheck.rows[0].barcode_id;
      await query(`
        INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
        VALUES (?, ?, 'Barcode Deactivated', 'Consent withdrawn by patient', ?)
      `, [sample_id, barcodeId, req.user.userId]);
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";

    // Audit log to user_activity_logs
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (?, ?, ?, ?, 'Consent Management', 'UPDATE', 'Consent', ?, ?, ?, ?)
    `, [
      req.user.userId, userRow.name, userRow.role, userRow.lab_name || "Aura Biobank Admin Center", sample.consent_id,
      `Consent status updated to Withdrawn (withdrawn_by: ${withdrawnByName}, withdrawn_at: ${withdrawnAt})`,
      `Consent withdrawn for sample ${sample_id}. Barcode deactivated and sample status set back to Collected.`,
      clientIp
    ]);

    res.json({
      success: true,
      message: `Consent successfully withdrawn for sample ${sample_id}. Barcode has been deactivated.`
    });
  } catch (error) {
    console.error("Error withdrawing consent:", error);
    res.status(500).json({ error: "Internal server error during consent withdrawal" });
  }
});

export default router;
