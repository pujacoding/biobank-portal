import React, { useState, useEffect } from 'react';
import EnterpriseDataGrid from './EnterpriseDataGrid';
import './Reports.css';

export default function ReportsLayout({
  reportEndpoint,
  reportTitle,
  reportDescription,
  columns = [],
  authToken
}) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({
    totalRecords: 0,
    totalSamples: 0,
    collected: 0,
    processed: 0,
    stored: 0,
    released: 0,
    disposed: 0,
    expired: 0,
    pendingQc: 0
  });
  
  const [pagination, setPagination] = useState({
    totalRecords: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1
  });

  const [loading, setLoading] = useState(false);
  const [generatedTime, setGeneratedTime] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  
  // Advanced Filters State
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    sampleId: '',
    barcode: '',
    subjectId: '',
    study: '',
    specimenType: '',
    status: '',
    freezer: '',
    createdBy: ''
  });

  // Timeline state for Chain of Custody
  const [cocTimeline, setCocTimeline] = useState([]);
  const [cocMetadata, setCocMetadata] = useState(null);

  // Dashboard Analytics states
  const [dashboardData, setDashboardData] = useState(null);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: pagination.page,
        pageSize: pagination.pageSize,
        sortBy,
        sortOrder,
        search: filters.search
      });

      // Append filter parameters
      Object.keys(filters).forEach(key => {
        if (filters[key] && key !== 'search') {
          queryParams.append(key, filters[key]);
        }
      });

      const response = await fetch(`/api/reports/${reportEndpoint}?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to retrieve report data');
      }

      const resData = await response.json();
      setGeneratedTime(new Date().toLocaleString());

      if (reportEndpoint === 'dashboard') {
        setDashboardData(resData);
        setSummary(resData.summary);
      } else if (reportEndpoint === 'chain-of-custody') {
        setCocTimeline(resData.timeline || []);
        setCocMetadata({
          sampleId: resData.sampleId,
          specimenType: resData.specimenType,
          subjectId: resData.subjectId,
          error: resData.error
        });
        setSummary(resData.summary);
      } else {
        setRows(resData.rows || []);
        setSummary(resData.summary || {});
        setPagination(prev => ({
          ...prev,
          totalRecords: resData.pagination?.totalRecords || 0,
          totalPages: resData.pagination?.totalPages || 1
        }));
      }
    } catch (error) {
      console.error("Error retrieving report data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [reportEndpoint, pagination.page, pagination.pageSize, sortBy, sortOrder]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchReportData();
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      sampleId: '',
      barcode: '',
      subjectId: '',
      study: '',
      specimenType: '',
      status: '',
      freezer: '',
      createdBy: ''
    });
    setSortBy('');
    setSortOrder('asc');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // ----------------------------------------
  // EXPORT HANDLERS
  // ----------------------------------------
  
  const handleExportCSV = () => {
    if (rows.length === 0) return alert('No data available to export');

    const headersLine = columns.map(col => `"${col.label}"`).join(',');
    const rowsLines = rows.map(row => 
      columns.map(col => {
        let val = row[col.key] || '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headersLine, ...rowsLines].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AURA_Report_${reportEndpoint}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const doc = new window.jspdf.jsPDF('p', 'pt', 'a4');
    
    // Header title
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(8, 12, 24);
    doc.text("AURA ENTERPRISE BIOBANK REGISTRY", 40, 50);
    
    doc.setFontSize(12);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Report: ${reportTitle}`, 40, 75);
    doc.text(`Generated: ${generatedTime}`, 40, 95);
    doc.text(`Description: ${reportDescription}`, 40, 115);

    // Simple table generator
    let y = 150;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    const headers = columns.map(c => c.label);
    const headerWidths = columns.map(() => 500 / columns.length);
    
    // Draw headers
    let currentX = 40;
    headers.forEach((h, i) => {
      doc.text(h.substring(0, 15), currentX, y);
      currentX += headerWidths[i];
    });

    y += 15;
    doc.line(40, y, 550, y);
    y += 20;

    doc.setFont('Helvetica', 'normal');
    rows.slice(0, 20).forEach((row) => {
      if (y > 780) {
        doc.addPage();
        y = 50;
      }
      currentX = 40;
      columns.forEach((col, idx) => {
        const textVal = String(row[col.key] || '');
        doc.text(textVal.substring(0, 15), currentX, y);
        currentX += headerWidths[idx];
      });
      y += 20;
    });

    doc.save(`AURA_Report_${reportEndpoint}_${Date.now()}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  // Render individual report header
  const renderHeader = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'var(--font-title)', color: 'var(--text-primary)', margin: 0 }}>
          {reportTitle}
        </h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
          {reportDescription}
        </p>
        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'block', marginTop: '6px', fontWeight: '500' }}>
          Last generated: <span style={{ color: 'var(--accent-cyan)' }}>{generatedTime || 'Never'}</span>
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" className="btn btn-secondary" onClick={fetchReportData}>
          🔄 Refresh
        </button>
        {reportEndpoint !== 'dashboard' && reportEndpoint !== 'chain-of-custody' && (
          <>
            <button type="button" className="btn btn-secondary" onClick={handleExportCSV}>
              📥 CSV
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleExportPDF}>
              📄 PDF
            </button>
          </>
        )}
        <button type="button" className="btn btn-primary" onClick={handlePrint}>
          🖨️ Print
        </button>
      </div>
    </div>
  );

  // Render metric aggregate cards
  const renderSummaryCards = () => (
    <div className="summary-cards-grid">
      <div className="summary-card">
        <div className="summary-card-lbl">Total Records</div>
        <div className="summary-card-val cyan">{summary.totalRecords || pagination.totalRecords || rows.length}</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-lbl">Total Samples</div>
        <div className="summary-card-val primary">{summary.totalSamples}</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-lbl">Collected</div>
        <div className="summary-card-val success">{summary.collected}</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-lbl">Processed</div>
        <div className="summary-card-val purple">{summary.processed}</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-lbl">Stored</div>
        <div className="summary-card-val cyan">{summary.stored}</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-lbl">Released</div>
        <div className="summary-card-val primary">{summary.released}</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-lbl">Disposed</div>
        <div className="summary-card-val error">{summary.disposed}</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-lbl">Expired</div>
        <div className="summary-card-val warning">{summary.expired}</div>
      </div>
      <div className="summary-card">
        <div className="summary-card-lbl">Pending QC</div>
        <div className="summary-card-val warning">{summary.pendingQc}</div>
      </div>
    </div>
  );

  // Render filters drawer
  const renderFilters = () => {
    if (!showFilters) return null;
    return (
      <form onSubmit={handleSearch} className="filters-grid">
        <div className="form-group">
          <label className="form-label">Global Search</label>
          <input
            type="text"
            className="form-control"
            placeholder="Search Subject ID, sample ID..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Sample ID</label>
          <input
            type="text"
            className="form-control"
            placeholder="e.g. AURA-SMP..."
            value={filters.sampleId}
            onChange={(e) => handleFilterChange('sampleId', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Barcode</label>
          <input
            type="text"
            className="form-control"
            placeholder="e.g. BC-00..."
            value={filters.barcode}
            onChange={(e) => handleFilterChange('barcode', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Subject ID</label>
          <input
            type="text"
            className="form-control"
            placeholder="e.g. SUBJ-..."
            value={filters.subjectId}
            onChange={(e) => handleFilterChange('subjectId', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Specimen Type</label>
          <select
            className="form-control"
            value={filters.specimenType}
            onChange={(e) => handleFilterChange('specimenType', e.target.value)}
          >
            <option value="">All Specimen Types</option>
            <option value="Blood">Blood</option>
            <option value="Serum">Serum</option>
            <option value="Plasma">Plasma</option>
            <option value="DNA">DNA</option>
            <option value="RNA">RNA</option>
            <option value="Saliva">Saliva</option>
            <option value="Urine">Urine</option>
            <option value="Tissue">Tissue</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Freezer Location</label>
          <select
            className="form-control"
            value={filters.freezer}
            onChange={(e) => handleFilterChange('freezer', e.target.value)}
          >
            <option value="">All Freezers</option>
            <option value="ULT-01">ULT Freezer 01</option>
            <option value="ULT-02">ULT Freezer 02</option>
            <option value="ULT-03">ULT Freezer 03</option>
            <option value="LN2-01">LN2 Cryo Tank 01</option>
            <option value="LN2-02">LN2 Cryo Tank 02</option>
            <option value="FRZ-01">Standard Freezer 01</option>
            <option value="UPR-01">Upright Refrigerator 01</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select
            className="form-control"
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="Collected">Collected</option>
            <option value="Stored">Stored</option>
            <option value="Released">Released</option>
            <option value="Disposed">Disposed</option>
            <option value="Completed">Completed</option>
            <option value="Failed">Failed</option>
            <option value="Verified">Verified</option>
            <option value="Normal">Normal</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Created By</label>
          <input
            type="text"
            className="form-control"
            placeholder="Operator name..."
            value={filters.createdBy}
            onChange={(e) => handleFilterChange('createdBy', e.target.value)}
          />
        </div>

        <div className="filter-actions-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowFilters(false)}
          >
            Hide Filters
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResetFilters}
            >
              Reset
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              Apply Search
            </button>
          </div>
        </div>
      </form>
    );
  };

  // Render Dashboard Analytics Layout
  const renderDashboardAnalytics = () => {
    if (!dashboardData) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* KPI metrics row */}
        {renderSummaryCards()}

        {/* Dynamic graphical cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          {/* Freezer Occupancy table */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              Freezer Occupancy Rates
            </h3>
            <table style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px' }}>Freezer Unit</th>
                  <th style={{ textAlign: 'center', padding: '6px' }}>Capacity</th>
                  <th style={{ textAlign: 'center', padding: '6px' }}>Occupied</th>
                  <th style={{ textAlign: 'right', padding: '6px' }}>Occupancy</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.freezerOccupancy?.map(f => (
                  <tr key={f.freezer_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '8px 6px', fontWeight: '600' }}>{f.name}</td>
                    <td style={{ textAlign: 'center', padding: '8px 6px' }}>{f.capacity}</td>
                    <td style={{ textAlign: 'center', padding: '8px 6px' }}>{f.occupied}</td>
                    <td style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--accent-cyan)' }}>{f.occupancyPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Specimen Distribution */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              Specimen Type Allocation
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {dashboardData.specimenDistribution?.map(s => (
                <div key={s.specimen_type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>{s.specimen_type}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '60%' }}>
                    <div style={{ flexGrow: 1, height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (s.count / summary.totalSamples) * 100)}%`, background: 'var(--accent-cyan)' }}></div>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '30px', textAlign: 'right' }}>{s.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sample Processing & QC Rates */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              QC Verdict Breakdown
            </h3>
            <div style={{ display: 'flex', gap: '30px', justifyContent: 'space-around', padding: '20px 0' }}>
              {dashboardData.qcResultRates?.map(q => (
                <div key={q.qc_result} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: q.qc_result === 'Passed' ? 'var(--accent-success)' : 'var(--accent-error)' }}>
                    {q.count}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: '700' }}>
                    {q.qc_result} Verification
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Audits logs */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              Recent Security & System Actions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
              {dashboardData.recentActivities?.map((a, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', paddingBottom: '4px', borderBottom: '1px dashed var(--border-color)' }}>
                  <div>
                    <span style={{ fontWeight: '700' }}>{a.user_name}</span> ({a.role})
                    <span style={{ color: 'var(--text-secondary)' }}> performed {a.action_type} on </span>
                    <span style={{ fontWeight: '600', color: 'var(--accent-cyan)' }}>{a.module_name}</span>
                  </div>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    );
  };

  // Render Chain of Custody Timeline Layout
  const renderChainOfCustody = () => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Custody Sample Search block */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', background: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
            Enter Specimen ID to trace custody:
          </span>
          <input
            type="text"
            placeholder="e.g. AURA-SMP-2026-00001"
            className="form-control"
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            style={{ width: '280px', background: 'var(--bg-primary)' }}
          />
          <button type="submit" className="btn btn-primary">
            Trace Specimen
          </button>
        </form>

        {cocMetadata && cocMetadata.error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-error)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '14px', borderRadius: '8px', fontSize: '14px', fontWeight: '600' }}>
            ⚠️ Error: {cocMetadata.error}
          </div>
        )}

        {cocMetadata && !cocMetadata.error && (
          <div style={{ padding: '14px 20px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', gap: '24px', fontSize: '13px' }}>
            <div><strong>Sample ID:</strong> <span style={{ fontFamily: 'monospace' }}>{cocMetadata.sampleId}</span></div>
            <div><strong>Subject ID:</strong> {cocMetadata.subjectId}</div>
            <div><strong>Specimen Type:</strong> {cocMetadata.specimenType}</div>
          </div>
        )}

        {/* Timeline representation */}
        <div className="coc-timeline">
          {cocTimeline.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '24px' }}>
              No audit logs found for this specimen container.
            </div>
          ) : (
            cocTimeline.map((step, idx) => (
              <div key={idx} className={`coc-step ${step.status === 'Failed' ? 'failed' : 'completed'}`}>
                <div className="coc-badge-dot"></div>
                <div className="coc-content-box">
                  <div className="coc-header-row">
                    <span className="coc-stage-title" style={{ color: step.status === 'Failed' ? 'var(--accent-error)' : 'var(--accent-cyan)' }}>
                      {step.stage}
                    </span>
                    <span className="coc-stage-time">{step.timestamp}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <div><strong>Custodian Operator:</strong> {step.user}</div>
                    <div><strong>LIMS Location Node:</strong> {step.location}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', textRendering: 'optimizeLegibility' }}>
      
      {/* 1. Header Area */}
      {renderHeader()}

      {/* 2. Custom Layout Renders */}
      {reportEndpoint === 'dashboard' ? (
        renderDashboardAnalytics()
      ) : reportEndpoint === 'chain-of-custody' ? (
        renderChainOfCustody()
      ) : (
        /* Standard Enterprise Grid Layout */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Summary KPIs */}
          {renderSummaryCards()}

          {/* Filters drawer control */}
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowFilters(!showFilters)}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              {showFilters ? 'Hide Filters panel' : 'Show Advanced Filters panel'}
            </button>
          </div>

          {/* Advanced filters drawer */}
          {renderFilters()}

          {/* Enterprise Data Grid */}
          <EnterpriseDataGrid
            columns={columns}
            rows={rows}
            pagination={pagination}
            onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
            onPageSizeChange={(pageSize) => setPagination(prev => ({ ...prev, page: 1, pageSize }))}
            onSortChange={(col, order) => {
              setSortBy(col);
              setSortOrder(order);
            }}
            onFilterChange={(colKey, value) => {
              handleFilterChange(colKey, value);
              setPagination(prev => ({ ...prev, page: 1 }));
              fetchReportData();
            }}
            loading={loading}
            sortBy={sortBy}
            sortOrder={sortOrder}
          />

        </div>
      )}
    </div>
  );
}
