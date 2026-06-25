import React, { useState, useEffect } from 'react';

export default function BarcodeDashboard({ samples, backendUrl, token, user, onPrintBarcode, onBarcodeAction, setActiveTab, activeLabId, activeLabName }) {
  const [metrics, setMetrics] = useState({
    totalGenerated: 0,
    totalPrinted: 0,
    totalReprinted: 0,
    pendingGeneration: 0
  });
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedBarcodeIds, setSelectedBarcodeIds] = useState([]);
  const [isBatchReprint, setIsBatchReprint] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainContent = document.querySelector('aside + div');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // Modals state
  const [reprintTarget, setReprintTarget] = useState(null); // barcode object
  const [reprintReason, setReprintReason] = useState('');
  const [showReprintModal, setShowReprintModal] = useState(false);

  const activeHistoryList = historyList.filter(h => h.status === 'Active');

  const handleSelectAllChange = (e) => {
    if (e.target.checked) {
      setSelectedBarcodeIds(activeHistoryList.map(h => h.barcode_id));
    } else {
      setSelectedBarcodeIds([]);
    }
  };

  const handleSelectBarcodeChange = (barcodeId) => {
    setSelectedBarcodeIds(prev => 
      prev.includes(barcodeId) 
        ? prev.filter(id => id !== barcodeId)
        : [...prev, barcodeId]
    );
  };

  const handleOpenBatchReprint = () => {
    setIsBatchReprint(true);
    setReprintTarget({ sample_id: `Multiple (${selectedBarcodeIds.length} items)` });
    setReprintReason('');
    setShowReprintModal(true);
    setError('');
    setSuccess('');
  };

  const [regenerateTarget, setRegenerateTarget] = useState(null); // barcode object
  const [regenerateReason, setRegenerateReason] = useState('');
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);

  const [showZplModal, setShowZplModal] = useState(false);
  const [zplContent, setZplContent] = useState('');

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const activeLab = localStorage.getItem('aura_active_lab_id');
      // 1. Fetch metrics
      const metricsResponse = await fetch(`${backendUrl}/api/barcode/dashboard`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
        }
      });
      const metricsData = await metricsResponse.json();
      if (metricsResponse.ok) {
        setMetrics(metricsData.metrics);
      }

      // 2. Fetch history
      const historyResponse = await fetch(`${backendUrl}/api/barcode/history`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
        }
      });
      const historyData = await historyResponse.json();
      if (historyResponse.ok) {
        setHistoryList(historyData.history || []);
      }
    } catch (err) {
      setError("Failed to fetch dashboard data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    setCurrentPage(1);
  }, [backendUrl, token, samples, activeLabId]);

  // List of samples waiting for initial barcode generation
  // (status is 'Consent Verified' and no active barcode)
  const pendingSamples = (samples || []).filter(s => {
    const hasActiveBarcode = historyList.some(h => h.sample_id === s.id && h.status === 'Active');
    return s.status === 'Consent Verified' && s.consent_status !== 'Withdrawn' && !hasActiveBarcode;
  });

  const handleGenerate = async (sampleId) => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const activeLab = localStorage.getItem('aura_active_lab_id');
      const response = await fetch(`${backendUrl}/api/barcode/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
        },
        body: JSON.stringify({ sample_id: sampleId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate barcode');
      }

      setSuccess(`Barcode generated successfully for sample ${sampleId}! Opening print dialog...`);
      
      // Auto-trigger print
      const originalSample = (samples || []).find(s => s.id === sampleId);
      if (originalSample) {
        const printSample = {
          ...originalSample,
          barcode_text: data?.barcode?.barcode_value || data?.barcode?.barcode_text || sampleId,
          qr_code_base64: data?.barcode?.qr_code_base64,
          code128_base64: data?.barcode?.code128_base64
        };
        onPrintBarcode(printSample);
      }

      if (onBarcodeAction) onBarcodeAction();
      fetchDashboardData();

      // Auto-move to shipments tab after 2 seconds
      if (setActiveTab) {
        setTimeout(() => {
          setActiveTab('shipments');
        }, 2000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReprint = (barcode) => {
    setIsBatchReprint(false);
    setReprintTarget(barcode);
    setReprintReason('');
    setShowReprintModal(true);
    setError('');
    setSuccess('');
  };

  const submitReprint = async (e) => {
    e.preventDefault();
    if (!reprintReason.trim()) {
      setError("Please specify a reason for reprinting.");
      return;
    }

    setShowReprintModal(false);
    setLoading(true);

    try {
      if (isBatchReprint) {
        const targets = historyList.filter(h => selectedBarcodeIds.includes(h.barcode_id));
        const reprintPromises = targets.map(target => 
          fetch(`${backendUrl}/api/barcode/reprint`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
            },
            body: JSON.stringify({
              sample_id: target.sample_id,
              reason: reprintReason.trim()
            })
          }).then(async res => {
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Failed to log reprint for ${target.sample_id}`);
            return { target, data };
          })
        );

        const results = await Promise.all(reprintPromises);
        
        // Map to printable sample structures
        const printSamples = results.map(({ target }) => {
          const originalSample = samples.find(s => s.id === target.sample_id) || {};
          return {
            ...originalSample,
            barcode_text: target.barcode_value,
            qr_code_base64: target.qr_code_base64,
            code128_base64: target.code128_base64
          };
        });

        setSuccess(`Batch reprint of ${targets.length} labels authorized. Triggering print...`);
        onPrintBarcode(printSamples);
        setSelectedBarcodeIds([]);
      } else {
        const response = await fetch(`${backendUrl}/api/barcode/reprint`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
          },
          body: JSON.stringify({
            sample_id: reprintTarget.sample_id,
            reason: reprintReason.trim()
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to trigger reprint logging');
        }

        setSuccess(`Reprint for ${reprintTarget.sample_id} authorized. Triggering print...`);
        
        // Find original sample details to render print label correctly
        const originalSample = samples.find(s => s.id === reprintTarget.sample_id);
        if (originalSample) {
          const printSample = {
            ...originalSample,
            barcode_text: reprintTarget.barcode_value,
            qr_code_base64: reprintTarget.qr_code_base64,
            code128_base64: reprintTarget.code128_base64
          };
          onPrintBarcode(printSample);
        }
      }

      if (onBarcodeAction) onBarcodeAction();
      fetchDashboardData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setIsBatchReprint(false);
    }
  };

  const handleOpenRegenerate = (barcode) => {
    setRegenerateTarget(barcode);
    setRegenerateReason('');
    setShowRegenerateModal(true);
    setError('');
    setSuccess('');
  };

  const submitRegenerate = async (e) => {
    e.preventDefault();
    if (!regenerateReason.trim()) {
      setError("Please specify a reason for barcode regeneration.");
      return;
    }

    setShowRegenerateModal(false);
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/barcode/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
        },
        body: JSON.stringify({
          sample_id: regenerateTarget.sample_id,
          reason: regenerateReason.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to regenerate barcode');
      }

      setSuccess(`Barcode regenerated successfully! New value: ${data.barcode.barcode_value}. Triggering print...`);
      
      // Find original sample details for printing
      const originalSample = samples.find(s => s.id === regenerateTarget.sample_id);
      if (originalSample) {
        const printSample = {
          ...originalSample,
          barcode_text: data.barcode.barcode_value,
          qr_code_base64: data.barcode.qr_code_base64,
          code128_base64: data.barcode.code128_base64
        };
        onPrintBarcode(printSample);
      }

      if (onBarcodeAction) onBarcodeAction();
      fetchDashboardData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleZplSimulate = (barcode) => {
    const originalSample = samples.find(s => s.id === barcode.sample_id) || {};
    const spec = originalSample.specimen_type || "N/A";
    const date = originalSample.collection_date || "N/A";

    const code = `^XA
^FX AURA Biobank Barcode Label for Zebra printers
^FX Outer label frame
^GB280,180,2^FS
^FX Lab branding header
^FO15,15^A0N,22,18^FDmetropolis laboratory^FS
^FX Sample ID metadata
^FO15,40^A0N,26,20^FDID: ${barcode.sample_id}^FS
^FO15,65^A0N,18,12^FDType: ${spec}^FS
^FO15,82^A0N,16,10^FDColl: ${date}^FS
^FX Code128 barcode placement
^FO15,105^BY1^BCN,35,Y,N,N^FD${barcode.barcode_value}^FS
^FX QR code mapping
^FO180,45^BQN,2,3^FDQA,${barcode.barcode_value}^FS
^XZ`;

    setZplContent(code);
    setShowZplModal(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', textAlign: 'left' }}>
      
      {/* Back Button */}
      <button 
        className="btn btn-secondary" 
        onClick={() => setActiveTab('dashboard')} 
        style={{ marginBottom: '4px', padding: '6px 12px', fontSize: '12px', alignSelf: 'flex-start' }}
      >
        ← Back to Dashboard
      </button>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: '26px', fontWeight: '700' }}>Barcode & Label Console</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Manage unique specimen barcode IDs, track print operations, and configure thermal printer parameters.
        </p>
      </div>

      {!activeLabId && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 'var(--border-radius-md)',
          padding: '16px',
          color: 'var(--accent-error)',
          fontSize: '13px',
          fontWeight: '600',
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>
            <strong>Active Lab Required:</strong> You must select an Active Working Lab from the top header dropdown to view metrics, barcode lists, or print labels.
          </span>
        </div>
      )}

      {error && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 'var(--border-radius-sm)',
          padding: '12px 16px',
          color: 'var(--accent-error)',
          fontSize: '13px',
          fontWeight: '600'
        }}>
          ✕ {error}
        </div>
      )}

      {success && (
        <div style={{
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: 'var(--border-radius-sm)',
          padding: '12px 16px',
          color: 'var(--accent-success)',
          fontSize: '13px',
          fontWeight: '600'
        }}>
          ✓ {success}
        </div>
      )}

      {/* Section 1: Dashboard Summary Cards */}
      <div className="dashboard-grid">
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Generated Barcodes
          </span>
          <span style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)' }}>
            {metrics.totalGenerated}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Active mappings in DB</span>
        </div>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Labels Printed
          </span>
          <span style={{ fontSize: '28px', fontWeight: '800', color: 'var(--accent-cyan)' }}>
            {metrics.totalPrinted}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Sum of print/reprint counts</span>
        </div>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Reprinted Labels
          </span>
          <span style={{ fontSize: '28px', fontWeight: '800', color: 'var(--accent-purple)' }}>
            {metrics.totalReprinted}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Damaged/lost reprint audits</span>
        </div>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pending Barcode Generation
          </span>
          <span style={{ fontSize: '28px', fontWeight: '800', color: 'var(--accent-warning)' }}>
            {metrics.pendingGeneration}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Verified consents waiting for label</span>
        </div>
      </div>

      {/* Section 2: Generation Queue (Pending verification) */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          Pending Generation Queue
        </h3>
        {pendingSamples.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>
            All consent-verified specimens have active barcodes mapped. No samples in queue.
          </p>
        ) : (
          <div className="table-container" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            <table className="custom-table" style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>Sample ID</th>
                  <th>Specimen Type</th>
                  <th>Consent ID</th>
                  <th>Consent Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingSamples.map(sample => (
                  <tr key={sample.id}>
                    <td style={{ fontWeight: '700', fontFamily: 'monospace' }}>{sample.id}</td>
                    <td>{sample.specimen_type}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--accent-purple)' }}>{sample.consent_id}</td>
                    <td>{sample.consent_date}</td>
                    <td>
                      <button 
                        className="btn btn-primary" 
                        onClick={() => handleGenerate(sample.id)}
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                        disabled={loading}
                      >
                        Generate Label
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 3: Barcode History Directory */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>
            Specimen Barcode History
          </h3>
          {selectedBarcodeIds.length > 0 && (
            <button 
              className="btn btn-secondary" 
              onClick={handleOpenBatchReprint}
              style={{ padding: '4px 12px', fontSize: '12px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '12px', height: '12px' }}>
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Reprint Selected ({selectedBarcodeIds.length})
            </button>
          )}
        </div>
        {historyList.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
            No barcodes generated yet.
          </p>
        ) : (
          <>
            <div className="table-container">
              <table className="custom-table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input 
                        type="checkbox"
                        checked={activeHistoryList.length > 0 && selectedBarcodeIds.length === activeHistoryList.length}
                        onChange={handleSelectAllChange}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th>Sample ID</th>
                    <th>Barcode Value</th>
                    <th>Generated By</th>
                    <th>Generated Date</th>
                    <th>Print Count</th>
                    <th>Last Printed Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map(h => {
                      let statusBadge = h.status === 'Active' ? 'badge-verified' : 'badge-rejected';
                      const genDate = new Date(h.generated_at).toLocaleString();
                      const lastPrint = h.last_printed_at ? new Date(h.last_printed_at).toLocaleString() : 'N/A';
                      
                      return (
                        <tr key={h.barcode_id}>
                          <td style={{ textAlign: 'center' }}>
                            <input 
                              type="checkbox"
                              disabled={h.status !== 'Active'}
                              checked={selectedBarcodeIds.includes(h.barcode_id)}
                              onChange={() => handleSelectBarcodeChange(h.barcode_id)}
                              style={{ cursor: h.status === 'Active' ? 'pointer' : 'not-allowed' }}
                            />
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>{h.sample_id}</td>
                          <td style={{ fontFamily: 'monospace', fontWeight: '600', color: 'var(--accent-cyan)' }}>{h.barcode_value}</td>
                          <td>{h.generated_by_name || "System"}</td>
                          <td style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>{genDate}</td>
                          <td style={{ fontWeight: '700', textAlign: 'center' }}>{h.print_count}</td>
                          <td style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>{lastPrint}</td>
                          <td>
                            <span className={`badge ${statusBadge}`}>{h.status}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {h.status === 'Active' && (
                                <>
                                  <button 
                                    className="btn btn-secondary" 
                                    onClick={() => handleOpenReprint(h)}
                                    style={{ padding: '3px 8px', fontSize: '11px' }}
                                    disabled={loading || h.consent_status === 'Withdrawn'}
                                    title={h.consent_status === 'Withdrawn' ? "Consent withdrawn" : ""}
                                  >
                                    Reprint
                                  </button>
                                  
                                  {user.role === 'Lab Admin' && (
                                    <button 
                                      className="btn btn-danger" 
                                      onClick={() => handleOpenRegenerate(h)}
                                      style={{ padding: '3px 8px', fontSize: '11px', backgroundColor: 'var(--accent-warning)', border: 'none' }}
                                      disabled={loading || h.consent_status === 'Withdrawn'}
                                      title={h.consent_status === 'Withdrawn' ? "Consent withdrawn" : ""}
                                    >
                                      Regenerate
                                    </button>
                                  )}
                                </>
                              )}
                              <button 
                                className="btn btn-secondary" 
                                onClick={() => handleZplSimulate(h)}
                                style={{ padding: '3px 8px', fontSize: '11px', borderColor: 'var(--accent-purple)', color: 'var(--accent-purple)' }}
                              >
                                ZPL Code
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Reprint Reason Modal */}
      {showReprintModal && reprintTarget && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1100, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700' }}>Authorize Barcode Reprint</h3>
              <button onClick={() => setShowReprintModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              You are reprinting active label for sample <strong>{reprintTarget.sample_id}</strong>. Every reprint is cataloged in compliance audits.
            </div>

            <form onSubmit={submitReprint} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="reprint-reason">Reason for Reprint *</label>
                <select
                  id="reprint-reason"
                  className="form-control"
                  required
                  value={reprintReason}
                  onChange={(e) => setReprintReason(e.target.value)}
                >
                  <option value="">-- Choose Reason --</option>
                  <option value="Damaged Label Sticker">Damaged Label Sticker</option>
                  <option value="Lost Label Sticker">Lost Label Sticker</option>
                  <option value="Scanner Failure / Unreadable">Scanner Failure / Unreadable</option>
                  <option value="Additional tube printing">Additional Tube Printing</option>
                  <option value="Audit inspection check">Audit Inspection Check</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowReprintModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5 }}>Authorize & Print</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Regenerate Reason Modal (Admin Only) */}
      {showRegenerateModal && regenerateTarget && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1100, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--accent-warning)' }}>Regenerate Sample Barcode</h3>
              <button onClick={() => setShowRegenerateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong>WARNING</strong>: This will disable the active barcode <strong>{regenerateTarget.barcode_value}</strong>, move it to history, and generate a new versioned suffix code. This requires explicit audit justification.
            </div>

            <form onSubmit={submitRegenerate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="regen-reason">Regeneration Reason *</label>
                <select
                  id="regen-reason"
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
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5, background: 'var(--accent-warning)', border: 'none' }}>Verify & Regenerate</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Zebra ZPL Code Modal */}
      {showZplModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1100, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700', color: 'var(--accent-purple)' }}>Zebra Printer ZPL Code</h3>
              <button onClick={() => setShowZplModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Below is the raw ZPL string formatted for a standard 3" x 2" Zebra desktop printer label.
            </div>

            <textarea
              className="form-control"
              readOnly
              value={zplContent}
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                height: '180px',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                resize: 'none',
                padding: '10px'
              }}
            />

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1 }} 
                onClick={() => setShowZplModal(false)}
              >
                Close
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ flex: 1.5, background: 'linear-gradient(135deg, var(--accent-purple), #8b5cf6)' }}
                onClick={() => {
                  navigator.clipboard.writeText(zplContent);
                  alert("ZPL configuration copied to clipboard!");
                }}
              >
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
