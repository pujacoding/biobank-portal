import React, { useState, useEffect } from 'react';

export default function InventoryStorage({ samples, backendUrl, token, user, onStorageAction, activeLabId, activeLabName }) {
  const [activeUnit, setActiveUnit] = useState('ULT-03');
  const [selectedWell, setSelectedWell] = useState(null);
  const [selectedSpecimen, setSelectedSpecimen] = useState(null);
  
  // Storage Form States
  const [depBarcode, setDepBarcode] = useState('');
  const [depQuality, setDepQuality] = useState('');
  const [depDiagnosis, setDepDiagnosis] = useState('Healthy Control');
  
  // QC Form States
  const [qcStatus, setQcStatus] = useState('Verified');
  const [qcQuality, setQcQuality] = useState('');
  
  // Relocate States
  const [relocateMode, setRelocateMode] = useState(false);
  const [relocateSourceWell, setRelocateSourceWell] = useState(null);
  const [relocateBarcode, setRelocateBarcode] = useState('');

  const rows = ['A', 'B', 'C', 'D', 'E', 'F'];
  const cols = [1, 2, 3, 4, 5, 6];
  
  // Allowed specimen types per freezer
  const allowedTypes = activeUnit === 'LN2-01' ? ['DNA', 'Tissue'] : ['Whole Blood', 'Serum', 'Plasma', 'Saliva', 'Urine'];

  // Filter samples that are stored in this unit
  const storedSamples = samples.filter(s => 
    s.location && s.location.startsWith(activeUnit) && s.retrieval_status !== 'Retrieved'
  );

  // Filter samples that are verified and barcode-generated, but NOT yet stored (ready for deposition)
  const availableToDeposit = samples.filter(s => {
    const isBaseAvailable = s.consent_status === 'Verified' && 
      s.barcode_text && 
      (!s.location || s.retrieval_status === 'Retrieved');

    if (!isBaseAvailable) return false;

    // A sample that is currently shipped (in transit) cannot be deposited
    if (s.status === 'Shipped') {
      return false;
    }

    // A sample received at a depot must match the corresponding freezer unit's depot
    if (s.status === 'Received') {
      const targetDepot = activeUnit === 'LN2-01' 
        ? 'AURA Central Biobank - LN2 Cryo Tank Yard' 
        : 'AURA Central Biobank - ULT Storage Wing';
      return s.shipment_destination === targetDepot;
    }

    return true;
  });

  const handleWellClick = (wellId) => {
    // Check if well is occupied
    const wellLocationSuffix = `Well ${wellId}`;
    const matchingSample = storedSamples.find(s => s.location && s.location.endsWith(wellLocationSuffix));
    
    if (relocateMode) {
      if (matchingSample) {
        alert("Target well is occupied. Please select an empty well slot for relocation.");
        return;
      }
      handleConfirmRelocation(wellId);
      return;
    }

    setSelectedWell(wellId);
    if (matchingSample) {
      setSelectedSpecimen(matchingSample);
      setQcQuality(matchingSample.quality || '');
      setQcStatus(matchingSample.qc_status || 'Verified');
    } else {
      setSelectedSpecimen(null);
      setDepBarcode('');
      setDepQuality('');
      setDepDiagnosis('Healthy Control');
    }
  };

  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    if (!depBarcode || !selectedWell) return;

    try {
      const locationCoords = `${activeUnit} > Shelf B > Drawer 3 > Box A12 > Well ${selectedWell}`;
      const response = await fetch(`${backendUrl}/api/integration/samples/store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          barcode: depBarcode,
          location: locationCoords,
          quality: depQuality,
          diagnosis: depDiagnosis
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to deposit specimen');

      alert("Specimen successfully deposited and registered in cryogenic grid.");
      setSelectedWell(null);
      if (onStorageAction) onStorageAction();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleQcSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSpecimen) return;

    try {
      const response = await fetch(`${backendUrl}/api/integration/samples/qc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          barcode: selectedSpecimen.id,
          quality: qcQuality,
          status: qcStatus
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update QC metrics');

      alert("Quality Control validation complete.");
      setSelectedWell(null);
      if (onStorageAction) onStorageAction();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleStartRelocation = () => {
    if (!selectedSpecimen) return;
    setRelocateMode(true);
    setRelocateSourceWell(selectedWell);
    setRelocateBarcode(selectedSpecimen.id);
    setSelectedWell(null);
    alert(`Select an empty well slot in the grid to relocate sample: ${selectedSpecimen.id}`);
  };

  const handleConfirmRelocation = async (targetWellId) => {
    try {
      const newCoords = `${activeUnit} > Shelf B > Drawer 3 > Box A12 > Well ${targetWellId}`;
      const response = await fetch(`${backendUrl}/api/integration/samples/relocate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          barcode: relocateBarcode,
          newLocation: newCoords
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to relocate specimen');

      alert(`Specimen ${relocateBarcode} successfully relocated to Well ${targetWellId}`);
      setRelocateMode(false);
      setRelocateSourceWell(null);
      setRelocateBarcode('');
      setSelectedWell(null);
      if (onStorageAction) onStorageAction();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleRetrieveSpecimen = async () => {
    if (!selectedSpecimen) return;
    const reason = prompt("Enter the compliance retrieval justification:", "Retrieved for active research study allocation");
    if (reason === null) return; // cancel
    if (!reason.trim()) {
      alert("justification is required before retrieving specimen from cold storage.");
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/integration/samples/retrieve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          barcode: selectedSpecimen.id,
          reason: reason.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to retrieve specimen');

      alert(`Specimen ${selectedSpecimen.id} retrieved from storage grid successfully.`);
      setSelectedWell(null);
      if (onStorageAction) onStorageAction();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '700' }}>Cryo-Storage Mapping & Rack Matrix</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Map, QC, relocate, or retrieve biological specimen containers inside freezer racks.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="freezer-select" style={{ fontSize: '14px', fontWeight: '700' }}>Active Unit:</label>
          <select 
            id="freezer-select" 
            className="form-control"
            value={activeUnit} 
            onChange={(e) => {
              setActiveUnit(e.target.value);
              setSelectedWell(null);
              setSelectedSpecimen(null);
              setRelocateMode(false);
            }}
            style={{ width: '220px' }}
          >
            <option value="ULT-03">ULT Freezer 03 (-80.4°C)</option>
            <option value="LN2-01">LN2 Tank 01 (-196.2°C)</option>
          </select>
        </div>
      </div>

      {relocateMode && (
        <div className="glass-card" style={{ background: 'rgba(168, 85, 247, 0.08)', borderColor: 'var(--accent-purple)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            📍 <strong>Relocating sample {relocateBarcode}</strong> from Well {relocateSourceWell?.split(' ').pop()}. Click any empty well slot to complete relocation.
          </div>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => {
            setRelocateMode(false);
            setRelocateSourceWell(null);
            setRelocateBarcode('');
          }}>Cancel</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Interactive 6x6 Grid */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              {activeUnit === 'LN2-01' ? 'LN2 Tank 01 > Shelf B, Drawer 3, Box A12' : 'ULT Freezer 03 > Shelf B, Drawer 3, Box A12'}
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>A12-W1 to A12-W36</span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: '12px',
            padding: '10px 0'
          }}>
            {rows.map(r => 
              cols.map(c => {
                const wellId = `${r}${c}`;
                const locationSuffix = `Well ${wellId}`;
                const matchingSample = storedSamples.find(s => s.location && s.location.endsWith(locationSuffix));
                
                let btnClass = 'well-btn-empty';
                let borderCol = 'var(--border-color)';
                let glow = 'none';

                if (matchingSample) {
                  btnClass = 'well-btn-occupied';
                  if (matchingSample.qc_status === 'Failed') {
                    borderCol = 'var(--accent-red)';
                  } else if (matchingSample.qc_status === 'Verified') {
                    borderCol = 'var(--accent-success)';
                  } else {
                    borderCol = 'var(--accent-cyan)';
                  }
                }

                if (selectedWell === wellId) {
                  glow = '0 0 12px var(--accent-primary)';
                  borderCol = 'var(--accent-primary)';
                }

                if (relocateMode && relocateSourceWell === wellId) {
                  glow = '0 0 12px var(--accent-purple)';
                  borderCol = 'var(--accent-purple)';
                }

                return (
                  <button 
                    key={wellId}
                    onClick={() => handleWellClick(wellId)}
                    style={{
                      height: '60px',
                      borderRadius: '8px',
                      border: `1.5px solid ${borderCol}`,
                      background: matchingSample ? 'rgba(0, 242, 254, 0.05)' : 'var(--bg-primary)',
                      color: matchingSample ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: glow,
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: '800', fontFamily: 'monospace' }}>{wellId}</span>
                    {matchingSample && (
                      <span style={{ 
                        fontSize: '8px', 
                        fontWeight: '700', 
                        color: 'var(--accent-cyan)', 
                        marginTop: '2px', 
                        maxWidth: '90%', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap' 
                      }}>
                        {matchingSample.id.split('-').pop()}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Side Panel: Inspector / Form */}
        <div className="glass-card" style={{ minHeight: '350px' }}>
          {!selectedWell ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '350px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '24px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '48px', height: '48px', marginBottom: '12px' }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              <p style={{ fontSize: '13px', lineHeight: 1.5 }}>
                Click any slot in the microplate rack grid to inspect stored specimen aliquots, relocate items, or deposit newly registered sample tubes.
              </p>
            </div>
          ) : selectedSpecimen ? (
            /* Occupied Well Panel - Inspection & QC/Retrieval */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                <span className="badge badge-verified" style={{ background: 'rgba(0, 242, 254, 0.1)', color: 'var(--accent-cyan)' }}>Well {selectedWell} (Occupied)</span>
                <button onClick={() => setSelectedWell(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
              </div>

              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'monospace' }}>{selectedSpecimen.id}</h2>
                <span className="badge badge-info" style={{ marginTop: '4px', display: 'inline-block' }}>{selectedSpecimen.specimen_type}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <div><strong>Subject (Donor ID):</strong> {selectedSpecimen.subject_id}</div>
                <div><strong>Age & Gender:</strong> {selectedSpecimen.age} yrs, {selectedSpecimen.gender}</div>
                <div><strong>Lab Origin:</strong> {selectedSpecimen.lab_name}</div>
                <div><strong>Clinical Diagnosis:</strong> {selectedSpecimen.diagnosis || 'Healthy Control'}</div>
                <div><strong>Current Quality:</strong> {selectedSpecimen.quality || 'RIN Check Unperformed'}</div>
                <div>
                  <strong>QC Status:</strong> &nbsp;
                  <span className={`badge ${selectedSpecimen.qc_status === 'Verified' ? 'badge-verified' : (selectedSpecimen.qc_status === 'Failed' ? 'badge-danger' : 'badge-pending')}`}>
                    {selectedSpecimen.qc_status || 'Pending'}
                  </span>
                </div>
              </div>

              {/* QC Validation Form */}
              <form onSubmit={handleQcSubmit} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Update QC Validation Metrics</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '11px' }}>QC Verdict</label>
                    <select className="form-control" value={qcStatus} onChange={(e) => setQcStatus(e.target.value)}>
                      <option value="Verified">Verified / Approved</option>
                      <option value="Failed">Failed / Discard</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '11px' }}>Quality Rating</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="e.g. RIN: 9.6"
                      value={qcQuality} 
                      onChange={(e) => setQcQuality(e.target.value)} 
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-secondary" style={{ width: '100%', padding: '6px' }}>🔬 Apply QC Results</button>
              </form>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <button className="btn btn-secondary" style={{ flex: 1, borderColor: 'var(--accent-purple)', color: 'var(--accent-purple)' }} onClick={handleStartRelocation}>
                  📍 Relocate
                </button>
                <button className="btn btn-secondary" style={{ flex: 1, borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }} onClick={handleRetrieveSpecimen}>
                  📥 Retrieve
                </button>
              </div>
            </div>
          ) : (
            /* Empty Well - Deposition Form */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifycontent: 'space-between', alignitems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                <span className="badge badge-pending">Well {selectedWell} (Empty / Available)</span>
                <button onClick={() => setSelectedWell(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
              </div>

              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Deposit Specimen Aliquot</h3>
              
              {availableToDeposit.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '24px 0', textAlign: 'center' }}>
                  No verified specimens with barcodes are currently pending storage. Verify consents and print barcode labels first!
                </div>
              ) : (
                <form onSubmit={handleDepositSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label htmlFor="dep-barcode-select">Select Pending Barcode *</label>
                    <select 
                      id="dep-barcode-select" 
                      className="form-control" 
                      required 
                      value={depBarcode} 
                      onChange={(e) => setDepBarcode(e.target.value)}
                    >
                      <option value="">-- Select Specimen --</option>
                      {availableToDeposit
                        .filter(s => allowedTypes.includes(s.specimen_type))
                        .map(s => (
                          <option key={s.id} value={s.id}>{s.id} ({s.specimen_type} - Subject: {s.subject_id})</option>
                        ))
                      }
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="dep-quality-input">Quality Metric *</label>
                    <input 
                      type="text" 
                      id="dep-quality-input" 
                      className="form-control" 
                      required 
                      placeholder="e.g. RIN: 9.2, Viability: 96%" 
                      value={depQuality} 
                      onChange={(e) => setDepQuality(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="dep-diag-input">Clinical Diagnosis (ICD-10) *</label>
                    <select 
                      id="dep-diag-input" 
                      className="form-control" 
                      required 
                      value={depDiagnosis} 
                      onChange={(e) => setDepDiagnosis(e.target.value)}
                    >
                      <option value="Healthy Control">Healthy Control</option>
                      <option value="Type 2 Diabetes">Type 2 Diabetes</option>
                      <option value="Breast Cancer">Breast Cancer</option>
                      <option value="COVID-19 Post-Acute">COVID-19 Post-Acute</option>
                      <option value="Alzheimer's Disease">Alzheimer's Disease</option>
                    </select>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '10px', marginTop: '6px' }}>
                    Secure Grid Deposition
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
