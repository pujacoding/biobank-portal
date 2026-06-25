import React, { useState } from 'react';

export default function SampleList({ 
  samples, 
  setActiveTab, 
  user, 
  token, 
  backendUrl, 
  onPrintBarcode, 
  onGenerateBarcode, 
  preSelectedSampleId,
  setPreSelectedSampleId,
  onRegistrationSuccess,
  activeLabId,
  activeLabName 
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [specimenFilter, setSpecimenFilter] = useState('All');
  const [selectedSampleIds, setSelectedSampleIds] = useState([]);

  // Preview Modal States
  const [selectedSampleForPreview, setSelectedSampleForPreview] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [isReprintMode, setIsReprintMode] = useState(false);
  const [reprintReason, setReprintReason] = useState('Reprint requested from View Samples');
  const [barcodeDataForPreview, setBarcodeDataForPreview] = useState(null);

  // Reprint Reason Dialog
  const [showReprintReasonModal, setShowReprintReasonModal] = useState(false);
  const [pendingPreviewSample, setPendingPreviewSample] = useState(null);

  // Details Modal States
  const [selectedSampleForDetails, setSelectedSampleForDetails] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsAuditLogs, setDetailsAuditLogs] = useState([]);

  // Admin Regenerate Modal States
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerateReason, setRegenerateReason] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, specimenFilter]);

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainContent = document.querySelector('aside + div');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage]);

  React.useEffect(() => {
    if (preSelectedSampleId && samples.length > 0) {
      const sample = samples.find(s => s.id === preSelectedSampleId);
      if (sample && sample.barcode_text) {
        handleOpenPreview(sample, false);
        setPreSelectedSampleId('');
      }
    }
  }, [preSelectedSampleId, samples]);

  // Filter logic
  const filteredSamples = samples.filter(sample => {
    const matchesSearch = 
      sample.id.toLowerCase().includes(search.toLowerCase()) ||
      sample.subject_id.toLowerCase().includes(search.toLowerCase()) ||
      (sample.barcode_text && sample.barcode_text.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || sample.status === statusFilter;
    const matchesSpecimen = specimenFilter === 'All' || sample.specimen_type === specimenFilter;

    return matchesSearch && matchesStatus && matchesSpecimen;
  });

  const uniqueSpecimenTypes = ['All', 'Whole Blood', 'Serum', 'Plasma', 'Saliva', 'Urine', 'Tissue'];
  const statusTypes = ['All', 'Collected', 'Consent Verified', 'Barcode Generated'];

  // Visible samples that have active barcodes
  const printableFilteredSamples = filteredSamples.filter(s => s.barcode_text);

  const handleSelectAllChange = (e) => {
    if (e.target.checked) {
      setSelectedSampleIds(printableFilteredSamples.map(s => s.id));
    } else {
      setSelectedSampleIds([]);
    }
  };

  const handleSelectSampleChange = (sampleId) => {
    setSelectedSampleIds(prev => 
      prev.includes(sampleId) 
        ? prev.filter(id => id !== sampleId)
        : [...prev, sampleId]
    );
  };

  const handlePrintSelected = () => {
    const selectedSamples = samples.filter(s => selectedSampleIds.includes(s.id));
    if (selectedSamples.length === 0) return;
    onPrintBarcode(selectedSamples);
  };

  // Open Preview Dialog for Print or Reprint
  const handleOpenPreview = async (sample, reprint) => {
    try {
      const response = await fetch(`${backendUrl}/api/barcode/${sample.id}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch active barcode details.');
      }

      setBarcodeDataForPreview(data.barcode);
      setSelectedSampleForPreview(sample);
      setIsReprintMode(reprint);
      setPreviewModalOpen(true);
    } catch (error) {
      alert("Error: " + error.message);
    }
  };

  // Trigger Reprint Reason prompt before opening Preview modal
  const handleReprintRequest = (sample) => {
    setPendingPreviewSample(sample);
    setReprintReason('Reprint requested from View Samples');
    setShowReprintReasonModal(true);
  };

  // Confirm Reprint Reason and Open Preview Screen
  const handleConfirmReprintReason = (e) => {
    e.preventDefault();
    if (!reprintReason.trim()) {
      alert("Please enter a valid reason for reprinting.");
      return;
    }
    setShowReprintReasonModal(false);
    if (pendingPreviewSample) {
      handleOpenPreview(pendingPreviewSample, true);
    }
  };

  // Triggers print command and logs event in database
  const handleConfirmPrint = async () => {
    if (!selectedSampleForPreview) return;
    try {
      const endpoint = isReprintMode ? '/api/barcode/reprint' : '/api/barcode/print';
      const body = { sample_id: selectedSampleForPreview.id };
      if (isReprintMode) {
        body.reason = reprintReason.trim();
      }

      const response = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to log print action');
      }

      // Copy outerHTML of preview card to print-section and trigger print
      const printCard = document.querySelector('.printable-preview-card');
      const printSection = document.getElementById('print-section');
      if (printSection && printCard) {
        printSection.innerHTML = printCard.outerHTML;
        document.body.classList.add('print-single-label');
        window.print();
        document.body.classList.remove('print-single-label');
        printSection.innerHTML = '';
      } else {
        window.print();
      }

      // Clean state
      setPreviewModalOpen(false);
      setSelectedSampleForPreview(null);
      setBarcodeDataForPreview(null);

      if (onRegistrationSuccess) onRegistrationSuccess();
    } catch (err) {
      alert("Print Error: " + err.message);
    }
  };

  // Generates and downloads a clientside PDF label using jsPDF
  const handleDownloadPDF = async (sample, reprint = false) => {
    try {
      const response = await fetch(`${backendUrl}/api/barcode/${sample.id}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to retrieve barcode images');
      }
      const barcode = data.barcode;

      // 80mm x 50mm label document setup
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [80, 50]
      });

      // Draw clean label card box
      doc.setDrawColor(0, 0, 0);
      doc.rect(2, 2, 76, 46);

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(11);
      doc.text("AURA BIOBANK", 6, 10);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Sample ID: ${sample.id}`, 6, 17);
      doc.text(`Specimen: ${sample.specimen_type} (${sample.sample_volume} mL)`, 6, 23);
      doc.text(`Collected: ${sample.collection_date}`, 6, 29);
      doc.text(`Lab: ${sample.lab_name || 'Metropolis Lab'}`, 6, 35);
      doc.setFontSize(6.5);
      doc.text(`Location: ${sample.lab_location || 'Boston, MA'}`, 6, 41);

      if (barcode.qr_code_base64) {
        doc.addImage(barcode.qr_code_base64, 'PNG', 46, 8, 28, 28);
      }

      doc.save(`AURA-LABEL-${sample.id}.pdf`);

      // Log print action to audit records
      const endpoint = reprint ? '/api/barcode/reprint' : '/api/barcode/print';
      const body = { sample_id: sample.id };
      if (reprint) {
        body.reason = "PDF Download reprint requested from View Samples";
      }

      await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
        },
        body: JSON.stringify(body)
      });

      if (onRegistrationSuccess) onRegistrationSuccess();
    } catch (err) {
      alert("PDF Error: " + err.message);
    }
  };

  // Open Details Screen Modal and fetch history logs
  const handleOpenDetails = async (sample) => {
    setSelectedSampleForDetails(sample);
    setDetailsModalOpen(true);
    setDetailsAuditLogs([]);
    try {
      const response = await fetch(`${backendUrl}/api/samples/audit/${sample.id}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
        }
      });
      const data = await response.json();
      if (response.ok) {
        setDetailsAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Error retrieving specimen audit traces: ", err);
    }
  };

  // Admin-only barcode regeneration
  const handleOpenRegenerate = () => {
    setRegenerateReason('');
    setShowRegenerateModal(true);
  };

  const submitRegenerate = async (e) => {
    e.preventDefault();
    if (!regenerateReason.trim()) {
      alert("Please specify a reason for barcode regeneration.");
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/barcode/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
        },
        body: JSON.stringify({
          sample_id: selectedSampleForDetails.id,
          reason: regenerateReason.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to regenerate barcode');
      }

      alert(`Barcode regenerated successfully! New value is: ${data.barcode.barcode_value}`);
      
      setShowRegenerateModal(false);
      setDetailsModalOpen(false);

      if (onRegistrationSuccess) onRegistrationSuccess();
    } catch (err) {
      alert("Regeneration Error: " + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'left' }}>
      {/* Back Button */}
      <button 
        className="btn btn-secondary" 
        onClick={() => setActiveTab('dashboard')} 
        style={{ marginBottom: '4px', padding: '6px 12px', fontSize: '12px', alignSelf: 'flex-start' }}
      >
        ← Back to Dashboard
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '700' }}>Biospecimen Registry</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Review sample metadata, patient demographics, and active workflow states for {user.lab_name}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {selectedSampleIds.length > 0 && (
            <button 
              className="btn btn-secondary" 
              onClick={handlePrintSelected} 
              style={{ padding: '8px 14px', fontSize: '13px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '14px', height: '14px' }}>
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Print Selected Labels ({selectedSampleIds.length})
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setActiveTab('register')} style={{ padding: '8px 14px', fontSize: '13px' }}>
            + Register Specimen
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-card" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px 20px' }}>
        <div style={{ flex: 2, minWidth: '220px' }}>
          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Search</label>
          <input 
            type="text" 
            className="form-control"
            placeholder="Search by Sample ID, Subject ID, Barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Specimen Type</label>
          <select 
            className="form-control"
            value={specimenFilter}
            onChange={(e) => setSpecimenFilter(e.target.value)}
          >
            {uniqueSpecimenTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Workflow Status</label>
          <select 
            className="form-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {statusTypes.map(status => (
              <option key={status} value={status}>{status === 'All' ? 'All Statuses' : status}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid List */}
      <div className="glass-card" style={{ padding: 0 }}>
        {filteredSamples.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '14px' }}>
            No specimens registered matching active filters.
          </p>
        ) : (
          <>
            <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={printableFilteredSamples.length > 0 && selectedSampleIds.length === printableFilteredSamples.length}
                      onChange={handleSelectAllChange}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th>Sample ID</th>
                  <th>Subject ID</th>
                  <th>Specimen Type</th>
                  <th>Collection Date</th>
                  <th>Barcode Status</th>
                  <th>Shipment Status</th>
                  <th>Current Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const pageSize = 10;
                  const totalPages = Math.ceil(filteredSamples.length / pageSize);
                  const paginatedSamples = filteredSamples.slice((currentPage - 1) * pageSize, currentPage * pageSize);

                  return paginatedSamples.map(sample => {
                    let statusBadge = 'badge-info';
                    if (sample.status === 'Consent Verified') statusBadge = 'badge-pending';
                    if (sample.status === 'Barcode Generated') statusBadge = 'badge-verified';

                    const hasBarcode = !!sample.barcode_text;
                    const barcodeStatusText = hasBarcode ? 'Generated' : 'Unassigned';
                    const barcodeBadgeClass = hasBarcode ? 'badge-verified' : 'badge-pending';

                    return (
                      <tr key={sample.id}>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            disabled={!hasBarcode}
                            checked={selectedSampleIds.includes(sample.id)}
                            onChange={() => handleSelectSampleChange(sample.id)}
                            title={!hasBarcode ? "No barcode generated yet" : ""}
                            style={{ cursor: hasBarcode ? 'pointer' : 'not-allowed' }}
                          />
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>{sample.id}</td>
                        <td style={{ fontFamily: 'monospace' }}>{sample.subject_id}</td>
                        <td>
                          <div>{sample.specimen_type} ({sample.sample_volume} mL)</div>
                          {sample.container_type && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {sample.container_count}x {sample.container_type}
                            </div>
                          )}
                        </td>
                        <td>{sample.collection_date}</td>
                        <td>
                          <span className={`badge ${barcodeBadgeClass}`}>{barcodeStatusText}</span>
                        </td>
                        <td>
                          <span className="badge badge-pending">Pending</span>
                        </td>
                        <td>
                          <span className={`badge ${statusBadge}`}>
                            {sample.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleOpenDetails(sample)}
                              className="btn btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
                            >
                              View Details
                            </button>

                            {hasBarcode && (
                              <>
                                <button
                                  onClick={() => handleOpenPreview(sample, false)}
                                  className="btn btn-secondary"
                                  style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)' }}
                                >
                                  Print Barcode
                                </button>
                                <button
                                  onClick={() => handleReprintRequest(sample)}
                                  className="btn btn-secondary"
                                  style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--accent-purple)', borderColor: 'var(--accent-purple)' }}
                                >
                                  Reprint Barcode
                                </button>
                                <button
                                  onClick={() => handleDownloadPDF(sample, false)}
                                  className="btn btn-secondary"
                                  style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--accent-success)', borderColor: 'var(--accent-success)' }}
                                >
                                  Download PDF
                                </button>
                              </>
                            )}

                            {!hasBarcode && (sample.status === 'Consent Verified') && (
                              <button
                                onClick={() => onGenerateBarcode(sample.id)}
                                className="btn btn-primary"
                                style={{ padding: '3px 8px', fontSize: '11px' }}
                              >
                                Generate Barcode
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredSamples.length > 0 && (() => {
            const pageSize = 10;
            const totalPages = Math.ceil(filteredSamples.length / pageSize);
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Showing {Math.min(filteredSamples.length, (currentPage - 1) * pageSize + 1)} to {Math.min(filteredSamples.length, currentPage * pageSize)} of {filteredSamples.length} entries
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    style={{ padding: '6px 12px', fontSize: '11px' }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: '600' }}>
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage >= totalPages || totalPages === 0}
                    style={{ padding: '6px 12px', fontSize: '11px' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            );
          })()}
        </>
      )}
      </div>

      {/* 1. Barcode Preview Screen Modal Overlay */}
      {previewModalOpen && selectedSampleForPreview && barcodeDataForPreview && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1100, padding: '20px'
        }} className="preview-screen-overlay">
          <div className="glass-card" style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                {isReprintMode ? 'Reprint Barcode Preview' : 'Print Barcode Preview'}
              </h3>
              <button onClick={() => setPreviewModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Label Layout Block (Targeted by Media Print stylesheet) */}
            <div 
              className="printable-preview-card"
              style={{
                border: '1px dashed var(--accent-cyan)',
                borderRadius: '6px',
                padding: '16px',
                backgroundColor: '#ffffff',
                color: '#000000',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
                gap: '12px',
                width: '100%',
                maxWidth: '360px',
                margin: '0 auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            >
              <div style={{ textAlign: 'left', flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '0.05em', color: '#0f172a' }}>AURA BIOBANK</div>
                <div style={{ fontSize: '9px', color: '#475569', marginTop: '4px', fontWeight: '700' }}>ID: {selectedSampleForPreview.id}</div>
                <div style={{ fontSize: '9px', color: '#475569', fontWeight: '600' }}>Type: {selectedSampleForPreview.specimen_type} ({selectedSampleForPreview.sample_volume} mL)</div>
                <div style={{ fontSize: '9px', color: '#475569', fontWeight: '600' }}>Coll: {selectedSampleForPreview.collection_date}</div>
                <div style={{ fontSize: '8px', color: '#64748b', fontWeight: '500', marginTop: '2px' }}>Lab: {selectedSampleForPreview.lab_name}</div>
              </div>

              {barcodeDataForPreview.qr_code_base64 && (
                <img 
                  src={barcodeDataForPreview.qr_code_base64} 
                  alt="QR Code" 
                  style={{ width: '64px', height: '64px', objectFit: 'contain' }}
                />
              )}
            </div>

            {/* Reprint information disclaimer */}
            {isReprintMode && (
              <div style={{ fontSize: '11px', color: 'var(--accent-purple)', fontStyle: 'italic', backgroundColor: 'rgba(168, 85, 247, 0.08)', padding: '8px 10px', borderRadius: '4px' }}>
                * Reprinting under track reason: "{reprintReason}". barcode value remains unchanged.
              </div>
            )}

            {/* Modal Controls */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1 }} 
                onClick={() => setPreviewModalOpen(false)}
              >
                Close
              </button>
              
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1.2, borderColor: 'var(--accent-success)', color: 'var(--accent-success)' }} 
                onClick={() => handleDownloadPDF(selectedSampleForPreview, isReprintMode)}
              >
                Download PDF
              </button>

              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ flex: 1.2 }} 
                onClick={handleConfirmPrint}
              >
                Print Label
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Reprint Reason Input Dialog */}
      {showReprintReasonModal && pendingPreviewSample && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1105, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Reprint Verification</h3>
              <button onClick={() => setShowReprintReasonModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Provide the compliance verification reason for reprinting active label for specimen <strong>{pendingPreviewSample.id}</strong>.
            </div>

            <form onSubmit={handleConfirmReprintReason} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="reprint-reason-select">Reprint Justification *</label>
                <select
                  id="reprint-reason-select"
                  className="form-control"
                  required
                  value={reprintReason}
                  onChange={(e) => setReprintReason(e.target.value)}
                >
                  <option value="Damaged Label Sticker">Damaged Label Sticker</option>
                  <option value="Lost Label Sticker">Lost Label Sticker</option>
                  <option value="Scanner Failure / Unreadable">Scanner Failure / Unreadable</option>
                  <option value="Additional tube printing">Additional tube printing</option>
                  <option value="Audit inspection check">Audit inspection check</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowReprintReasonModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5 }}>Verify & View</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. View Details Modal Overlay */}
      {detailsModalOpen && selectedSampleForDetails && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1100, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                  Specimen Metadata Details
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                  {selectedSampleForDetails.id}
                </span>
              </div>
              <button onClick={() => setDetailsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Specimen properties layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '13px' }}>
              <div>
                <h4 style={{ color: 'var(--accent-cyan)', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>
                  Subject Profile
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div><strong>Subject ID:</strong> {selectedSampleForDetails.subject_id}</div>
                  <div><strong>Gender:</strong> {selectedSampleForDetails.gender}</div>
                  <div><strong>Age:</strong> {selectedSampleForDetails.age} years</div>
                </div>
              </div>

              <div>
                <h4 style={{ color: 'var(--accent-cyan)', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>
                  Ingest Laboratory
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div><strong>Lab Name:</strong> {selectedSampleForDetails.lab_name}</div>
                  <div><strong>Lab Location:</strong> {selectedSampleForDetails.lab_location || 'Metropolis Address'}</div>
                  <div><strong>Collector:</strong> {selectedSampleForDetails.collector_name}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '13px', marginTop: '4px' }}>
              <div>
                <h4 style={{ color: 'var(--accent-cyan)', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>
                  Specimen Characteristics
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div><strong>Specimen Type:</strong> {selectedSampleForDetails.specimen_type}</div>
                  <div><strong>Sample Volume:</strong> {selectedSampleForDetails.sample_volume} mL</div>
                  {selectedSampleForDetails.container_type && (
                    <>
                      <div><strong>Container Type:</strong> {selectedSampleForDetails.container_type}</div>
                      <div><strong>Container Count:</strong> {selectedSampleForDetails.container_count}</div>
                    </>
                  )}
                  <div><strong>Collection Date:</strong> {selectedSampleForDetails.collection_date}</div>
                  <div><strong>Collection Time:</strong> {selectedSampleForDetails.collection_time}</div>
                </div>
              </div>

              <div>
                <h4 style={{ color: 'var(--accent-cyan)', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>
                  Lifecycle Status
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div><strong>Consent Status:</strong> {selectedSampleForDetails.consent_status || 'Pending'}</div>
                  <div><strong>Barcode Status:</strong> {selectedSampleForDetails.barcode_text ? 'Generated' : 'Unassigned'}</div>
                  <div><strong>Shipment Status:</strong> Pending</div>
                  <div><strong>Current Status:</strong> {selectedSampleForDetails.status}</div>
                </div>
              </div>
            </div>

            {/* Audit / Action Tracing timeline */}
            <div style={{ marginTop: '8px' }}>
              <h4 style={{ fontSize: '14px', color: 'var(--accent-purple)', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '10px' }}>
                Specimen History Tracing Ledger
              </h4>
              {detailsAuditLogs.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                  No tracking events recorded for this specimen.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto', paddingRight: '4px' }}>
                  {detailsAuditLogs.map(log => {
                    const ts = new Date(log.action_timestamp).toLocaleString();
                    return (
                      <div key={log.audit_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px dashed var(--border-color)', paddingBottom: '4px' }}>
                        <div>
                          <strong style={{ color: 'var(--text-primary)' }}>{log.action_type}</strong>
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>
                            ({log.reason || 'No description'})
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-tertiary)', textAlign: 'right' }}>
                          <span>By: {log.performed_by_name} ({log.performed_by_role})</span> &bull; <span>{ts}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Controls (Including Admin Barcode Regeneration Option) */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              {user.role === 'Lab Admin' && selectedSampleForDetails.barcode_text && (
                <button 
                  type="button" 
                  className="btn btn-danger" 
                  style={{ marginRight: 'auto', padding: '10px 16px', background: 'var(--accent-warning)', border: 'none' }} 
                  onClick={handleOpenRegenerate}
                >
                  Regenerate Barcode
                </button>
              )}
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ width: '120px' }} 
                onClick={() => setDetailsModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Admin Barcode Regeneration Reason Modal */}
      {showRegenerateModal && selectedSampleForDetails && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.9)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1105, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--accent-warning)', margin: 0 }}>
                Regenerate Specimen Barcode
              </h3>
              <button onClick={() => setShowRegenerateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Warning: This will set the active barcode for specimen <strong>{selectedSampleForDetails.id}</strong> to Inactive and generate a new versioned barcode.
            </div>

            <form onSubmit={submitRegenerate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="regen-reason-select">Regeneration Justification *</label>
                <select
                  id="regen-reason-select"
                  className="form-control"
                  required
                  value={regenerateReason}
                  onChange={(e) => setRegenerateReason(e.target.value)}
                >
                  <option value="">-- Choose Reason --</option>
                  <option value="Incorrect Sample Mapping">Incorrect Sample Mapping</option>
                  <option value="Sample Demographics Rectification">Sample Demographics Rectification</option>
                  <option value="Duplicate Barcode Mapped In Error">Duplicate Barcode Mapped In Error</option>
                  <option value="Technical Malfunction Recovery">Technical Malfunction Recovery</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowRegenerateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5, background: 'var(--accent-warning)', border: 'none' }}>Confirm & Regenerate</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global printable media override stylesheet is placed in index.css */}
    </div>
  );
}
