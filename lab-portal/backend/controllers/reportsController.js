import pool from '../config/db.js';

// Helper for pagination, search, and sort parameters
function getPaginationParams(req) {
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 10;
  const offset = (page - 1) * pageSize;
  const sortBy = req.query.sortBy || '';
  const sortOrder = req.query.sortOrder === 'desc' ? 'DESC' : 'ASC';
  const search = req.query.search || '';
  return { page, pageSize, offset, sortBy, sortOrder, search };
}

// Helper to fetch global summary card metrics
async function getSummaryMetrics() {
  const metrics = {
    totalRecords: 0,
    totalSamples: 0,
    collected: 0,
    processed: 0,
    stored: 0,
    released: 0,
    disposed: 0,
    expired: 0,
    pendingQc: 0
  };

  try {
    const samplesCount = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'Collected' THEN 1 END) as collected,
        COUNT(CASE WHEN status = 'Stored' OR (location IS NOT NULL AND status != 'Disposed' AND retrieval_status != 'Retrieved') THEN 1 END) as stored,
        COUNT(CASE WHEN status = 'Released' OR retrieval_status = 'Released' THEN 1 END) as released,
        COUNT(CASE WHEN status = 'Disposed' THEN 1 END) as disposed,
        COUNT(CASE WHEN qc_status = 'Pending' THEN 1 END) as pending_qc
      FROM samples
    `);

    const processingCount = await pool.query("SELECT COUNT(*) FROM sample_processing");

    metrics.totalSamples = parseInt(samplesCount.rows[0].total || 0, 10);
    metrics.collected = parseInt(samplesCount.rows[0].collected || 0, 10);
    metrics.stored = parseInt(samplesCount.rows[0].stored || 0, 10);
    metrics.released = parseInt(samplesCount.rows[0].released || 0, 10);
    metrics.disposed = parseInt(samplesCount.rows[0].disposed || 0, 10);
    metrics.pendingQc = parseInt(samplesCount.rows[0].pending_qc || 0, 10);
    metrics.processed = parseInt(processingCount.rows[0].count || 0, 10);

    // Expired calculation (Blood > 30 days, others > 2 years for simulation)
    const expiredCount = await pool.query(`
      SELECT COUNT(*) FROM samples 
      WHERE (specimen_type = 'Blood' AND collection_date::date < CURRENT_DATE - INTERVAL '30 days')
         OR (specimen_type != 'Blood' AND collection_date::date < CURRENT_DATE - INTERVAL '730 days')
    `);
    metrics.expired = parseInt(expiredCount.rows[0].count || 0, 10);
    
  } catch (err) {
    console.error("Error fetching summary metrics:", err.message);
  }

  return metrics;
}

// 1. Dashboard Analytics Endpoint
export async function getDashboardAnalytics(req, res, next) {
  try {
    const summary = await getSummaryMetrics();

    // Sample Collection Trends (by month)
    const collectionTrends = await pool.query(`
      SELECT SUBSTRING(collection_date FROM 1 FOR 7) as month, COUNT(*) as count 
      FROM samples 
      GROUP BY month 
      ORDER BY month DESC 
      LIMIT 12
    `);

    // Storage Utilization
    const totalCapacityRes = await pool.query("SELECT SUM(capacity) as total FROM freezer_configurations");
    const occupiedSlotsRes = await pool.query("SELECT COUNT(*) as total FROM samples WHERE location IS NOT NULL AND status != 'Disposed' AND retrieval_status != 'Retrieved'");
    
    const capacity = parseInt(totalCapacityRes.rows[0].total || 3100, 10);
    const occupied = parseInt(occupiedSlotsRes.rows[0].total || 0, 10);

    // Freezer Occupancy
    const freezersOccupancy = await pool.query(`
      SELECT 
        fc.freezer_id, 
        fc.name, 
        fc.capacity,
        COUNT(s.id) as occupied
      FROM freezer_configurations fc
      LEFT JOIN samples s ON s.location LIKE fc.freezer_id || '%' AND s.retrieval_status != 'Retrieved' AND s.status != 'Disposed'
      GROUP BY fc.freezer_id, fc.name, fc.capacity
      ORDER BY fc.freezer_id
    `);

    // Specimen Type Distribution
    const specimenDistribution = await pool.query(`
      SELECT specimen_type, COUNT(*) as count 
      FROM samples 
      GROUP BY specimen_type 
      ORDER BY count DESC
    `);

    // QC Verdict Rates
    const qcResultRes = await pool.query(`
      SELECT qc_result, COUNT(*) as count 
      FROM qc_reports 
      GROUP BY qc_result
    `);

    // Shipment Trends
    const shipmentTrends = await pool.query(`
      SELECT destination, COUNT(*) as count 
      FROM shipments 
      GROUP BY destination
    `);

    // Disposal Trends
    const disposalTrends = await pool.query(`
      SELECT reason, COUNT(*) as count 
      FROM disposals 
      GROUP BY reason
    `);

    // Recent User Activities
    const recentActivities = await pool.query(`
      SELECT user_name, role, module_name, action_type, timestamp 
      FROM user_activity_logs 
      ORDER BY timestamp DESC 
      LIMIT 10
    `);

    res.json({
      summary,
      collectionTrends: collectionTrends.rows,
      storageUtilization: { capacity, occupied, available: capacity - occupied, occupancyPercent: capacity > 0 ? parseFloat(((occupied / capacity) * 100).toFixed(1)) : 0 },
      freezerOccupancy: freezersOccupancy.rows.map(f => ({
        ...f,
        occupied: parseInt(f.occupied, 10),
        available: f.capacity - parseInt(f.occupied, 10),
        occupancyPercent: f.capacity > 0 ? parseFloat(((parseInt(f.occupied, 10) / f.capacity) * 100).toFixed(1)) : 0
      })),
      specimenDistribution: specimenDistribution.rows,
      qcResultRates: qcResultRes.rows,
      shipmentTrends: shipmentTrends.rows,
      disposalTrends: disposalTrends.rows,
      recentActivities: recentActivities.rows
    });
  } catch (err) {
    next(err);
  }
}

// 2. Specimen Inventory Report
export async function getSpecimenInventory(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    // Filters
    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(s.id ILIKE $${paramIndex} OR s.subject_id ILIKE $${paramIndex} OR s.diagnosis ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    // Add column filters if present
    const filters = ['sampleId', 'barcode', 'subjectId', 'study', 'specimenType', 'status', 'freezer', 'createdBy'];
    filters.forEach(f => {
      const val = req.query[f];
      if (val) {
        if (f === 'sampleId') {
          filterQueries.push(`s.id ILIKE $${paramIndex}`);
          filterValues.push(`%${val}%`);
        } else if (f === 'barcode') {
          filterQueries.push(`b.barcode_value ILIKE $${paramIndex}`);
          filterValues.push(`%${val}%`);
        } else if (f === 'subjectId') {
          filterQueries.push(`s.subject_id ILIKE $${paramIndex}`);
          filterValues.push(`%${val}%`);
        } else if (f === 'specimenType') {
          filterQueries.push(`s.specimen_type = $${paramIndex}`);
          filterValues.push(val);
        } else if (f === 'status') {
          filterQueries.push(`s.status = $${paramIndex}`);
          filterValues.push(val);
        } else if (f === 'freezer') {
          filterQueries.push(`s.location LIKE $${paramIndex} || '%'`);
          filterValues.push(val);
        } else if (f === 'createdBy') {
          filterQueries.push(`u.name ILIKE $${paramIndex}`);
          filterValues.push(`%${val}%`);
        }
        paramIndex++;
      }
    });

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';

    // Sort mappings
    let orderByCol = 's.created_at';
    if (sortBy === 'sampleId') orderByCol = 's.id';
    else if (sortBy === 'subjectId') orderByCol = 's.subject_id';
    else if (sortBy === 'specimenType') orderByCol = 's.specimen_type';
    else if (sortBy === 'volume') orderByCol = 's.sample_volume';
    else if (sortBy === 'collectionDate') orderByCol = 's.collection_date';
    else if (sortBy === 'status') orderByCol = 's.status';

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM samples s
      LEFT JOIN barcodes b ON b.sample_id = s.id
      LEFT JOIN users u ON s.collector_id = u.id
      ${whereClause}
    `;

    const countRes = await pool.query(countQuery, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        s.id as "sampleId", 
        b.barcode_value as "barcode", 
        s.subject_id as "subjectId", 
        'IRB-2026-STUDY' as "study", 
        s.specimen_type as "specimenType", 
        s.sample_volume as "volume", 
        s.collection_date as "collectionDate", 
        s.status as "status", 
        s.location as "storageLocation",
        u.name as "createdBy"
      FROM samples s
      LEFT JOIN barcodes b ON b.sample_id = s.id
      LEFT JOIN users u ON s.collector_id = u.id
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    // Split location details in response
    const rows = dataRes.rows.map(row => {
      const locParts = (row.storageLocation || '').split(' > ');
      return {
        ...row,
        freezer: locParts[0] || 'N/A',
        rack: locParts[1] || 'N/A',
        shelf: locParts[2] || 'N/A',
        box: locParts[3] || 'N/A',
        position: locParts[4] || 'N/A'
      };
    });

    res.json({
      summary,
      rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 3. Sample Collection Report
export async function getSampleCollection(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(s.subject_id ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR l.name ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';
    let orderByCol = 's.collection_date';
    if (sortBy === 'subjectId') orderByCol = 's.subject_id';
    else if (sortBy === 'collector') orderByCol = 'u.name';
    else if (sortBy === 'collectionSite') orderByCol = 'l.name';

    const countRes = await pool.query(`
      SELECT COUNT(*) as total 
      FROM samples s
      LEFT JOIN users u ON s.collector_id = u.id
      LEFT JOIN labs l ON s.lab_id = l.id
      ${whereClause}
    `, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        s.collection_date as "collectionDate",
        s.subject_id as "subjectId",
        u.name as "collector",
        l.name as "collectionSite",
        s.specimen_type as "specimenType",
        s.sample_volume as "volume",
        s.consent_status as "consentStatus"
      FROM samples s
      LEFT JOIN users u ON s.collector_id = u.id
      LEFT JOIN labs l ON s.lab_id = l.id
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    res.json({
      summary,
      rows: dataRes.rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 4. Sample Processing Report
export async function getSampleProcessing(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(sample_id ILIKE $${paramIndex} OR processing_step ILIKE $${paramIndex} OR operator ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';
    let orderByCol = 'start_time';
    if (sortBy === 'sampleId') orderByCol = 'sample_id';
    else if (sortBy === 'processingStep') orderByCol = 'processing_step';
    else if (sortBy === 'operator') orderByCol = 'operator';
    else if (sortBy === 'status') orderByCol = 'status';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM sample_processing ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        sample_id as "sampleId",
        processing_step as "processingStep",
        operator,
        start_time as "startTime",
        end_time as "endTime",
        duration,
        status
      FROM sample_processing
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    res.json({
      summary,
      rows: dataRes.rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 5. Consent Report
export async function getConsentReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(subject_id ILIKE $${paramIndex} OR consent_version ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';
    let orderByCol = 'consent_date';
    if (sortBy === 'subjectId') orderByCol = 'subject_id';
    else if (sortBy === 'consentStatus') orderByCol = 'verification_status';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM consent ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        subject_id as "subjectId",
        consent_version as "consentVersion",
        consent_date as "consentDate",
        (consent_date::date + INTERVAL '5 years')::date::text as "expiryDate",
        verification_status as "consentStatus"
      FROM consent
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    res.json({
      summary,
      rows: dataRes.rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 6. Inventory Report
export async function getInventoryReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(item_name ILIKE $${paramIndex} OR location ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';
    let orderByCol = 'item_name';
    if (sortBy === 'itemName') orderByCol = 'item_name';
    else if (sortBy === 'availableQuantity') orderByCol = 'available_quantity';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM lab_inventory ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        item_name as "itemName",
        available_quantity as "availableQuantity",
        reserved_quantity as "reservedQuantity",
        minimum_quantity as "minimumQuantity",
        location
      FROM lab_inventory
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    res.json({
      summary,
      rows: dataRes.rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 7. Storage Report
export async function getStorageReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = ['location IS NOT NULL'];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(id ILIKE $${paramIndex} OR location ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = 'WHERE ' + filterQueries.join(' AND ');
    let orderByCol = 'id';
    if (sortBy === 'sampleId') orderByCol = 'id';
    else if (sortBy === 'storageLocation') orderByCol = 'location';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM samples ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        id as "sampleId",
        location as "storageLocation"
      FROM samples
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    const rows = dataRes.rows.map(row => {
      const locParts = (row.storageLocation || '').split(' > ');
      const freezer = locParts[0] || 'N/A';
      
      let temp = -80.4;
      if (freezer.startsWith('LN2')) temp = -196.2;
      else if (freezer.startsWith('FRZ')) temp = -20.0;
      else if (freezer.startsWith('UPR')) temp = 4.0;

      return {
        sampleId: row.sampleId,
        freezer,
        rack: locParts[1] || 'N/A',
        shelf: locParts[2] || 'N/A',
        box: locParts[3] || 'N/A',
        position: locParts[4] || 'N/A',
        temperature: temp,
        occupancy: 'Occupied'
      };
    });

    res.json({
      summary,
      rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 8. Shipment Report
export async function getShipmentReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(id ILIKE $${paramIndex} OR destination ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';
    let orderByCol = 'created_at';
    if (sortBy === 'shipmentId') orderByCol = 'id';
    else if (sortBy === 'destination') orderByCol = 'destination';
    else if (sortBy === 'status') orderByCol = 'status';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM shipments ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        id as "shipmentId",
        'Biomedical Courier Inc.' as courier,
        'TRK-' || id as "trackingNumber",
        destination,
        COALESCE(shipped_at, created_at::text) as "dispatchDate",
        COALESCE(received_at, 'In Transit') as "deliveryDate",
        status as "shipmentStatus"
      FROM shipments
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    res.json({
      summary,
      rows: dataRes.rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 9. Specimen Release Report
export async function getSpecimenReleaseReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(researcher_name ILIKE $${paramIndex} OR institution ILIKE $${paramIndex} OR irb_code ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';
    let orderByCol = 'created_at';
    if (sortBy === 'releaseId') orderByCol = 'id';
    else if (sortBy === 'researcher') orderByCol = 'researcher_name';
    else if (sortBy === 'institution') orderByCol = 'institution';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM research_requests ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        id as "releaseId",
        'Study Protocol ' || irb_code as "researchProject",
        researcher_name as researcher,
        institution,
        status as "approvalStatus",
        specimens as "releasedSamples",
        created_at::date::text as "releaseDate"
      FROM research_requests
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    res.json({
      summary,
      rows: dataRes.rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 10. Disposal Report
export async function getDisposalReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(sample_id ILIKE $${paramIndex} OR reason ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';
    let orderByCol = 'disposal_date';
    if (sortBy === 'disposalId') orderByCol = 'id';
    else if (sortBy === 'sampleId') orderByCol = 'sample_id';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM disposals ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        id as "disposalId",
        sample_id as "sampleId",
        reason,
        approved_by as "approvedBy",
        disposal_date::date::text as "disposalDate"
      FROM disposals
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    res.json({
      summary,
      rows: dataRes.rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 11. QC Report
export async function getQCReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(sample_id ILIKE $${paramIndex} OR technician ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';
    let orderByCol = 'sample_id';
    if (sortBy === 'sampleId') orderByCol = 'sample_id';
    else if (sortBy === 'concentration') orderByCol = 'concentration';
    else if (sortBy === 'purity') orderByCol = 'purity';
    else if (sortBy === 'qcResult') orderByCol = 'qc_result';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM qc_reports ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        sample_id as "sampleId",
        concentration as "concentration",
        purity as "purity",
        qc_result as "qcResult",
        qc_status as "qcStatus",
        technician
      FROM qc_reports
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    res.json({
      summary,
      rows: dataRes.rows.map(r => ({
        ...r,
        concentration: `${r.concentration} ng/µL`,
        purity: `${r.purity} (A260/A280)`
      })),
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 12. Temperature Monitoring Report
export async function getTemperatureReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`freezer ILIKE $${paramIndex}`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';
    let orderByCol = 'recorded_time';
    if (sortBy === 'freezer') orderByCol = 'freezer';
    else if (sortBy === 'currentTemp') orderByCol = 'current_temp';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM temperature_monitoring ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        freezer,
        current_temp as "currentTemperature",
        min_temp as "minimum",
        max_temp as "maximum",
        alarm_status as "alarmStatus",
        recorded_time as "recordedTime"
      FROM temperature_monitoring
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    res.json({
      summary,
      rows: dataRes.rows.map(r => ({
        ...r,
        currentTemperature: `${r.currentTemperature}°C`,
        minimum: `${r.minimum}°C`,
        maximum: `${r.maximum}°C`
      })),
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 13. Chain of Custody Report
export async function getChainOfCustodyReport(req, res, next) {
  try {
    const { search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let sampleId = search.trim();
    if (!sampleId) {
      const defaultSampleRes = await pool.query("SELECT id FROM samples ORDER BY created_at DESC LIMIT 1");
      if (defaultSampleRes.rows.length > 0) {
        sampleId = defaultSampleRes.rows[0].id;
      }
    }

    if (!sampleId) {
      return res.json({ summary, sampleId: '', timeline: [] });
    }

    const sampleRes = await pool.query("SELECT * FROM samples WHERE id = $1", [sampleId]);
    if (sampleRes.rows.length === 0) {
      return res.json({ summary, sampleId, error: 'Sample not found', timeline: [] });
    }

    const sample = sampleRes.rows[0];

    const logsRes = await pool.query(`
      SELECT action_type, new_value, user_name, timestamp 
      FROM user_activity_logs 
      WHERE entity_id = $1 OR entity_id LIKE '%' || $1 || '%'
      ORDER BY timestamp ASC
    `, [sampleId]);

    const timeline = [];

    // 1. Collected
    timeline.push({
      stage: 'Collected',
      timestamp: sample.collection_date + ' ' + sample.collection_time,
      user: 'Clinic Intake Nurse',
      location: 'Metropolis Core Collection Clinic',
      status: 'Completed'
    });

    // 2. Processed
    const procRes = await pool.query("SELECT * FROM sample_processing WHERE sample_id = $1", [sampleId]);
    if (procRes.rows.length > 0) {
      const p = procRes.rows[0];
      timeline.push({
        stage: 'Processed',
        timestamp: new Date(p.end_time).toLocaleString(),
        user: p.operator,
        location: 'Processing Wing L2',
        status: p.status
      });
    }

    // 3. QC Approved
    const qcRes = await pool.query("SELECT * FROM qc_reports WHERE sample_id = $1", [sampleId]);
    if (qcRes.rows.length > 0) {
      const q = qcRes.rows[0];
      timeline.push({
        stage: 'QC Approved',
        timestamp: new Date(sample.created_at).toLocaleString(),
        user: q.technician,
        location: 'QC Chemistry Lab',
        status: q.qc_result === 'Passed' ? 'Completed' : 'Failed'
      });
    }

    // 4. Barcode Generated
    const barcodeRes = await pool.query("SELECT * FROM barcodes WHERE sample_id = $1", [sampleId]);
    if (barcodeRes.rows.length > 0) {
      const b = barcodeRes.rows[0];
      timeline.push({
        stage: 'Barcode Generated',
        timestamp: new Date(b.generated_at).toLocaleString(),
        user: 'LIMS Central Barcode Daemon',
        location: 'Printing Station P-03',
        status: 'Completed'
      });
    }

    // 5. Stored
    if (sample.location) {
      timeline.push({
        stage: 'Stored',
        timestamp: new Date(sample.created_at).toLocaleString(),
        user: 'Freezer Cryo-grid Manager',
        location: sample.location,
        status: 'Completed'
      });
    }

    // Logs timeline events
    logsRes.rows.forEach(log => {
      let stage = '';
      if (log.action_type === 'Retrieve') stage = 'Released';
      else if (log.action_type === 'Store') stage = 'Stored';
      else if (log.action_type === 'Dispose') stage = 'Disposed';
      else if (log.action_type === 'Ship') stage = 'Shipped';
      else if (log.action_type === 'Receive') stage = 'Received';

      if (stage) {
        timeline.push({
          stage,
          timestamp: new Date(log.timestamp).toLocaleString(),
          user: log.user_name,
          location: log.new_value || 'Cryo Repository',
          status: 'Completed'
        });
      }
    });

    res.json({
      summary,
      sampleId,
      specimenType: sample.specimen_type,
      subjectId: sample.subject_id,
      timeline
    });
  } catch (err) {
    next(err);
  }
}

// 14. Audit Trail Report
export async function getAuditTrailReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(user_name ILIKE $${paramIndex} OR role ILIKE $${paramIndex} OR action_type ILIKE $${paramIndex} OR module_name ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';
    let orderByCol = 'timestamp';
    if (sortBy === 'user') orderByCol = 'user_name';
    else if (sortBy === 'action') orderByCol = 'action_type';
    else if (sortBy === 'module') orderByCol = 'module_name';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM user_activity_logs ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        user_name as "user",
        role,
        module_name as module,
        action_type as action,
        entity_id as record,
        timestamp,
        COALESCE(ip_address, '127.0.0.1') as "ipAddress"
      FROM user_activity_logs
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    res.json({
      summary,
      rows: dataRes.rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 15. User Activity Report
export async function getUserActivityReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(user_name ILIKE $${paramIndex} OR role ILIKE $${paramIndex} OR performed_actions ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';
    let orderByCol = 'login_time';
    if (sortBy === 'user') orderByCol = 'user_name';
    else if (sortBy === 'sessionDuration') orderByCol = 'session_duration';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM user_sessions ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const dataQuery = `
      SELECT 
        user_name as "user",
        role,
        login_time as "loginTime",
        logout_time as "logoutTime",
        session_duration as "sessionDuration",
        performed_actions as "performedActions"
      FROM user_sessions
      ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(dataQuery, [...filterValues, pageSize, offset]);

    res.json({
      summary,
      rows: dataRes.rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 16. Freezer Utilization Report
export async function getFreezerUtilizationReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let orderByCol = 'fc.freezer_id';
    if (sortBy === 'freezer') orderByCol = 'fc.freezer_id';
    else if (sortBy === 'capacity') orderByCol = 'fc.capacity';

    const countRes = await pool.query("SELECT COUNT(*) as total FROM freezer_configurations");
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const queryStr = `
      SELECT 
        fc.freezer_id as freezer, 
        fc.capacity,
        COUNT(s.id) as occupied
      FROM freezer_configurations fc
      LEFT JOIN samples s ON s.location LIKE fc.freezer_id || '%' AND s.retrieval_status != 'Retrieved' AND s.status != 'Disposed'
      GROUP BY fc.freezer_id, fc.capacity
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT $1 OFFSET $2
    `;

    const dataRes = await pool.query(queryStr, [pageSize, offset]);

    const rows = dataRes.rows.map(f => {
      const occupied = parseInt(f.occupied, 10);
      const available = f.capacity - occupied;
      const occupancy_percent = f.capacity > 0 ? parseFloat(((occupied / f.capacity) * 100).toFixed(1)) : 0;
      return {
        freezer: f.freezer,
        capacity: f.capacity,
        occupied,
        available,
        occupancyPercent: `${occupancy_percent}%`
      };
    });

    res.json({
      summary,
      rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 17. Expiry Report
export async function getExpiryReport(req, res, next) {
  try {
    const { offset, pageSize, sortBy, sortOrder, search } = getPaginationParams(req);
    const summary = await getSummaryMetrics();

    let filterQueries = [];
    let filterValues = [];
    let paramIndex = 1;

    if (search) {
      filterQueries.push(`(id ILIKE $${paramIndex} OR specimen_type ILIKE $${paramIndex})`);
      filterValues.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';

    const countRes = await pool.query(`SELECT COUNT(*) as total FROM samples ${whereClause}`, filterValues);
    const totalRecords = parseInt(countRes.rows[0].total, 10);
    summary.totalRecords = totalRecords;

    const queryStr = `
      SELECT 
        id as "sampleId",
        specimen_type as "specimenType",
        collection_date,
        CASE 
          WHEN specimen_type = 'Blood' THEN (collection_date::date + INTERVAL '30 days')::text
          WHEN specimen_type IN ('Serum', 'Plasma') THEN (collection_date::date + INTERVAL '730 days')::text
          WHEN specimen_type IN ('Tissue', 'FFPE Tissue', 'Frozen Tissue') THEN (collection_date::date + INTERVAL '1825 days')::text
          ELSE (collection_date::date + INTERVAL '730 days')::text
        END as "expiryDate"
      FROM samples
      ${whereClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataRes = await pool.query(queryStr, [...filterValues, pageSize, offset]);

    const rows = dataRes.rows.map(r => {
      const expiry = new Date(r.expiryDate);
      const today = new Date();
      const diffTime = expiry - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let status = 'Valid';
      if (diffDays <= 0) status = 'Expired';
      else if (diffDays <= 15) status = 'Near Expiry';

      return {
        sampleId: r.sampleId,
        specimenType: r.specimenType,
        expiryDate: r.expiryDate,
        daysRemaining: Math.max(0, diffDays),
        status
      };
    });

    if (sortBy === 'daysRemaining') {
      rows.sort((a, b) => sortOrder === 'ASC' ? a.daysRemaining - b.daysRemaining : b.daysRemaining - a.daysRemaining);
    } else if (sortBy === 'status') {
      rows.sort((a, b) => sortOrder === 'ASC' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status));
    }

    res.json({
      summary,
      rows,
      pagination: {
        totalRecords,
        page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}

// 18. Empty Storage Report
export async function getEmptyStorageReport(req, res, next) {
  try {
    const summary = await getSummaryMetrics();

    const freezersRes = await pool.query("SELECT * FROM freezer_configurations WHERE status = 'Active'");
    const freezers = freezersRes.rows;

    const occupiedRes = await pool.query("SELECT location FROM samples WHERE location IS NOT NULL AND retrieval_status != 'Retrieved' AND status != 'Disposed'");
    const occupiedSet = new Set(occupiedRes.rows.map(r => r.location));

    const rows = [];
    const shelves = ['Shelf A', 'Shelf B', 'Shelf C'];
    const drawers = ['Drawer 1', 'Drawer 2', 'Drawer 3'];
    const boxes = ['Box A12', 'Box B04', 'Box C10'];
    const wells = ['A1', 'A2', 'B1', 'B2', 'C3', 'D4', 'E5', 'F6'];

    outerLoop:
    for (const fc of freezers) {
      for (const sh of shelves) {
        for (const dr of drawers) {
          for (const bx of boxes) {
            for (const wl of wells) {
              const coordinate = `${fc.freezer_id} > ${sh} > ${dr} > ${bx} > Well ${wl}`;
              if (!occupiedSet.has(coordinate)) {
                rows.push({
                  freezer: fc.name,
                  rack: sh,
                  shelf: dr,
                  box: bx,
                  availablePositions: `Well ${wl}`
                });

                if (rows.length >= 100) {
                  break outerLoop;
                }
              }
            }
          }
        }
      }
    }

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;
    const paginatedRows = rows.slice(offset, offset + pageSize);

    res.json({
      summary,
      rows: paginatedRows,
      pagination: {
        totalRecords: rows.length,
        page,
        pageSize,
        totalPages: Math.ceil(rows.length / pageSize)
      }
    });
  } catch (err) {
    next(err);
  }
}
