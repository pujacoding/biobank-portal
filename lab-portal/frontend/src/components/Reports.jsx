import React, { useState, useEffect } from 'react';

export default function Reports({ samples, backendUrl, token, user, setActiveTab }) {
  const [selectedReport, setSelectedReport] = useState('inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Extract unique specimen types from samples
  const specimenTypes = ['All', ...new Set(samples.map(s => s.specimen_type).filter(Boolean))];

  // 1. Filtered data helper
  const getFilteredData = () => {
    return samples.filter(sample => {
      // Search matches
      const matchesSearch = 
        sample.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sample.subject_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sample.diagnosis && sample.diagnosis.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (sample.location && sample.location.toLowerCase().includes(searchQuery.toLowerCase()));

      // Specimen type matches
      const matchesType = typeFilter === 'All' || sample.specimen_type === typeFilter;

      // Report-specific status rules
      let matchesReportStatus = true;
      if (selectedReport === 'inventory') {
        matchesReportStatus = statusFilter === 'All' || sample.status === statusFilter;
      } else if (selectedReport === 'storage') {
        const isStored = sample.location && sample.retrieval_status !== 'Retrieved' && sample.status !== 'Disposed';
        matchesReportStatus = isStored;
      } else if (selectedReport === 'released') {
        const isReleased = sample.status === 'Released' || sample.retrieval_status === 'Released' || 
                           sample.status === 'Retrieved' || sample.retrieval_status === 'Retrieved' ||
                           sample.status === 'Allocated' || sample.retrieval_status === 'Allocated';
        matchesReportStatus = isReleased;
      } else if (selectedReport === 'disposed') {
        const isDisposed = sample.status === 'Disposed' || sample.retrieval_status === 'Disposed';
        matchesReportStatus = isDisposed;
      }

      // Date matches
      let matchesDate = true;
      if (dateFrom && sample.collection_date < dateFrom) matchesDate = false;
      if (dateTo && sample.collection_date > dateTo) matchesDate = false;

      return matchesSearch && matchesType && matchesReportStatus && matchesDate;
    });
  };

  const filteredSamples = getFilteredData();

  // CSV Export helper
  const handleExportCSV = () => {
    let headers = [];
    let rows = [];

    if (selectedReport === 'inventory') {
      headers = ['Sample ID', 'Subject ID', 'Specimen Type', 'Volume (mL)', 'Collection Date', 'Consent', 'Status', 'Location'];
      rows = filteredSamples.map(s => [
        s.id, s.subject_id, s.specimen_type, s.sample_volume, s.collection_date, s.consent_status, s.status, s.location || 'N/A'
      ]);
    } else if (selectedReport === 'storage') {
      headers = ['Sample ID', 'Barcode Value', 'Specimen Type', 'Storage Coordinate', 'Quality Grade', 'Diagnosis Code', 'Ingested Date'];
      rows = filteredSamples.map(s => [
        s.id, s.barcode_text || 'N/A', s.specimen_type, s.location, s.quality || 'Passed', s.diagnosis || 'Healthy', s.collection_date
      ]);
    } else if (selectedReport === 'released') {
      headers = ['Sample ID', 'Destination / Study', 'Released Date', 'Specimen Type', 'Volume (mL)', 'Volume Units', 'Justification'];
      rows = filteredSamples.map(s => [
        s.id, s.shipment_destination || 'Research Core', s.collection_date, s.specimen_type, s.sample_volume, 'mL', 'IRB Study Allocation'
      ]);
    } else if (selectedReport === 'disposed') {
      headers = ['Sample ID', 'Decommission Date', 'Specimen Type', 'Volume (mL)', 'Disposal Method', 'Audit Justification'];
      rows = filteredSamples.map(s => [
        s.id, s.collection_date, s.specimen_type, s.sample_volume, 'Autoclave & Incinerate', 'Compliance clean run'
      ]);
    }

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `aura_biobank_${selectedReport}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF Export helper
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

      // Styling parameters
      doc.setFillColor(8, 12, 24); // Dark theme matching background
      doc.rect(0, 0, 210, 297, 'F');

      // Title & Headers
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(0, 242, 254); // Cyan
      doc.text("AURA RESEARCH BIOBANK CENTER", 15, 20);

      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      const reportTitles = {
        inventory: "SPECIMEN INVENTORY & TRACKING LEDGER",
        storage: "CRYOGENIC LOCATION MAP & FREEZER GRID RACK",
        released: "RESEARCH STUDY SPECIMEN RELEASE LOG",
        disposed: "COMPLIANCE DISPOSAL & DECOMMISSION REGISTRY"
      };
      doc.text(reportTitles[selectedReport], 15, 28);

      // Metadata line
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184); // Muted slate
      const dateStr = new Date().toLocaleString();
      doc.text(`Generated: ${dateStr}  |  Operator: ${user.name} (${user.role})  |  Records Count: ${filteredSamples.length}`, 15, 35);

      // Divider line
      doc.setDrawColor(30, 41, 59);
      doc.line(15, 38, 195, 38);

      // Draw table headers
      let y = 46;
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0, 242, 254);

      let colWidths = [];
      let headers = [];

      if (selectedReport === 'inventory') {
        headers = ['Sample ID', 'Subject ID', 'Type', 'Volume', 'Date', 'Consent', 'Status'];
        colWidths = [45, 30, 25, 20, 25, 20, 20];
      } else if (selectedReport === 'storage') {
        headers = ['Sample ID', 'Specimen Type', 'Storage Location / Coordinate', 'Diagnosis', 'Quality'];
        colWidths = [45, 30, 65, 25, 20];
      } else if (selectedReport === 'released') {
        headers = ['Sample ID', 'Destination', 'Date', 'Type', 'Volume', 'Allocated Study'];
        colWidths = [45, 45, 25, 25, 20, 25];
      } else if (selectedReport === 'disposed') {
        headers = ['Sample ID', 'Date Disposed', 'Specimen Type', 'Volume', 'Method', 'Audit Reason'];
        colWidths = [45, 30, 30, 20, 30, 30];
      }

      // Draw Header Text
      let currentX = 15;
      headers.forEach((h, idx) => {
        doc.text(h, currentX, y);
        currentX += colWidths[idx];
      });

      // Header underline
      doc.line(15, y + 2, 195, y + 2);
      y += 8;

      // Draw Rows
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(226, 232, 240); // Off-white

      filteredSamples.forEach((sample, rowIndex) => {
        if (y > 275) {
          doc.addPage();
          // Draw header overlay for next page
          doc.setFillColor(8, 12, 24);
          doc.rect(0, 0, 210, 297, 'F');
          
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(0, 242, 254);
          let nextX = 15;
          headers.forEach((h, idx) => {
            doc.text(h, nextX, 20);
            nextX += colWidths[idx];
          });
          doc.line(15, 22, 195, 22);
          
          doc.setFont("Helvetica", "normal");
          doc.setTextColor(226, 232, 240);
          y = 28;
        }

        // Zebra striping background
        if (rowIndex % 2 === 1) {
          doc.setFillColor(15, 23, 42); // Slightly lighter slate
          doc.rect(15, y - 4, 180, 6, 'F');
        }

        let rowData = [];
        if (selectedReport === 'inventory') {
          rowData = [sample.id, sample.subject_id, sample.specimen_type, `${sample.sample_volume} mL`, sample.collection_date, sample.consent_status, sample.status];
        } else if (selectedReport === 'storage') {
          rowData = [sample.id, sample.specimen_type, sample.location ? sample.location.split('>').slice(-2).join('>') : 'N/A', sample.diagnosis || 'Healthy Control', sample.quality || 'Passed'];
        } else if (selectedReport === 'released') {
          rowData = [sample.id, sample.shipment_destination || 'Central Depo', sample.collection_date, sample.specimen_type, `${sample.sample_volume} mL`, 'Study Allocation'];
        } else if (selectedReport === 'disposed') {
          rowData = [sample.id, sample.collection_date, sample.specimen_type, `${sample.sample_volume} mL`, 'Autoclave/Incinerate', 'Compliance purge'];
        }

        let nextX = 15;
        rowData.forEach((val, idx) => {
          doc.text(String(val), nextX, y);
          nextX += colWidths[idx];
        });

        y += 6;
      });

      // Save Document
      doc.save(`aura_biobank_${selectedReport}_report.pdf`);
    } catch (err) {
      alert("Error generating PDF: " + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* Title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
        <button 
          className="btn btn-secondary" 
          onClick={() => setActiveTab('dashboard')} 
          style={{ marginBottom: '4px', padding: '6px 12px', fontSize: '12px', alignSelf: 'flex-start' }}
        >
          ← Back to Dashboard
        </button>
        <h1 style={{ fontSize: '28px', fontWeight: '700', letterSpacing: '-0.02em' }}>
          Biobank Compliance & <span className="title-gradient">Historic Reports</span>
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Run audits, query historical sample records, and export CSV/PDF summaries for ethics committee reviews.
        </p>
      </div>

      {/* Reports Navigation Tabs */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '2px', flexWrap: 'wrap' }}>
        {[
          { id: 'inventory', label: 'Specimen Inventory Log', desc: 'Complete historical sample lists.' },
          { id: 'storage', label: 'Storage Allocation Grid', desc: 'Racks & wells actively occupied.' },
          { id: 'released', label: 'Specimen Releases Log', desc: 'Checked-out specimens.' },
          { id: 'disposed', label: 'Disposal Ledger', desc: 'Decommissioned specimens.' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setSelectedReport(tab.id);
              setTypeFilter('All');
              setStatusFilter('All');
            }}
            style={{
              padding: '12px 18px',
              background: selectedReport === tab.id ? 'var(--border-color)' : 'transparent',
              border: 'none',
              borderBottom: selectedReport === tab.id ? '2px solid var(--accent-cyan)' : 'none',
              color: selectedReport === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
              borderRadius: 'var(--border-radius-sm) var(--border-radius-sm) 0 0',
              transition: 'var(--transition-smooth)',
              textAlign: 'left'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters & Export Panel */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', textAlign: 'left' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: '220px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Search Specimens</label>
            <input
              type="text"
              className="form-control"
              placeholder="Search by ID, Subject, location, or diagnosis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ marginTop: '6px' }}
            />
          </div>

          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Specimen Type</label>
            <select
              className="form-control"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ marginTop: '6px' }}
            >
              {specimenTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {selectedReport === 'inventory' && (
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Status</label>
              <select
                className="form-control"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ marginTop: '6px' }}
              >
                <option value="All">All Statuses</option>
                <option value="Collected">Collected</option>
                <option value="Consent Verified">Consent Verified</option>
                <option value="Barcode Generated">Barcode Generated</option>
                <option value="Stored">Stored</option>
                <option value="Released">Released</option>
                <option value="Disposed">Disposed</option>
              </select>
            </div>
          )}

          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>From Date</label>
            <input
              type="date"
              className="form-control"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ marginTop: '6px' }}
            />
          </div>

          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>To Date</label>
            <input
              type="date"
              className="form-control"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ marginTop: '6px' }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button 
            onClick={handleExportCSV} 
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={filteredSamples.length === 0}
          >
            📊 Export CSV
          </button>
          <button 
            onClick={handleExportPDF} 
            className="btn btn-primary"
            style={{ padding: '8px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={filteredSamples.length === 0}
          >
            📄 Download PDF Report
          </button>
        </div>
      </div>

      {/* Preview Table */}
      <div className="glass-card" style={{ padding: 0, textAlign: 'left' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600' }}>
            Previewing {filteredSamples.length} matching ledger records
          </h3>
        </div>

        {filteredSamples.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '13px', fontStyle: 'italic' }}>
            No records matched the selected query or report status constraints.
          </p>
        ) : (
          <div className="table-container">
            <table className="custom-table" style={{ fontSize: '13px' }}>
              <thead>
                {selectedReport === 'inventory' && (
                  <tr>
                    <th>Sample ID</th>
                    <th>Subject ID</th>
                    <th>Specimen Type</th>
                    <th>Volume</th>
                    <th>Collection Date</th>
                    <th>Consent Status</th>
                    <th>Current Status</th>
                    <th>Storage Coordinates</th>
                  </tr>
                )}
                {selectedReport === 'storage' && (
                  <tr>
                    <th>Sample ID</th>
                    <th>Barcode Value</th>
                    <th>Specimen Type</th>
                    <th>Storage Coordinate</th>
                    <th>Quality Status</th>
                    <th>Diagnosis Code</th>
                    <th>Ingested Date</th>
                  </tr>
                )}
                {selectedReport === 'released' && (
                  <tr>
                    <th>Sample ID</th>
                    <th>Destination Study</th>
                    <th>Release Date</th>
                    <th>Specimen Type</th>
                    <th>Released Volume</th>
                    <th>Allocation Reason</th>
                  </tr>
                )}
                {selectedReport === 'disposed' && (
                  <tr>
                    <th>Sample ID</th>
                    <th>Date Disposed</th>
                    <th>Specimen Type</th>
                    <th>Volume Disposed</th>
                    <th>Method</th>
                    <th>Audit Justification</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {filteredSamples.map(sample => {
                  let consentBadge = 'badge-pending';
                  if (sample.consent_status === 'Verified') consentBadge = 'badge-verified';
                  if (sample.consent_status === 'Rejected' || sample.consent_status === 'Withdrawn') consentBadge = 'badge-rejected';

                  let statusBadge = 'badge-info';
                  if (sample.status === 'Consent Verified') statusBadge = 'badge-pending';
                  if (sample.status === 'Barcode Generated') statusBadge = 'badge-verified';
                  if (sample.status === 'Disposed') statusBadge = 'badge-rejected';

                  return (
                    <tr key={sample.id}>
                      {selectedReport === 'inventory' && (
                        <>
                          <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>{sample.id}</td>
                          <td style={{ fontFamily: 'monospace' }}>{sample.subject_id}</td>
                          <td>{sample.specimen_type}</td>
                          <td>{sample.sample_volume} mL</td>
                          <td>{sample.collection_date}</td>
                          <td><span className={`badge ${consentBadge}`}>{sample.consent_status}</span></td>
                          <td><span className={`badge ${statusBadge}`}>{sample.status}</span></td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{sample.location || 'Not Deposited'}</td>
                        </>
                      )}
                      {selectedReport === 'storage' && (
                        <>
                          <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>{sample.id}</td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{sample.barcode_text || 'N/A'}</td>
                          <td>{sample.specimen_type}</td>
                          <td style={{ fontSize: '12px', fontWeight: '600' }}>{sample.location}</td>
                          <td><span className="badge badge-verified">{sample.qc_status || 'Verified'}</span></td>
                          <td>{sample.diagnosis || 'Healthy Control'}</td>
                          <td>{sample.collection_date}</td>
                        </>
                      )}
                      {selectedReport === 'released' && (
                        <>
                          <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>{sample.id}</td>
                          <td style={{ fontWeight: '600' }}>{sample.shipment_destination || 'AURA Research Core'}</td>
                          <td>{sample.collection_date}</td>
                          <td>{sample.specimen_type}</td>
                          <td>{sample.sample_volume} mL</td>
                          <td><span className="badge badge-info">IRB-Approved Study Allocation</span></td>
                        </>
                      )}
                      {selectedReport === 'disposed' && (
                        <>
                          <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>{sample.id}</td>
                          <td>{sample.collection_date}</td>
                          <td>{sample.specimen_type}</td>
                          <td>{sample.sample_volume} mL</td>
                          <td><span className="badge badge-rejected">Autoclave & Incinerate</span></td>
                          <td style={{ color: 'var(--text-secondary)' }}>Operator-initiated decommissioning run</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
