import React, { useState, useEffect } from 'react';

const REPORT_GROUPS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '📊',
    items: [
      { id: 'biobank-overview', label: 'Biobank Overview', desc: 'Overall biobank inventory and status summary.' },
      { id: 'key-statistics', label: 'Key Statistics', desc: 'Sample distribution and volumes by specimen type.' },
      { id: 'operational-summary', label: 'Operational Summary', desc: 'Breakdown of LIMS actions performed across modules.' }
    ]
  },
  {
    id: 'subject-consent',
    label: 'Subject & Consent',
    icon: '👤',
    items: [
      { id: 'subject-registration', label: 'Subject Registration', desc: 'A record of all registered donors and demographics.' },
      { id: 'consent-report', label: 'Consent Report', desc: 'General verification status of donor consent documents.' },
      { id: 'consent-history', label: 'Consent History', desc: 'Audit log of consent submissions, approvals, and withdrawals.' }
    ]
  },
  {
    id: 'sample-collection',
    label: 'Sample Collection',
    icon: '🩸',
    items: [
      { id: 'sample-collection', label: 'Sample Collection Report', desc: 'A detailed log of collected samples and volumes.' },
      { id: 'collection-summary', label: 'Collection Summary', desc: 'Aggregated collection metrics grouped by specimen type.' },
      { id: 'collection-status', label: 'Collection Status', desc: 'Breakdown of specimens by collection status.' }
    ]
  },
  {
    id: 'sample-processing',
    label: 'Sample Processing',
    icon: '⚙️',
    items: [
      { id: 'sample-processing', label: 'Sample Processing Report', desc: 'Processing ledger details, including aliquot quality and integrity.' },
      { id: 'processing-status', label: 'Processing Status', desc: 'LIMS sample ingestion progress and processing states.' },
      { id: 'processing-summary', label: 'Processing Summary', desc: 'Processing volume metrics aggregated by specimen type.' }
    ]
  },
  {
    id: 'specimen-inventory',
    label: 'Specimen Inventory',
    icon: '📦',
    items: [
      { id: 'specimen-inventory', label: 'Specimen Inventory', desc: 'Current active biological sample registry and storage coordinates.' },
      { id: 'inventory-movement', label: 'Inventory Movement', desc: 'Timeline ledger of sample movements, relocations, and checkouts.' },
      { id: 'inventory-status', label: 'Inventory Status', desc: 'Status overview of active storage aliquots.' },
      { id: 'expiry-report', label: 'Expiry Report', desc: 'Ethics compliance expiry report based on collection dates.' }
    ]
  },
  {
    id: 'inventory-storage',
    label: 'Inventory & Storage',
    icon: '❄️',
    items: [
      { id: 'storage-report', label: 'Storage Report', desc: 'Active spatial coordinates mapping inside cryogenic freezers.' },
      { id: 'freezer-occupancy', label: 'Freezer Occupancy', desc: 'Occupied vs available ratios for storage units.' },
      { id: 'empty-storage', label: 'Empty Storage Slots', desc: 'Available empty wells and positions in the microplate rack grid.' },
      { id: 'storage-movement', label: 'Storage Movement', desc: 'Audit trails specifically tracking freezer relocation coordinates.' }
    ]
  },
  {
    id: 'qc',
    label: 'QC',
    icon: '🔬',
    items: [
      { id: 'qc-report', label: 'QC Report', desc: 'Quality control metrics, ratings, and verdicts for sample batches.' },
      { id: 'qc-status', label: 'QC Status', desc: 'QC validation status counts.' },
      { id: 'qc-summary', label: 'QC Summary', desc: 'QC pass and failure rates grouped by specimen type.' }
    ]
  },
  {
    id: 'shipment-receiving',
    label: 'Shipment & Receiving',
    icon: '🚚',
    items: [
      { id: 'shipment-report', label: 'Shipment Report', desc: 'Log of dispatched shipping cargo and destinations.' },
      { id: 'receiving-report', label: 'Receiving Report', desc: 'Log of received shipments checked in at depots.' },
      { id: 'shipment-status', label: 'Shipment Status', desc: 'Breakdown of active shipment statuses.' },
      { id: 'shipment-history', label: 'Shipment History', desc: 'Audit history tracking shipment routing changes.' }
    ]
  },
  {
    id: 'disposal',
    label: 'Disposal',
    icon: '🗑️',
    items: [
      { id: 'disposal-report', label: 'Disposal Report', desc: 'List of decommissioned and autoclaved bio-waste specimens.' },
      { id: 'disposal-history', label: 'Disposal History', desc: 'Compliance justifications and audit trails for disposals.' }
    ]
  },
  {
    id: 'traceability',
    label: 'Traceability',
    icon: '🔍',
    items: [
      { id: 'trace-specimen', label: 'Trace Specimen', desc: 'Quick lookup of current registry states for specific barcode IDs.' },
      { id: 'chain-of-custody', label: 'Chain of Custody', desc: 'Detailed chronological movement timeline for a specimen.' }
    ]
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: '🌡️',
    items: [
      { id: 'temperature-logs', label: 'Temperature Logs', desc: 'Cryogenic unit temperature monitoring logs.' },
      { id: 'temperature-excursion', label: 'Temperature Excursion', desc: 'Alerts flagging instances of temperature threshold deviations.' }
    ]
  },
  {
    id: 'audit-users',
    label: 'Audit & Users',
    icon: '🛡️',
    items: [
      { id: 'audit-trail', label: 'Audit Trail', desc: 'Full compliance action logs for LIMS operations.' },
      { id: 'user-sessions', label: 'User Sessions', desc: 'Authentication session logs of logins and logouts.' }
    ]
  }
];

const REPORT_COLUMNS = {
  'subject-registration': [
    { key: 'subjectId', label: 'Subject ID' },
    { key: 'gender', label: 'Gender' },
    { key: 'age', label: 'Age' },
    { key: 'registrationDate', label: 'Registration Date' },
    { key: 'sampleCount', label: 'Samples Collected' },
    { key: 'consentStatus', label: 'Consent Status' }
  ],
  'consent-report': [
    { key: 'consentId', label: 'Consent ID' },
    { key: 'subjectId', label: 'Subject ID' },
    { key: 'consentType', label: 'Consent Type' },
    { key: 'consentVersion', label: 'Version' },
    { key: 'consentDate', label: 'Consent Date' },
    { key: 'status', label: 'Status' }
  ],
  'consent-history': [
    { key: 'consentId', label: 'Consent ID' },
    { key: 'subjectId', label: 'Subject ID' },
    { key: 'status', label: 'Status' },
    { key: 'submittedDate', label: 'Submitted Date' },
    { key: 'submittedBy', label: 'Submitted By' },
    { key: 'withdrawnAt', label: 'Withdrawn Date' },
    { key: 'withdrawnBy', label: 'Withdrawn By' }
  ],
  'sample-collection': [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'subjectId', label: 'Subject ID' },
    { key: 'specimenType', label: 'Specimen Type' },
    { key: 'volume', label: 'Volume (mL)' },
    { key: 'collectionDate', label: 'Collection Date' },
    { key: 'collectionTime', label: 'Collection Time' },
    { key: 'status', label: 'Status' }
  ],
  'collection-summary': [
    { key: 'specimenType', label: 'Specimen Type' },
    { key: 'collectedCount', label: 'Collected Count' },
    { key: 'totalVolume', label: 'Total Volume' },
    { key: 'avgVolume', label: 'Avg Volume' }
  ],
  'collection-status': [
    { key: 'status', label: 'Status' },
    { key: 'count', label: 'Specimens Count' },
    { key: 'totalVolume', label: 'Total Volume' }
  ],
  'sample-processing': [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'subjectId', label: 'Subject ID' },
    { key: 'specimenType', label: 'Specimen Type' },
    { key: 'processingStatus', label: 'Ingestion Status' },
    { key: 'quality', label: 'Quality Score' },
    { key: 'processingDate', label: 'Collection Date' }
  ],
  'processing-status': [
    { key: 'processingStatus', label: 'Ingestion Status' },
    { key: 'count', label: 'Count' }
  ],
  'processing-summary': [
    { key: 'specimenType', label: 'Specimen Type' },
    { key: 'processedCount', label: 'Processed Count' },
    { key: 'totalProcessedVolume', label: 'Total Volume' },
    { key: 'avgProcessedVolume', label: 'Avg Volume' }
  ],
  'specimen-inventory': [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'subjectId', label: 'Subject ID' },
    { key: 'specimenType', label: 'Specimen Type' },
    { key: 'volume', label: 'Volume (mL)' },
    { key: 'status', label: 'Status' },
    { key: 'location', label: 'Cryo Coordinates' }
  ],
  'inventory-movement': [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'movementType', label: 'Movement Action' },
    { key: 'fromLocation', label: 'Previous Coordinate' },
    { key: 'toLocation', label: 'New Coordinate' },
    { key: 'performedBy', label: 'Operator' },
    { key: 'timestamp', label: 'Date/Time' }
  ],
  'inventory-status': [
    { key: 'status', label: 'Status State' },
    { key: 'count', label: 'Total Specimens' },
    { key: 'totalVolume', label: 'Total Volume' }
  ],
  'expiry-report': [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'specimenType', label: 'Specimen Type' },
    { key: 'collectionDate', label: 'Collection Date' },
    { key: 'expiryDate', label: 'Ethics Expiry Date' }
  ],
  'storage-report': [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'specimenType', label: 'Specimen Type' },
    { key: 'location', label: 'Storage Coordinates' },
    { key: 'status', label: 'Status' }
  ],
  'freezer-occupancy': [
    { key: 'freezer', label: 'Freezer Unit' },
    { key: 'occupied', label: 'Occupied Positions' },
    { key: 'capacity', label: 'Total Capacity' }
  ],
  'empty-storage': [
    { key: 'freezer', label: 'Freezer Unit' },
    { key: 'rack', label: 'Rack' },
    { key: 'drawer', label: 'Drawer' },
    { key: 'box', label: 'Box' },
    { key: 'position', label: 'Position Well' }
  ],
  'storage-movement': [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'fromCoordinate', label: 'Origin' },
    { key: 'toCoordinate', label: 'Destination' },
    { key: 'performedBy', label: 'Operator' },
    { key: 'timestamp', label: 'Timestamp' }
  ],
  'qc-report': [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'specimenType', label: 'Specimen Type' },
    { key: 'qualityGrade', label: 'Quality Score' },
    { key: 'qcStatus', label: 'QC Status' },
    { key: 'collectionDate', label: 'Date Registered' }
  ],
  'qc-status': [
    { key: 'qcStatus', label: 'QC Verdict' },
    { key: 'count', label: 'Count' }
  ],
  'qc-summary': [
    { key: 'specimenType', label: 'Specimen Type' },
    { key: 'totalChecked', label: 'Total Inspected' },
    { key: 'passed', label: 'Passed / Approved' },
    { key: 'failed', label: 'Failed / Rejected' },
    { key: 'pending', label: 'Awaiting Validation' }
  ],
  'shipment-report': [
    { key: 'shipmentId', label: 'Shipment ID' },
    { key: 'destination', label: 'Target Bio-Depot' },
    { key: 'status', label: 'Status' },
    { key: 'shippedAt', label: 'Shipped Date' },
    { key: 'sampleCount', label: 'Specimens Enclosed' }
  ],
  'receiving-report': [
    { key: 'shipmentId', label: 'Shipment ID' },
    { key: 'destination', label: 'Intake Depot' },
    { key: 'status', label: 'Status' },
    { key: 'receivedAt', label: 'Check-In Date' },
    { key: 'sampleCount', label: 'Specimens Received' }
  ],
  'shipment-status': [
    { key: 'status', label: 'Status' },
    { key: 'count', label: 'Cargo Count' }
  ],
  'shipment-history': [
    { key: 'shipmentId', label: 'Shipment ID' },
    { key: 'action', label: 'Action State' },
    { key: 'details', label: 'Audit Details' },
    { key: 'performedBy', label: 'Officer' },
    { key: 'timestamp', label: 'Date/Time' }
  ],
  'disposal-report': [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'specimenType', label: 'Specimen Type' },
    { key: 'volume', label: 'Volume (mL)' },
    { key: 'decommissionDate', label: 'Decommission Date' }
  ],
  'disposal-history': [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'complianceJustification', label: 'Compliance Justification' },
    { key: 'performedBy', label: 'Officer' },
    { key: 'decommissionDate', label: 'Date Decommissioned' }
  ],
  'trace-specimen': [
    { key: 'sampleId', label: 'Barcode Value' },
    { key: 'subjectId', label: 'Donor Subject ID' },
    { key: 'specimenType', label: 'Specimen Type' },
    { key: 'currentStatus', label: 'Ingestion Status' },
    { key: 'currentLocation', label: 'Storage Position' },
    { key: 'qcStatus', label: 'QC Verdict' },
    { key: 'consentStatus', label: 'Consent State' }
  ],
  'chain-of-custody': [
    { key: 'sampleId', label: 'Sample ID' },
    { key: 'action', label: 'Action State' },
    { key: 'details', label: 'Activity Details' },
    { key: 'performedBy', label: 'User Operator' },
    { key: 'timestamp', label: 'Timestamp' }
  ],
  'temperature-logs': [
    { key: 'id', label: 'Log ID' },
    { key: 'freezerUnit', label: 'Freezer Unit' },
    { key: 'temperature', label: 'Recorded Temperature' },
    { key: 'timestamp', label: 'Date/Time' },
    { key: 'status', label: 'Status' }
  ],
  'temperature-excursion': [
    { key: 'id', label: 'Excursion ID' },
    { key: 'freezerUnit', label: 'Freezer Unit' },
    { key: 'deviationTemperature', label: 'Peak Deviation' },
    { key: 'thresholdLimit', label: 'Safety Threshold' },
    { key: 'duration', label: 'Duration' },
    { key: 'timestamp', label: 'Trigger Time' },
    { key: 'status', label: 'Status' }
  ],
  'audit-trail': [
    { key: 'id', label: 'Log ID' },
    { key: 'userName', label: 'User Operator' },
    { key: 'role', label: 'Role' },
    { key: 'action', label: 'Action' },
    { key: 'module', label: 'LIMS Module' },
    { key: 'details', label: 'Event Details' },
    { key: 'timestamp', label: 'Timestamp' }
  ],
  'user-sessions': [
    { key: 'id', label: 'Session Log ID' },
    { key: 'userName', label: 'Username' },
    { key: 'role', label: 'Role' },
    { key: 'sessionAction', label: 'Activity Action' },
    { key: 'ipAddress', label: 'Client IP' },
    { key: 'timestamp', label: 'Timestamp' }
  ],
  'biobank-overview': [
    { key: 'metric', label: 'Operational Metric Indicator' },
    { key: 'value', label: 'Telemetry Count' }
  ],
  'key-statistics': [
    { key: 'specimenType', label: 'Biological Specimen Type' },
    { key: 'count', label: 'Registered Count' },
    { key: 'totalVolume', label: 'Accumulated Volume' }
  ],
  'operational-summary': [
    { key: 'moduleName', label: 'Functional LIMS Module' },
    { key: 'operationCount', label: 'Total Operations Logged' }
  ]
};

export default function Reports({ samples, backendUrl, token, user, setActiveTab }) {
  const [activeReport, setActiveReport] = useState('biobank-overview');
  const [expandedGroups, setExpandedGroups] = useState({ dashboard: true });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters State
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('All');
  const [specimenType, setSpecimenType] = useState('All');
  const [qcVerdict, setQcVerdict] = useState('All');
  const [freezerUnit, setFreezerUnit] = useState('All');

  // Trigger fetch when report type, page, or applied filters change
  const fetchReportData = async () => {
    setLoading(true);
    try {
      const activeLab = localStorage.getItem('aura_active_lab_id');
      const queryParams = new URLSearchParams({
        page,
        pageSize: 10,
        search,
        dateFrom,
        dateTo,
        status,
        specimenType,
        qcVerdict,
        freezerUnit
      });

      const response = await fetch(`${backendUrl}/api/reports/${activeReport}?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
        }
      });

      const data = await response.json();
      if (response.ok) {
        setRows(data.rows || []);
        setTotalRecords(data.pagination?.totalRecords || 0);
        setTotalPages(data.pagination?.totalPages || 1);
      } else {
        console.error("Failed to load report data:", data.error);
      }
    } catch (error) {
      console.error("Error fetching report data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [activeReport, page]);

  const handleApplyFilters = () => {
    setPage(1);
    fetchReportData();
  };

  const handleResetFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setStatus('All');
    setSpecimenType('All');
    setQcVerdict('All');
    setFreezerUnit('All');
    setPage(1);
    // Use timeout to let state updates apply before fetching
    setTimeout(() => {
      fetchReportData();
    }, 50);
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Find active report metadata
  let activeReportItem = null;
  let activeGroupItem = null;
  for (const group of REPORT_GROUPS) {
    const found = group.items.find(item => item.id === activeReport);
    if (found) {
      activeReportItem = found;
      activeGroupItem = group;
      break;
    }
  }

  // Get dynamic unique specimen types from samples prop for filter dropdown
  const uniqueSpecimenTypes = ['All', ...new Set(samples.map(s => s.specimen_type).filter(Boolean))];

  // Helper to resolve status colors for cells
  const getStatusBadgeClass = (statusVal) => {
    if (!statusVal) return '';
    const val = String(statusVal).toLowerCase();
    if (['verified', 'approved', 'normal', 'valid', 'active', 'stored'].includes(val)) {
      return 'badge-verified';
    } else if (['pending', 'in transit', 'near expiry', 'collected'].includes(val)) {
      return 'badge-pending';
    } else if (['failed', 'withdrawn', 'disposed', 'excursion', 'expired', 'inactive'].includes(val)) {
      return 'badge-danger';
    }
    return 'badge-info';
  };

  // Export CSV Helper
  const handleExportCSV = () => {
    const cols = REPORT_COLUMNS[activeReport] || [];
    const headers = cols.map(c => c.label);
    const dataRows = rows.map(r => cols.map(c => r[c.key] || 'N/A'));

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...dataRows.map(row => row.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `aura_report_${activeReport}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export PDF Helper using jsPDF
  const handleExportPDF = () => {
    try {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) {
        alert("PDF export engine is currently unavailable. Please verify browser script assets.");
        return;
      }

      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      doc.setFillColor(8, 12, 24);
      doc.rect(0, 0, 210, 297, 'F');

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(0, 242, 254);
      doc.text("AURA RESEARCH BIOBANK CENTER", 15, 20);

      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(activeReportItem?.label.toUpperCase() || 'BIOBANK REPORT', 15, 27);

      const dateStr = new Date().toLocaleString();
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${dateStr} | Operator: ${user.name} (${user.role}) | Records: ${totalRecords}`, 15, 34);

      doc.setDrawColor(30, 41, 59);
      doc.line(15, 37, 195, 37);

      // Draw Headers
      let y = 45;
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 242, 254);

      const cols = REPORT_COLUMNS[activeReport] || [];
      const colWidth = Math.floor(180 / cols.length);

      let currentX = 15;
      cols.forEach(c => {
        doc.text(c.label, currentX, y);
        currentX += colWidth;
      });

      doc.line(15, y + 2, 195, y + 2);
      y += 8;

      // Draw Rows
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(226, 232, 240);

      rows.forEach((r, rowIndex) => {
        if (y > 275) {
          doc.addPage();
          doc.setFillColor(8, 12, 24);
          doc.rect(0, 0, 210, 297, 'F');
          
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(0, 242, 254);
          let nextX = 15;
          cols.forEach(c => {
            doc.text(c.label, nextX, 20);
            nextX += colWidth;
          });
          doc.line(15, 22, 195, 22);
          
          doc.setFont("Helvetica", "normal");
          doc.setTextColor(226, 232, 240);
          y = 28;
        }

        if (rowIndex % 2 === 1) {
          doc.setFillColor(15, 23, 42);
          doc.rect(15, y - 4, 180, 6, 'F');
        }

        let nextX = 15;
        cols.forEach(c => {
          doc.text(String(r[c.key] || 'N/A'), nextX, y);
          nextX += colWidth;
        });

        y += 6;
      });

      doc.save(`aura_report_${activeReport}.pdf`);
    } catch (err) {
      alert("Error generating PDF: " + err.message);
    }
  };

  // Print Report Helper
  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', letterSpacing: '-0.02em', margin: 0 }}>
            Biobank Compliance & <span className="title-gradient">Reports Center</span>
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Run audits, query historical sample records, and export compliance documents.
          </p>
        </div>
        <button 
          className="btn btn-secondary" 
          onClick={() => setActiveTab('dashboard')} 
          style={{ padding: '8px 16px', fontSize: '13px' }}
        >
          ← Back to Dashboard
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Side: Accordion Menu */}
        <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', maxHeight: '720px', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: '0 0 10px 8px', letterSpacing: '0.05em' }}>
            Workflow Modules
          </h3>
          
          {REPORT_GROUPS.map(group => {
            const isExpanded = !!expandedGroups[group.id];
            return (
              <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {/* Group Header Button */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--border-radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: '600',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{group.icon}</span>
                    <span>{group.label}</span>
                  </span>
                  <span style={{ fontSize: '10px', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s ease' }}>
                    ▼
                  </span>
                </button>

                {/* Sub-items (expanded state) */}
                {isExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '12px', borderLeft: '1.5px dashed var(--border-color)', margin: '2px 0 6px 12px' }}>
                    {group.items.map(item => {
                      const isSelected = activeReport === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveReport(item.id);
                            setPage(1);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: isSelected ? 'var(--border-color)' : 'transparent',
                            border: 'none',
                            borderRadius: 'var(--border-radius-sm)',
                            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: isSelected ? '700' : '500',
                            fontSize: '12.5px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          • {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Side: Report View Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Active Report Header Card */}
          <div className="glass-card" style={{ padding: '20px 24px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--accent-cyan)', letterSpacing: '0.05em' }}>
              Selected Report • {activeGroupItem?.label}
            </span>
            <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>
              {activeReportItem?.label}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              {activeReportItem?.desc}
            </p>
          </div>

          {/* Filters Bar Card */}
          <div className="glass-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              
              {/* Search filter (General) */}
              {activeReport !== 'freezer-occupancy' && activeReport !== 'empty-storage' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                    Search
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={activeReport === 'chain-of-custody' ? "Enter Barcode ID..." : "Search..."}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              )}

              {/* Date From (Filter) */}
              {!['freezer-occupancy', 'empty-storage', 'biobank-overview', 'key-statistics', 'operational-summary', 'temperature-excursion'].includes(activeReport) && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                      Date From
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                      Date To
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Specimen Type filter dropdown (Specific reports) */}
              {['sample-collection', 'collection-summary', 'sample-processing', 'processing-summary', 'specimen-inventory', 'expiry-report', 'storage-report', 'qc-report', 'qc-summary', 'disposal-report', 'trace-specimen'].includes(activeReport) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                    Specimen Type
                  </label>
                  <select
                    className="form-control"
                    value={specimenType}
                    onChange={(e) => setSpecimenType(e.target.value)}
                  >
                    {uniqueSpecimenTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* QC Verdict status filter */}
              {['qc-report', 'qc-status', 'qc-summary', 'sample-processing'].includes(activeReport) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                    QC Verdict
                  </label>
                  <select
                    className="form-control"
                    value={qcVerdict}
                    onChange={(e) => setQcVerdict(e.target.value)}
                  >
                    <option value="All">All Verdicts</option>
                    <option value="Pending">Pending</option>
                    <option value="Verified">Verified / Approved</option>
                    <option value="Failed">Failed / Rejected</option>
                  </select>
                </div>
              )}

              {/* Freezer Unit Filter */}
              {['specimen-inventory', 'storage-report', 'freezer-occupancy', 'empty-storage', 'storage-movement', 'temperature-logs', 'temperature-excursion'].includes(activeReport) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                    Freezer Unit
                  </label>
                  <select
                    className="form-control"
                    value={freezerUnit}
                    onChange={(e) => setFreezerUnit(e.target.value)}
                  >
                    <option value="All">All Units</option>
                    <option value="ULT-03">ULT Freezer 03</option>
                    <option value="LN2-01">LN2 Tank 01</option>
                  </select>
                </div>
              )}

              {/* General Status Filter */}
              {['consent-report', 'consent-history', 'shipment-report', 'receiving-report', 'shipment-status'].includes(activeReport) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                    Status
                  </label>
                  <select
                    className="form-control"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="All">All Statuses</option>
                    {['consent-report', 'consent-history'].includes(activeReport) ? (
                      <>
                        <option value="Pending">Pending</option>
                        <option value="Verified">Verified</option>
                        <option value="Withdrawn">Withdrawn</option>
                      </>
                    ) : (
                      <>
                        <option value="Pending">Pending</option>
                        <option value="In Transit">In Transit</option>
                        <option value="Received">Received</option>
                      </>
                    )}
                  </select>
                </div>
              )}

            </div>

            {/* Filter Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-primary" onClick={handleApplyFilters} style={{ padding: '8px 16px', fontSize: '13px' }}>
                  Apply Filters
                </button>
                <button className="btn btn-secondary" onClick={handleResetFilters} style={{ padding: '8px 16px', fontSize: '13px' }}>
                  Reset
                </button>
              </div>
              
              {/* Document Exports & Actions */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={fetchReportData} style={{ padding: '8px 12px', fontSize: '12px', borderColor: 'var(--border-color)' }}>
                  🔄 Refresh
                </button>
                <button className="btn btn-secondary" onClick={handlePrint} style={{ padding: '8px 12px', fontSize: '12px', borderColor: 'var(--border-color)' }}>
                  🖨️ Print
                </button>
                <button className="btn btn-secondary" onClick={handleExportCSV} style={{ padding: '8px 12px', fontSize: '12px', borderColor: 'var(--border-color)' }}>
                  📊 Export CSV
                </button>
                <button className="btn btn-secondary" onClick={handleExportPDF} style={{ padding: '8px 12px', fontSize: '12px', borderColor: 'var(--border-color)' }}>
                  📄 Export PDF
                </button>
              </div>
            </div>

          </div>

          {/* Main Data Report Grid Card */}
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            
            {loading ? (
              <div style={{ padding: '48px', color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center' }}>
                Loading report data records...
              </div>
            ) : rows.length === 0 ? (
              <div style={{ padding: '48px', color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center' }}>
                {activeReport === 'chain-of-custody' && !search 
                  ? "Enter a Barcode ID in the search input above to trace its Chain of Custody." 
                  : "No compliance audit records found matching the active filters."
                }
              </div>
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      {(REPORT_COLUMNS[activeReport] || []).map(col => (
                        <th key={col.key}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rIdx) => (
                      <tr key={row.id || row.sampleId || row.consentId || row.shipmentId || rIdx}>
                        {(REPORT_COLUMNS[activeReport] || []).map(col => {
                          const val = row[col.key];
                          
                          // Custom cells / formatting logic
                          if (col.key === 'status' || col.key === 'consentStatus' || col.key === 'qcStatus' || col.key === 'processingStatus' || col.key === 'movementType' || col.key === 'sessionAction') {
                            return (
                              <td key={col.key}>
                                <span className={`badge ${getStatusBadgeClass(val)}`}>
                                  {val || 'Pending'}
                                </span>
                              </td>
                            );
                          }

                          if (col.key === 'expiryDate') {
                            const isExpired = val && new Date(val) <= new Date();
                            return (
                              <td key={col.key} style={{ fontWeight: '600', color: isExpired ? 'var(--accent-error)' : 'var(--text-primary)' }}>
                                {val} {isExpired && ' (EXPIRED)'}
                              </td>
                            );
                          }

                          if (col.key === 'sampleId' || col.key === 'consentId' || col.key === 'shipmentId' || col.key === 'subjectId') {
                            return (
                              <td key={col.key} style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--accent-cyan)' }}>
                                {val || '--'}
                              </td>
                            );
                          }

                          return (
                            <td key={col.key}>
                              {val !== null && val !== undefined ? String(val) : '--'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Panel */}
            {totalRecords > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Total Records: <strong>{totalRecords}</strong>
                </span>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setPage(p => Math.max(p - 1, 1))}
                    disabled={page === 1}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: '600' }}>
                    Page {page} of {totalPages || 1}
                  </span>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                    disabled={page >= totalPages}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
