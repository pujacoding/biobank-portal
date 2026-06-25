import { query } from '../services/dbService.js';

const generateSubjectId = () => 'SUBJ-' + Math.random().toString(36).substring(2, 8).toUpperCase();

/**
 * Register a new specimen sample
 */
export async function registerSample(req, res, next) {
  try {
    console.log("req.body in registerSample:", req.body);
    let { gender, age, specimen_type_id, specimen_type, sample_volume, consent_template_id, consent_template_ids, container_type, container_count } = req.body;

    // Resolve specimen_type_id if missing but specimen_type is present
    if (!specimen_type_id && specimen_type) {
      const typeRes = await query("SELECT id FROM specimen_types WHERE LOWER(specimen_name) = LOWER($1)", [specimen_type.trim()]);
      if (typeRes.rows.length > 0) {
        specimen_type_id = typeRes.rows[0].id;
      }
    }

    // Resolve specimen_type if missing but specimen_type_id is present
    if (!specimen_type && specimen_type_id) {
      const typeRes = await query("SELECT specimen_name FROM specimen_types WHERE id = $1", [specimen_type_id]);
      if (typeRes.rows.length > 0) {
        specimen_type = typeRes.rows[0].specimen_name;
      }
    }

    if (!gender || !age || !specimen_type_id || !specimen_type || !sample_volume) {
      return res.status(400).json({ error: "Missing required fields for subject or specimen information" });
    }

    let selectedIds = [];
    if (Array.isArray(consent_template_ids) && consent_template_ids.length > 0) {
      selectedIds = consent_template_ids.map(String);
    } else if (consent_template_id) {
      selectedIds = [String(consent_template_id)];
    }

    if (selectedIds.length === 0) {
      // Auto-default to the first active consent template
      const activeTemplates = await query("SELECT template_id FROM consent_templates WHERE status = 'Active' ORDER BY template_id ASC LIMIT 1");
      if (activeTemplates.rows.length > 0) {
        selectedIds = [String(activeTemplates.rows[0].template_id)];
      } else {
        selectedIds = ['1']; // Fallback
      }
    }

    const firstTemplateId = parseInt(selectedIds[0], 10);
    const numericAge = parseInt(age, 10);
    const numericVolume = parseFloat(sample_volume);

    if (isNaN(numericAge) || numericAge < 0 || numericAge > 120) {
      return res.status(400).json({ error: "Invalid age format" });
    }
    if (isNaN(numericVolume) || numericVolume <= 0) {
      return res.status(400).json({ error: "Sample volume must be greater than zero" });
    }

    // Dynamic Specimen Type validation
    const specTypeCheck = await query("SELECT * FROM specimen_types WHERE id = $1 AND status = 'Active'", [specimen_type_id]);
    if (specTypeCheck.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or inactive specimen type selected." });
    }
    const selectedSpecType = specTypeCheck.rows[0];

    let resolvedSpecimenName = selectedSpecType.specimen_name;
    if (selectedSpecType.specimen_code === 'OTH' || selectedSpecType.specimen_name === 'Other') {
      if (!specimen_type || specimen_type.trim() === '' || specimen_type.trim() === 'Other') {
        return res.status(400).json({ error: "Please provide a custom specimen description for 'Other' type." });
      }
      resolvedSpecimenName = specimen_type.trim();
    }

    // Resolve consent template details
    const templateResult = await query("SELECT version FROM consent_templates WHERE template_id = $1", [firstTemplateId]);
    if (templateResult.rows.length === 0) {
      return res.status(400).json({ error: "Invalid consent template selected." });
    }
    const consent_version = templateResult.rows[0].version;

    const subject_id = req.body.subject_id || generateSubjectId();
    
    // Generate sequential Sample ID: AURA-SMP-YYYY-XXXXXX
    const currentYear = new Date().getFullYear();
    const countCheck = await query(
      "SELECT COUNT(*) as count FROM samples WHERE id LIKE $1", 
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
      WHERE u.id = $1
    `, [collector_id]);
    
    const userRow = userResult.rows[0] || { name: "System", role: "Collection Staff" };
    const collectorName = userRow.name;
    const collectorRole = userRow.role;

    let labName = "Aura Biobank Admin Center";
    if (lab_id) {
      const labNameRes = await query("SELECT name FROM labs WHERE id = $1", [lab_id]);
      if (labNameRes.rows.length > 0) {
        labName = labNameRes.rows[0].name;
      }
    }
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";

    const finalContainerType = container_type || 'Tube';
    const finalContainerCount = container_count ? parseInt(container_count, 10) : 1;

    // Insert sample details in a transaction-equivalent parameterized query
    await query(
      `INSERT INTO samples (
        id, subject_id, gender, age, specimen_type, specimen_type_id, sample_volume, container_type, container_count,
        collection_date, collection_time, collection_datetime, lab_id, collector_id, 
        consent_id, consent_status, barcode_status, status, consent_version, consent_template_id, consent_template_ids
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, null, 'Pending', 'Unassigned', 'Collected', $15, $16, $17)`,
      [
        sample_id, subject_id, gender, numericAge, resolvedSpecimenName, specimen_type_id, numericVolume, finalContainerType, finalContainerCount,
        localDate, localTime, collection_datetime, lab_id, collector_id,
        consent_version, firstTemplateId, JSON.stringify(selectedIds)
      ]
    );

    // Register Log in user_activity_logs
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES ($1, $2, $3, $4, 'Sample Management', 'CREATE', 'Sample', $5, null, $6, $7)
    `, [
      collector_id, collectorName, collectorRole, labName, sample_id,
      `Registered sample ${sample_id} (Subject: ${subject_id}, Specimen: ${resolvedSpecimenName}, Consent Version: ${consent_version}).`,
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
        specimen_type: resolvedSpecimenName,
        specimen_type_id,
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
    next(error);
  }
}

/**
 * Retrieve registered samples (scoped by RBAC criteria)
 */
export async function getSamples(req, res, next) {
  try {
    const userCheck = await query("SELECT role_id FROM users WHERE id = $1", [req.user.userId]);
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
             b.code128_base64,
             sh.shipment_destination
      FROM samples s
      LEFT JOIN users u ON s.collector_id = u.id
      LEFT JOIN labs l ON s.lab_id = l.id
      LEFT JOIN consent c ON s.consent_id = c.id
      LEFT JOIN barcodes b ON s.id = b.sample_id AND b.status = 'Active'
      LEFT JOIN (
        SELECT ss1.sample_id, sh1.destination as shipment_destination
        FROM shipment_samples ss1
        JOIN shipments sh1 ON ss1.shipment_id = sh1.id
        WHERE sh1.created_at = (
          SELECT MAX(sh2.created_at)
          FROM shipment_samples ss2
          JOIN shipments sh2 ON ss2.shipment_id = sh2.id
          WHERE ss2.sample_id = ss1.sample_id
        )
      ) sh ON s.id = sh.sample_id
    `;
    const params = [];

    // RBAC check: Collection staff see their own, laboratory members see lab-scoped, superadmin sees all
    if (userRoleId === 4) {
      sql += " WHERE s.lab_id = $1 AND s.collector_id = $2";
      params.push(req.user.labId, req.user.userId);
    } else if (req.user.labId) {
      sql += " WHERE s.lab_id = $1";
      params.push(req.user.labId);
    }

    sql += " ORDER BY s.created_at DESC";

    const result = await query(sql, params);
    const globalCountRes = await query("SELECT COUNT(*) as count FROM samples");
    const globalTotal = parseInt(globalCountRes.rows[0].count, 10);

    res.json({
      success: true,
      samples: result.rows,
      globalTotal: globalTotal
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve tracking trace history for a specific specimen ID
 */
export async function getSampleAudit(req, res, next) {
  try {
    const { id } = req.params;
    
    const result = await query(`
      SELECT ba.audit_id, ba.action_type, ba.reason, ba.action_timestamp,
             u.name as performed_by_name, r.role_name as performed_by_role
      FROM barcode_audit ba
      LEFT JOIN users u ON ba.performed_by = u.id
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE ba.sample_id = $1
      ORDER BY ba.action_timestamp DESC
    `, [id]);

    res.json({
      success: true,
      logs: result.rows
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Public endpoint to fetch tracking coordinates and status for specimen
 */
export async function getPublicSample(req, res, next) {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT s.id, s.specimen_type, s.sample_volume, s.collection_date, s.collection_time, s.status,
             l.name as lab_name, l.location_address as lab_location
      FROM samples s
      LEFT JOIN labs l ON s.lab_id = l.id
      WHERE s.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Specimen tracking ID not found in system directory" });
    }

    res.json({
      success: true,
      sample: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
}
