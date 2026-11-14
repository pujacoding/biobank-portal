import { useState, useEffect, useRef, useCallback } from 'react';

// Audio feedback helper (using Web Audio API, graceful fallback if blocked)
const playBeep = (type = 'success') => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else {
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch {
    // AudioContext blocked or not supported
  }
};

const parseJsonResponse = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  const text = await res.text();
  throw new Error(`Server returned ${res.status}: ${text.slice(0, 100)}`);
};

const DEFAULT_DESTINATIONS = [
  { id: 2, name: 'Central Biobank Laboratory B', type: 'Central Biobank', temp: 'Per validated SOP (-80°C / LN2)' },
  { id: 1, name: 'Collection Center A (Field Clinic)', type: 'Collection Center', temp: '2°C to 8°C Cold Pack' },
  { id: 3, name: 'Partner Diagnostic Core Lab', type: 'Clinical Testing', temp: '-20°C Standard Cold' },
  { id: 4, name: 'External Genomic Research Lab', type: 'Sequencing Facility', temp: 'Dry Ice (-78.5°C)' }
];

const TEMPERATURE_OPTIONS = [
  'Per validated SOP',
  '-80°C Dry Ice',
  '-20°C Frozen Cold Pack',
  '2°C to 8°C Refrigerated',
  'Ambient (15°C to 25°C)',
  'LN2 Vapor Phase (-196°C)'
];

export default function ShipmentManagement({ 
  samples = [], 
  backendUrl, 
  token, 
  user,
  onShipmentAction, 
  activeLabId, 
  activeLabName, 
  setActiveTab,
  setPreSelectedSampleId
}) {
  // Navigation tabs: 'create_dispatch' | 'in_transit' | 'receive_intake'
  const [activeTabNav, setActiveTabNav] = useState('create_dispatch');

  // Transfer creation state (Steps 1, 2, 3)
  const [selectedSampleId, setSelectedSampleId] = useState('');
  const [destinationLabId, setDestinationLabId] = useState(() => {
    const other = DEFAULT_DESTINATIONS.find(d => Number(d.id) !== Number(activeLabId));
    return other ? other.id : 2;
  });
  const [dispatchedBy, setDispatchedBy] = useState(user?.name || user?.username || 'Lab Technician');
  const [temperatureSop, setTemperatureSop] = useState('Per validated SOP');
  const [courierNotes, setCourierNotes] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [dispatchAlert, setDispatchAlert] = useState(null);

  useEffect(() => {
    if (activeLabId && Number(destinationLabId) === Number(activeLabId)) {
      const other = DEFAULT_DESTINATIONS.find(d => Number(d.id) !== Number(activeLabId));
      if (other) setDestinationLabId(other.id);
    }
  }, [activeLabId, destinationLabId]);

  // Shipments & Transfers state
  const [shipments, setShipments] = useState([]);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [selectedTransferForDetail, setSelectedTransferForDetail] = useState(null);

  // Receiving scan & verify state (Steps 5, 6, 7)
  const [scanInput, setScanInput] = useState('');
  const [verifyingScan, setVerifyingScan] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { match, shipment, sample, status }
  const [scanAlert, setScanAlert] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [quarantineReason, setQuarantineReason] = useState('Temperature Excursion');
  const [quarantineNotes, setQuarantineNotes] = useState('');
  const [showQuarantineModal, setShowQuarantineModal] = useState(false);
  const [quarantineTargetSample, setQuarantineTargetSample] = useState(null);

  const scanInputRef = useRef(null);

  // Fetch all shipments
  const fetchShipments = useCallback(async () => {
    if (!token) return;
    setLoadingShipments(true);
    try {
      const res = await fetch(`${backendUrl}/api/integration/shipments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await parseJsonResponse(res);
        const list = Array.isArray(data) ? data : (data.shipments || []);
        setShipments(list);
      }
    } catch (err) {
      console.error('Failed to load transfers:', err);
    } finally {
      setLoadingShipments(false);
    }
  }, [backendUrl, token]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  // Focus scan input when switching to receive tab
  useEffect(() => {
    if (activeTabNav === 'receive_intake' && scanInputRef.current) {
      setTimeout(() => scanInputRef.current?.focus(), 150);
    }
  }, [activeTabNav]);

  // Eligible samples for transfer (Step 1 eligibility check)
  const eligibleSamples = samples.filter(s => {
    const isWithdrawn = s.status === 'Withdrawn';
    const isDisposed = s.status === 'Disposed';
    const isQuarantined = s.status === 'Quarantined';
    const isInTransit = s.status === 'In Transit' || (s.barcode_status === 'TRANSIT');
    return !isWithdrawn && !isDisposed && !isQuarantined && !isInTransit;
  });

  const selectedSample = samples.find(s => s.id === selectedSampleId);

  // Step 3: Handle Dispatch Handover
  const handleDispatch = async (e) => {
    e.preventDefault();
    if (!selectedSampleId) {
      setDispatchAlert({ type: 'error', message: 'Step 1: Please select an eligible sample barcode.' });
      playBeep('error');
      return;
    }

    if (!destinationLabId) {
      setDispatchAlert({ type: 'error', message: 'Step 2: Please select a valid destination laboratory.' });
      playBeep('error');
      return;
    }

    if (activeLabId && Number(destinationLabId) === Number(activeLabId)) {
      setDispatchAlert({ type: 'error', message: 'Step 2: Destination laboratory cannot be the same as your origin facility.' });
      playBeep('error');
      return;
    }

    setDispatching(true);
    setDispatchAlert(null);

    try {
      const destObj = DEFAULT_DESTINATIONS.find(d => String(d.id) === String(destinationLabId));
      const destName = destObj ? destObj.name : 'Central Biobank Laboratory B';

      const payload = {
        destination: destName,
        destination_lab_id: Number(destinationLabId) || 2,
        dispatched_by: dispatchedBy || 'Lab Technician',
        temperature: temperatureSop,
        notes: courierNotes,
        barcodes: [selectedSampleId],
        sample_ids: [selectedSampleId]
      };

      const res = await fetch(`${backendUrl}/api/integration/shipments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await parseJsonResponse(res);

      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch transfer');
      }

      playBeep('success');
      const transferId = data.shipment?.transfer_id || data.transferId || data.shipmentId || 'TRF';
      setDispatchAlert({
        type: 'success',
        message: `Transfer ${transferId} created & dispatched! Consignment is now In Transit.`
      });

      // Clear form
      setSelectedSampleId('');
      setCourierNotes('');

      // Refresh data
      await fetchShipments();
      if (onShipmentAction) onShipmentAction();

      // Switch to in-transit view to view the record card
      if (data.shipment) {
        setSelectedTransferForDetail(data.shipment);
        setActiveTabNav('in_transit');
      }
    } catch (err) {
      playBeep('error');
      setDispatchAlert({ type: 'error', message: err.message });
    } finally {
      setDispatching(false);
    }
  };

  // Step 5: Handle Barcode Scan at Destination Lab
  const handleScanSubmit = async (e, barcodeOverride) => {
    e?.preventDefault();
    const barcode = (barcodeOverride !== undefined && barcodeOverride !== null ? String(barcodeOverride) : (scanInput || '')).trim();
    if (!barcode) return;

    setVerifyingScan(true);
    setScanAlert(null);
    setScanResult(null);

    try {
      const res = await fetch(`${backendUrl}/api/integration/shipments/verify-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ barcode: barcode, barcode_id: barcode, sample_id: barcode })
      });

      const data = await parseJsonResponse(res);

      if (!res.ok || !data.matched) {
        playBeep('error');
        setScanAlert({
          type: 'error',
          message: data.error || data.message || `No active transfer manifest found matching barcode "${barcode}".`
        });
        setScanResult(null);
      } else {
        playBeep('success');
        setScanResult(data);
        setScanAlert({
          type: 'success',
          message: `Barcode verified against Transfer ${data.shipment?.transfer_id || data.shipment?.id || 'Manifest'}! Proceed to inspect condition & accept custody.`
        });
      }
    } catch (err) {
      playBeep('error');
      setScanAlert({ type: 'error', message: err.message });
    } finally {
      setVerifyingScan(false);
    }
  };

  // Step 6A: Accept Specimen into Destination Custody
  const handleAcceptSample = async (sampleId, shipmentId) => {
    setActionLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/integration/shipments/accept-sample`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sample_id: sampleId,
          shipment_id: shipmentId,
          condition: 'Intact / Compliant',
          notes: 'Received in good condition. Verified against physical barcode.'
        })
      });

      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Failed to accept specimen');

      playBeep('success');
      setScanAlert({
        type: 'success',
        message: `Sample ${sampleId} successfully accepted into destination custody! Now ready for storage allocation.`
      });

      // Update scan result state
      if (scanResult && scanResult.sample?.id === sampleId) {
        setScanResult(prev => ({
          ...prev,
          sample: { ...prev.sample, status: 'Received' },
          status: 'Accepted'
        }));
      }

      await fetchShipments();
      if (onShipmentAction) onShipmentAction();
    } catch (err) {
      playBeep('error');
      setScanAlert({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Step 6B: Open Quarantine Dialog
  const handleOpenQuarantine = (sample, shipment) => {
    setQuarantineTargetSample({ sample, shipment });
    setShowQuarantineModal(true);
  };

  // Step 6C: Submit Quarantine Action
  const handleSubmitQuarantine = async () => {
    if (!quarantineTargetSample) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/integration/shipments/quarantine-sample`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          sample_id: quarantineTargetSample.sample.id,
          shipment_id: quarantineTargetSample.shipment.id,
          reason: quarantineReason,
          notes: quarantineNotes
        })
      });

      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Failed to quarantine specimen');

      playBeep('error');
      setShowQuarantineModal(false);
      setScanAlert({
        type: 'warning',
        message: `Sample ${quarantineTargetSample.sample.id} placed in QUARANTINE: ${quarantineReason}. Investigation flag logged.`
      });

      if (scanResult && scanResult.sample?.id === quarantineTargetSample.sample.id) {
        setScanResult(prev => ({
          ...prev,
          sample: { ...prev.sample, status: 'Quarantined' },
          status: 'Quarantined'
        }));
      }

      await fetchShipments();
      if (onShipmentAction) onShipmentAction();
    } catch (err) {
      setScanAlert({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Step 7: Proceed to Storage Allocation (Direct Hand-off to Inventory tab)
  const handleProceedToStore = (sampleId) => {
    if (setPreSelectedSampleId) {
      setPreSelectedSampleId(sampleId);
    }
    if (setActiveTab) {
      setActiveTab('inventory');
    }
  };

  // Filter in-transit shipments
  const inTransitShipments = shipments.filter(s => s.status === 'In Transit');
  const completedShipments = shipments.filter(s => s.status === 'Delivered' || s.status === 'Received');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
      
      {/* TOP HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🚚</span> Sample Transfer & Chain-of-Custody Management
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Validated 7-step custody protocol: Create &rarr; Destination &rarr; Dispatch &rarr; In-Transit &rarr; Receive &rarr; Accept/Quarantine &rarr; Store.
          </p>
        </div>

        {/* WORKFLOW TABS */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setActiveTabNav('create_dispatch')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: activeTabNav === 'create_dispatch' ? 'var(--accent-cyan)' : 'transparent',
              color: activeTabNav === 'create_dispatch' ? '#000' : 'var(--text-secondary)',
              fontWeight: activeTabNav === 'create_dispatch' ? '700' : '500',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>➕</span> 1-3. Create & Dispatch
          </button>

          <button
            type="button"
            onClick={() => setActiveTabNav('in_transit')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: activeTabNav === 'in_transit' ? 'var(--accent-cyan)' : 'transparent',
              color: activeTabNav === 'in_transit' ? '#000' : 'var(--text-secondary)',
              fontWeight: activeTabNav === 'in_transit' ? '700' : '500',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>🚚</span> 4. In Transit
            {inTransitShipments.length > 0 && (
              <span style={{
                background: activeTabNav === 'in_transit' ? '#000' : 'var(--accent-cyan)',
                color: activeTabNav === 'in_transit' ? '#fff' : '#000',
                padding: '1px 6px',
                borderRadius: '10px',
                fontSize: '10px',
                fontWeight: '800'
              }}>
                {inTransitShipments.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTabNav('receive_intake')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: activeTabNav === 'receive_intake' ? 'var(--accent-cyan)' : 'transparent',
              color: activeTabNav === 'receive_intake' ? '#000' : 'var(--text-secondary)',
              fontWeight: activeTabNav === 'receive_intake' ? '700' : '500',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📥</span> 5-7. Receive & Intake
          </button>
        </div>
      </div>

      {/* VIEW 1: CREATE & DISPATCH TRANSFER (STEPS 1, 2, 3) */}
      {activeTabNav === 'create_dispatch' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(300px, 1fr)', gap: '20px' }}>
          
          {/* LEFT: DISPATCH FORM */}
          <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                Create Consignment & Dispatch Handover
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Origin: <strong style={{ color: 'var(--accent-cyan)' }}>{activeLabName || 'Collection Center A'}</strong>
              </p>
            </div>

            {dispatchAlert && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                background: dispatchAlert.type === 'success' ? 'rgba(0, 242, 254, 0.12)' : 'rgba(255, 75, 75, 0.15)',
                color: dispatchAlert.type === 'success' ? 'var(--accent-cyan)' : '#ff4b4b',
                border: `1px solid ${dispatchAlert.type === 'success' ? 'var(--accent-cyan)' : '#ff4b4b'}`
              }}>
                {dispatchAlert.message}
              </div>
            )}

            <form onSubmit={handleDispatch} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* STEP 1: SELECT SAMPLE BARCODE */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Step 1. Select Sample Barcode <span style={{ color: '#ff4b4b' }}>*</span>
                </label>
                <select
                  className="form-control"
                  value={selectedSampleId}
                  onChange={(e) => setSelectedSampleId(e.target.value)}
                  style={{ width: '100%', fontSize: '13px' }}
                  required
                >
                  <option value="">-- Choose eligible sample to transfer --</option>
                  {eligibleSamples.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.id} - {s.specimen_type || 'Specimen'} ({s.subject_id ? `Subject: ${s.subject_id}` : 'Unassigned'} | Vol: {s.sample_volume || '--'}{s.volume_unit || 'mL'})
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {eligibleSamples.length} eligible specimens available in current inventory. Withdrawn or In-Transit tubes are excluded.
                </div>
              </div>

              {/* STEP 2: SELECT RECEIVING LABORATORY */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Step 2. Select Receiving Destination Laboratory <span style={{ color: '#ff4b4b' }}>*</span>
                </label>
                <select
                  className="form-control"
                  value={destinationLabId}
                  onChange={(e) => setDestinationLabId(e.target.value)}
                  style={{ width: '100%', fontSize: '13px' }}
                  required
                >
                  {DEFAULT_DESTINATIONS.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.temp})
                    </option>
                  ))}
                </select>
              </div>

              {/* STEP 3: DISPATCH HANDOVER DETAILS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Dispatched By (Custodian)
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={dispatchedBy}
                    onChange={(e) => setDispatchedBy(e.target.value)}
                    placeholder="e.g. Lab Technician"
                    style={{ width: '100%', fontSize: '13px' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Temperature Condition
                  </label>
                  <select
                    className="form-control"
                    value={temperatureSop}
                    onChange={(e) => setTemperatureSop(e.target.value)}
                    style={{ width: '100%', fontSize: '13px' }}
                  >
                    {TEMPERATURE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Handover Notes / Courier Carrier
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={courierNotes}
                  onChange={(e) => setCourierNotes(e.target.value)}
                  placeholder="e.g. Validated cold chain vehicle, seal intact #CC-8821"
                  style={{ width: '100%', fontSize: '13px' }}
                />
              </div>

              {/* DISPATCH ACTION BUTTON */}
              <button
                type="submit"
                disabled={dispatching || !selectedSampleId}
                className="btn btn-primary"
                style={{
                  marginTop: '10px',
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: '700',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>{dispatching ? '⏳' : '🚀'}</span>
                {dispatching ? 'Generating TRF & Handing Over...' : 'Step 3: Confirm Sample Handover & Dispatch'}
              </button>
            </form>
          </div>

          {/* RIGHT: SPECIMEN ELIGIBILITY & CUSTODY PREVIEW */}
          <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
              Specimen Eligibility & Custody Preview
            </h3>

            {selectedSample ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{
                  padding: '12px',
                  background: 'var(--bg-primary)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>SAMPLE ID</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--accent-cyan)' }}>
                      {selectedSample.id}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>SPECIMEN TYPE</span>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                      {selectedSample.specimen_type || 'Whole Blood / Plasma'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>CURRENT CUSTODY / LAB</span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {activeLabName || 'Collection Center A'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>CURRENT STORAGE LOCATION</span>
                    <span style={{ color: selectedSample.storage_location ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {selectedSample.storage_location || 'Staged in collection rack (Unassigned)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>ELIGIBILITY STATUS</span>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '700',
                      background: 'rgba(0, 242, 254, 0.1)',
                      color: 'var(--accent-cyan)',
                      border: '1px solid var(--accent-cyan)'
                    }}>
                      ✓ Eligible for Handover
                    </span>
                  </div>
                </div>

                {/* PROTOCOL NOTICE */}
                <div style={{
                  padding: '12px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.5'
                }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Standard Transfer Protocol:</strong>
                  <br />
                  Once dispatched, the system generates a standardized Transfer ID (<code style={{ color: 'var(--accent-cyan)' }}>TRF-YYYY-XXX</code>) and transitions the specimen status to <strong>In Transit</strong>. Storage location will be unassigned until received & accepted at the central biobank.
                </div>
              </div>
            ) : (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                padding: '40px 20px',
                border: '1px dashed var(--border-color)',
                borderRadius: '8px'
              }}>
                <span style={{ fontSize: '32px', marginBottom: '10px' }}>🧪</span>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>No sample selected</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  Select an eligible tube in Step 1 to review custody eligibility before generating the transfer manifest.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: STEP 4 - IN TRANSIT RECORDS (MATCHING USER REFERENCE IMAGE) */}
      {activeTabNav === 'in_transit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
              Active Transfer Records ({inTransitShipments.length} In Transit)
            </h3>
            <button
              type="button"
              onClick={fetchShipments}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              🔄 Refresh Manifests
            </button>
          </div>

          {loadingShipments ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading active transfers...
            </div>
          ) : inTransitShipments.length === 0 ? (
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '32px' }}>🚚</span>
              <p style={{ fontSize: '14px', fontWeight: '600', marginTop: '10px' }}>No samples currently in transit</p>
              <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                Create and dispatch a consignment in Step 1-3 to initiate custody transfer.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {inTransitShipments.map((shipment) => {
                const rawSample = (shipment.manifest_items && shipment.manifest_items[0]) || null;
                const sampleId = rawSample?.sample_id || rawSample?.id || rawSample?.barcode_value || shipment.tracking_number || shipment.id || 'BIO-2026-001';
                const sampleType = rawSample?.specimen_type || rawSample?.sample_type || 'Plasma';

                return (
                  <div 
                    key={shipment.id}
                    className="glass-card" 
                    style={{
                      padding: '24px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      maxWidth: '900px'
                    }}
                  >
                    {/* TRANSFER HEADER */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        Transfer {shipment.transfer_id || shipment.id || shipment.tracking_number || 'TRF-2026-001'}
                      </span>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        background: 'rgba(0, 150, 255, 0.15)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.4)'
                      }}>
                        In Transit
                      </span>
                    </div>

                    {/* 2-COLUMN METADATA GRID (EXACT LAYOUT FROM USER IMAGE) */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '20px',
                      marginBottom: '28px'
                    }}>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Sample ID</div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                          {sampleId}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Sample type</div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {sampleType}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>From</div>
                        <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                          {shipment.origin_lab_name || 'Collection Center A'}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>To</div>
                        <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                          {shipment.destination || shipment.destination_lab_id || 'Central Biobank B'}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Dispatched by</div>
                        <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                          {shipment.dispatched_by || 'Lab Technician'}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Temperature</div>
                        <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                          {shipment.temperature || 'Per validated SOP'}
                        </div>
                      </div>
                    </div>

                    {/* 4-STAGE VERTICAL TIMELINE (EXACT VISUAL FROM USER REFERENCE IMAGE) */}
                    <div style={{
                      borderTop: '1px solid var(--border-color)',
                      paddingTop: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0px',
                      marginBottom: '24px'
                    }}>
                      {/* STAGE 1: CREATED */}
                      <div style={{ display: 'flex', gap: '14px', position: 'relative' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-cyan)' }}>1</span>
                          <div style={{ width: '1px', flex: 1, background: 'var(--accent-cyan)', minHeight: '28px', margin: '4px 0' }} />
                        </div>
                        <div style={{ paddingBottom: '16px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Transfer created</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Sample identified and verified</div>
                        </div>
                      </div>

                      {/* STAGE 2: DISPATCHED */}
                      <div style={{ display: 'flex', gap: '14px', position: 'relative' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-cyan)' }}>2</span>
                          <div style={{ width: '1px', flex: 1, background: 'var(--accent-cyan)', minHeight: '28px', margin: '4px 0' }} />
                        </div>
                        <div style={{ paddingBottom: '16px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Dispatched</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Handover recorded</div>
                        </div>
                      </div>

                      {/* STAGE 3: IN TRANSIT */}
                      <div style={{ display: 'flex', gap: '14px', position: 'relative' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: '#38bdf8' }}>3</span>
                          <div style={{ width: '1px', flex: 1, background: 'var(--border-color)', minHeight: '28px', margin: '4px 0' }} />
                        </div>
                        <div style={{ paddingBottom: '16px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#38bdf8' }}>In transit</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Awaiting receiving laboratory confirmation</div>
                        </div>
                      </div>

                      {/* STAGE 4: RECEIVED & VERIFIED */}
                      <div style={{ display: 'flex', gap: '14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-tertiary)' }}>4</span>
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-tertiary)' }}>Received and verified</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Pending destination acceptance</div>
                        </div>
                      </div>
                    </div>

                    {/* CALLOUT BOX (EXACT COPY FROM USER REFERENCE IMAGE) */}
                    <div style={{
                      padding: '14px 18px',
                      background: 'rgba(0,0,0,0.4)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      fontSize: '12px',
                      lineHeight: '1.6',
                      color: 'var(--text-secondary)'
                    }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Important:</strong> Dispatching a sample must not automatically mark it as received. The receiving laboratory must verify the physical sample and accept it. Temperature excursions, damaged containers, or mismatched barcodes should trigger quarantine or investigation.
                    </div>

                    {/* ACTION BAR: QUICK JUMP TO RECEIVE INTAKE */}
                    <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          setScanInput(sampleId);
                          setActiveTabNav('receive_intake');
                          handleScanSubmit(null, sampleId);
                        }}
                        style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '700' }}
                      >
                        📥 Scan & Receive at Destination Lab &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: STEPS 5, 6, 7 - RECEIVE & CUSTODY INTAKE */}
      {activeTabNav === 'receive_intake' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* STEP 5: SCAN BARCODE AT DESTINATION */}
          <div className="glass-card" style={{ padding: '24px', maxWidth: '850px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
              Step 5. Receive & Scan Barcode at Destination Laboratory
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 16px 0' }}>
              Receiving biobank: <strong style={{ color: 'var(--accent-cyan)' }}>Central Biobank Laboratory B</strong>. Scan incoming tube barcode to verify against active transfer manifest.
            </p>

            {scanAlert && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                marginBottom: '16px',
                background: scanAlert.type === 'success' ? 'rgba(0, 242, 254, 0.12)' : scanAlert.type === 'warning' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(255, 75, 75, 0.15)',
                color: scanAlert.type === 'success' ? 'var(--accent-cyan)' : scanAlert.type === 'warning' ? '#eab308' : '#ff4b4b',
                border: `1px solid ${scanAlert.type === 'success' ? 'var(--accent-cyan)' : scanAlert.type === 'warning' ? '#eab308' : '#ff4b4b'}`
              }}>
                {scanAlert.message}
              </div>
            )}

            <form onSubmit={handleScanSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                ref={scanInputRef}
                type="text"
                className="form-control"
                placeholder="Scan or enter specimen barcode (e.g. BIO-2026-001)..."
                value={scanInput || ''}
                onChange={(e) => setScanInput(e.target.value)}
                style={{ flex: 1, fontSize: '14px', fontFamily: 'monospace', padding: '10px 14px' }}
                autoFocus
              />
              <button
                type="submit"
                disabled={verifyingScan || !(scanInput || '').trim()}
                className="btn btn-primary"
                style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap' }}
              >
                {verifyingScan ? 'Verifying...' : '🔍 Match Manifest'}
              </button>
            </form>

            {/* QUICK-PICK FOR ACTIVE IN-TRANSIT SAMPLES */}
            {inTransitShipments.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Awaiting receipt:</span>
                {inTransitShipments.map(s => {
                  const sId = s.manifest_items?.[0]?.sample_id || s.manifest_items?.[0]?.id || s.manifest_items?.[0]?.barcode_value || s.tracking_number || s.id;
                  if (!sId) return null;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setScanInput(sId);
                        handleScanSubmit(null, sId);
                      }}
                      style={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--accent-cyan)',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      {sId}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* STEP 6 & 7: MANIFEST MATCH & CUSTODY ACCEPTANCE / QUARANTINE / STORE */}
          {scanResult && (
            <div className="glass-card" style={{
              padding: '24px',
              maxWidth: '850px',
              border: '1px solid var(--accent-cyan)',
              background: 'var(--bg-secondary)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '18px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: '700', textTransform: 'uppercase' }}>
                    Manifest Match Verified
                  </span>
                  <h3 style={{ fontSize: '17px', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 0 0', fontFamily: 'monospace' }}>
                    {scanResult.sample?.id || scanResult.sample?.sample_id} &bull; {scanResult.sample?.specimen_type || 'Plasma'}
                  </h3>
                </div>

                <span style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '700',
                  background: scanResult.sample?.status === 'Received' ? 'rgba(0, 242, 254, 0.15)' : scanResult.sample?.status === 'Quarantined' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                  color: scanResult.sample?.status === 'Received' ? 'var(--accent-cyan)' : scanResult.sample?.status === 'Quarantined' ? '#eab308' : '#38bdf8',
                  border: '1px solid currentColor'
                }}>
                  {scanResult.sample?.status}
                </span>
              </div>

              {/* 2-COLUMN VERIFIED DETAILS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Consignment Transfer ID</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {scanResult.shipment?.transfer_id || scanResult.shipment?.tracking_number || scanResult.shipment?.id}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Origin Laboratory</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    {scanResult.shipment?.origin_lab_name || 'Collection Center A'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Dispatched Custodian</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    {scanResult.shipment?.dispatched_by || 'Lab Technician'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Transport Temperature</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    {scanResult.shipment?.temperature || 'Per validated SOP'}
                  </div>
                </div>
              </div>

              {/* STEP 6 ACTIONS: ACCEPT OR QUARANTINE */}
              {scanResult.sample?.status !== 'Received' && scanResult.sample?.status !== 'Quarantined' && (
                <div style={{
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                      Step 6: Physical Intake Verification
                    </h4>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                      Inspect container integrity, volume and seal before transferring custody.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleOpenQuarantine(scanResult.sample, scanResult.shipment)}
                      className="btn btn-secondary"
                      style={{
                        padding: '8px 14px',
                        fontSize: '12px',
                        fontWeight: '700',
                        color: '#eab308',
                        borderColor: 'rgba(234, 179, 8, 0.4)'
                      }}
                    >
                      ⚠️ Quarantine / Non-Conformance
                    </button>

                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleAcceptSample(scanResult.sample?.id, scanResult.shipment?.id)}
                      className="btn btn-primary"
                      style={{ padding: '8px 18px', fontSize: '12px', fontWeight: '700' }}
                    >
                      {actionLoading ? 'Accepting...' : '✅ Accept & Transfer Custody'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 7: ASSIGN STORAGE LOCATION (IF ACCEPTED) */}
              {scanResult.sample?.status === 'Received' && (
                <div style={{
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(0, 242, 254, 0.04)',
                  padding: '16px',
                  borderRadius: '8px',
                  marginTop: '10px'
                }}>
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: '700', margin: 0, color: 'var(--accent-cyan)' }}>
                      Step 7: Ready for Storage Allocation
                    </h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                      Sample is accepted into Central Biobank custody. Assign freezer rack & well coordinates now.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleProceedToStore(scanResult.sample?.id)}
                    className="btn btn-primary"
                    style={{
                      padding: '10px 18px',
                      fontSize: '12px',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>📍</span> Proceed to Storage Allocation &rarr;
                  </button>
                </div>
              )}

              {/* QUARANTINED NOTICE */}
              {scanResult.sample?.status === 'Quarantined' && (
                <div style={{
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '14px',
                  color: '#eab308',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>⚠️</span>
                  <span>This sample is held in quarantine protocol. Direct storage allocation is restricted until QC clearance.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* QUARANTINE MODAL */}
      {showQuarantineModal && quarantineTargetSample && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-card" style={{ maxWidth: '500px', width: '100%', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#eab308' }}>
              ⚠️ Quarantine Specimen Intake
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 16px 0' }}>
              Flag specimen <strong style={{ color: 'var(--text-primary)' }}>{quarantineTargetSample.sample.id}</strong> for investigation and non-conformance.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Non-Conformance Reason
                </label>
                <select
                  className="form-control"
                  value={quarantineReason}
                  onChange={(e) => setQuarantineReason(e.target.value)}
                  style={{ width: '100%', fontSize: '13px' }}
                >
                  <option value="Temperature Excursion">Temperature Excursion during transit</option>
                  <option value="Damaged Container / Leakage">Damaged Container / Tube crack or seal leak</option>
                  <option value="Mismatched Barcode">Mismatched Barcode / Manifest discrepancy</option>
                  <option value="Volume Inadequate">Insufficient volume / Hemolyzed specimen</option>
                  <option value="Chain of Custody Breach">Broken tamper seal / Custody breach</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Corrective Action Notes / Log
                </label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={quarantineNotes}
                  onChange={(e) => setQuarantineNotes(e.target.value)}
                  placeholder="Record observed condition, excursion reading, or photos taken..."
                  style={{ width: '100%', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowQuarantineModal(false)}
                  style={{ padding: '8px 14px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleSubmitQuarantine}
                  className="btn btn-primary"
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: '700',
                    background: '#eab308',
                    color: '#000',
                    border: 'none'
                  }}
                >
                  {actionLoading ? 'Flagging...' : 'Confirm Quarantine'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
