import bwipjs from 'bwip-js';
import { query, getClient } from '../services/dbService.js';

/**
 * Generate high-resolution Barcode & QR code image buffers using bwip-js
 */
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
 * Generate formatted Barcode Data URLs (Code 128 + QR Code)
 */
async function generateBarcodeImages(barcodeValue, sampleId) {
  const scanUrl = `http://localhost:5173/?scan=${encodeURIComponent(barcodeValue)}`;
  const qrPng = await generateBarcodeBuffer('qrcode', scanUrl, { height: 40, width: 40 });
  const code128Png = await generateBarcodeBuffer('code128', barcodeValue, {
    height: 12,
    includetext: true,
    textxalign: 'center'
  });

  return {
    qr_code_base64: 'data:image/png;base64,' + qrPng.toString('base64'),
    code128_base64: 'data:image/png;base64,' + code128Png.toString('base64')
  };
}

/**
 * Helper to log user compliance activities to user_activity_logs
 */
async function logActivity(client, userId, actionType, moduleName, entityType, entityId, oldVal, newVal, headers = {}, socket = {}) {
  try {
    const performer = await client.query(`
      SELECT u.name, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = $1
    `, [userId]);

    const user = performer.rows[0] || { name: "System", role: "Super Admin", lab_name: "Aura Biobank Admin Center" };
    const clientIp = headers['x-forwarded-for'] || socket?.remoteAddress || "";

    await client.query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      userId, user.name, user.role, user.lab_name || "Aura Biobank Admin Center",
      moduleName, actionType, entityType, String(entityId),
      oldVal ? (typeof oldVal === 'string' ? oldVal : JSON.stringify(oldVal)) : null,
      newVal ? (typeof newVal === 'string' ? newVal : JSON.stringify(newVal)) : null,
      clientIp
    ]);
  } catch (err) {
    console.error("Failed to write to user_activity_logs:", err);
  }
}

/**
 * Helper to log immutable barcode audit entry
 */
async function logBarcodeAudit(client, sampleId, barcodeId, barcodeValue, actionType, reason, performedBy, oldVal = null, newVal = null, relatedEntityId = null) {
  await client.query(`
    INSERT INTO barcode_audit (
      sample_id, barcode_id, barcode_value, action_type, reason, performed_by, old_value, new_value, related_entity_id, action_timestamp
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
  `, [
    sampleId,
    barcodeId || null,
    barcodeValue || null,
    actionType,
    reason || null,
    performedBy || null,
    oldVal ? (typeof oldVal === 'string' ? oldVal : JSON.stringify(oldVal)) : null,
    newVal ? (typeof newVal === 'string' ? newVal : JSON.stringify(newVal)) : null,
    relatedEntityId || null
  ]);
}

/**
 * Helper to generate standard Barcode String
 * Format: AURA-YYMMDD-XXXXXX
 */
function formatBarcodeValue(specimenCode, sequenceNumber, aliquotIndex = null, revisionIndex = null) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yy}${mm}${dd}`;
  const seqPart = String(sequenceNumber).padStart(6, '0');

  let code = `AURA-${datePart}-${seqPart}`;
  if (aliquotIndex !== null && aliquotIndex !== undefined) {
    code += `-A${String(aliquotIndex).padStart(2, '0')}`;
  }
  if (revisionIndex !== null && revisionIndex !== undefined && revisionIndex > 0) {
    code += `-R${revisionIndex}`;
  }
  return code;
}

// ==========================================
// 1. REGISTRY & DASHBOARD SUMMARY METRICS
// ==========================================

export async function getRegistry(req, res, next) {
  try {
    const {
      search = '',
      status = '',
      specimen_type = '',
      storage_location = '',
      startDate = '',
      endDate = '',
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Filters for Registry List
    const conditions = [];
    const params = [];
    let pIdx = 1;

    // Lab isolation check (Super Admin sees all)
    if (req.user.labId && req.user.role !== 'Super Admin') {
      conditions.push(`s.lab_id = $${pIdx++}`);
      params.push(req.user.labId);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        b.barcode_value ILIKE $${pIdx} OR 
        s.id ILIKE $${pIdx} OR 
        s.subject_id ILIKE $${pIdx} OR 
        b.storage_location ILIKE $${pIdx} OR
        s.location ILIKE $${pIdx}
      )`);
      params.push(q);
      pIdx++;
    }

    if (status && status !== 'ALL') {
      conditions.push(`UPPER(b.status) = $${pIdx++}`);
      params.push(status.toUpperCase());
    }

    if (specimen_type && specimen_type !== 'ALL') {
      conditions.push(`s.specimen_type = $${pIdx++}`);
      params.push(specimen_type);
    }

    if (storage_location && storage_location !== 'ALL') {
      conditions.push(`(b.storage_location ILIKE $${pIdx} OR s.location ILIKE $${pIdx})`);
      params.push(`%${storage_location}%`);
      pIdx++;
    }

    if (startDate) {
      conditions.push(`b.generated_at >= $${pIdx++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`b.generated_at <= $${pIdx++}`);
      params.push(endDate + ' 23:59:59');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count Total Matching Records
    const countSql = `
      SELECT COUNT(*) as total
      FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      ${whereClause}
    `;
    const countRes = await query(countSql, params);
    const totalRecords = parseInt(countRes.rows[0].total, 10);

    // Fetch Paginated Registry Rows
    const dataSql = `
      SELECT 
        b.barcode_id,
        b.barcode_value,
        b.barcode_type,
        b.barcode_format,
        b.sample_id,
        b.parent_barcode_id,
        b.parent_barcode_value,
        b.aliquot_index,
        COALESCE(b.volume, s.sample_volume) as volume,
        COALESCE(b.volume_unit, s.volume_unit, 'mL') as volume_unit,
        COALESCE(b.storage_location, s.location) as current_storage_location,
        b.status as barcode_status,
        b.print_count,
        b.generated_at,
        b.generated_by,
        u.name as generated_by_name,
        b.replacement_of,
        b.replacement_of_barcode_value,
        b.replaced_by,
        b.replaced_by_barcode_value,
        b.void_reason,
        b.voided_at,
        b.verified_at,
        b.qr_code_base64,
        b.code128_base64,
        s.subject_id as coded_participant_id,
        s.specimen_type,
        s.container_type,
        s.collection_date,
        s.collection_time,
        s.consent_status,
        s.parent_sample_id,
        l.name as lab_name
      FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      LEFT JOIN users u ON b.generated_by = u.id
      LEFT JOIN labs l ON s.lab_id = l.id
      ${whereClause}
      ORDER BY b.generated_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;
    params.push(limitNum, offset);

    const dataRes = await query(dataSql, params);

    // Compute Dashboard Summary Metrics
    let labFilterSql = '';
    const labFilterParams = [];
    if (req.user.labId && req.user.role !== 'Super Admin') {
      labFilterSql = 'JOIN samples s ON b.sample_id = s.id WHERE s.lab_id = $1';
      labFilterParams.push(req.user.labId);
    }

    const metricsSql = `
      SELECT
        COUNT(*) as total_barcodes,
        COUNT(CASE WHEN b.generated_at >= CURRENT_DATE THEN 1 END) as generated_today,
        COUNT(CASE WHEN b.print_count = 0 OR b.status = 'GENERATED' THEN 1 END) as pending_print,
        COUNT(CASE WHEN UPPER(b.status) = 'STORED' THEN 1 END) as stored_samples,
        COUNT(CASE WHEN UPPER(b.status) = 'IN_TRANSIT' THEN 1 END) as in_transit,
        COUNT(CASE WHEN UPPER(b.status) IN ('VOIDED', 'REPLACED', 'INACTIVE') THEN 1 END) as voided_replaced
      FROM barcodes b
      ${labFilterSql}
    `;
    const metricsRes = await query(metricsSql, labFilterParams);
    const metricsRow = metricsRes.rows[0] || {};

    res.json({
      success: true,
      summary: {
        totalBarcodes: parseInt(metricsRow.total_barcodes || 0, 10),
        generatedToday: parseInt(metricsRow.generated_today || 0, 10),
        pendingPrint: parseInt(metricsRow.pending_print || 0, 10),
        storedSamples: parseInt(metricsRow.stored_samples || 0, 10),
        inTransit: parseInt(metricsRow.in_transit || 0, 10),
        voidedReplaced: parseInt(metricsRow.voided_replaced || 0, 10)
      },
      pagination: {
        total: totalRecords,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalRecords / limitNum)
      },
      barcodes: dataRes.rows
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Backward-compatible Dashboard endpoint
 */
export async function getDashboard(req, res, next) {
  try {
    let labFilterSql = '';
    const labParams = [];
    if (req.user.labId && req.user.role !== 'Super Admin') {
      labFilterSql = 'JOIN samples s ON b.sample_id = s.id WHERE s.lab_id = $1';
      labParams.push(req.user.labId);
    }

    const metricsSql = `
      SELECT
        COUNT(CASE WHEN b.status NOT IN ('VOIDED', 'Inactive') THEN 1 END) as total_generated,
        COALESCE(SUM(b.print_count), 0) as total_printed,
        (SELECT COUNT(*) FROM barcode_audit ba 
         JOIN samples s ON ba.sample_id = s.id 
         WHERE ba.action_type IN ('BARCODE_REPRINTED', 'Barcode Reprinted')
         ${req.user.labId && req.user.role !== 'Super Admin' ? 'AND s.lab_id = $1' : ''}
        ) as total_reprinted,
        (SELECT COUNT(*) FROM samples s 
         WHERE s.status = 'Consent Verified' 
           AND NOT EXISTS (SELECT 1 FROM barcodes b2 WHERE b2.sample_id = s.id AND b2.status NOT IN ('VOIDED', 'Inactive'))
           ${req.user.labId && req.user.role !== 'Super Admin' ? 'AND s.lab_id = $1' : ''}
        ) as pending_generation
      FROM barcodes b
      ${labFilterSql}
    `;

    const metricsRes = await query(metricsSql, labParams);
    const m = metricsRes.rows[0];

    res.json({
      success: true,
      metrics: {
        totalGenerated: parseInt(m.total_generated || 0, 10),
        totalPrinted: parseInt(m.total_printed || 0, 10),
        totalReprinted: parseInt(m.total_reprinted || 0, 10),
        pendingGeneration: parseInt(m.pending_generation || 0, 10)
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Backward-compatible History endpoint
 */
export async function getHistory(req, res, next) {
  try {
    let sql = `
      SELECT b.barcode_id, b.sample_id, b.barcode_value, b.barcode_type, b.generated_at, b.print_count, b.status,
             b.qr_code_base64, b.code128_base64, b.storage_location,
             u.name as generated_by_name,
             s.consent_status,
             s.specimen_type,
             s.subject_id as coded_participant_id,
             (SELECT MAX(action_timestamp) 
              FROM barcode_audit ba 
              WHERE ba.barcode_id = b.barcode_id AND ba.action_type IN ('BARCODE_PRINTED', 'Barcode Printed', 'BARCODE_REPRINTED', 'Barcode Reprinted')) as last_printed_at
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

// ==========================================
// 2. ELIGIBLE SAMPLES FOR BARCODE GENERATION
// ==========================================

export async function getEligibleSamples(req, res, next) {
  try {
    let sql = `
      SELECT 
        s.id as sample_id,
        s.subject_id as coded_participant_id,
        COALESCE(c.verification_status, s.consent_status) as consent_status,
        s.specimen_type,
        s.specimen_type_id,
        s.sample_volume,
        COALESCE(s.volume_unit, 'mL') as volume_unit,
        s.container_type,
        s.container_count,
        s.collection_date,
        s.collection_time,
        s.collection_datetime,
        s.status as sample_status,
        s.parent_sample_id,
        s.aliquot_count,
        l.name as collection_site,
        b.barcode_value as active_barcode,
        b.barcode_id as active_barcode_id,
        b.status as active_barcode_status
      FROM samples s
      LEFT JOIN consent c ON s.consent_id = c.id
      LEFT JOIN labs l ON s.lab_id = l.id
      LEFT JOIN barcodes b ON s.id = b.sample_id AND b.status NOT IN ('VOIDED', 'Inactive')
    `;

    const params = [];
    if (req.user.labId && req.user.role !== 'Super Admin') {
      sql += ` WHERE s.lab_id = $1`;
      params.push(req.user.labId);
    }

    sql += ` ORDER BY s.created_at DESC LIMIT 200`;

    const result = await query(sql, params);

    res.json({
      success: true,
      samples: result.rows
    });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// 3. BARCODE GENERATION (Parent + Optional Aliquots)
// ==========================================

export async function generateBarcode(req, res, next) {
  const client = await getClient();
  try {
    const { sample_id, num_aliquots, aliquot_volume, volume_unit = 'mL' } = req.body;
    if (!sample_id) {
      return res.status(400).json({ error: "Sample ID is required" });
    }

    await client.query('BEGIN');

    // Fetch sample and verify consent
    let sql = `
      SELECT s.*, 
             COALESCE(c.verification_status, s.consent_status) as effective_consent_status, 
             st.specimen_code,
             l.name as lab_name
      FROM samples s
      LEFT JOIN consent c ON s.consent_id = c.id
      LEFT JOIN specimen_types st ON s.specimen_type_id = st.id
      LEFT JOIN labs l ON s.lab_id = l.id
      WHERE s.id = $1
      FOR UPDATE
    `;
    const params = [sample_id];
    if (req.user.labId && req.user.role !== 'Super Admin') {
      sql += " AND s.lab_id = $2";
      params.push(req.user.labId);
    }
    const sampleCheck = await client.query(sql, params);

    if (sampleCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Sample profile not found or access denied." });
    }

    const sample = sampleCheck.rows[0];

    // STRICT CONSENT VALIDATION
    if (sample.effective_consent_status === 'Withdrawn') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Barcode generation blocked: Sample has withdrawn consent." });
    }

    if (sample.effective_consent_status !== 'Submitted' && sample.effective_consent_status !== 'Verified') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: "Consent must be verified before specimen labels can be generated."
      });
    }

    // Check if active barcode already exists
    const activeBarcodeCheck = await client.query(
      "SELECT * FROM barcodes WHERE sample_id = $1 AND status NOT IN ('VOIDED', 'Inactive') FOR UPDATE",
      [sample_id]
    );

    if (activeBarcodeCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: "Barcode already generated and active for this sample. Use Replace if a new label is required.",
        barcode: activeBarcodeCheck.rows[0]
      });
    }

    // Determine sequence number from sample_id or current max
    const specimenCode = sample.specimen_code || 'SMP';
    const sampleIdParts = sample_id.split('-');
    const seqNum = parseInt(sampleIdParts[sampleIdParts.length - 1], 10) || (Math.floor(Math.random() * 900000) + 100000);

    // Generate unique parent barcode value
    let barcode_value = formatBarcodeValue(specimenCode, seqNum);
    
    // Concurrency / Duplicate check
    const dupCheck = await client.query("SELECT barcode_id FROM barcodes WHERE barcode_value = $1", [barcode_value]);
    if (dupCheck.rows.length > 0) {
      // Append unique suffix if collision
      barcode_value = `${barcode_value}-${Date.now().toString().slice(-4)}`;
    }

    // Generate barcode images
    const { qr_code_base64, code128_base64 } = await generateBarcodeImages(barcode_value, sample_id);

    // Insert Parent Barcode
    const insertResult = await client.query(`
      INSERT INTO barcodes (
        sample_id, barcode_value, barcode_type, barcode_format, volume, volume_unit, generated_by, print_count, status, qr_code_base64, code128_base64, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'GENERATED', $8, $9, CURRENT_TIMESTAMP)
      RETURNING barcode_id, barcode_value, generated_at, status, print_count
    `, [
      sample_id,
      barcode_value,
      'Standard',
      'CODE128_QR',
      sample.sample_volume,
      volume_unit,
      req.user.userId,
      qr_code_base64,
      code128_base64
    ]);

    const parentBarcode = insertResult.rows[0];

    // Update Sample record
    await client.query(`
      UPDATE samples 
      SET status = 'Barcode Generated', barcode_status = 'Generated', barcode_value = $1, volume_unit = $2 
      WHERE id = $3
    `, [barcode_value, volume_unit, sample_id]);

    // Log Audit Event
    await logBarcodeAudit(
      client,
      sample_id,
      parentBarcode.barcode_id,
      barcode_value,
      'BARCODE_GENERATED',
      'Initial specimen barcode generated',
      req.user.userId,
      null,
      { barcode_value, status: 'GENERATED' }
    );

    await logActivity(
      client,
      req.user.userId,
      'CREATE',
      'Barcode Manager',
      'Barcode',
      parentBarcode.barcode_id,
      null,
      { sample_id, barcode_value, status: 'GENERATED' },
      req.headers,
      req.socket
    );

    // If aliquots requested, generate child aliquots inside the same transaction
    const generatedAliquots = [];
    const aliquotCount = parseInt(num_aliquots, 10);
    const aliqVol = parseFloat(aliquot_volume) || (sample.sample_volume / (aliquotCount || 1));

    if (!isNaN(aliquotCount) && aliquotCount > 0) {
      for (let i = 1; i <= aliquotCount; i++) {
        const aliquotSampleId = `${sample_id}-A${String(i).padStart(2, '0')}`;
        const aliquotBarcodeValue = `${barcode_value}-A${String(i).padStart(2, '0')}`;

        // Generate images for aliquot
        const aliqImages = await generateBarcodeImages(aliquotBarcodeValue, aliquotSampleId);

        // Insert aliquot sample record
        await client.query(`
          INSERT INTO samples (
            id, subject_id, gender, age, specimen_type, specimen_type_id, sample_volume, volume_unit, container_type, container_count,
            collection_date, collection_time, collection_datetime, lab_id, collector_id, consent_id, consent_status,
            barcode_status, barcode_value, status, parent_sample_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11, $12, $13, $14, $15, $16, 'Generated', $17, 'Barcode Generated', $18)
          ON CONFLICT (id) DO UPDATE SET barcode_value = EXCLUDED.barcode_value, status = 'Barcode Generated'
        `, [
          aliquotSampleId,
          sample.subject_id,
          sample.gender,
          sample.age,
          sample.specimen_type,
          sample.specimen_type_id,
          aliqVol,
          volume_unit,
          sample.container_type || 'Tube',
          sample.collection_date,
          sample.collection_time,
          sample.collection_datetime,
          sample.lab_id,
          sample.collector_id,
          sample.consent_id,
          sample.consent_status,
          aliquotBarcodeValue,
          sample_id
        ]);

        // Insert aliquot barcode record
        const aliqBarcodeRes = await client.query(`
          INSERT INTO barcodes (
            sample_id, barcode_value, barcode_type, barcode_format, parent_barcode_id, parent_barcode_value, aliquot_index,
            volume, volume_unit, generated_by, print_count, status, qr_code_base64, code128_base64, generated_at
          ) VALUES ($1, $2, 'Aliquot', 'CODE128_QR', $3, $4, $5, $6, $7, $8, 0, 'GENERATED', $9, $10, CURRENT_TIMESTAMP)
          RETURNING barcode_id, barcode_value, generated_at, status
        `, [
          aliquotSampleId,
          aliquotBarcodeValue,
          parentBarcode.barcode_id,
          barcode_value,
          i,
          aliqVol,
          volume_unit,
          req.user.userId,
          aliqImages.qr_code_base64,
          aliqImages.code128_base64
        ]);

        const aliqBarcode = aliqBarcodeRes.rows[0];
        generatedAliquots.push({
          ...aliqBarcode,
          sample_id: aliquotSampleId,
          qr_code_base64: aliqImages.qr_code_base64,
          code128_base64: aliqImages.code128_base64
        });

        // Audit aliquot creation
        await logBarcodeAudit(
          client,
          aliquotSampleId,
          aliqBarcode.barcode_id,
          aliquotBarcodeValue,
          'ALIQUOT_CREATED',
          `Aliquot A${String(i).padStart(2, '0')} created from parent ${barcode_value}`,
          req.user.userId,
          null,
          { parent_barcode: barcode_value, volume: aliqVol }
        );
      }

      // Update parent sample aliquot count
      await client.query("UPDATE samples SET aliquot_count = $1 WHERE id = $2", [aliquotCount, sample_id]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Barcode generated successfully${generatedAliquots.length > 0 ? ` with ${generatedAliquots.length} aliquots` : ''}.`,
      barcode: {
        barcode_id: parentBarcode.barcode_id,
        sample_id,
        barcode_value,
        print_count: 0,
        status: 'GENERATED',
        qr_code_base64,
        code128_base64,
        generated_at: parentBarcode.generated_at
      },
      aliquots: generatedAliquots
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

// ==========================================
// 4. GENERATE ALIQUOTS FOR EXISTING BARCODE
// ==========================================

export async function generateAliquots(req, res, next) {
  const client = await getClient();
  try {
    const { parent_sample_id, num_aliquots, aliquot_volume, volume_unit = 'mL' } = req.body;
    if (!parent_sample_id || !num_aliquots || parseInt(num_aliquots, 10) <= 0) {
      return res.status(400).json({ error: "Parent sample ID and valid number of aliquots are required" });
    }

    const count = parseInt(num_aliquots, 10);
    const vol = parseFloat(aliquot_volume);

    if (isNaN(vol) || vol <= 0) {
      return res.status(400).json({ error: "Aliquot volume must be greater than zero" });
    }

    await client.query('BEGIN');

    // Retrieve parent sample & parent barcode
    const parentCheck = await client.query(`
      SELECT s.*, b.barcode_id as parent_barcode_id, b.barcode_value as parent_barcode_value, b.status as parent_status
      FROM samples s
      JOIN barcodes b ON s.id = b.sample_id AND b.status NOT IN ('VOIDED', 'Inactive')
      WHERE s.id = $1
      FOR UPDATE
    `, [parent_sample_id]);

    if (parentCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Parent sample or active parent barcode not found" });
    }

    const parent = parentCheck.rows[0];

    if (parent.consent_status === 'Withdrawn') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Aliquot generation blocked: Parent specimen has withdrawn consent" });
    }

    if (parent.parent_status === 'VOIDED' || parent.status === 'Disposed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Cannot create aliquots from a voided or disposed parent specimen" });
    }

    // Get current aliquot count to calculate starting index
    const existingAliqRes = await client.query(
      "SELECT COUNT(*) as count FROM barcodes WHERE parent_barcode_id = $1",
      [parent.parent_barcode_id]
    );
    const startIdx = parseInt(existingAliqRes.rows[0].count, 10) + 1;

    const createdAliquots = [];

    for (let i = 0; i < count; i++) {
      const idx = startIdx + i;
      const aliqSampleId = `${parent_sample_id}-A${String(idx).padStart(2, '0')}`;
      const aliqBarcodeValue = `${parent.parent_barcode_value}-A${String(idx).padStart(2, '0')}`;

      // Generate images
      const { qr_code_base64, code128_base64 } = await generateBarcodeImages(aliqBarcodeValue, aliqSampleId);

      // Insert sample
      await client.query(`
        INSERT INTO samples (
          id, subject_id, gender, age, specimen_type, specimen_type_id, sample_volume, volume_unit, container_type, container_count,
          collection_date, collection_time, collection_datetime, lab_id, collector_id, consent_id, consent_status,
          barcode_status, barcode_value, status, parent_sample_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11, $12, $13, $14, $15, $16, 'Generated', $17, 'Barcode Generated', $18)
        ON CONFLICT (id) DO NOTHING
      `, [
        aliqSampleId,
        parent.subject_id,
        parent.gender,
        parent.age,
        parent.specimen_type,
        parent.specimen_type_id,
        vol,
        volume_unit,
        parent.container_type || 'Tube',
        parent.collection_date,
        parent.collection_time,
        parent.collection_datetime,
        parent.lab_id,
        parent.collector_id,
        parent.consent_id,
        parent.consent_status,
        aliqBarcodeValue,
        parent_sample_id
      ]);

      // Insert barcode
      const bRes = await client.query(`
        INSERT INTO barcodes (
          sample_id, barcode_value, barcode_type, barcode_format, parent_barcode_id, parent_barcode_value, aliquot_index,
          volume, volume_unit, generated_by, print_count, status, qr_code_base64, code128_base64, generated_at
        ) VALUES ($1, $2, 'Aliquot', 'CODE128_QR', $3, $4, $5, $6, $7, $8, 0, 'GENERATED', $9, $10, CURRENT_TIMESTAMP)
        RETURNING barcode_id, barcode_value, generated_at, status
      `, [
        aliqSampleId,
        aliqBarcodeValue,
        parent.parent_barcode_id,
        parent.parent_barcode_value,
        idx,
        vol,
        volume_unit,
        req.user.userId,
        qr_code_base64,
        code128_base64
      ]);

      const aliqBarcode = bRes.rows[0];
      createdAliquots.push({
        ...aliqBarcode,
        sample_id: aliqSampleId,
        qr_code_base64,
        code128_base64
      });

      await logBarcodeAudit(
        client,
        aliqSampleId,
        aliqBarcode.barcode_id,
        aliqBarcodeValue,
        'ALIQUOT_CREATED',
        `Aliquot A${String(idx).padStart(2, '0')} derived from parent ${parent.parent_barcode_value}`,
        req.user.userId,
        null,
        { parent_barcode: parent.parent_barcode_value, volume: vol }
      );
    }

    // Update parent aliquot count
    await client.query(
      "UPDATE samples SET aliquot_count = COALESCE(aliquot_count, 0) + $1 WHERE id = $2",
      [count, parent_sample_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Successfully created ${count} aliquots.`,
      aliquots: createdAliquots
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

// ==========================================
// 5. BARCODE DETAILS & FULL LIFECYCLE TIMELINE
// ==========================================

export async function getBarcodeDetails(req, res, next) {
  try {
    const { identifier } = req.params;
    if (!identifier) {
      return res.status(400).json({ error: "Barcode or Sample ID is required" });
    }

    const decodedId = decodeURIComponent(identifier).trim();

    // Look up barcode by barcode_id, barcode_value, or sample_id
    const bCheck = await query(`
      SELECT 
        b.*,
        u.name as generated_by_name,
        v_u.name as voided_by_name,
        ver_u.name as verified_by_name,
        s.subject_id as coded_participant_id,
        s.specimen_type,
        s.sample_volume,
        COALESCE(s.volume_unit, b.volume_unit, 'mL') as volume_unit,
        s.container_type,
        s.container_count,
        s.collection_date,
        s.collection_time,
        s.collection_datetime,
        s.consent_status,
        s.parent_sample_id,
        s.location as sample_location,
        s.status as sample_status,
        l.name as lab_name,
        l.location_address as lab_address,
        ct.consent_name,
        ct.consent_code
      FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      LEFT JOIN users u ON b.generated_by = u.id
      LEFT JOIN users v_u ON b.voided_by = v_u.id
      LEFT JOIN users ver_u ON b.verified_by = ver_u.id
      LEFT JOIN labs l ON s.lab_id = l.id
      LEFT JOIN consent_templates ct ON s.consent_template_id = ct.template_id
      WHERE b.barcode_value = $1 OR s.id = $1 OR CAST(b.barcode_id AS VARCHAR) = $1
      ORDER BY b.generated_at DESC
      LIMIT 1
    `, [decodedId]);

    if (bCheck.rows.length === 0) {
      return res.status(404).json({ error: "Barcode not found." });
    }

    const barcode = bCheck.rows[0];

    // Fetch Aliquot Children if this is a parent barcode
    const aliquotsRes = await query(`
      SELECT b.barcode_id, b.barcode_value, b.sample_id, b.aliquot_index, b.volume, b.volume_unit, b.status, b.storage_location, b.generated_at
      FROM barcodes b
      WHERE b.parent_barcode_id = $1 OR b.parent_barcode_value = $2
      ORDER BY b.aliquot_index ASC
    `, [barcode.barcode_id, barcode.barcode_value]);

    // Fetch Full Audit Trail / Lifecycle History
    const auditRes = await query(`
      SELECT ba.*, u.name as performed_by_name, r.role_name as performed_by_role
      FROM barcode_audit ba
      LEFT JOIN users u ON ba.performed_by = u.id
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE ba.sample_id = $1 OR ba.barcode_id = $2 OR ba.barcode_value = $3
      ORDER BY ba.action_timestamp ASC
    `, [barcode.sample_id, barcode.barcode_id, barcode.barcode_value]);

    // Fetch Print Queue Status
    const queueRes = await query(`
      SELECT * FROM print_queue WHERE barcode_id = $1 ORDER BY queued_at DESC LIMIT 1
    `, [barcode.barcode_id]);

    res.json({
      success: true,
      barcode,
      aliquots: aliquotsRes.rows,
      timeline: auditRes.rows,
      printQueue: queueRes.rows[0] || null
    });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// 6. PRINT BARCODE EVENT
// ==========================================

export async function printBarcode(req, res, next) {
  const client = await getClient();
  try {
    const { sample_id, barcode_id, barcode_value } = req.body;
    if (!sample_id && !barcode_id && !barcode_value) {
      return res.status(400).json({ error: "Barcode identifier is required." });
    }

    await client.query('BEGIN');

    let sql = `
      SELECT b.*, s.lab_id, s.consent_status, s.specimen_type, s.subject_id
      FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE (b.barcode_id = $1 OR b.sample_id = $2 OR b.barcode_value = $3)
        AND b.status NOT IN ('VOIDED', 'Inactive')
      LIMIT 1
      FOR UPDATE
    `;
    const barcodeCheck = await client.query(sql, [barcode_id || null, sample_id || null, barcode_value || null]);

    if (barcodeCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "No active barcode label mapping found." });
    }

    const barcode = barcodeCheck.rows[0];

    // Increment print count & update status to PRINTED if GENERATED
    const newStatus = (barcode.status === 'GENERATED' || !barcode.status) ? 'PRINTED' : barcode.status;

    await client.query(`
      UPDATE barcodes 
      SET print_count = print_count + 1, status = $1 
      WHERE barcode_id = $2
    `, [newStatus, barcode.barcode_id]);

    // If print queue item exists, mark PRINTED
    await client.query(`
      UPDATE print_queue 
      SET status = 'PRINTED', printed_at = CURRENT_TIMESTAMP 
      WHERE barcode_id = $1 AND status = 'PENDING'
    `, [barcode.barcode_id]);

    // Audit Log
    await logBarcodeAudit(
      client,
      barcode.sample_id,
      barcode.barcode_id,
      barcode.barcode_value,
      'BARCODE_PRINTED',
      `Barcode label printed (Count: ${barcode.print_count + 1})`,
      req.user.userId,
      { print_count: barcode.print_count, status: barcode.status },
      { print_count: barcode.print_count + 1, status: newStatus }
    );

    await logActivity(
      client,
      req.user.userId,
      'PRINT',
      'Barcode Manager',
      'Barcode',
      barcode.barcode_id,
      barcode,
      { ...barcode, print_count: barcode.print_count + 1, status: newStatus },
      req.headers,
      req.socket
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: "Print logged successfully.",
      barcode: {
        ...barcode,
        print_count: barcode.print_count + 1,
        status: newStatus
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

// ==========================================
// 7. REPRINT WORKFLOW (Same specimen, same barcode)
// ==========================================

export async function reprintBarcode(req, res, next) {
  const client = await getClient();
  try {
    const { sample_id, barcode_id, barcode_value, reason, notes } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Reprint reason is required." });
    }

    if (reason === 'Other' && (!notes || !notes.trim())) {
      return res.status(400).json({ error: "Additional notes are required when reason is 'Other'." });
    }

    const fullReason = notes && notes.trim() ? `${reason.trim()} - ${notes.trim()}` : reason.trim();

    await client.query('BEGIN');

    let sql = `
      SELECT b.*, s.consent_status, s.lab_id
      FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE (b.barcode_id = $1 OR b.sample_id = $2 OR b.barcode_value = $3)
        AND b.status NOT IN ('VOIDED', 'Inactive')
      LIMIT 1
      FOR UPDATE
    `;
    const barcodeCheck = await client.query(sql, [barcode_id || null, sample_id || null, barcode_value || null]);

    if (barcodeCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "No active barcode label mapping found." });
    }

    const barcode = barcodeCheck.rows[0];

    if (barcode.consent_status === 'Withdrawn') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Reprint Blocked: Specimen has withdrawn consent." });
    }

    // Increment print count
    await client.query(`
      UPDATE barcodes 
      SET print_count = print_count + 1 
      WHERE barcode_id = $1
    `, [barcode.barcode_id]);

    // Audit Log
    await logBarcodeAudit(
      client,
      barcode.sample_id,
      barcode.barcode_id,
      barcode.barcode_value,
      'BARCODE_REPRINTED',
      `Reprint Reason: ${fullReason}`,
      req.user.userId,
      { print_count: barcode.print_count },
      { print_count: barcode.print_count + 1, reason: fullReason }
    );

    await logActivity(
      client,
      req.user.userId,
      'PRINT',
      'Barcode Manager',
      'Barcode',
      barcode.barcode_id,
      barcode,
      { ...barcode, print_count: barcode.print_count + 1, reprint_reason: fullReason },
      req.headers,
      req.socket
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: "Barcode reprint logged successfully.",
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

// ==========================================
// 8. SCAN & VERIFY WORKFLOW
// ==========================================

export async function scanAndVerify(req, res, next) {
  const client = await getClient();
  try {
    const { barcode_value } = req.body;
    if (!barcode_value || !barcode_value.trim()) {
      return res.status(400).json({ error: "Barcode scan input is required." });
    }

    const cleanCode = barcode_value.trim();

    await client.query('BEGIN');

    // Look up barcode by barcode_value or sample_id
    const bCheck = await client.query(`
      SELECT 
        b.*,
        s.id as sample_id,
        s.subject_id as coded_participant_id,
        s.specimen_type,
        s.sample_volume,
        COALESCE(s.volume_unit, b.volume_unit, 'mL') as volume_unit,
        s.container_type,
        COALESCE(b.storage_location, s.location) as storage_location,
        s.consent_status,
        s.parent_sample_id,
        l.name as lab_name,
        u.name as generated_by_name
      FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      LEFT JOIN labs l ON s.lab_id = l.id
      LEFT JOIN users u ON b.generated_by = u.id
      WHERE b.barcode_value = $1 OR s.id = $1
      ORDER BY b.generated_at DESC
      LIMIT 1
      FOR UPDATE
    `, [cleanCode]);

    if (bCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        notFound: true, 
        error: "Barcode not found." 
      });
    }

    const barcode = bCheck.rows[0];

    // Check if VOIDED
    if (barcode.status === 'VOIDED' || barcode.status === 'Inactive') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        isVoided: true,
        error: "WARNING: This barcode is VOIDED and is no longer valid for operational use.",
        barcode: {
          barcode_id: barcode.barcode_id,
          barcode_value: barcode.barcode_value,
          sample_id: barcode.sample_id,
          status: 'VOIDED',
          void_reason: barcode.void_reason,
          voided_at: barcode.voided_at,
          replaced_by: barcode.replaced_by_barcode_value
        }
      });
    }

    // Check if DISPOSED / EXHAUSTED / WITHDRAWN
    if (barcode.status === 'DISPOSED' || barcode.consent_status === 'Withdrawn') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        invalidState: true,
        error: `Specimen is in '${barcode.status}' state or consent is '${barcode.consent_status}'. Operational actions are restricted.`,
        barcode
      });
    }

    // Valid Barcode: transition to VERIFIED if was GENERATED or PRINTED or APPLIED
    let updatedStatus = barcode.status;
    if (['GENERATED', 'PRINTED', 'APPLIED'].includes(barcode.status)) {
      updatedStatus = 'VERIFIED';
      await client.query(`
        UPDATE barcodes 
        SET status = 'VERIFIED', verified_at = CURRENT_TIMESTAMP, verified_by = $1 
        WHERE barcode_id = $2
      `, [req.user.userId, barcode.barcode_id]);
    }

    // Log Verification Audit
    await logBarcodeAudit(
      client,
      barcode.sample_id,
      barcode.barcode_id,
      barcode.barcode_value,
      'BARCODE_VERIFIED',
      'Barcode successfully scanned and verified',
      req.user.userId,
      { status: barcode.status },
      { status: updatedStatus }
    );

    await logActivity(
      client,
      req.user.userId,
      'VERIFY',
      'Barcode Manager',
      'Barcode',
      barcode.barcode_id,
      { status: barcode.status },
      { status: updatedStatus },
      req.headers,
      req.socket
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: "Barcode verified successfully.",
      barcode: {
        ...barcode,
        status: updatedStatus,
        verified_at: new Date().toISOString()
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

// ==========================================
// 9. VOID BARCODE (Admin / Super Admin only)
// ==========================================

export async function voidBarcode(req, res, next) {
  const client = await getClient();
  try {
    const { barcode_id, barcode_value, reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "A valid reason for voiding this barcode is required." });
    }

    // Role check: Only Admin (role_id 2) or Super Admin (role_id 1)
    const userRoleCheck = await client.query("SELECT role_id FROM users WHERE id = $1", [req.user.userId]);
    const roleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);
    if (roleId !== 1 && roleId !== 2) {
      return res.status(403).json({ error: "Access denied. Only Lab Admins or Super Admins can void barcodes." });
    }

    await client.query('BEGIN');

    const bCheck = await client.query(`
      SELECT b.*, s.id as sample_id
      FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE (b.barcode_id = $1 OR b.barcode_value = $2)
      FOR UPDATE
    `, [barcode_id || null, barcode_value || null]);

    if (bCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Barcode not found." });
    }

    const barcode = bCheck.rows[0];

    if (barcode.status === 'VOIDED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Barcode is already voided." });
    }

    // Update status to VOIDED
    await client.query(`
      UPDATE barcodes 
      SET status = 'VOIDED', void_reason = $1, voided_at = CURRENT_TIMESTAMP, voided_by = $2 
      WHERE barcode_id = $3
    `, [reason.trim(), req.user.userId, barcode.barcode_id]);

    // Update sample barcode status
    await client.query("UPDATE samples SET barcode_status = 'Voided' WHERE id = $1", [barcode.sample_id]);

    // Remove from print queue if pending
    await client.query("DELETE FROM print_queue WHERE barcode_id = $1", [barcode.barcode_id]);

    // Audit Log
    await logBarcodeAudit(
      client,
      barcode.sample_id,
      barcode.barcode_id,
      barcode.barcode_value,
      'BARCODE_VOIDED',
      `Voided: ${reason.trim()}`,
      req.user.userId,
      { status: barcode.status },
      { status: 'VOIDED', void_reason: reason.trim() }
    );

    await logActivity(
      client,
      req.user.userId,
      'VOID',
      'Barcode Manager',
      'Barcode',
      barcode.barcode_id,
      barcode,
      { ...barcode, status: 'VOIDED', void_reason: reason.trim() },
      req.headers,
      req.socket
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Barcode ${barcode.barcode_value} has been permanently voided.`,
      barcode: {
        ...barcode,
        status: 'VOIDED',
        void_reason: reason.trim()
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

// ==========================================
// 10. REPLACE BARCODE (Admin / Super Admin only)
// ==========================================

export async function replaceBarcode(req, res, next) {
  const client = await getClient();
  try {
    const { barcode_id, barcode_value, reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "A valid reason for barcode replacement is required." });
    }

    // Role check: Only Admin (role_id 2) or Super Admin (role_id 1)
    const userRoleCheck = await client.query("SELECT role_id FROM users WHERE id = $1", [req.user.userId]);
    const roleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);
    if (roleId !== 1 && roleId !== 2) {
      return res.status(403).json({ error: "Access denied. Only Lab Admins or Super Admins can replace barcodes." });
    }

    await client.query('BEGIN');

    const bCheck = await client.query(`
      SELECT b.*, s.id as sample_id, s.subject_id, s.specimen_type, s.specimen_type_id, s.sample_volume, s.consent_status, st.specimen_code
      FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      LEFT JOIN specimen_types st ON s.specimen_type_id = st.id
      WHERE (b.barcode_id = $1 OR b.barcode_value = $2)
      FOR UPDATE
    `, [barcode_id || null, barcode_value || null]);

    if (bCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Active barcode to replace not found." });
    }

    const oldBarcode = bCheck.rows[0];

    if (oldBarcode.consent_status === 'Withdrawn') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Replacement Blocked: Specimen has withdrawn consent." });
    }

    // Determine replacement revision count
    const historyCountRes = await client.query(
      "SELECT COUNT(*) as count FROM barcodes WHERE replacement_of = $1 OR sample_id = $2",
      [oldBarcode.barcode_id, oldBarcode.sample_id]
    );
    const revIndex = parseInt(historyCountRes.rows[0].count, 10) + 1;

    // Build replacement barcode value
    const baseCode = oldBarcode.barcode_value.split('-R')[0];
    const newBarcodeValue = `${baseCode}-R${revIndex}`;

    // Generate images for replacement
    const { qr_code_base64, code128_base64 } = await generateBarcodeImages(newBarcodeValue, oldBarcode.sample_id);

    // 1. Insert new replacement barcode
    const insertNewRes = await client.query(`
      INSERT INTO barcodes (
        sample_id, barcode_value, barcode_type, barcode_format, parent_barcode_id, parent_barcode_value, aliquot_index,
        volume, volume_unit, storage_location, replacement_of, replacement_of_barcode_value, generated_by, print_count, status,
        qr_code_base64, code128_base64, generated_at
      ) VALUES ($1, $2, 'Replacement', 'CODE128_QR', $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 'GENERATED', $12, $13, CURRENT_TIMESTAMP)
      RETURNING barcode_id, barcode_value, generated_at, status
    `, [
      oldBarcode.sample_id,
      newBarcodeValue,
      oldBarcode.parent_barcode_id,
      oldBarcode.parent_barcode_value,
      oldBarcode.aliquot_index,
      oldBarcode.volume || oldBarcode.sample_volume,
      oldBarcode.volume_unit || 'mL',
      oldBarcode.storage_location,
      oldBarcode.barcode_id,
      oldBarcode.barcode_value,
      req.user.userId,
      qr_code_base64,
      code128_base64
    ]);

    const newBarcode = insertNewRes.rows[0];

    // 2. Void old barcode and point replaced_by to new barcode
    await client.query(`
      UPDATE barcodes 
      SET status = 'VOIDED', replaced_by = $1, replaced_by_barcode_value = $2, void_reason = $3, voided_at = CURRENT_TIMESTAMP, voided_by = $4 
      WHERE barcode_id = $5
    `, [newBarcode.barcode_id, newBarcodeValue, `Replaced by ${newBarcodeValue}: ${reason.trim()}`, req.user.userId, oldBarcode.barcode_id]);

    // 3. Update sample barcode reference
    await client.query("UPDATE samples SET barcode_value = $1, barcode_status = 'Generated' WHERE id = $2", [newBarcodeValue, oldBarcode.sample_id]);

    // 4. Record Audits
    await logBarcodeAudit(
      client,
      oldBarcode.sample_id,
      oldBarcode.barcode_id,
      oldBarcode.barcode_value,
      'BARCODE_VOIDED',
      `Replaced by ${newBarcodeValue}: ${reason.trim()}`,
      req.user.userId,
      { status: oldBarcode.status },
      { status: 'VOIDED', replaced_by: newBarcodeValue }
    );

    await logBarcodeAudit(
      client,
      oldBarcode.sample_id,
      newBarcode.barcode_id,
      newBarcodeValue,
      'BARCODE_REPLACED',
      `Generated replacement for ${oldBarcode.barcode_value}. Reason: ${reason.trim()}`,
      req.user.userId,
      { replacement_of: oldBarcode.barcode_value },
      { replacement: newBarcodeValue }
    );

    await logBarcodeAudit(
      client,
      oldBarcode.sample_id,
      newBarcode.barcode_id,
      newBarcodeValue,
      'BARCODE_GENERATED',
      'Initial generation for replacement barcode',
      req.user.userId,
      null,
      { barcode_value: newBarcodeValue, status: 'GENERATED' }
    );

    await logActivity(
      client,
      req.user.userId,
      'REPLACE',
      'Barcode Manager',
      'Barcode',
      newBarcode.barcode_id,
      oldBarcode,
      { ...newBarcode, replacement_of: oldBarcode.barcode_value, reason: reason.trim() },
      req.headers,
      req.socket
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Barcode replaced successfully with new identifier ${newBarcodeValue}.`,
      oldBarcode: {
        barcode_id: oldBarcode.barcode_id,
        barcode_value: oldBarcode.barcode_value,
        status: 'VOIDED'
      },
      newBarcode: {
        barcode_id: newBarcode.barcode_id,
        sample_id: oldBarcode.sample_id,
        barcode_value: newBarcodeValue,
        status: 'GENERATED',
        qr_code_base64,
        code128_base64,
        generated_at: newBarcode.generated_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

// Backward-compatible regenerateBarcode wrapper
export async function regenerateBarcode(req, res, next) {
  return replaceBarcode(req, res, next);
}

// ==========================================
// 11. INVENTORY STORAGE INTEGRATION
// ==========================================

export async function assignStorage(req, res, next) {
  const client = await getClient();
  try {
    const { barcode_value, location, freezer, rack, box, position, notes } = req.body;
    if (!barcode_value) {
      return res.status(400).json({ error: "Barcode ID is required." });
    }

    // Construct standardized location string if hierarchy fields passed
    let formattedLocation = location;
    if (!formattedLocation && (freezer || rack || box || position)) {
      formattedLocation = `${freezer || 'ULT-03'} > ${rack || 'Rack A'} > ${box || 'Box 01'} > Position ${position || 'A1'}`;
    }

    if (!formattedLocation || !formattedLocation.trim()) {
      return res.status(400).json({ error: "Storage coordinates are required." });
    }

    await client.query('BEGIN');

    // 1. Check if barcode exists and is active
    const bCheck = await client.query(`
      SELECT b.*, s.id as sample_id, s.consent_status, COALESCE(b.storage_location, s.location) as old_location
      FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE b.barcode_value = $1 OR s.id = $1
      FOR UPDATE
    `, [barcode_value.trim()]);

    if (bCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Barcode not found." });
    }

    const barcode = bCheck.rows[0];

    if (barcode.status === 'VOIDED' || barcode.consent_status === 'Withdrawn') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "Cannot assign storage to a voided specimen or withdrawn consent." });
    }

    // 2. OCCUPANCY & COLLISION CHECK: No silent overwriting!
    const occCheck = await client.query(`
      SELECT b.barcode_value, b.sample_id
      FROM barcodes b
      WHERE (b.storage_location = $1 OR b.storage_location ILIKE $1)
        AND b.barcode_id != $2
        AND b.status NOT IN ('VOIDED', 'DISPOSED', 'EXHAUSTED', 'Inactive')
      LIMIT 1
    `, [formattedLocation.trim(), barcode.barcode_id]);

    if (occCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        error: `Position is already occupied by active specimen: ${occCheck.rows[0].barcode_value}. Please select an empty slot.` 
      });
    }

    const isRelocation = !!barcode.old_location && barcode.old_location !== 'Unassigned';
    const actionName = isRelocation ? 'STORAGE_MOVED' : 'STORAGE_ASSIGNED';

    // 3. Update Barcode & Sample records
    await client.query(`
      UPDATE barcodes 
      SET storage_location = $1, status = 'STORED' 
      WHERE barcode_id = $2
    `, [formattedLocation.trim(), barcode.barcode_id]);

    await client.query(`
      UPDATE samples 
      SET location = $1, status = 'Stored', retrieval_status = 'Stored' 
      WHERE id = $2
    `, [formattedLocation.trim(), barcode.sample_id]);

    // 4. Audit Log
    const auditReason = isRelocation 
      ? `Relocated from ${barcode.old_location} to ${formattedLocation.trim()}${notes ? ` (${notes})` : ''}`
      : `Stored at ${formattedLocation.trim()}${notes ? ` (${notes})` : ''}`;

    await logBarcodeAudit(
      client,
      barcode.sample_id,
      barcode.barcode_id,
      barcode.barcode_value,
      actionName,
      auditReason,
      req.user.userId,
      { location: barcode.old_location },
      { location: formattedLocation.trim() }
    );

    await logActivity(
      client,
      req.user.userId,
      isRelocation ? 'MOVE' : 'STORE',
      'Inventory Storage',
      'Specimen',
      barcode.barcode_id,
      { location: barcode.old_location },
      { location: formattedLocation.trim(), status: 'STORED' },
      req.headers,
      req.socket
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Storage location successfully assigned for ${barcode.barcode_value}.`,
      location: formattedLocation.trim(),
      barcode: {
        ...barcode,
        storage_location: formattedLocation.trim(),
        status: 'STORED'
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

// ==========================================
// 12. SHIPMENT INTEGRATION
// ==========================================

export async function addToShipment(req, res, next) {
  const client = await getClient();
  try {
    const { barcode_value, shipment_id, destination } = req.body;
    if (!barcode_value) {
      return res.status(400).json({ error: "Barcode value is required." });
    }

    await client.query('BEGIN');

    // 1. Verify barcode eligibility
    const bCheck = await client.query(`
      SELECT b.*, s.id as sample_id, s.consent_status
      FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE b.barcode_value = $1 OR s.id = $1
      FOR UPDATE
    `, [barcode_value.trim()]);

    if (bCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Specimen barcode not found." });
    }

    const barcode = bCheck.rows[0];

    if (['VOIDED', 'DISPOSED', 'EXHAUSTED', 'Inactive'].includes(barcode.status) || barcode.consent_status === 'Withdrawn') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Cannot add specimen to shipment: Status is '${barcode.status}' or consent is '${barcode.consent_status}'.` 
      });
    }

    // 2. Resolve or create shipment
    let targetShipmentId = shipment_id;
    if (!targetShipmentId) {
      targetShipmentId = 'SHP-' + Date.now();
      await client.query(`
        INSERT INTO shipments (id, origin_lab_id, destination, status, shipped_at)
        VALUES ($1, $2, $3, 'In Transit', CURRENT_TIMESTAMP)
      `, [targetShipmentId, req.user.labId || 1, destination || 'AURA Central Biobank']);
    }

    // 3. Add to shipment_samples
    await client.query(`
      INSERT INTO shipment_samples (shipment_id, sample_id)
      VALUES ($1, $2)
      ON CONFLICT (shipment_id, sample_id) DO NOTHING
    `, [targetShipmentId, barcode.sample_id]);

    // 4. Update status to IN_TRANSIT
    await client.query("UPDATE barcodes SET status = 'IN_TRANSIT' WHERE barcode_id = $1", [barcode.barcode_id]);
    await client.query("UPDATE samples SET status = 'Shipped' WHERE id = $1", [barcode.sample_id]);

    // 5. Audit Log
    await logBarcodeAudit(
      client,
      barcode.sample_id,
      barcode.barcode_id,
      barcode.barcode_value,
      'SHIPMENT_ADDED',
      `Added to cargo shipment: ${targetShipmentId}`,
      req.user.userId,
      { status: barcode.status },
      { status: 'IN_TRANSIT', shipment_id: targetShipmentId }
    );

    await logActivity(
      client,
      req.user.userId,
      'SHIP',
      'Shipments',
      'Barcode',
      barcode.barcode_id,
      null,
      { shipment_id: targetShipmentId, barcode_value: barcode.barcode_value, status: 'IN_TRANSIT' },
      req.headers,
      req.socket
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Specimen ${barcode.barcode_value} added to shipment ${targetShipmentId}.`,
      shipmentId: targetShipmentId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

// ==========================================
// 13. PRINT QUEUE MANAGEMENT
// ==========================================

export async function getPrintQueue(req, res, next) {
  try {
    const { status = 'ALL' } = req.query;
    let sql = `
      SELECT 
        pq.*,
        b.barcode_value,
        b.barcode_format,
        b.print_count,
        b.qr_code_base64,
        b.code128_base64,
        s.specimen_type,
        s.sample_volume,
        s.volume_unit,
        s.collection_date,
        s.subject_id as coded_participant_id,
        u.name as queued_by_name
      FROM print_queue pq
      JOIN barcodes b ON pq.barcode_id = b.barcode_id
      JOIN samples s ON pq.sample_id = s.id
      LEFT JOIN users u ON pq.queued_by = u.id
    `;

    const params = [];
    if (status && status !== 'ALL') {
      sql += ` WHERE UPPER(pq.status) = $1`;
      params.push(status.toUpperCase());
    }

    sql += ` ORDER BY pq.queued_at DESC LIMIT 100`;

    const result = await query(sql, params);

    res.json({
      success: true,
      queue: result.rows
    });
  } catch (error) {
    next(error);
  }
}

export async function addToPrintQueue(req, res, next) {
  const client = await getClient();
  try {
    const { barcode_ids, copies = 1, notes } = req.body;
    if (!barcode_ids || !Array.isArray(barcode_ids) || barcode_ids.length === 0) {
      return res.status(400).json({ error: "Array of barcode IDs is required." });
    }

    await client.query('BEGIN');

    const added = [];
    for (const bId of barcode_ids) {
      const bRes = await client.query(
        "SELECT barcode_id, sample_id, barcode_value FROM barcodes WHERE barcode_id = $1 AND status NOT IN ('VOIDED', 'Inactive')",
        [bId]
      );
      if (bRes.rows.length > 0) {
        const item = bRes.rows[0];
        const insRes = await client.query(`
          INSERT INTO print_queue (barcode_id, sample_id, copies, status, queued_by, notes, queued_at)
          VALUES ($1, $2, $3, 'PENDING', $4, $5, CURRENT_TIMESTAMP)
          RETURNING *
        `, [item.barcode_id, item.sample_id, Math.max(1, parseInt(copies, 10) || 1), req.user.userId, notes || null]);

        added.push(insRes.rows[0]);
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: `Added ${added.length} item(s) to the Print Queue.`,
      queueItems: added
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

export async function processPrintQueue(req, res, next) {
  const client = await getClient();
  try {
    const { queue_ids, action = 'PRINT' } = req.body;
    if (!queue_ids || !Array.isArray(queue_ids) || queue_ids.length === 0) {
      return res.status(400).json({ error: "Queue IDs array is required." });
    }

    await client.query('BEGIN');

    for (const qId of queue_ids) {
      const qCheck = await client.query("SELECT * FROM print_queue WHERE id = $1 FOR UPDATE", [qId]);
      if (qCheck.rows.length > 0) {
        const qItem = qCheck.rows[0];
        if (action === 'PRINT') {
          await client.query(
            "UPDATE print_queue SET status = 'PRINTED', printed_at = CURRENT_TIMESTAMP WHERE id = $1",
            [qId]
          );
          await client.query(
            "UPDATE barcodes SET print_count = print_count + $1, status = 'PRINTED' WHERE barcode_id = $2",
            [qItem.copies, qItem.barcode_id]
          );
          await logBarcodeAudit(
            client,
            qItem.sample_id,
            qItem.barcode_id,
            null,
            'BARCODE_PRINTED',
            `Batch print from queue (Copies: ${qItem.copies})`,
            req.user.userId
          );
        } else if (action === 'FAIL') {
          await client.query("UPDATE print_queue SET status = 'FAILED' WHERE id = $1", [qId]);
        }
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Print queue batch processed successfully.`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

export async function deletePrintQueueItem(req, res, next) {
  try {
    const { id } = req.params;
    await query("DELETE FROM print_queue WHERE id = $1", [id]);
    res.json({ success: true, message: "Queue item removed." });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// 14. AUDIT HISTORY QUERY
// ==========================================

export async function getAuditHistory(req, res, next) {
  try {
    const {
      search = '',
      action_type = '',
      startDate = '',
      endDate = '',
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        ba.sample_id ILIKE $${pIdx} OR 
        ba.barcode_value ILIKE $${pIdx} OR 
        ba.reason ILIKE $${pIdx} OR
        u.name ILIKE $${pIdx}
      )`);
      params.push(q);
      pIdx++;
    }

    if (action_type && action_type !== 'ALL') {
      conditions.push(`ba.action_type = $${pIdx++}`);
      params.push(action_type);
    }

    if (startDate) {
      conditions.push(`ba.action_timestamp >= $${pIdx++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`ba.action_timestamp <= $${pIdx++}`);
      params.push(endDate + ' 23:59:59');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(`
      SELECT COUNT(*) as total 
      FROM barcode_audit ba 
      LEFT JOIN users u ON ba.performed_by = u.id 
      ${whereClause}
    `, params);
    const total = parseInt(countRes.rows[0].total, 10);

    const dataSql = `
      SELECT 
        ba.*,
        u.name as performed_by_name,
        r.role_name as performed_by_role,
        s.specimen_type,
        s.subject_id as coded_participant_id
      FROM barcode_audit ba
      LEFT JOIN users u ON ba.performed_by = u.id
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN samples s ON ba.sample_id = s.id
      ${whereClause}
      ORDER BY ba.action_timestamp DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;
    params.push(limitNum, offset);

    const dataRes = await query(dataSql, params);

    res.json({
      success: true,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      },
      events: dataRes.rows
    });
  } catch (error) {
    next(error);
  }
}

// Backward-compatible getActiveBarcode
export async function getActiveBarcode(req, res, next) {
  try {
    const { sample_id } = req.params;

    let sql = `
      SELECT b.* FROM barcodes b
      JOIN samples s ON b.sample_id = s.id
      WHERE b.sample_id = $1 AND b.status NOT IN ('VOIDED', 'Inactive')
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
