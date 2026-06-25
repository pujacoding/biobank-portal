import { query, getClient } from '../services/dbService.js';

/**
 * Get overall biobank telemetry statistics
 */
export async function getStats(req, res, next) {
  try {
    const totalSamples = await query("SELECT COUNT(*) as count FROM samples");
    const totalDonors = await query("SELECT COUNT(DISTINCT subject_id) as count FROM samples");
    const totalRequests = await query("SELECT COUNT(*) as count FROM research_requests");
    const totalStudies = await query("SELECT COUNT(*) as count FROM studies");
    const totalPublications = await query("SELECT COUNT(*) as count FROM publications");

    res.json({
      success: true,
      stats: {
        totalSpecimens: parseInt(totalSamples.rows[0].count, 10),
        totalDonors: parseInt(totalDonors.rows[0].count, 10),
        totalRequests: parseInt(totalRequests.rows[0].count, 10),
        totalStudies: parseInt(totalStudies.rows[0].count, 10),
        totalPublications: parseInt(totalPublications.rows[0].count, 10)
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get searchable specimen catalog mapped to Biobank format
 */
export async function getCatalog(req, res, next) {
  try {
    const sql = `
      SELECT s.*, 
             COALESCE(c.verification_status, s.consent_status) as consent_status,
             ct.consent_code, ct.consent_name,
             st.category as specimen_category
      FROM samples s
      LEFT JOIN consent c ON s.consent_id = c.id
      LEFT JOIN consent_templates ct ON s.consent_template_id = ct.template_id
      LEFT JOIN specimen_types st ON s.specimen_type_id = st.id
      ORDER BY s.created_at DESC
    `;
    const result = await query(sql);
    
    const specimens = result.rows.map(row => {
      const isAcademic = row.consent_code === 'GBC' || row.consent_code === 'FRC' || row.consent_code === 'PBA';
      const isGenomic = row.consent_code === 'FRC' || row.consent_code === 'PBA';
      const isCommercial = row.consent_code === 'FRC';
      
      let category = row.specimen_category;
      if (!category) {
        const type = (row.specimen_type || '').toLowerCase();
        if (['blood', 'whole blood', 'serum', 'plasma', 'buffy coat', 'pbmc'].includes(type)) {
          category = 'Blood';
        } else if (type === 'urine') {
          category = 'Urine';
        } else if (type === 'stool') {
          category = 'Stool';
        } else if (type.includes('swab') || type === 'saliva' || type === 'sputum') {
          category = 'Swab';
        } else if (type.includes('tissue') || type.includes('bone marrow')) {
          category = 'Tissue';
        } else if (['csf', 'pleural fluid', 'ascitic fluid', 'synovial fluid'].includes(type)) {
          category = 'Body Fluid';
        } else if (['dna', 'rna'].includes(type)) {
          category = 'Molecular';
        } else if (['stem cell', 'cell line', 'exosome'].includes(type)) {
          category = 'Cell Therapy';
        } else if (type === 'semen') {
          category = 'Reproductive';
        } else {
          category = 'Other';
        }
      }
      
      return {
        barcode: row.id,
        type: row.specimen_type,
        category: category,
        diagnosis: row.diagnosis || 'Healthy Control',
        gender: row.gender,
        age: row.age,
        location: row.location || '',
        quality: row.quality || 'Integrity: Unchecked',
        qcStatus: row.qc_status || 'Pending',
        retrievalStatus: row.retrieval_status || 'Stored',
        consent: {
          academic: isAcademic,
          genomic: isGenomic,
          commercial: isCommercial
        },
        donorId: row.subject_id,
        createdAt: row.created_at
      };
    });

    res.json({ success: true, specimens });
  } catch (error) {
    next(error);
  }
}

/**
 * Get active donor directory
 */
export async function getDonors(req, res, next) {
  try {
    const sql = `
      SELECT s.subject_id as donor_id, s.gender, s.age, s.diagnosis, 
             COALESCE(c.verification_status, s.consent_status) as consent_status,
             c.withdrawn_at, c.withdrawn_by, MAX(s.created_at) as created_at
      FROM samples s
      LEFT JOIN consent c ON s.consent_id = c.id
      GROUP BY s.subject_id, s.gender, s.age, s.diagnosis, COALESCE(c.verification_status, s.consent_status), c.withdrawn_at, c.withdrawn_by
      ORDER BY created_at DESC
    `;
    const result = await query(sql);

    const donors = result.rows.map(row => {
      const isWithdrawn = row.consent_status === 'Withdrawn';
      return {
        donorId: row.donor_id,
        name: row.donor_id,
        uhid: `UHID-${row.donor_id.split('-').pop()}-X`,
        fullName: `Patient Subject ${row.donor_id.split('-').pop()}`,
        age: row.age,
        gender: row.gender,
        consentStatus: row.consent_status === 'Verified' ? 'Active' : (isWithdrawn ? 'Withdrawn' : 'Pending'),
        consentExpiry: '2031-12-31',
        academic: !isWithdrawn,
        genomic: !isWithdrawn,
        commercial: false,
        diagnosis: row.diagnosis || 'Healthy Control',
        withdrawnAt: row.withdrawn_at || null,
        withdrawnBy: row.withdrawn_by || null,
        createdAt: row.created_at
      };
    });

    res.json({ success: true, donors });
  } catch (error) {
    next(error);
  }
}

/**
 * Withdraw donor consent from research portal (Transactional)
 */
export async function withdrawDonorConsent(req, res, next) {
  const client = await getClient();
  try {
    const { donorId } = req.body;
    if (!donorId) {
      return res.status(400).json({ error: "donorId is required" });
    }

    await client.query('BEGIN');

    const samplesCheck = await client.query("SELECT * FROM samples WHERE subject_id = $1 FOR UPDATE", [donorId]);
    if (samplesCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "No samples found for this donor" });
    }

    const now = new Date();
    const withdrawnAt = `${now.toLocaleDateString('en-CA')} ${now.toTimeString().split(' ')[0]}`;
    const withdrawnByName = "Super Admin (Research Portal)";

    // Update consent records
    for (const sample of samplesCheck.rows) {
      if (sample.consent_id) {
        await client.query(
          "UPDATE consent SET verification_status = 'Withdrawn', withdrawn_at = $1, withdrawn_by = $2 WHERE id = $3",
          [withdrawnAt, withdrawnByName, sample.consent_id]
        );
      }
    }

    // Update samples table
    await client.query(
      "UPDATE samples SET consent_status = 'Withdrawn', barcode_status = 'Unassigned', status = 'Collected' WHERE subject_id = $1",
      [donorId]
    );

    // Deactivate barcodes
    for (const sample of samplesCheck.rows) {
      await client.query(
        "UPDATE barcodes SET status = 'Inactive' WHERE sample_id = $1 AND status = 'Active'",
        [sample.id]
      );
    }

    // Add activity log
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
    await client.query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (1, 'Super Admin', 'Super Admin', 'Research Portal Integration', 'Consent Management', 'UPDATE', 'Consent', $1, null, $2, $3)
    `, [donorId, `Consent withdrawn for donor ${donorId} via Research Portal. All specimens blocked.`, clientIp]);

    await client.query('COMMIT');

    res.json({ success: true, message: `Consent successfully withdrawn for donor ${donorId}` });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * Fetch LIMS users for external integration login
 */
export async function getUsers(req, res, next) {
  try {
    // Select u.password_plain as password for client-side authentication compatibility in Biobank Portal
    const sql = `
      SELECT u.id, u.name as username, r.role_name as role, u.status, u.password_plain as password 
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE u.status = 'Active'
    `;
    const result = await query(sql);
    res.json({ success: true, users: result.rows });
  } catch (error) {
    next(error);
  }
}

/**
 * Fetch research requests
 */
export async function getResearchRequests(req, res, next) {
  try {
    const result = await query("SELECT * FROM research_requests ORDER BY created_at DESC");
    res.json({ success: true, requests: result.rows });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new research access request
 */
export async function createResearchRequest(req, res, next) {
  try {
    const { researcher_name, institution, irb_code, hypothesis, specimens } = req.body;
    if (!researcher_name || !institution || !irb_code || !hypothesis || !specimens) {
      return res.status(400).json({ error: "Missing required checkout parameters" });
    }

    const barcodes = specimens.split(',').map(b => b.trim()).filter(b => b.length > 0);
    if (barcodes.length === 0) {
      return res.status(400).json({ error: "No specimens specified in the request" });
    }

    // Retrieve consent status for each requested specimen
    const checkRes = await query(`
      SELECT s.id, COALESCE(c.verification_status, s.consent_status) as consent_status
      FROM samples s
      LEFT JOIN consent c ON s.consent_id = c.id
      WHERE s.id = ANY($1::varchar[])
    `, [barcodes]);

    for (const row of checkRes.rows) {
      if (row.consent_status === 'Withdrawn') {
        return res.status(400).json({ 
          error: `Checkout Blocked: Specimen '${row.id}' has been withdrawn from research by the patient.` 
        });
      }
      if (row.consent_status !== 'Verified') {
        return res.status(400).json({ 
          error: `Checkout Blocked: Specimen '${row.id}' does not have verified consent (Status: ${row.consent_status}).` 
        });
      }
    }

    const id = 'REQ-' + Date.now();
    await query(`
      INSERT INTO research_requests (id, researcher_name, institution, irb_code, hypothesis, specimens, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'Pending')
    `, [id, researcher_name, institution, irb_code, hypothesis, specimens]);

    res.status(201).json({ success: true, requestId: id });
  } catch (error) {
    next(error);
  }
}

/**
 * Approve research request and allocate specimens (Transactional)
 */
export async function approveResearchRequest(req, res, next) {
  const client = await getClient();
  try {
    const { id } = req.params;
    
    await client.query('BEGIN');

    const reqCheck = await client.query("SELECT specimens FROM research_requests WHERE id = $1 FOR UPDATE", [id]);
    if (reqCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Request not found" });
    }

    const specimensStr = reqCheck.rows[0].specimens;
    const barcodes = specimensStr.split(',').map(b => b.trim());

    // Update request status
    await client.query("UPDATE research_requests SET status = 'Approved' WHERE id = $1", [id]);

    // Update specimens status
    for (const barcode of barcodes) {
      await client.query("UPDATE samples SET status = 'Allocated', retrieval_status = 'Allocated' WHERE id = $1", [barcode]);
      
      await client.query(`
        INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
        VALUES ($1, 'Allocated', 'Allocated to research study request: ' || $2, 1)
      `, [barcode, id]);
    }

    await client.query('COMMIT');

    res.json({ success: true, message: "Request approved and samples allocated successfully." });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Reject research request and release specimens back to storage (Transactional)
 */
export async function rejectResearchRequest(req, res, next) {
  const client = await getClient();
  try {
    const { id } = req.params;
    
    await client.query('BEGIN');

    const reqCheck = await client.query("SELECT specimens FROM research_requests WHERE id = $1 FOR UPDATE", [id]);
    if (reqCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Request not found" });
    }

    const specimensStr = reqCheck.rows[0].specimens;
    const barcodes = specimensStr.split(',').map(b => b.trim());

    await client.query("UPDATE research_requests SET status = 'Rejected' WHERE id = $1", [id]);

    for (const barcode of barcodes) {
      await client.query("UPDATE samples SET status = 'Consent Verified', retrieval_status = 'Stored' WHERE id = $1", [barcode]);
      
      await client.query(`
        INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
        VALUES ($1, 'Rejected', 'Rejected research study request: ' || $2, 1)
      `, [barcode, id]);
    }

    await client.query('COMMIT');

    res.json({ success: true, message: "Request rejected successfully." });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Fetch all research studies
 */
export async function getStudies(req, res, next) {
  try {
    const result = await query("SELECT * FROM studies ORDER BY created_at DESC");
    res.json({ success: true, studies: result.rows });
  } catch (error) {
    next(error);
  }
}

/**
 * Create research study
 */
export async function createStudy(req, res, next) {
  try {
    const { title, irb_code, investigator, description } = req.body;
    if (!title || !irb_code || !investigator) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const id = 'STD-' + Date.now();
    await query(`
      INSERT INTO studies (id, title, irb_code, investigator, description)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, title, irb_code, investigator, description || '']);

    res.status(201).json({ success: true, studyId: id });
  } catch (error) {
    next(error);
  }
}

/**
 * Fetch all publications
 */
export async function getPublications(req, res, next) {
  try {
    const result = await query("SELECT * FROM publications ORDER BY created_at DESC");
    res.json({ success: true, publications: result.rows });
  } catch (error) {
    next(error);
  }
}

/**
 * Create publication
 */
export async function createPublication(req, res, next) {
  try {
    const { title, authors, journal, doi, linked_study_id } = req.body;
    if (!title || !authors || !journal) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const id = 'PUB-' + Date.now();
    await query(`
      INSERT INTO publications (id, title, authors, journal, doi, linked_study_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, title, authors, journal, doi || '', linked_study_id || '']);

    res.status(201).json({ success: true, publicationId: id });
  } catch (error) {
    next(error);
  }
}

/**
 * Assign coordinates and store sample in freezer (Transactional)
 */
export async function storeSample(req, res, next) {
  const client = await getClient();
  try {
    const { barcode, location, quality, diagnosis } = req.body;
    if (!barcode || !location || !quality) {
      return res.status(400).json({ error: "Missing barcode, location or quality metric" });
    }

    await client.query('BEGIN');

    await client.query(`
      UPDATE samples 
      SET location = $1, quality = $2, diagnosis = $3, status = 'Stored', retrieval_status = 'Stored', ingestion_status = 'Ingested' 
      WHERE id = $4
    `, [location, quality, diagnosis || 'Healthy Control', barcode]);

    await client.query(`
      INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
      VALUES ($1, 'Storage Assignment', 'Deposited specimen at coordinate: ' || $2, 1)
    `, [barcode, location]);

    await client.query('COMMIT');

    res.json({ success: true, message: `Specimen ${barcode} successfully stored at ${location}.` });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Log QC inspection status (Transactional)
 */
export async function qcSample(req, res, next) {
  const client = await getClient();
  try {
    const { barcode, quality, status } = req.body;
    if (!barcode || !quality || !status) {
      return res.status(400).json({ error: "Missing required QC parameters" });
    }

    await client.query('BEGIN');

    await client.query(`
      UPDATE samples 
      SET quality = $1, qc_status = $2
      WHERE id = $3
    `, [quality, status, barcode]);

    await client.query(`
      INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
      VALUES ($1, 'QC Processing', 'Quality Control check completed. Status: ' || $2, 1)
    `, [barcode, status]);

    await client.query('COMMIT');

    res.json({ success: true, message: `QC updated for ${barcode}.` });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Relocate stored sample coordinates (Transactional)
 */
export async function relocateSample(req, res, next) {
  const client = await getClient();
  try {
    const { barcode, newLocation } = req.body;
    if (!barcode || !newLocation) {
      return res.status(400).json({ error: "Missing barcode or new coordinate" });
    }

    await client.query('BEGIN');

    const currentCheck = await client.query("SELECT location FROM samples WHERE id = $1 FOR UPDATE", [barcode]);
    const oldLocation = currentCheck.rows[0]?.location || 'Unassigned';

    await client.query("UPDATE samples SET location = $1 WHERE id = $2", [newLocation, barcode]);

    await client.query(`
      INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
      VALUES ($1, 'Specimen Relocate', 'Relocated from ' || $2 || ' to ' || $3, 1)
    `, [barcode, oldLocation, newLocation]);

    await client.query('COMMIT');

    res.json({ success: true, message: `Relocated ${barcode} successfully.` });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Retrieve sample from freezer coordinates (Transactional)
 */
export async function retrieveSample(req, res, next) {
  const client = await getClient();
  try {
    const { barcode, reason } = req.body;
    if (!barcode) {
      return res.status(400).json({ error: "Missing barcode ID" });
    }

    await client.query('BEGIN');

    await client.query(`
      UPDATE samples 
      SET location = null, status = 'Retrieved', retrieval_status = 'Retrieved' 
      WHERE id = $1
    `, [barcode]);

    await client.query(`
      INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
      VALUES ($1, 'Specimen Retrieval', $2, 1)
    `, [barcode, reason || 'Retrieved for research purposes']);

    await client.query('COMMIT');

    res.json({ success: true, message: `Specimen ${barcode} retrieved from freezer layout.` });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Retrieve trace audit logs for single barcode
 */
export async function traceSample(req, res, next) {
  try {
    const { barcode } = req.params;

    const sampleRes = await query(`
      SELECT s.*, l.name as lab_name, l.location_address as lab_location, 
             u.name as collector_name, ct.consent_name, ct.consent_code
      FROM samples s
      LEFT JOIN labs l ON s.lab_id = l.id
      LEFT JOIN users u ON s.collector_id = u.id
      LEFT JOIN consent_templates ct ON s.consent_template_id = ct.template_id
      WHERE s.id = $1
    `, [barcode]);

    if (sampleRes.rows.length === 0) {
      return res.status(404).json({ error: "Specimen barcode not found in records directory." });
    }

    const sample = sampleRes.rows[0];

    const auditRes = await query(`
      SELECT ba.*, u.name as performed_by_name, r.role_name as performed_by_role
      FROM barcode_audit ba
      LEFT JOIN users u ON ba.performed_by = u.id
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE ba.sample_id = $1
      ORDER BY ba.action_timestamp ASC
    `, [barcode]);

    const barcodeRes = await query("SELECT * FROM barcodes WHERE sample_id = $1 AND status = 'Active'", [barcode]);

    res.json({
      success: true,
      sample,
      history: auditRes.rows,
      barcode: barcodeRes.rows[0] || null
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Fetch all shipments
 */
export async function getShipments(req, res, next) {
  try {
    const sql = `
      SELECT sh.*, l.name as origin_lab_name,
             (SELECT COUNT(*) FROM shipment_samples ss WHERE ss.shipment_id = sh.id) as sample_count
      FROM shipments sh
      LEFT JOIN labs l ON sh.origin_lab_id = l.id
      ORDER BY sh.created_at DESC
    `;
    const result = await query(sql);
    const shipments = result.rows;

    const samplesRes = await query("SELECT shipment_id, sample_id FROM shipment_samples");
    const samplesMap = {};
    samplesRes.rows.forEach(row => {
      if (!samplesMap[row.shipment_id]) {
        samplesMap[row.shipment_id] = [];
      }
      samplesMap[row.shipment_id].push(row.sample_id);
    });

    const enrichedShipments = shipments.map(shp => ({
      ...shp,
      barcodes: (samplesMap[shp.id] || []).join(', ')
    }));

    res.json({ success: true, shipments: enrichedShipments });
  } catch (error) {
    next(error);
  }
}

/**
 * Dispatch a new shipment (Transactional)
 */
export async function createShipment(req, res, next) {
  const client = await getClient();
  try {
    const { destination, barcodes, origin_lab_id } = req.body;
    if (!destination || !barcodes || barcodes.length === 0) {
      return res.status(400).json({ error: "Missing destination or sample barcodes" });
    }

    await client.query('BEGIN');

    const id = 'SHP-' + Date.now();
    await client.query(`
      INSERT INTO shipments (id, origin_lab_id, destination, status, shipped_at)
      VALUES ($1, $2, $3, 'In Transit', CURRENT_TIMESTAMP)
    `, [id, origin_lab_id || 1, destination]);

    for (const barcode of barcodes) {
      await client.query("INSERT INTO shipment_samples (shipment_id, sample_id) VALUES ($1, $2)", [id, barcode]);
      await client.query("UPDATE samples SET status = 'Shipped' WHERE id = $1", [barcode]);
      
      await client.query(`
        INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
        VALUES ($1, 'Shipment Dispatch', 'Dispatched in shipment: ' || $2, 1)
      `, [barcode, id]);
    }

    await client.query('COMMIT');

    res.status(201).json({ success: true, shipmentId: id });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Receive active shipment at destination (Transactional)
 */
export async function receiveShipment(req, res, next) {
  const client = await getClient();
  try {
    const { id } = req.params;
    
    await client.query('BEGIN');

    await client.query("UPDATE shipments SET status = 'Received', received_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);

    const samplesRes = await client.query("SELECT sample_id FROM shipment_samples WHERE shipment_id = $1", [id]);
    
    for (const row of samplesRes.rows) {
      await client.query("UPDATE samples SET status = 'Received' WHERE id = $1", [row.sample_id]);
      await client.query(`
        INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
        VALUES ($1, 'Shipment Receiving', 'Received from shipment: ' || $2, 1)
      `, [row.sample_id, id]);
    }

    await client.query('COMMIT');

    res.json({ success: true, message: `Shipment ${id} successfully marked as Received.` });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}
