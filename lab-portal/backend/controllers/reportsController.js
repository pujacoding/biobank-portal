import { query } from '../services/dbService.js';

// Helper for pagination, search, and sort parameters
function getPaginationParams(req) {
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 10;
  const offset = (page - 1) * pageSize;
  const sortBy = req.query.sortBy || '';
  const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const search = req.query.search || '';
  const dateFrom = req.query.dateFrom || '';
  const dateTo = req.query.dateTo || '';
  const status = req.query.status || 'All';
  
  // Custom workflow filters
  const specimenType = req.query.specimenType || 'All';
  const qcVerdict = req.query.qcVerdict || 'All';
  const freezerUnit = req.query.freezerUnit || 'All';

  return { page, pageSize, offset, sortBy, sortOrder, search, dateFrom, dateTo, status, specimenType, qcVerdict, freezerUnit };
}

// Helper to determine if we should filter by lab
function getLabFilter(req) {
  const isSuperAdmin = req.user.role === 'Super Admin' || req.user.roleId === 1;
  const isDemoUser = Boolean(
    (req.user.email && req.user.email.toLowerCase().includes('demo')) ||
    (req.user.name && req.user.name.toLowerCase().includes('demo'))
  );
  const hasFilter = req.user && req.user.labId && !isSuperAdmin;
  return {
    isSuperAdmin,
    isDemoUser,
    hasFilter,
    labId: hasFilter ? req.user.labId : null,
    userId: req.user.userId,
    userName: req.user.name || ""
  };
}

/**
 * Main routing controller for all 20+ LIMS reports
 */
export async function getReportData(req, res, next) {
  try {
    const { reportType } = req.params;
    const params = getPaginationParams(req);
    const labFilter = getLabFilter(req);
    
    let queryStr = "";
    let countStr = "";
    let queryParams = [];
    let countParams = [];
    let paramIndex = 1;
    let filterQueries = [];

    // Apply demo user / lab context filter
    if (labFilter.isDemoUser) {
      if (['subject-registration', 'sample-collection', 'sample-processing', 'specimen-inventory', 'expiry-report', 'storage-report', 'freezer-occupancy', 'qc-report', 'disposal-report', 'trace-specimen', 'collection-summary', 'collection-status', 'processing-status', 'processing-summary', 'inventory-status', 'qc-status', 'qc-summary'].includes(reportType)) {
        filterQueries.push(`s.collector_id = $${paramIndex}`);
        queryParams.push(labFilter.userId);
        countParams.push(labFilter.userId);
        paramIndex++;
      } else if (['consent-report', 'consent-history'].includes(reportType)) {
        filterQueries.push(`c.subject_id IN (SELECT subject_id FROM samples WHERE collector_id = $${paramIndex})`);
        queryParams.push(labFilter.userId);
        countParams.push(labFilter.userId);
        paramIndex++;
      } else if (['shipment-report', 'receiving-report', 'shipment-status', 'shipment-history'].includes(reportType)) {
        filterQueries.push(`1 = 0`);
      } else if (['audit-trail', 'user-sessions', 'inventory-movement', 'storage-movement', 'disposal-history'].includes(reportType)) {
        filterQueries.push(`logs.user_id = $${paramIndex}`);
        queryParams.push(labFilter.userId);
        countParams.push(labFilter.userId);
        paramIndex++;
      }
    } else if (labFilter.hasFilter) {
      if (['subject-registration', 'sample-collection', 'sample-processing', 'specimen-inventory', 'expiry-report', 'storage-report', 'freezer-occupancy', 'qc-report', 'disposal-report'].includes(reportType)) {
        filterQueries.push(`s.lab_id = $${paramIndex}`);
        queryParams.push(labFilter.labId);
        countParams.push(labFilter.labId);
        paramIndex++;
      } else if (['consent-report', 'consent-history'].includes(reportType)) {
        filterQueries.push(`c.subject_id IN (SELECT subject_id FROM samples WHERE lab_id = $${paramIndex})`);
        queryParams.push(labFilter.labId);
        countParams.push(labFilter.labId);
        paramIndex++;
      } else if (['shipment-report', 'receiving-report', 'shipment-status', 'shipment-history'].includes(reportType)) {
        filterQueries.push(`ship.origin_lab_id = $${paramIndex}`);
        queryParams.push(labFilter.labId);
        countParams.push(labFilter.labId);
        paramIndex++;
      } else if (['audit-trail', 'user-sessions', 'inventory-movement', 'storage-movement', 'disposal-history'].includes(reportType)) {
        const labRes = await query("SELECT name FROM labs WHERE id = $1", [labFilter.labId]);
        const labName = labRes.rows[0]?.name || "";
        filterQueries.push(`logs.lab_name = $${paramIndex}`);
        queryParams.push(labName);
        countParams.push(labName);
        paramIndex++;
      }
    } else if (!labFilter.isSuperAdmin && !labFilter.hasFilter) {
      if (['subject-registration', 'sample-collection', 'sample-processing', 'specimen-inventory', 'expiry-report', 'storage-report', 'freezer-occupancy', 'qc-report', 'disposal-report', 'trace-specimen', 'collection-summary', 'collection-status', 'processing-status', 'processing-summary', 'inventory-status', 'qc-status', 'qc-summary'].includes(reportType)) {
        filterQueries.push(`s.collector_id = $${paramIndex}`);
        queryParams.push(labFilter.userId);
        countParams.push(labFilter.userId);
        paramIndex++;
      }
    }

    // Apply Date Filters
    if (params.dateFrom) {
      const colName = ['consent-report', 'consent-history'].includes(reportType) ? 'c.consent_date' : 
                      ['shipment-report', 'receiving-report', 'shipment-status', 'shipment-history'].includes(reportType) ? 'ship.created_at' :
                      ['audit-trail', 'user-sessions', 'inventory-movement', 'storage-movement', 'disposal-history'].includes(reportType) ? 'logs.timestamp' : 's.collection_date';
      
      const castSuffix = ['audit-trail', 'user-sessions', 'inventory-movement', 'storage-movement', 'disposal-history', 'shipment-report', 'receiving-report', 'shipment-status', 'shipment-history'].includes(reportType) ? '::date' : '';
      filterQueries.push(`${colName}${castSuffix} >= $${paramIndex}`);
      queryParams.push(params.dateFrom);
      countParams.push(params.dateFrom);
      paramIndex++;
    }
    if (params.dateTo) {
      const colName = ['consent-report', 'consent-history'].includes(reportType) ? 'c.consent_date' : 
                      ['shipment-report', 'receiving-report', 'shipment-status', 'shipment-history'].includes(reportType) ? 'ship.created_at' :
                      ['audit-trail', 'user-sessions', 'inventory-movement', 'storage-movement', 'disposal-history'].includes(reportType) ? 'logs.timestamp' : 's.collection_date';
      
      const castSuffix = ['audit-trail', 'user-sessions', 'inventory-movement', 'storage-movement', 'disposal-history', 'shipment-report', 'receiving-report', 'shipment-status', 'shipment-history'].includes(reportType) ? '::date' : '';
      filterQueries.push(`${colName}${castSuffix} <= $${paramIndex}`);
      queryParams.push(params.dateTo);
      countParams.push(params.dateTo);
      paramIndex++;
    }

    // Apply Status Filter
    if (params.status && params.status !== 'All') {
      if (['consent-report', 'consent-history'].includes(reportType)) {
        filterQueries.push(`c.verification_status = $${paramIndex}`);
      } else if (['shipment-report', 'receiving-report', 'shipment-status'].includes(reportType)) {
        filterQueries.push(`ship.status = $${paramIndex}`);
      } else if (['qc-report'].includes(reportType)) {
        filterQueries.push(`s.qc_status = $${paramIndex}`);
      } else {
        filterQueries.push(`s.status = $${paramIndex}`);
      }
      queryParams.push(params.status);
      countParams.push(params.status);
      paramIndex++;
    }

    // Apply Specimen Type Filter
    if (params.specimenType && params.specimenType !== 'All') {
      filterQueries.push(`s.specimen_type = $${paramIndex}`);
      queryParams.push(params.specimenType);
      countParams.push(params.specimenType);
      paramIndex++;
    }

    // Apply QC Verdict Filter
    if (params.qcVerdict && params.qcVerdict !== 'All') {
      filterQueries.push(`s.qc_status = $${paramIndex}`);
      queryParams.push(params.qcVerdict);
      countParams.push(params.qcVerdict);
      paramIndex++;
    }

    // Apply Freezer Unit Filter
    if (params.freezerUnit && params.freezerUnit !== 'All') {
      filterQueries.push(`s.location LIKE $${paramIndex}`);
      queryParams.push(`${params.freezerUnit}%`);
      countParams.push(`${params.freezerUnit}%`);
      paramIndex++;
    }

    // Search Query Helper
    if (params.search) {
      if (['consent-report', 'consent-history'].includes(reportType)) {
        filterQueries.push(`(c.subject_id ILIKE $${paramIndex} OR c.id ILIKE $${paramIndex})`);
      } else if (['shipment-report', 'receiving-report', 'shipment-status', 'shipment-history'].includes(reportType)) {
        filterQueries.push(`(ship.id ILIKE $${paramIndex} OR ship.destination ILIKE $${paramIndex})`);
      } else if (['audit-trail', 'user-sessions', 'inventory-movement', 'storage-movement', 'disposal-history'].includes(reportType)) {
        filterQueries.push(`(logs.user_name ILIKE $${paramIndex} OR logs.action_type ILIKE $${paramIndex} OR logs.entity_id ILIKE $${paramIndex} OR logs.new_value ILIKE $${paramIndex})`);
      } else {
        filterQueries.push(`(s.id ILIKE $${paramIndex} OR s.subject_id ILIKE $${paramIndex} OR s.diagnosis ILIKE $${paramIndex})`);
      }
      queryParams.push(`%${params.search}%`);
      countParams.push(`%${params.search}%`);
      paramIndex++;
    }

    const whereClause = filterQueries.length > 0 ? 'WHERE ' + filterQueries.join(' AND ') : '';

    // ==========================================
    // 12 REPORT CATEGORY CONTROLLERS MAP
    // ==========================================
    let rows = [];
    let totalRecords = 0;
    
    // Limits and Offset params placeholders
    const limitPlaceholder = `$${paramIndex}`;
    const offsetPlaceholder = `$${paramIndex + 1}`;

    switch (reportType) {
      case 'subject-registration': {
        // Returns subject demographic and sample count metrics
        countStr = `
          SELECT COUNT(DISTINCT s.subject_id) as total 
          FROM samples s
          ${whereClause}
        `;
        queryStr = `
          SELECT 
            s.subject_id as "subjectId",
            s.gender,
            s.age,
            MIN(s.collection_date) as "registrationDate",
            COUNT(s.id) as "sampleCount",
            s.consent_status as "consentStatus"
          FROM samples s
          ${whereClause}
          GROUP BY s.subject_id, s.gender, s.age, s.consent_status
          ORDER BY "registrationDate" ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'consent-report': {
        countStr = `SELECT COUNT(*) as total FROM consent c ${whereClause}`;
        queryStr = `
          SELECT 
            c.id as "consentId",
            c.subject_id as "subjectId",
            c.consent_type as "consentType",
            c.consent_version as "consentVersion",
            c.consent_date as "consentDate",
            c.verification_status as "status",
            c.document_url as "documentUrl"
          FROM consent c
          ${whereClause}
          ORDER BY c.consent_date ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'consent-history': {
        countStr = `SELECT COUNT(*) as total FROM consent c ${whereClause}`;
        queryStr = `
          SELECT 
            c.id as "consentId",
            c.subject_id as "subjectId",
            c.verification_status as "status",
            c.submitted_date as "submittedDate",
            c.submitted_by as "submittedBy",
            c.withdrawn_at as "withdrawnAt",
            c.withdrawn_by as "withdrawnBy"
          FROM consent c
          ${whereClause}
          ORDER BY c.created_at ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'sample-collection': {
        countStr = `SELECT COUNT(*) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.id as "sampleId",
            s.subject_id as "subjectId",
            s.specimen_type as "specimenType",
            s.sample_volume as "volume",
            s.collection_date as "collectionDate",
            s.collection_time as "collectionTime",
            s.status
          FROM samples s
          ${whereClause}
          ORDER BY s.collection_date ${params.sortOrder}, s.collection_time ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'collection-summary': {
        countStr = `SELECT COUNT(DISTINCT s.specimen_type) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.specimen_type as "specimenType",
            COUNT(*) as "collectedCount",
            SUM(s.sample_volume) as "totalVolume",
            AVG(s.sample_volume) as "avgVolume"
          FROM samples s
          ${whereClause}
          GROUP BY s.specimen_type
          ORDER BY "collectedCount" ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'collection-status': {
        countStr = `SELECT COUNT(DISTINCT s.status) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.status as "status",
            COUNT(*) as "count",
            SUM(s.sample_volume) as "totalVolume"
          FROM samples s
          ${whereClause}
          GROUP BY s.status
          ORDER BY "count" ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'sample-processing': {
        countStr = `SELECT COUNT(*) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.id as "sampleId",
            s.subject_id as "subjectId",
            s.specimen_type as "specimenType",
            s.ingestion_status as "processingStatus",
            s.quality,
            s.collection_date as "processingDate"
          FROM samples s
          ${whereClause}
          ORDER BY s.collection_date ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'processing-status': {
        countStr = `SELECT COUNT(DISTINCT s.ingestion_status) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.ingestion_status as "processingStatus",
            COUNT(*) as "count"
          FROM samples s
          ${whereClause}
          GROUP BY s.ingestion_status
          ORDER BY "count" ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'processing-summary': {
        countStr = `SELECT COUNT(DISTINCT s.specimen_type) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.specimen_type as "specimenType",
            COUNT(*) as "processedCount",
            SUM(s.sample_volume) as "totalProcessedVolume",
            AVG(s.sample_volume) as "avgProcessedVolume"
          FROM samples s
          ${whereClause}
          GROUP BY s.specimen_type
          ORDER BY "processedCount" ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'specimen-inventory': {
        countStr = `SELECT COUNT(*) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.id as "sampleId",
            s.subject_id as "subjectId",
            s.specimen_type as "specimenType",
            s.sample_volume as "volume",
            s.status,
            s.location
          FROM samples s
          ${whereClause}
          ORDER BY s.id ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'inventory-movement': {
        countStr = `
          SELECT COUNT(*) as total 
          FROM user_activity_logs logs 
          ${whereClause ? whereClause + " AND " : "WHERE "} logs.module_name = 'Inventory & Storage' AND logs.action_type IN ('RELOCATE', 'RETRIEVE', 'STORE')
        `;
        queryStr = `
          SELECT 
            logs.entity_id as "sampleId",
            logs.action_type as "movementType",
            logs.old_value as "fromLocation",
            logs.new_value as "toLocation",
            logs.user_name as "performedBy",
            logs.timestamp as "timestamp"
          FROM user_activity_logs logs
          ${whereClause ? whereClause + " AND " : "WHERE "} logs.module_name = 'Inventory & Storage' AND logs.action_type IN ('RELOCATE', 'RETRIEVE', 'STORE')
          ORDER BY logs.timestamp ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'inventory-status': {
        countStr = `SELECT COUNT(DISTINCT s.status) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.status as "status",
            COUNT(*) as "count",
            SUM(s.sample_volume) as "totalVolume"
          FROM samples s
          ${whereClause}
          GROUP BY s.status
          ORDER BY "count" ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'expiry-report': {
        countStr = `SELECT COUNT(*) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.id as "sampleId",
            s.specimen_type as "specimenType",
            s.collection_date as "collectionDate",
            CASE 
              WHEN s.specimen_type = 'Blood' THEN (s.collection_date::date + INTERVAL '30 days')::text
              WHEN s.specimen_type IN ('Serum', 'Plasma') THEN (s.collection_date::date + INTERVAL '730 days')::text
              WHEN s.specimen_type IN ('Tissue', 'FFPE Tissue', 'Frozen Tissue') THEN (s.collection_date::date + INTERVAL '1825 days')::text
              ELSE (s.collection_date::date + INTERVAL '730 days')::text
            END as "expiryDate"
          FROM samples s
          ${whereClause}
          ORDER BY "expiryDate" ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'storage-report': {
        countStr = `
          SELECT COUNT(*) as total 
          FROM samples s 
          ${whereClause ? whereClause + " AND " : "WHERE "} s.location IS NOT NULL
        `;
        queryStr = `
          SELECT 
            s.id as "sampleId",
            s.specimen_type as "specimenType",
            s.location,
            s.status
          FROM samples s
          ${whereClause ? whereClause + " AND " : "WHERE "} s.location IS NOT NULL
          ORDER BY s.location ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'freezer-occupancy': {
        countStr = `
          SELECT COUNT(DISTINCT COALESCE(split_part(s.location, ' > ', 1), 'Unassigned')) as total 
          FROM samples s 
          ${whereClause ? whereClause + " AND " : "WHERE "} s.location IS NOT NULL AND s.status != 'Disposed'
        `;
        queryStr = `
          SELECT 
            COALESCE(split_part(s.location, ' > ', 1), 'Unassigned') as "freezer",
            COUNT(*) as "occupied",
            500 as "capacity"
          FROM samples s
          ${whereClause ? whereClause + " AND " : "WHERE "} s.location IS NOT NULL AND s.status != 'Disposed'
          GROUP BY "freezer"
          ORDER BY "occupied" ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'empty-storage': {
        if (labFilter.isDemoUser) {
          totalRecords = 0;
          rows = [];
          break;
        }
        // Predefined grid wells logic subtraction from database
        const occupiedRes = await query("SELECT location FROM samples WHERE location IS NOT NULL AND retrieval_status != 'Retrieved' AND status != 'Disposed'");
        const occupiedSet = new Set(occupiedRes.rows.map(r => r.location));
        const freezers = ['ULT Freezer 03', 'LN2 Tank 01'];
        const shelves = ['Shelf B'];
        const drawers = ['Drawer 3'];
        const boxes = ['Box A12'];
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        const numbers = [1, 2, 3, 4, 5, 6];

        const allEmptySlots = [];
        for (const fz of freezers) {
          const prefix = fz === 'LN2 Tank 01' ? 'LN2-01' : 'ULT-03';
          for (const sh of shelves) {
            for (const dr of drawers) {
              for (const bx of boxes) {
                for (const l of letters) {
                  for (const n of numbers) {
                    const coordinate = `${prefix} > ${sh} > ${dr} > ${bx} > Well ${l}${n}`;
                    if (!occupiedSet.has(coordinate)) {
                      allEmptySlots.push({
                        freezer: fz,
                        rack: sh,
                        drawer: dr,
                        box: bx,
                        position: `Well ${l}${n}`,
                        coordinate
                      });
                    }
                  }
                }
              }
            }
          }
        }

        totalRecords = allEmptySlots.length;
        const page = params.page;
        const pageSize = params.pageSize;
        rows = allEmptySlots.slice((page - 1) * pageSize, page * pageSize);
        break;
      }

      case 'storage-movement': {
        countStr = `
          SELECT COUNT(*) as total 
          FROM user_activity_logs logs 
          ${whereClause ? whereClause + " AND " : "WHERE "} logs.module_name = 'Inventory & Storage' AND logs.action_type = 'RELOCATE'
        `;
        queryStr = `
          SELECT 
            logs.entity_id as "sampleId",
            logs.old_value as "fromCoordinate",
            logs.new_value as "toCoordinate",
            logs.user_name as "performedBy",
            logs.timestamp as "timestamp"
          FROM user_activity_logs logs
          ${whereClause ? whereClause + " AND " : "WHERE "} logs.module_name = 'Inventory & Storage' AND logs.action_type = 'RELOCATE'
          ORDER BY logs.timestamp ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'qc-report': {
        countStr = `SELECT COUNT(*) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.id as "sampleId",
            s.specimen_type as "specimenType",
            s.quality as "qualityGrade",
            s.qc_status as "qcStatus",
            s.collection_date as "collectionDate"
          FROM samples s
          ${whereClause}
          ORDER BY s.id ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'qc-status': {
        countStr = `SELECT COUNT(DISTINCT s.qc_status) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.qc_status as "qcStatus",
            COUNT(*) as "count"
          FROM samples s
          ${whereClause}
          GROUP BY s.qc_status
          ORDER BY "count" ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'qc-summary': {
        countStr = `SELECT COUNT(DISTINCT s.specimen_type) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.specimen_type as "specimenType",
            COUNT(*) as "totalChecked",
            SUM(CASE WHEN s.qc_status = 'Verified' THEN 1 ELSE 0 END) as "passed",
            SUM(CASE WHEN s.qc_status = 'Failed' THEN 1 ELSE 0 END) as "failed",
            SUM(CASE WHEN s.qc_status = 'Pending' THEN 1 ELSE 0 END) as "pending"
          FROM samples s
          ${whereClause}
          GROUP BY s.specimen_type
          ORDER BY "totalChecked" ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'shipment-report': {
        countStr = `SELECT COUNT(*) as total FROM shipments ship ${whereClause}`;
        queryStr = `
          SELECT 
            ship.id as "shipmentId",
            ship.destination,
            ship.status,
            ship.shipped_at as "shippedAt",
            ship.received_at as "receivedAt",
            (SELECT COUNT(*) FROM shipment_samples ss WHERE ss.shipment_id = ship.id) as "sampleCount"
          FROM shipments ship
          ${whereClause}
          ORDER BY ship.created_at ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'receiving-report': {
        countStr = `
          SELECT COUNT(*) as total 
          FROM shipments ship 
          ${whereClause ? whereClause + " AND " : "WHERE "} ship.status = 'Received'
        `;
        queryStr = `
          SELECT 
            ship.id as "shipmentId",
            ship.destination,
            ship.status,
            ship.shipped_at as "shippedAt",
            ship.received_at as "receivedAt",
            (SELECT COUNT(*) FROM shipment_samples ss WHERE ss.shipment_id = ship.id) as "sampleCount"
          FROM shipments ship
          ${whereClause ? whereClause + " AND " : "WHERE "} ship.status = 'Received'
          ORDER BY ship.received_at ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'shipment-status': {
        countStr = `SELECT COUNT(DISTINCT ship.status) as total FROM shipments ship ${whereClause}`;
        queryStr = `
          SELECT 
            ship.status as "status",
            COUNT(*) as "count"
          FROM shipments ship
          ${whereClause}
          GROUP BY ship.status
          ORDER BY "count" ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'shipment-history': {
        countStr = `
          SELECT COUNT(*) as total 
          FROM user_activity_logs logs 
          ${whereClause ? whereClause + " AND " : "WHERE "} logs.module_name = 'Shipment Management'
        `;
        queryStr = `
          SELECT 
            logs.entity_id as "shipmentId",
            logs.action_type as "action",
            logs.new_value as "details",
            logs.user_name as "performedBy",
            logs.timestamp as "timestamp"
          FROM user_activity_logs logs
          ${whereClause ? whereClause + " AND " : "WHERE "} logs.module_name = 'Shipment Management'
          ORDER BY logs.timestamp ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'disposal-report': {
        countStr = `
          SELECT COUNT(*) as total 
          FROM samples s 
          ${whereClause ? whereClause + " AND " : "WHERE "} s.status = 'Disposed'
        `;
        queryStr = `
          SELECT 
            s.id as "sampleId",
            s.specimen_type as "specimenType",
            s.sample_volume as "volume",
            s.collection_date as "decommissionDate"
          FROM samples s
          ${whereClause ? whereClause + " AND " : "WHERE "} s.status = 'Disposed'
          ORDER BY s.collection_date ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'disposal-history': {
        countStr = `
          SELECT COUNT(*) as total 
          FROM user_activity_logs logs 
          ${whereClause ? whereClause + " AND " : "WHERE "} logs.module_name = 'Inventory & Storage' AND logs.action_type = 'DISPOSE'
        `;
        queryStr = `
          SELECT 
            logs.entity_id as "sampleId",
            logs.new_value as "complianceJustification",
            logs.user_name as "performedBy",
            logs.timestamp as "decommissionDate"
          FROM user_activity_logs logs
          ${whereClause ? whereClause + " AND " : "WHERE "} logs.module_name = 'Inventory & Storage' AND logs.action_type = 'DISPOSE'
          ORDER BY logs.timestamp ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'trace-specimen': {
        countStr = `SELECT COUNT(*) as total FROM samples s ${whereClause}`;
        queryStr = `
          SELECT 
            s.id as "sampleId",
            s.subject_id as "subjectId",
            s.specimen_type as "specimenType",
            s.status as "currentStatus",
            s.location as "currentLocation",
            s.qc_status as "qcStatus",
            s.consent_status as "consentStatus",
            s.collection_date as "collectionDate"
          FROM samples s
          ${whereClause}
          ORDER BY s.id ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'chain-of-custody': {
        // Chronological log of custody changes for a sample
        if (!params.search) {
          totalRecords = 0;
          rows = [];
          break;
        }
        
        countStr = `
          SELECT COUNT(*) as total 
          FROM user_activity_logs logs 
          WHERE logs.entity_id = $1
        `;
        queryStr = `
          SELECT 
            logs.entity_id as "sampleId",
            logs.action_type as "action",
            logs.new_value as "details",
            logs.user_name as "performedBy",
            logs.timestamp as "timestamp"
          FROM user_activity_logs logs
          WHERE logs.entity_id = $1
          ORDER BY logs.timestamp ${params.sortOrder}
          LIMIT $2 OFFSET $3
        `;
        
        // Custom params override for specific sample audit lookup
        queryParams = [params.search.trim()];
        countParams = [params.search.trim()];
        break;
      }

      case 'temperature-logs': {
        if (labFilter.isDemoUser) {
          totalRecords = 0;
          rows = [];
          break;
        }
        // Dynamically generated temperature monitoring logs
        const mockLogs = [];
        const units = ['ULT Freezer 03', 'LN2 Tank 01'];
        const targets = [-80.4, -196.2];
        const now = new Date();

        for (let i = 0; i < 50; i++) {
          const logTime = new Date(now.getTime() - i * 30 * 60 * 1000); // 30 mins intervals
          const unitIdx = i % 2;
          const variance = (Math.random() - 0.5) * 2; // ±1°C variance
          const temp = parseFloat((targets[unitIdx] + variance).toFixed(1));
          
          if (params.freezerUnit === 'All' || (params.freezerUnit === 'ULT-03' && unitIdx === 0) || (params.freezerUnit === 'LN2-01' && unitIdx === 1)) {
            mockLogs.push({
              id: `TEMP-LOG-${10000 + i}`,
              freezerUnit: units[unitIdx],
              temperature: `${temp}°C`,
              timestamp: logTime.toISOString().replace('T', ' ').substring(0, 19),
              status: 'Normal'
            });
          }
        }

        totalRecords = mockLogs.length;
        const page = params.page;
        const pageSize = params.pageSize;
        rows = mockLogs.slice((page - 1) * pageSize, page * pageSize);
        break;
      }

      case 'temperature-excursion': {
        if (labFilter.isDemoUser) {
          totalRecords = 0;
          rows = [];
          break;
        }
        // Temperature excursion alerts (simulated events)
        const excursions = [
          { id: 'EXC-001', freezerUnit: 'ULT Freezer 03', deviationTemperature: '-74.2°C', thresholdLimit: '-78.0°C', duration: '45 mins', timestamp: '2026-08-20 14:30:12', status: 'Resolved' },
          { id: 'EXC-002', freezerUnit: 'LN2 Tank 01', deviationTemperature: '-185.0°C', thresholdLimit: '-190.0°C', duration: '12 mins', timestamp: '2026-08-22 09:12:44', status: 'Resolved' }
        ];
        
        totalRecords = excursions.length;
        rows = excursions;
        break;
      }

      case 'audit-trail': {
        countStr = `SELECT COUNT(*) as total FROM user_activity_logs logs ${whereClause}`;
        queryStr = `
          SELECT 
            logs.activity_id as "id",
            logs.user_name as "userName",
            logs.role,
            logs.action_type as "action",
            logs.module_name as "module",
            logs.new_value as "details",
            logs.timestamp as "timestamp"
          FROM user_activity_logs logs
          ${whereClause}
          ORDER BY logs.timestamp ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'user-sessions': {
        countStr = `
          SELECT COUNT(*) as total 
          FROM user_activity_logs logs 
          ${whereClause ? whereClause + " AND " : "WHERE "} logs.module_name = 'Auth' AND logs.action_type IN ('LOGIN', 'LOGOUT')
        `;
        queryStr = `
          SELECT 
            logs.activity_id as "id",
            logs.user_name as "userName",
            logs.role,
            logs.action_type as "sessionAction",
            logs.ip_address as "ipAddress",
            logs.timestamp as "timestamp"
          FROM user_activity_logs logs
          ${whereClause ? whereClause + " AND " : "WHERE "} logs.module_name = 'Auth' AND logs.action_type IN ('LOGIN', 'LOGOUT')
          ORDER BY logs.timestamp ${params.sortOrder}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
        `;
        break;
      }

      case 'biobank-overview': {
        // Group metrics overview
        const countRes = await query("SELECT COUNT(*) as total, SUM(CASE WHEN status != 'Disposed' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'Disposed' THEN 1 ELSE 0 END) as disposed, SUM(CASE WHEN qc_status = 'Verified' THEN 1 ELSE 0 END) as qc_passed, SUM(CASE WHEN location IS NOT NULL AND status != 'Disposed' THEN 1 ELSE 0 END) as stored FROM samples");
        const counts = countRes.rows[0] || { total: 0, active: 0, disposed: 0, qc_passed: 0, stored: 0 };
        
        rows = [
          { metric: 'Total Registered Specimens', value: parseInt(counts.total || 0, 10) },
          { metric: 'Active Aliquots in Inventory', value: parseInt(counts.active || 0, 10) },
          { metric: 'QC Cleared Specimens', value: parseInt(counts.qc_passed || 0, 10) },
          { metric: 'Stored in Freezer Cryo-Coordinate Grid', value: parseInt(counts.stored || 0, 10) },
          { metric: 'Disposed & Audited Bio-Waste', value: parseInt(counts.disposed || 0, 10) }
        ];
        totalRecords = rows.length;
        break;
      }

      case 'key-statistics': {
        // Group totals breakdown by Specimen Type
        const statsRes = await query("SELECT specimen_type as type, COUNT(*) as count, SUM(sample_volume) as volume FROM samples GROUP BY specimen_type ORDER BY count DESC");
        rows = statsRes.rows.map(r => ({
          specimenType: r.type,
          count: parseInt(r.count, 10),
          totalVolume: `${parseFloat(r.volume || 0).toFixed(1)} mL`
        }));
        totalRecords = rows.length;
        break;
      }

      case 'operational-summary': {
        // Sum logs breakdown by module actions
        const opsRes = await query("SELECT module_name as module, COUNT(*) as action_count FROM user_activity_logs GROUP BY module_name ORDER BY action_count DESC");
        rows = opsRes.rows.map(r => ({
          moduleName: r.module || 'System Core',
          operationCount: parseInt(r.action_count, 10)
        }));
        totalRecords = rows.length;
        break;
      }

      default: {
        return res.status(400).json({ error: `Invalid report identifier: '${reportType}'` });
      }
    }

    // Execute query and count if query strings exist
    if (queryStr) {
      // Execute count
      const countRes = await query(countStr, countParams);
      totalRecords = parseInt(countRes.rows[0]?.total || 0, 10);

      // Execute main data query
      const fullParams = [...queryParams, params.pageSize, params.offset];
      const dataRes = await query(queryStr, fullParams);
      rows = dataRes.rows;
    }

    res.json({
      success: true,
      reportType,
      rows,
      pagination: {
        totalRecords,
        page: params.page,
        pageSize: params.pageSize,
        totalPages: Math.ceil(totalRecords / params.pageSize)
      }
    });

  } catch (error) {
    next(error);
  }
}
