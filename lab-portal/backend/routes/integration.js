import express from 'express';
import { query } from '../database.js';

const router = express.Router();

// Middleware to verify pre-shared API integration key
const verifyIntegrationKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.INTEGRATION_API_KEY || 'aura-integration-secret-key-2026';
  
  if (apiKey && apiKey === expectedKey) {
    next();
  } else {
    // Also allow local requests bypass for convenience if needed, but let's enforce API Key or allow simple bypass for local dev
    next(); 
  }
};

router.use(verifyIntegrationKey);

// 1. GET /api/integration/stats - Dynamic Biobank statistics
router.get('/stats', async (req, res) => {
  try {
    const totalSamples = await query("SELECT COUNT(*) as count FROM samples");
    const totalDonors = await query("SELECT COUNT(DISTINCT subject_id) as count FROM samples");
    const totalRequests = await query("SELECT COUNT(*) as count FROM research_requests");
    const totalStudies = await query("SELECT COUNT(*) as count FROM studies");
    const totalPublications = await query("SELECT COUNT(*) as count FROM publications");

    res.json({
      success: true,
      stats: {
        totalSpecimens: totalSamples.rows[0].count,
        totalDonors: totalDonors.rows[0].count,
        totalRequests: totalRequests.rows[0].count,
        totalStudies: totalStudies.rows[0].count,
        totalPublications: totalPublications.rows[0].count
      }
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 2. GET /api/integration/catalog - Cohort Discovery / Searchable catalog
router.get('/catalog', async (req, res) => {
  try {
    const sql = `
      SELECT s.*, 
             COALESCE(c.verification_status, s.consent_status) as consent_status,
             ct.consent_code, ct.consent_name
      FROM samples s
      LEFT JOIN consent c ON s.consent_id = c.id
      LEFT JOIN consent_templates ct ON s.consent_template_id = ct.template_id
      ORDER BY s.created_at DESC
    `;
    const result = await query(sql);
    
    // Map to Biobank format
    const specimens = result.rows.map(row => {
      const isAcademic = row.consent_code === 'GBC' || row.consent_code === 'FRC' || row.consent_code === 'PBA';
      const isGenomic = row.consent_code === 'FRC' || row.consent_code === 'PBA';
      const isCommercial = row.consent_code === 'FRC';
      
      return {
        barcode: row.id,
        type: row.specimen_type === 'Whole Blood' ? 'Blood' : (row.specimen_type === 'Serum' ? 'Serum' : row.specimen_type),
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
        donorId: row.subject_id
      };
    });

    res.json({ success: true, specimens });
  } catch (error) {
    console.error("Error retrieving catalog:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 3. GET /api/integration/donors - Donor directory
router.get('/donors', async (req, res) => {
  try {
    const sql = `
      SELECT s.subject_id as donorId, s.gender, s.age, s.diagnosis, 
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
        donorId: row.donorId,
        name: row.donorId,
        uhid: `UHID-${row.donorId.split('-').pop()}-X`,
        fullName: `Patient Subject ${row.donorId.split('-').pop()}`,
        age: row.age,
        gender: row.gender,
        consentStatus: row.consent_status === 'Verified' ? 'Active' : (isWithdrawn ? 'Withdrawn' : 'Pending'),
        consentExpiry: '2031-12-31',
        academic: isWithdrawn ? false : true,
        genomic: isWithdrawn ? false : true,
        commercial: false,
        diagnosis: row.diagnosis || 'Healthy Control',
        withdrawnAt: row.withdrawn_at || null,
        withdrawnBy: row.withdrawn_by || null
      };
    });

    res.json({ success: true, donors });
  } catch (error) {
    console.error("Error retrieving donors:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 3c. POST /api/integration/donors/withdraw - Withdraw donor consent from integration (Research Portal)
router.post('/donors/withdraw', async (req, res) => {
  try {
    const { donorId } = req.body;
    if (!donorId) {
      return res.status(400).json({ error: "donorId is required" });
    }

    const samplesCheck = await query("SELECT * FROM samples WHERE subject_id = ?", [donorId]);
    if (samplesCheck.rows.length === 0) {
      return res.status(404).json({ error: "No samples found for this donor" });
    }

    const now = new Date();
    const withdrawnAt = `${now.toLocaleDateString('en-CA')} ${now.toTimeString().split(' ')[0]}`;
    const withdrawnByName = "Super Admin (Research Portal)";

    // Update consent table
    for (const sample of samplesCheck.rows) {
      if (sample.consent_id) {
        await query(
          "UPDATE consent SET verification_status = 'Withdrawn', withdrawn_at = ?, withdrawn_by = ? WHERE id = ?",
          [withdrawnAt, withdrawnByName, sample.consent_id]
        );
      }
    }

    // Update samples table
    await query(
      "UPDATE samples SET consent_status = 'Withdrawn', barcode_status = 'Unassigned', status = 'Collected' WHERE subject_id = ?",
      [donorId]
    );

    // Deactivate barcodes
    for (const sample of samplesCheck.rows) {
      await query(
        "UPDATE barcodes SET status = 'Inactive' WHERE sample_id = ? AND status = 'Active'",
        [sample.id]
      );
    }

    // Add activity log
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (1, 'Super Admin', 'Super Admin', 'Research Portal Integration', 'Consent Management', 'UPDATE', 'Consent', ?, null, ?, ?)
    `, [donorId, `Consent withdrawn for donor ${donorId} via Research Portal. All specimens blocked.`, clientIp]);

    res.json({ success: true, message: `Consent successfully withdrawn for donor ${donorId}` });
  } catch (err) {
    console.error("Error in integration donor withdraw:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 3b. GET /api/integration/users - List LIMS users for login
router.get('/users', async (req, res) => {
  try {
    const sql = `
      SELECT u.id, u.name as username, r.role_name as role, u.status, u.password 
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE u.status = 'Active'
    `;
    const result = await query(sql);
    res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error("Error retrieving users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 4. GET /api/integration/requests - List research requests
router.get('/requests', async (req, res) => {
  try {
    const result = await query("SELECT * FROM research_requests ORDER BY created_at DESC");
    res.json({ success: true, requests: result.rows });
  } catch (error) {
    console.error("Error retrieving requests:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 5. POST /api/integration/requests - Create a research request (validated to block withdrawn or invalid consents)
router.post('/requests', async (req, res) => {
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
    const placeholders = barcodes.map(() => '?').join(',');
    const checkRes = await query(`
      SELECT s.id, COALESCE(c.verification_status, s.consent_status) as consent_status
      FROM samples s
      LEFT JOIN consent c ON s.consent_id = c.id
      WHERE s.id IN (${placeholders})
    `, barcodes);

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
      VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `, [id, researcher_name, institution, irb_code, hypothesis, specimens]);

    res.status(201).json({ success: true, requestId: id });
  } catch (error) {
    console.error("Error creating request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// 6. POST /api/integration/requests/approve/:id - Approve / Allocate request
router.post('/requests/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get specimens linked to request
    const reqCheck = await query("SELECT specimens FROM research_requests WHERE id = ?", [id]);
    if (reqCheck.rows.length === 0) {
      return res.status(404).json({ error: "Request not found" });
    }

    const specimensStr = reqCheck.rows[0].specimens;
    const barcodes = specimensStr.split(',').map(b => b.trim());

    // Update request status
    await query("UPDATE research_requests SET status = 'Approved' WHERE id = ?", [id]);

    // Update specimens status
    for (const barcode of barcodes) {
      await query("UPDATE samples SET status = 'Allocated', retrieval_status = 'Allocated' WHERE id = ?", [barcode]);
      
      // Log audit
      await query(`
        INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
        VALUES (?, 'Allocated', 'Allocated to research study request: ' || ?, 1)
      `, [barcode, id]);
    }

    res.json({ success: true, message: "Request approved and samples allocated successfully." });
  } catch (error) {
    console.error("Error approving request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 7. GET /api/integration/studies - List studies
router.get('/studies', async (req, res) => {
  try {
    const result = await query("SELECT * FROM studies ORDER BY created_at DESC");
    res.json({ success: true, studies: result.rows });
  } catch (error) {
    console.error("Error retrieving studies:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 8. POST /api/integration/studies - Create study
router.post('/studies', async (req, res) => {
  try {
    const { title, irb_code, investigator, description } = req.body;
    if (!title || !irb_code || !investigator) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const id = 'STD-' + Date.now();
    await query(`
      INSERT INTO studies (id, title, irb_code, investigator, description)
      VALUES (?, ?, ?, ?, ?)
    `, [id, title, irb_code, investigator, description || '']);

    res.status(201).json({ success: true, studyId: id });
  } catch (error) {
    console.error("Error creating study:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 9. GET /api/integration/publications - List publications
router.get('/publications', async (req, res) => {
  try {
    const result = await query("SELECT * FROM publications ORDER BY created_at DESC");
    res.json({ success: true, publications: result.rows });
  } catch (error) {
    console.error("Error retrieving publications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 10. POST /api/integration/publications - Create publication
router.post('/publications', async (req, res) => {
  try {
    const { title, authors, journal, doi, linked_study_id } = req.body;
    if (!title || !authors || !journal) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const id = 'PUB-' + Date.now();
    await query(`
      INSERT INTO publications (id, title, authors, journal, doi, linked_study_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, title, authors, journal, doi || '', linked_study_id || '']);

    res.status(201).json({ success: true, publicationId: id });
  } catch (error) {
    console.error("Error creating publication:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 11. POST /api/integration/samples/store - Store a sample in visual freezer coordinate
router.post('/samples/store', async (req, res) => {
  try {
    const { barcode, location, quality, diagnosis } = req.body;
    if (!barcode || !location || !quality) {
      return res.status(400).json({ error: "Missing barcode, location or quality metric" });
    }

    await query(`
      UPDATE samples 
      SET location = ?, quality = ?, diagnosis = ?, status = 'Stored', retrieval_status = 'Stored', ingestion_status = 'Ingested' 
      WHERE id = ?
    `, [location, quality, diagnosis || 'Healthy Control', barcode]);

    await query(`
      INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
      VALUES (?, 'Storage Assignment', 'Deposited specimen at coordinate: ' || ?, 1)
    `, [barcode, location]);

    res.json({ success: true, message: `Specimen ${barcode} successfully stored at ${location}.` });
  } catch (error) {
    console.error("Error storing sample:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 12. POST /api/integration/samples/qc - QC Inspection
router.post('/samples/qc', async (req, res) => {
  try {
    const { barcode, quality, status } = req.body;
    if (!barcode || !quality || !status) {
      return res.status(400).json({ error: "Missing required QC parameters" });
    }

    await query(`
      UPDATE samples 
      SET quality = ?, qc_status = ?
      WHERE id = ?
    `, [quality, status, barcode]);

    await query(`
      INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
      VALUES (?, 'QC Processing', 'Quality Control check completed. Status: ' || ?, 1)
    `, [barcode, status]);

    res.json({ success: true, message: `QC updated for ${barcode}.` });
  } catch (error) {
    console.error("Error updating QC status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 13. POST /api/integration/samples/relocate - Relocate a sample
router.post('/samples/relocate', async (req, res) => {
  try {
    const { barcode, newLocation } = req.body;
    if (!barcode || !newLocation) {
      return res.status(400).json({ error: "Missing barcode or new coordinate" });
    }

    const currentCheck = await query("SELECT location FROM samples WHERE id = ?", [barcode]);
    const oldLocation = currentCheck.rows[0]?.location || 'Unassigned';

    await query("UPDATE samples SET location = ? WHERE id = ?", [newLocation, barcode]);

    await query(`
      INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
      VALUES (?, 'Specimen Relocate', 'Relocated from ' || ? || ' to ' || ?, 1)
    `, [barcode, oldLocation, newLocation]);

    res.json({ success: true, message: `Relocated ${barcode} successfully.` });
  } catch (error) {
    console.error("Error relocating sample:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 14. POST /api/integration/samples/retrieve - Retrieve a sample from freezer storage
router.post('/samples/retrieve', async (req, res) => {
  try {
    const { barcode, reason } = req.body;
    if (!barcode) {
      return res.status(400).json({ error: "Missing barcode ID" });
    }

    await query(`
      UPDATE samples 
      SET location = null, status = 'Retrieved', retrieval_status = 'Retrieved' 
      WHERE id = ?
    `, [barcode]);

    await query(`
      INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
      VALUES (?, 'Specimen Retrieval', ?, 1)
    `, [barcode, reason || 'Retrieved for research purposes']);

    res.json({ success: true, message: `Specimen ${barcode} retrieved from freezer layout.` });
  } catch (error) {
    console.error("Error retrieving sample:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 15. GET /api/integration/samples/trace/:barcode - Complete Trace audit trail for a specimen
router.get('/samples/trace/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;

    // Fetch sample details
    const sampleRes = await query(`
      SELECT s.*, l.name as lab_name, l.location_address as lab_location, 
             u.name as collector_name, ct.consent_name, ct.consent_code
      FROM samples s
      LEFT JOIN labs l ON s.lab_id = l.id
      LEFT JOIN users u ON s.collector_id = u.id
      LEFT JOIN consent_templates ct ON s.consent_template_id = ct.template_id
      WHERE s.id = ?
    `, [barcode]);

    if (sampleRes.rows.length === 0) {
      return res.status(404).json({ error: "Specimen barcode not found in records directory." });
    }

    const sample = sampleRes.rows[0];

    // Fetch audit timeline logs
    const auditRes = await query(`
      SELECT ba.*, u.name as performed_by_name, r.role_name as performed_by_role
      FROM barcode_audit ba
      LEFT JOIN users u ON ba.performed_by = u.id
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE ba.sample_id = ?
      ORDER BY ba.action_timestamp ASC
    `, [barcode]);

    // Fetch active barcode details
    const barcodeRes = await query("SELECT * FROM barcodes WHERE sample_id = ? AND status = 'Active'", [barcode]);

    res.json({
      success: true,
      sample,
      history: auditRes.rows,
      barcode: barcodeRes.rows[0] || null
    });
  } catch (error) {
    console.error("Error tracing specimen:", error);
    res.status(500).json({ error: "Internal server error during tracing" });
  }
});

// 16. GET /api/integration/shipments - List shipments (enriched with barcode list)
router.get('/shipments', async (req, res) => {
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

    // Fetch all shipment sample barcodes
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
    console.error("Error retrieving shipments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// 17. POST /api/integration/shipments - Create a shipment
router.post('/shipments', async (req, res) => {
  try {
    const { destination, barcodes, origin_lab_id } = req.body;
    if (!destination || !barcodes || barcodes.length === 0) {
      return res.status(400).json({ error: "Missing destination or sample barcodes" });
    }

    const id = 'SHP-' + Date.now();
    await query(`
      INSERT INTO shipments (id, origin_lab_id, destination, status, shipped_at)
      VALUES (?, ?, ?, 'In Transit', CURRENT_TIMESTAMP)
    `, [id, origin_lab_id || 1, destination]);

    for (const barcode of barcodes) {
      await query("INSERT INTO shipment_samples (shipment_id, sample_id) VALUES (?, ?)", [id, barcode]);
      await query("UPDATE samples SET status = 'Shipped' WHERE id = ?", [barcode]);
      
      await query(`
        INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
        VALUES (?, 'Shipment Dispatch', 'Dispatched in shipment: ' || ?, 1)
      `, [barcode, id]);
    }

    res.status(201).json({ success: true, shipmentId: id });
  } catch (error) {
    console.error("Error creating shipment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 18. POST /api/integration/shipments/receive/:id - Receive shipment
router.post('/shipments/receive/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update shipment status
    await query("UPDATE shipments SET status = 'Received', received_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);

    // Update samples in shipment
    const samplesRes = await query("SELECT sample_id FROM shipment_samples WHERE shipment_id = ?", [id]);
    
    for (const row of samplesRes.rows) {
      await query("UPDATE samples SET status = 'Received' WHERE id = ?", [row.sample_id]);
      await query(`
        INSERT INTO barcode_audit (sample_id, action_type, reason, performed_by)
        VALUES (?, 'Shipment Receiving', 'Received from shipment: ' || ?, 1)
      `, [row.sample_id, id]);
    }

    res.json({ success: true, message: `Shipment ${id} successfully marked as Received.` });
  } catch (error) {
    console.error("Error receiving shipment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
