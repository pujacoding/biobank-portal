import bwipjs from 'bwip-js';
import { query, getClient } from '../services/dbService.js';
import { checkUserPermission } from '../middleware/auth.js';

const generateConsentId = () => 'CNS-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

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
 * Fetch active consent templates
 */
export async function getTemplates(req, res, next) {
  try {
    const result = await query("SELECT * FROM consent_templates WHERE status = 'Active' ORDER BY consent_name ASC");
    res.json({ success: true, templates: result.rows });
  } catch (error) {
    next(error);
  }
}

/**
 * Fetch all consent templates (Super Admin only)
 */
export async function getAllTemplates(req, res, next) {
  try {
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: "Access Denied: Only Super Admin can view all templates." });
    }
    const result = await query("SELECT * FROM consent_templates ORDER BY created_at DESC");
    res.json({ success: true, templates: result.rows });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new consent template (Super Admin only)
 */
export async function createTemplate(req, res, next) {
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
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING template_id`,
      [name, code, typeof summary === 'object' ? JSON.stringify(summary) : summary, details, version, effective_date || new Date().toLocaleDateString('en-CA'), status || 'Active']
    );

    const newId = insertResult.lastID;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";

    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES ($1, $2, $3, 'Aura Biobank Admin Center', 'Consent Management', 'CREATE', 'Consent Template', $4, null, $5, $6)
    `, [
      req.user.userId, req.user.name || "Super Admin", req.user.role,
      String(newId), `Created consent template ${name} (${code}) version ${version}.`,
      clientIp
    ]);

    res.status(201).json({ success: true, template_id: newId });
  } catch (error) {
    if (error.message && error.message.includes('unique')) {
      return res.status(400).json({ error: "Consent code must be unique." });
    }
    next(error);
  }
}

/**
 * Update an existing consent template (Super Admin only)
 */
export async function updateTemplate(req, res, next) {
  try {
    if (req.user.role !== 'Super Admin') {
      return res.status(403).json({ error: "Access Denied: Only Super Admin can manage templates." });
    }
    const { id } = req.params;
    const { name, code, summary, details, version, effective_date, status } = req.body;

    if (!name || !code || !summary || !details || !version) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const oldCheck = await query("SELECT * FROM consent_templates WHERE template_id = $1", [id]);
    if (oldCheck.rows.length === 0) {
      return res.status(404).json({ error: "Template not found" });
    }
    const oldVal = oldCheck.rows[0];

    await query(
      `UPDATE consent_templates 
       SET consent_name = $1, consent_code = $2, consent_summary = $3, consent_details = $4, version = $5, effective_date = $6, status = $7
       WHERE template_id = $8`,
      [name, code, typeof summary === 'object' ? JSON.stringify(summary) : summary, details, version, effective_date, status, id]
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES ($1, $2, $3, 'Aura Biobank Admin Center', 'Consent Management', 'UPDATE', 'Consent Template', $4, $5, $6, $7)
    `, [
      req.user.userId, req.user.name || "Super Admin", req.user.role,
      String(id), JSON.stringify(oldVal), `Updated consent template ${name} (${code}) version ${version}.`,
      clientIp
    ]);

    res.json({ success: true, message: "Template updated successfully" });
  } catch (error) {
    next(error);
  }
}

/**
 * Submit consent documents for specimen
 */
export async function submitConsent(req, res, next) {
  const client = await getClient();
  try {
    const { sample_id, consent_version, consent_date, document_name, status } = req.body;

    if (!sample_id || !consent_version || !consent_date || !document_name) {
      return res.status(400).json({ error: "Missing required fields for consent submission" });
    }

    const finalStatus = status === 'Draft' ? 'Draft' : 'Submitted';

    // Transaction begin
    await client.query('BEGIN');

    // Check if sample exists
    const sampleCheck = await client.query("SELECT * FROM samples WHERE id = $1 FOR UPDATE", [sample_id]);
    if (sampleCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Sample not found" });
    }

    const sample = sampleCheck.rows[0];

    // Check if sample already has verified consent
    let isUpdatingDraft = false;
    let existingConsentId = null;
    if (sample.consent_id) {
      const existingConsent = await client.query("SELECT verification_status FROM consent WHERE id = $1", [sample.consent_id]);
      const currentStatus = existingConsent.rows[0]?.verification_status;
      if (currentStatus === 'Verified') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: "This sample already has verified consent." });
      }
      if (currentStatus === 'Draft') {
        isUpdatingDraft = true;
        existingConsentId = sample.consent_id;
      }
    }

    // Resolve consent template name to store as consent_type
    let consentType = "General Biobank Consent";
    if (sample.consent_template_ids) {
      try {
        const ids = JSON.parse(sample.consent_template_ids);
        if (Array.isArray(ids) && ids.length > 0) {
          const templatesRes = await client.query(
            `SELECT consent_name FROM consent_templates WHERE template_id = ANY($1::int[])`,
            [ids.map(Number)]
          );
          if (templatesRes.rows.length > 0) {
            consentType = templatesRes.rows.map(t => t.consent_name).join(', ');
          }
        }
      } catch (e) {
        console.error("Failed to parse consent_template_ids for consent_type:", e);
      }
    } else if (sample.consent_template_id) {
      const templateRes = await client.query("SELECT consent_name FROM consent_templates WHERE template_id = $1", [sample.consent_template_id]);
      if (templateRes.rows.length > 0) {
        consentType = templateRes.rows[0].consent_name;
      }
    }

    // Fetch user details for audit
    const userResult = await client.query(`
      SELECT u.name, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = $1
    `, [req.user.userId]);
    const userRow = userResult.rows[0] || { name: "System", role: "Lab Technician", lab_name: "" };
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";

    const consent_id = isUpdatingDraft ? existingConsentId : generateConsentId();
    const mockDocumentUrl = `/uploads/consent/${consent_id}_${document_name}`;
    const submittedDate = new Date().toLocaleDateString('en-CA');

    if (isUpdatingDraft) {
      // Update existing draft consent
      await client.query(
        `UPDATE consent 
         SET consent_version = $1, consent_date = $2, document_url = $3, submitted_by = $4, submitted_date = $5, consent_type = $6, verification_status = $7
         WHERE id = $8`,
        [consent_version, consent_date, mockDocumentUrl, userRow.name, submittedDate, consentType, finalStatus, consent_id]
      );
      
      // Update samples table
      await client.query(
        "UPDATE samples SET consent_status = $1 WHERE id = $2",
        [finalStatus, sample_id]
      );

      // Audit log to user_activity_logs
      await client.query(`
        INSERT INTO user_activity_logs (
          user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
        ) VALUES ($1, $2, $3, $4, 'Consent Management', 'UPDATE', 'Consent', $5, null, $6, $7)
      `, [
        req.user.userId, userRow.name, userRow.role, userRow.lab_name || "Aura Biobank Admin Center", consent_id,
        `Updated draft consent ${consent_id} (status: ${finalStatus}, type: ${consentType}) for sample ${sample_id}.`,
        clientIp
      ]);
    } else {
      // Create consent record
      await client.query(
        `INSERT INTO consent (id, subject_id, consent_version, consent_date, document_url, verification_status, submitted_by, submitted_date, consent_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [consent_id, sample.subject_id, consent_version, consent_date, mockDocumentUrl, finalStatus, userRow.name, submittedDate, consentType]
      );

      // Link consent to sample and transition consent_status to finalStatus
      await client.query(
        "UPDATE samples SET consent_id = $1, consent_status = $2 WHERE id = $3",
        [consent_id, finalStatus, sample_id]
      );

      // Audit log to user_activity_logs
      await client.query(`
        INSERT INTO user_activity_logs (
          user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
        ) VALUES ($1, $2, $3, $4, 'Consent Management', 'CREATE', 'Consent', $5, null, $6, $7)
      `, [
        req.user.userId, userRow.name, userRow.role, userRow.lab_name || "Aura Biobank Admin Center", consent_id,
        `Created consent ${consent_id} (status: ${finalStatus}, type: ${consentType}) for sample ${sample_id}.`,
        clientIp
      ]);
    }

    await client.query('COMMIT');

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
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Transition consent from Draft to Submitted
 */
export async function transitionConsent(req, res, next) {
  const client = await getClient();
  try {
    const { consent_id } = req.body;

    if (!consent_id) {
      return res.status(400).json({ error: "Consent ID is required" });
    }

    const allowedRoles = ['Super Admin', 'Collection Staff', 'Lab Admin', 'Lab Technician'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access Denied: You are not authorized to transition Draft consents to Submitted status." });
    }

    await client.query('BEGIN');

    const consentCheck = await client.query("SELECT * FROM consent WHERE id = $1 FOR UPDATE", [consent_id]);
    if (consentCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Consent record not found" });
    }

    const consent = consentCheck.rows[0];
    if (consent.verification_status !== 'Draft') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Only consents in 'Draft' status can be transitioned." });
    }

    const userResult = await client.query(`
      SELECT u.name, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = $1
    `, [req.user.userId]);
    const userRow = userResult.rows[0] || { name: "System", role: "Super Admin", lab_name: "" };
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
    const submittedDate = new Date().toLocaleDateString('en-CA');

    // Update consent verification status to 'Submitted'
    await client.query(
      "UPDATE consent SET verification_status = 'Submitted', submitted_by = $1, submitted_date = $2 WHERE id = $3",
      [userRow.name, submittedDate, consent_id]
    );

    // Update samples
    await client.query(
      "UPDATE samples SET consent_status = 'Submitted' WHERE consent_id = $1",
      [consent_id]
    );

    // Audit log
    await client.query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES ($1, $2, $3, $4, 'Consent Management', 'UPDATE', 'Consent', $5, 'Draft', 'Submitted', $6)
    `, [req.user.userId, userRow.name, userRow.role, userRow.lab_name || "Aura Biobank Admin Center", consent_id, clientIp]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Consent ${consent_id} transitioned successfully to 'Submitted'.`
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Verify or Reject consent (transistions sample state and generates barcode on verification)
 */
export async function verifyConsent(req, res, next) {
  const client = await getClient();
  try {
    const { consent_id, verification_status } = req.body;

    if (!consent_id || !verification_status) {
      return res.status(400).json({ error: "Consent ID and verification status are required" });
    }

    if (verification_status !== 'Verified' && verification_status !== 'Rejected') {
      return res.status(400).json({ error: "Verification status must be 'Verified' or 'Rejected'" });
    }

    await client.query('BEGIN');

    const consentCheck = await client.query("SELECT * FROM consent WHERE id = $1 FOR UPDATE", [consent_id]);
    if (consentCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Consent record not found" });
    }

    const oldConsent = consentCheck.rows[0];
    const currentStatus = oldConsent.verification_status;

    // Role-restriction: ONLY Super Admin can verify/reject Draft consents directly
    if (currentStatus === 'Draft' && req.user.role !== 'Super Admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: "Access Denied: Only Super Admin is authorized to verify or reject Draft consents directly." });
    }

    const requiredPermissionName = verification_status === 'Verified' ? 'Verify Consent' : 'Reject Consent';
    const isAuthorized = await checkUserPermission(req.user.userId, requiredPermissionName);

    if (!isAuthorized) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        error: `Access Denied: Required permission: '${requiredPermissionName}' in module 'Consent Management'` 
      });
    }

    // Update consent verification status
    await client.query(
      "UPDATE consent SET verification_status = $1 WHERE id = $2",
      [verification_status, consent_id]
    );

    // Fetch linked sample
    const sampleCheck = await client.query(`
      SELECT s.*, st.specimen_code
      FROM samples s
      LEFT JOIN specimen_types st ON s.specimen_type_id = st.id
      WHERE s.consent_id = $1 FOR UPDATE OF s
    `, [consent_id]);
    const sample = sampleCheck.rows[0];

    const userResult = await client.query(`
      SELECT u.name, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = $1
    `, [req.user.userId]);
    const userRow = userResult.rows[0] || { name: "System", role: "Lab Technician", lab_name: "" };
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
    const actionType = verification_status === 'Verified' ? 'APPROVE' : 'REJECT';

    if (sample && verification_status === 'Verified') {
      await client.query(
        "UPDATE samples SET consent_status = 'Verified', barcode_status = 'Generated', status = 'Barcode Generated' WHERE consent_id = $1",
        [consent_id]
      );

      // Generate barcode on the fly
      const sample_id = sample.id;
      const specimenCode = sample.specimen_code || 'SMP';
      const sampleIdParts = sample_id.split('-');
      const year = sampleIdParts[2] || new Date().getFullYear();
      const seqStr = sampleIdParts[3] || '000001';
      const seqNum = parseInt(seqStr, 10);
      const barcode_value = `${specimenCode}-${year}-${String(seqNum).padStart(4, '0')}`;
      const scanUrl = `http://localhost:5173/?scan=${sample_id}`;

      // Generate barcodes (QR Code encodes scanUrl, Code128 encodes barcode_value)
      const qrPng = await generateBarcodeBuffer('qrcode', scanUrl, { height: 40, width: 40 });
      const code128Png = await generateBarcodeBuffer('code128', barcode_value, { height: 12, includetext: true, textxalign: 'center' });

      const qr_code_base64 = 'data:image/png;base64,' + qrPng.toString('base64');
      const code128_base64 = 'data:image/png;base64,' + code128Png.toString('base64');

      // Clean up any existing barcodes for this sample/value first to prevent UNIQUE constraint failure
      await client.query("DELETE FROM barcodes WHERE barcode_value = $1 OR sample_id = $2", [barcode_value, sample_id]);

      // Create active barcode record (print_count = 1)
      const insertBarcode = await client.query(`
        INSERT INTO barcodes (
          sample_id, barcode_value, barcode_type, generated_by, print_count, status, qr_code_base64, code128_base64
        ) VALUES ($1, $2, 'Standard', $3, 1, 'Active', $4, $5) RETURNING barcode_id
      `, [sample_id, barcode_value, req.user.userId, qr_code_base64, code128_base64]);

      const final_barcode_id = insertBarcode.rows[0]?.barcode_id;

      // Insert initial generation action to barcode_audit
      await client.query(`
        INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
        VALUES ($1, $2, 'Barcode Generated', 'Initial barcode generation upon consent verification', $3)
      `, [sample_id, final_barcode_id, req.user.userId]);

      // Log barcode creation
      await client.query(`
        INSERT INTO user_activity_logs (
          user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
        ) VALUES ($1, $2, $3, $4, 'QR Management', 'CREATE', 'Barcode', $5, null, $6, $7)
      `, [
        req.user.userId, userRow.name, userRow.role, userRow.lab_name || "Aura Biobank Admin Center",
        String(final_barcode_id), `Generated active barcode ${barcode_value} for sample ${sample_id} upon consent verification.`,
        clientIp
      ]);

    } else if (sample && verification_status === 'Rejected') {
      await client.query(
        "UPDATE samples SET consent_status = 'Rejected', barcode_status = 'Unassigned', status = 'Collected' WHERE consent_id = $1"
      , [consent_id]);
    }

    // Audit log for consent status transition
    await client.query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES ($1, $2, $3, $4, 'Consent Management', $5, 'Consent', $6, $7, $8, $9)
    `, [
      req.user.userId, userRow.name, userRow.role, userRow.lab_name || "Aura Biobank Admin Center", 
      actionType, consent_id, JSON.stringify(oldConsent), JSON.stringify({ ...oldConsent, verification_status }),
      clientIp
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Consent verification status updated to ${verification_status}. Barcode generated: ${verification_status === 'Verified'}`
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Withdraw consent (Super Admin only, transitions sample and deactivates barcodes)
 */
export async function withdrawConsent(req, res, next) {
  const client = await getClient();
  try {
    const { sample_id } = req.body;

    if (!sample_id) {
      return res.status(400).json({ error: "Sample ID is required" });
    }

    if (req.user.role !== 'Super Admin' && req.user.role !== 'Lab Admin') {
      return res.status(403).json({ error: "Access Denied: Only Super Admin and Lab Admin are authorized to withdraw patient consent." });
    }

    await client.query('BEGIN');

    // Check if sample exists
    const sampleCheck = await client.query("SELECT * FROM samples WHERE id = $1 FOR UPDATE", [sample_id]);
    if (sampleCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Sample not found" });
    }

    const sample = sampleCheck.rows[0];

    if (!sample.consent_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "This sample does not have an associated consent record to withdraw." });
    }

    const userResult = await client.query(`
      SELECT u.name, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = $1
    `, [req.user.userId]);
    const userRow = userResult.rows[0] || { name: "System", role: "Super Admin", lab_name: "" };
    
    const now = new Date();
    const withdrawnAt = `${now.toLocaleDateString('en-CA')} ${now.toTimeString().split(' ')[0]}`;
    const withdrawnByName = userRow.name || "Super Admin";

    // Update consent verification status to 'Withdrawn'
    await client.query(
      "UPDATE consent SET verification_status = 'Withdrawn', withdrawn_at = $1, withdrawn_by = $2 WHERE id = $3",
      [withdrawnAt, withdrawnByName, sample.consent_id]
    );

    const isResearchPosition = ['Stored', 'Received', 'Shipped', 'In Transit', 'Allocated', 'Retrieved'].includes(sample.status);
    let logMsg = '';
    let responseMsg = '';

    if (isResearchPosition) {
      // Update sample consent status to 'Withdrawn' but preserve current status and barcode
      await client.query(
        "UPDATE samples SET consent_status = 'Withdrawn' WHERE id = $1",
        [sample_id]
      );
      logMsg = `Consent withdrawn for sample ${sample_id}. Sample is in research position (${sample.status}); location and barcode preserved but locked.`;
      responseMsg = `Consent successfully withdrawn for sample ${sample_id}. The specimen has been locked in its current position.`;
    } else {
      // Revert status to 'Collected', clear barcode status, and deactivate barcodes
      await client.query(
        "UPDATE samples SET consent_status = 'Withdrawn', barcode_status = 'Unassigned', status = 'Collected' WHERE id = $1",
        [sample_id]
      );

      // Deactivate active barcodes associated with this sample
      await client.query(
        "UPDATE barcodes SET status = 'Inactive' WHERE sample_id = $1 AND status = 'Active'",
        [sample_id]
      );

      // Fetch the deactivated barcode ID if any, for auditing
      const barcodeCheck = await client.query(
        "SELECT barcode_id FROM barcodes WHERE sample_id = $1 AND status = 'Inactive' ORDER BY generated_at DESC LIMIT 1",
        [sample_id]
      );

      if (barcodeCheck.rows.length > 0) {
        const barcodeId = barcodeCheck.rows[0].barcode_id;
        await client.query(`
          INSERT INTO barcode_audit (sample_id, barcode_id, action_type, reason, performed_by)
          VALUES ($1, $2, 'Barcode Deactivated', 'Consent withdrawn by patient', $3)
        `, [sample_id, barcodeId, req.user.userId]);
      }

      logMsg = `Consent withdrawn for sample ${sample_id}. Barcode deactivated and sample status set back to Collected.`;
      responseMsg = `Consent successfully withdrawn for sample ${sample_id}. Barcode has been deactivated.`;
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";

    // Audit log to user_activity_logs
    await client.query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES ($1, $2, $3, $4, 'Consent Management', 'UPDATE', 'Consent', $5, $6, $7, $8)
    `, [
      req.user.userId, userRow.name, userRow.role, userRow.lab_name || "Aura Biobank Admin Center", sample.consent_id,
      `Consent status updated to Withdrawn (withdrawn_by: ${withdrawnByName}, withdrawn_at: ${withdrawnAt})`,
      logMsg,
      clientIp
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: responseMsg
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}
