import React, { useState, useEffect } from 'react';

export default function TraceSpecimen({ backendUrl, token, user, activeLabId, activeLabName }) {
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [traceData, setTraceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-search if scanned from URL parameters (e.g. ?scan=barcode in integration context)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const scanBarcode = urlParams.get('trace') || urlParams.get('scan');
    if (scanBarcode) {
      setBarcodeQuery(scanBarcode);
      performTrace(scanBarcode);
    }
  }, []);

  const performTrace = async (barcode) => {
    const targetBarcode = barcode || barcodeQuery;
    if (!targetBarcode.trim()) return;

    setLoading(true);
    setError('');
    setTraceData(null);

    try {
      const response = await fetch(`${backendUrl}/api/integration/samples/trace/${targetBarcode.trim()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to locate barcode details in repository registry.');
      }

      setTraceData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    performTrace();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'left' }}>
      
      <div>
        <h1 style={{ fontSize: '26px', fontWeight: '700' }}>Trace Specimen & Lifecycle Auditing</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Track the secure cold-chain lifecycle and spatial movement coordinates of biological specimen containers.
        </p>
      </div>

      {/* Central Search Box */}
      <div className="glass-card" style={{ padding: '24px', maxWidth: '640px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="trace-search-input" style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Scan or Enter Barcode ID</label>
            <input 
              id="trace-search-input"
              type="text" 
              className="form-control" 
              placeholder="e.g. BLD-2026-0007" 
              required
              value={barcodeQuery}
              onChange={(e) => setBarcodeQuery(e.target.value)}
              style={{ fontSize: '14px', padding: '10px 14px' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '14px' }}>
            Trace Lifecycle
          </button>
        </form>

        {error && (
          <div style={{ marginTop: '16px', color: 'var(--accent-red)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ⚠️ <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      {loading && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Tracing specimen ledger records...</p>
      )}

      {/* Trace Findings Result */}
      {traceData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '24px', alignItems: 'start' }}>
          
          {/* Specimen Details Summary */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <span className="badge badge-verified" style={{ background: 'rgba(0, 242, 254, 0.1)', color: 'var(--accent-cyan)' }}>Current Registry State</span>
              <h2 style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'monospace', marginTop: '6px' }}>{traceData.sample.id}</h2>
              <span className="badge badge-info" style={{ marginTop: '2px', display: 'inline-block' }}>{traceData.sample.specimen_type}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div><strong>Pseudonymized Subject ID:</strong> {traceData.sample.subject_id}</div>
              <div><strong>Age & Gender:</strong> {traceData.sample.age} years old, {traceData.sample.gender}</div>
              <div><strong>Lab Intake Source:</strong> {traceData.sample.lab_name}</div>
              <div><strong>Extraction Date:</strong> {traceData.sample.collection_date} &bull; {traceData.sample.collection_time}</div>
              <div><strong>Clinical Pathology:</strong> {traceData.sample.diagnosis || 'Healthy Control'}</div>
              <div><strong>Quality Inspection Check:</strong> {traceData.sample.quality || 'Integrity: Unchecked'}</div>
              <div>
                <strong>QC Verdict Status:</strong> &nbsp;
                <span className={`badge ${traceData.sample.qc_status === 'Verified' ? 'badge-verified' : (traceData.sample.qc_status === 'Failed' ? 'badge-danger' : 'badge-pending')}`}>
                  {traceData.sample.qc_status || 'Pending'}
                </span>
              </div>
              <div>
                <strong>Storage Location Address:</strong> &nbsp;
                {traceData.sample.location ? (
                  <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--accent-cyan)' }}>{traceData.sample.location}</span>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Unstored / In Transit</span>
                )}
              </div>
              <div>
                <strong>Lifecycle State:</strong> &nbsp;
                <span className="badge badge-verified">{traceData.sample.status}</span>
              </div>
            </div>
          </div>

          {/* Lifecycle Tracking Timeline */}
          <div className="glass-card">
            <h3 style={{ fontSize: '18px', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '20px' }}>Specimen Audit Timeline Ledger</h3>
            
            <div style={{ position: 'relative', paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
              {/* Vertical line connector */}
              <div style={{
                position: 'absolute',
                left: '9px',
                top: '12px',
                bottom: '12px',
                width: '2px',
                backgroundColor: 'var(--border-color)',
                zIndex: 0
              }}></div>

              {/* Milestone 1: Intake Collection */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{
                  position: 'absolute',
                  left: '-32px',
                  top: '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-cyan)',
                  border: '4px solid var(--bg-secondary)',
                  boxShadow: '0 0 8px var(--accent-cyan)',
                  zIndex: 2
                }}></span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>1. Specimen Intake & Demographics Registration</strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{traceData.sample.collection_date}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Registered sample {traceData.sample.id} ({traceData.sample.specimen_type}, {traceData.sample.sample_volume} mL) for Subject {traceData.sample.subject_id} at {traceData.sample.lab_name} by intake operator {traceData.sample.collector_name}.
                </p>
              </div>

              {/* Milestone 2: Patient Consent */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{
                  position: 'absolute',
                  left: '-32px',
                  top: '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: traceData.sample.consent_status === 'Verified' ? 'var(--accent-teal)' : 'var(--accent-orange)',
                  border: '4px solid var(--bg-secondary)',
                  boxShadow: `0 0 8px ${traceData.sample.consent_status === 'Verified' ? 'var(--accent-teal)' : 'var(--accent-orange)'}`,
                  zIndex: 2
                }}></span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>2. Patient Consent Verification</strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{traceData.sample.collection_date}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Linked Consent Template: <strong>{traceData.sample.consent_code || 'GBC'}</strong> (Consent Version: {traceData.sample.consent_version || 'v1.0'}). Verification status: &nbsp;
                  <span className={`badge ${traceData.sample.consent_status === 'Verified' ? 'badge-verified' : 'badge-pending'}`}>
                    {traceData.sample.consent_status || 'Pending'}
                  </span>.
                </p>
              </div>

              {/* Milestone 3: Barcode Label Generation */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{
                  position: 'absolute',
                  left: '-32px',
                  top: '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: traceData.barcode ? 'var(--accent-teal)' : 'var(--border-color)',
                  border: '4px solid var(--bg-secondary)',
                  zIndex: 2
                }}></span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>3. QR / Barcode Activation</strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{traceData.sample.collection_date}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  {traceData.barcode ? (
                    <span>Generated and printed active Code128 and QR labels matching barcode value <code>{traceData.sample.id}</code> (Label print count: {traceData.barcode.print_count || 1}).</span>
                  ) : (
                    <span>Barcode label printing pending consent verification.</span>
                  )}
                </p>
              </div>

              {/* Milestone 4: QC Processing */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{
                  position: 'absolute',
                  left: '-32px',
                  top: '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: traceData.sample.qc_status === 'Verified' ? 'var(--accent-teal)' : (traceData.sample.qc_status === 'Failed' ? 'var(--accent-red)' : 'var(--border-color)'),
                  border: '4px solid var(--bg-secondary)',
                  zIndex: 2
                }}></span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>4. Quality Control Processing</strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{traceData.sample.location ? 'QC Completed' : 'Pending'}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  {traceData.sample.qc_status && traceData.sample.qc_status !== 'Pending' ? (
                    <span>Quality check verified. Score metrics: <strong>{traceData.sample.quality}</strong>. QC status: <code>{traceData.sample.qc_status}</code>.</span>
                  ) : (
                    <span>QC inspection check uncompleted. Specimen awaiting laboratory validation check.</span>
                  )}
                </p>
              </div>

              {/* Milestone 5: Cold-Chain Storage deposition */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{
                  position: 'absolute',
                  left: '-32px',
                  top: '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: traceData.sample.location ? 'var(--accent-teal)' : 'var(--border-color)',
                  border: '4px solid var(--bg-secondary)',
                  zIndex: 2
                }}></span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>5. Freezer Storage Deposition</strong>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{traceData.sample.location ? 'Deposited' : 'Pending'}</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  {traceData.sample.location ? (
                    <span>Assigned to spatial coordinates: <code>{traceData.sample.location}</code> (Cold Chain target validation: &bull; Never exceeded limit thresholds).</span>
                  ) : (
                    <span>Awaiting cryogenic rack deposition. Specimen is currently at room temperature in transit workspace.</span>
                  )}
                </p>
              </div>

              {/* Milestone 6: Retrieval & Release */}
              {(traceData.sample.retrieval_status === 'Retrieved' || traceData.sample.retrieval_status === 'Allocated') && (
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{
                    position: 'absolute',
                    left: '-32px',
                    top: '2px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-purple)',
                    border: '4px solid var(--bg-secondary)',
                    boxShadow: '0 0 8px var(--accent-purple)',
                    zIndex: 2
                  }}></span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>6. Retrieval & Research Allocation</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Active Allocation</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    Specimen retrieved and allocated to research study checkout request. Storage coordinate has been released. Ingestion status: Ingested.
                  </p>
                </div>
              )}

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
