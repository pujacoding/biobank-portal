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
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 high
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else {
      osc.frequency.setValueAtTime(260, ctx.currentTime); // Low buzz
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch {
    // AudioContext blocked or not supported - silent graceful degradation
  }
};

const DESTINATIONS = [
  { value: 'LN2-01', label: 'LN2 Tank 01 (-196.2°C)', temp: '-196.2°C', icon: '❄️', type: 'Cryogenic Vapor Phase' },
  { value: 'ULT-03', label: 'ULT Freezer 03 (-80.4°C)', temp: '-80.4°C', icon: '🧊', type: 'Ultra-Low Temp Freezer' },
  { value: 'CENTRAL-BIOBANK', label: 'Central Biobank Cold Storage (-20°C)', temp: '-20.0°C', icon: '📦', type: 'Standard Bio-Depot' },
  { value: 'PARTNER-DIAGNOSTIC', label: 'Partner Diagnostic Lab (2°C to 8°C)', temp: '+4.0°C', icon: '🏥', type: 'Clinical Testing Center' },
  { value: 'EXTERNAL-IRB', label: 'External Research Facility (Dry Ice)', temp: '-78.5°C', icon: '🔬', type: 'IRB Protocol Research' }
];

export default function ShipmentManagement({ 
  samples = [], 
  backendUrl, 
  token, 
  onShipmentAction, 
  activeLabId, 
  activeLabName, 
  setActiveTab 
}) {
  // Navigation: 'dispatch' (Scan & Dispatch) or 'registry' (Shipment History)
  const [activeView, setActiveView] = useState('dispatch');

  // Shipment State
  const [shipments, setShipments] = useState([]);
  const [destination, setDestination] = useState('LN2-01');
  const [courierNotes, setCourierNotes] = useState('');
  const [stagedItems, setStagedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  // Scan & Input State
  const [scanInput, setScanInput] = useState('');
  const [scanAlert, setScanAlert] = useState(null); // { type: 'success' | 'error' | 'warning', message: '' }
  const [showBrowseModal, setShowBrowseModal] = useState(false);
  const [browseSearch, setBrowseSearch] = useState('');
  const [lastDispatched, setLastDispatched] = useState(null);

  // Registry table state
  const [registrySearch, setRegistrySearch] = useState('');
  const [registryStatusFilter, setRegistryStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const scanInputRef = useRef(null);

  // Focus scan bar on mount or when switching to dispatch view
  useEffect(() => {
    if (activeView === 'dispatch') {
      setTimeout(() => scanInputRef.current?.focus(), 150);
    }
  }, [activeView]);

  // Clear scan alerts after 4 seconds
  useEffect(() => {
    if (scanAlert) {
      const timer = setTimeout(() => setScanAlert(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [scanAlert]);

  // Available specimens that are eligible to ship:
  // Must NOT have withdrawn consent, not already Shipped/In Transit, not Disposed/Exhausted
  const shippableSamples = samples.filter(s => {
    if (s.consent_status === 'Withdrawn') return false;
    if (s.status === 'Shipped' || s.status === 'In Transit' || s.status === 'Disposed' || s.status === 'Exhausted') return false;
    // Must be either Barcode Generated, Consent Verified, Stored, or Collected with valid barcode
    return true;
  });

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/integration/shipments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setShipments(data.shipments || []);
      }
    } catch (err) {
      console.error("Error retrieving shipments:", err);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments, samples]);

  // CORE HELPER TO PROCESS ONE OR MORE BARCODES/IDS (FOR SCAN, TYPE, OR PASTE)
  const processInputItems = (rawText) => {
    if (!rawText || !rawText.trim()) {
      setScanAlert({ type: 'warning', message: 'Please scan, enter, or paste a Sample ID or Barcode.' });
      scanInputRef.current?.focus();
      return;
    }

    // Split in case user pasted multiple IDs (e.g. from Excel, notepad, or comma-separated)
    const tokens = rawText
      .split(/[\r\n,;\t]+/)
      .map(t => t.trim())
      .filter(Boolean);

    if (tokens.length === 0) return;

    if (tokens.length === 1) {
      // Single Item Flow
      const query = tokens[0];
      const clean = query.toUpperCase();

      // Check if already in staged items
      const alreadyStaged = stagedItems.some(s => 
        s.id.toUpperCase() === clean || 
        (s.barcode_text && s.barcode_text.toUpperCase() === clean) ||
        (s.active_barcode && s.active_barcode.toUpperCase() === clean) ||
        (s.barcode_value && s.barcode_value.toUpperCase() === clean)
      );

      if (alreadyStaged) {
        playBeep('error');
        setScanAlert({ type: 'warning', message: `⚠️ Specimen "${query}" is already added to the cargo manifest.` });
        setScanInput('');
        scanInputRef.current?.focus();
        return;
      }

      // Locate matching specimen in samples pool
      const match = samples.find(s => 
        s.id.toUpperCase() === clean || 
        (s.barcode_text && s.barcode_text.toUpperCase() === clean) ||
        (s.active_barcode && s.active_barcode.toUpperCase() === clean) ||
        (s.barcode_value && s.barcode_value.toUpperCase() === clean)
      );

      if (!match) {
        playBeep('error');
        setScanAlert({ 
          type: 'error', 
          message: `❌ No specimen found matching "${query}". Verify the barcode format or registration status.` 
        });
        setScanInput('');
        scanInputRef.current?.focus();
        return;
      }

      // Consent check
      if (match.consent_status === 'Withdrawn') {
        playBeep('error');
        setScanAlert({ 
          type: 'error', 
          message: `⛔ Shipment Blocked: Specimen "${match.id}" has WITHDRAWN consent and cannot be transported.` 
        });
        setScanInput('');
        scanInputRef.current?.focus();
        return;
      }

      // Status check
      if (match.status === 'Shipped' || match.status === 'In Transit') {
        playBeep('error');
        setScanAlert({ 
          type: 'error', 
          message: `⛔ Specimen "${match.id}" is already recorded as "${match.status}".` 
        });
        setScanInput('');
        scanInputRef.current?.focus();
        return;
      }

      // Successful match -> add to staged items
      playBeep('success');
      setStagedItems(prev => [match, ...prev]);
      setScanAlert({ 
        type: 'success', 
        message: `✓ Scanned & Added: ${match.id} (${match.specimen_type || 'Specimen'}, ${match.sample_volume || '--'} ${match.volume_unit || 'mL'}) to cargo manifest.` 
      });
      setScanInput('');
      scanInputRef.current?.focus();
    } else {
      // Multi-Item Batch Paste Flow (e.g. multiple copied lines from Excel or comma-separated list)
      const newlyAdded = [];
      let duplicateCount = 0;
      let notFoundCount = 0;
      let blockedConsentCount = 0;

      tokens.forEach(tok => {
        const clean = tok.toUpperCase();
        const isAlreadyInStaged = stagedItems.some(s => 
          s.id.toUpperCase() === clean || 
          (s.barcode_text && s.barcode_text.toUpperCase() === clean) ||
          (s.active_barcode && s.active_barcode.toUpperCase() === clean) ||
          (s.barcode_value && s.barcode_value.toUpperCase() === clean)
        ) || newlyAdded.some(s => s.id.toUpperCase() === clean);

        if (isAlreadyInStaged) {
          duplicateCount++;
          return;
        }

        const match = samples.find(s => 
          s.id.toUpperCase() === clean || 
          (s.barcode_text && s.barcode_text.toUpperCase() === clean) ||
          (s.active_barcode && s.active_barcode.toUpperCase() === clean) ||
          (s.barcode_value && s.barcode_value.toUpperCase() === clean)
        );

        if (!match) {
          notFoundCount++;
          return;
        }

        if (match.consent_status === 'Withdrawn') {
          blockedConsentCount++;
          return;
        }

        if (match.status === 'Shipped' || match.status === 'In Transit') {
          return;
        }

        newlyAdded.push(match);
      });

      if (newlyAdded.length > 0) {
        playBeep('success');
        setStagedItems(prev => [...newlyAdded, ...prev]);
        setScanAlert({
          type: 'success',
          message: `✓ Pasted & added ${newlyAdded.length} specimen(s) to cargo manifest!${duplicateCount > 0 ? ` (${duplicateCount} duplicate(s) skipped)` : ''}${notFoundCount > 0 ? ` (${notFoundCount} not found)` : ''}${blockedConsentCount > 0 ? ` (${blockedConsentCount} blocked for consent)` : ''}`
        });
      } else {
        playBeep('error');
        setScanAlert({
          type: 'error',
          message: `❌ None of the ${tokens.length} pasted item(s) could be added.${duplicateCount > 0 ? ` (${duplicateCount} already staged)` : ''}${notFoundCount > 0 ? ` (${notFoundCount} not found)` : ''}`
        });
      }

      setScanInput('');
      scanInputRef.current?.focus();
    }
  };

  // SCAN OR ENTER SPECIMEN HANDLER
  const handleScanSpecimen = (e) => {
    if (e) e.preventDefault();
    processInputItems(scanInput);
  };

  // PASTE SPECIMEN HANDLER (IMMEDIATE PROCESS ON CMD+V / CTRL+V / RIGHT-CLICK PASTE)
  const handlePasteSpecimen = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData?.getData('text') || '';
    if (pastedText) {
      processInputItems(pastedText);
    }
  };

  const handleRemoveStagedItem = (id) => {
    setStagedItems(prev => prev.filter(s => s.id !== id));
  };

  const handleAddAllShippable = () => {
    const unstaged = shippableSamples.filter(s => !stagedItems.some(st => st.id === s.id));
    if (unstaged.length === 0) {
      setScanAlert({ type: 'warning', message: 'All eligible specimens are already staged in the manifest.' });
      return;
    }
    setStagedItems(prev => [...prev, ...unstaged]);
    playBeep('success');
    setScanAlert({ type: 'success', message: `✓ Added all ${unstaged.length} eligible specimens to cargo manifest.` });
  };

  const handleClearManifest = () => {
    if (stagedItems.length === 0) return;
    if (window.confirm("Are you sure you want to clear all specimens from the current cargo manifest?")) {
      setStagedItems([]);
      setScanAlert({ type: 'warning', message: 'Cargo manifest cleared.' });
      scanInputRef.current?.focus();
    }
  };

  // DISPATCH BATCH
  const handleDispatchBatch = async () => {
    if (!destination) {
      alert("Please select a target destination bio-depot.");
      return;
    }

    if (stagedItems.length === 0) {
      alert("Please scan or add at least one specimen tube to dispatch.");
      scanInputRef.current?.focus();
      return;
    }

    setDispatching(true);
    try {
      const response = await fetch(`${backendUrl}/api/integration/shipments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          destination,
          barcodes: stagedItems.map(s => s.id),
          origin_lab_id: activeLabId || 1,
          notes: courierNotes.trim() || undefined
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to dispatch shipment');

      const dispatchedCount = stagedItems.length;
      const dispatchedId = data.shipmentId;

      playBeep('success');
      setLastDispatched({
        id: dispatchedId,
        count: dispatchedCount,
        destination,
        timestamp: new Date().toLocaleTimeString()
      });

      // Clear manifest and form
      setStagedItems([]);
      setCourierNotes('');
      fetchShipments();
      if (onShipmentAction) onShipmentAction();

    } catch (err) {
      playBeep('error');
      alert("Shipment Error: " + err.message);
    } finally {
      setDispatching(false);
    }
  };

  // RECEIVE CHECK-IN HANDLER
  const handleReceiveShipment = async (shipmentId) => {
    const confirmRec = window.confirm(`Confirm receipt check-in for shipment cargo: ${shipmentId}?\n\nAll specimens in this cargo container will transition to 'Received' status.`);
    if (!confirmRec) return;

    try {
      const response = await fetch(`${backendUrl}/api/integration/shipments/receive/${shipmentId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to receive shipment');

      alert(`Cargo ${shipmentId} confirmed received at bio-depot. Specimen status updated.`);
      fetchShipments();
      if (onShipmentAction) onShipmentAction();
      if (setActiveTab) {
        setTimeout(() => setActiveTab('storage'), 1200);
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // Selected destination info
  const destInfo = DESTINATIONS.find(d => d.value === destination) || DESTINATIONS[0];

  // Total volume calculation
  const totalVolume = stagedItems.reduce((acc, curr) => acc + (parseFloat(curr.sample_volume) || 0), 0);

  // Registry filtering
  const filteredShipments = shipments.filter(shp => {
    const matchesSearch = !registrySearch || 
      shp.id.toLowerCase().includes(registrySearch.toLowerCase()) ||
      (shp.destination && shp.destination.toLowerCase().includes(registrySearch.toLowerCase())) ||
      (shp.barcodes && shp.barcodes.toLowerCase().includes(registrySearch.toLowerCase())) ||
      (shp.origin_lab_name && shp.origin_lab_name.toLowerCase().includes(registrySearch.toLowerCase()));

    const matchesStatus = registryStatusFilter === 'ALL' || shp.status === registryStatusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredShipments.length / pageSize);
  const paginatedShipments = filteredShipments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getSpecimenBadgeColor = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('blood')) return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
    if (t.includes('plasma')) return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
    if (t.includes('serum')) return { bg: 'rgba(234, 179, 8, 0.15)', text: '#fde047', border: 'rgba(234, 179, 8, 0.3)' };
    if (t.includes('dna') || t.includes('rna')) return { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
    if (t.includes('tissue')) return { bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.3)' };
    return { bg: 'rgba(148, 163, 184, 0.15)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.3)' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left', width: '100%' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>🧊</span>
            <h1 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.02em', margin: 0 }}>
              Cold-Chain Shipment & Logistics
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
            Scan barcodes tube-by-tube to compile cargo manifests and transfer verified biological specimens between bio-depots.
          </p>
        </div>

        {/* View Switcher Buttons */}
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-surface)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveView('dispatch')}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeView === 'dispatch' ? 'var(--accent-primary)' : 'transparent',
              color: activeView === 'dispatch' ? '#fff' : 'var(--text-secondary)',
              transition: 'var(--transition-smooth)'
            }}
          >
            <span>📦 Scan & Dispatch</span>
            {stagedItems.length > 0 && (
              <span style={{
                background: activeView === 'dispatch' ? 'rgba(255,255,255,0.25)' : 'var(--accent-primary)',
                color: '#fff',
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '12px',
                fontWeight: '800'
              }}>
                {stagedItems.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveView('registry')}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeView === 'registry' ? 'var(--accent-primary)' : 'transparent',
              color: activeView === 'registry' ? '#fff' : 'var(--text-secondary)',
              transition: 'var(--transition-smooth)'
            }}
          >
            <span>📋 Cargo Registry Logs</span>
            <span style={{
              background: activeView === 'registry' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
              color: activeView === 'registry' ? '#fff' : 'var(--text-secondary)',
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '12px',
              fontWeight: '700'
            }}>
              {shipments.length}
            </span>
          </button>
        </div>
      </div>

      {/* QUICK STATUS TELEMETRY METRICS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(0, 242, 254, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            🧪
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: '700' }}>Shippable Specimens</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>{shippableSamples.length}</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            📥
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: '700' }}>In Cargo Manifest</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: stagedItems.length > 0 ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
              {stagedItems.length} <span style={{ fontSize: '11px', fontWeight: '500' }}>({totalVolume.toFixed(1)} mL)</span>
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            🚚
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: '700' }}>In-Transit Cargo</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#fbbf24' }}>
              {shipments.filter(s => s.status === 'In Transit').length}
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
            ✅
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: '700' }}>Delivered / Received</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#34d399' }}>
              {shipments.filter(s => s.status === 'Received').length}
            </div>
          </div>
        </div>
      </div>

      {/* DISPATCH NEW CARGO VIEW */}
      {activeView === 'dispatch' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* SUCCESS DISPATCH BANNER IF RECENTLY COMPLETED */}
          {lastDispatched && (
            <div style={{
              background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.15))',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}>🎉</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                    Cargo Shipment <span style={{ fontFamily: 'monospace', color: '#34d399' }}>{lastDispatched.id}</span> Dispatched Successfully!
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Dispatched {lastDispatched.count} specimen tubes to {lastDispatched.destination} at {lastDispatched.timestamp}.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setActiveView('registry')}
                  style={{ padding: '6px 12px', fontSize: '11px', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34d399' }}
                >
                  View in Cargo Registry &rarr;
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setLastDispatched(null)}
                  style={{ padding: '6px 10px', fontSize: '11px' }}
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* SECTION 1: SCAN BAR SECTION (THE HERO COMPONENT) */}
          <div className="glass-card" style={{ padding: '20px', border: '1px solid var(--accent-cyan)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-cyan)', display: 'inline-block', boxShadow: '0 0 8px var(--accent-cyan)' }}></span>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--accent-cyan)' }}>
                    Rapid Barcode Scan & Intake
                  </h3>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Point your handheld scanner at the tube label, or copy & paste / type any Sample ID or Barcode and it will immediately add to your cargo batch.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowBrowseModal(true)}
                  style={{ padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>📋 Browse Inventory ({shippableSamples.length})</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleAddAllShippable}
                  style={{ padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>⚡ Add All ({shippableSamples.length})</span>
                </button>
              </div>
            </div>

            {/* SCAN INPUT BAR */}
            <form onSubmit={handleScanSpecimen} style={{ display: 'flex', gap: '10px', position: 'relative' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', pointerEvents: 'none', opacity: 0.8 }}>
                  🔍
                </span>
                <input
                  ref={scanInputRef}
                  type="text"
                  className="form-control"
                  value={scanInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.includes('\n') || val.includes('\r')) {
                      processInputItems(val);
                    } else {
                      setScanInput(val);
                    }
                  }}
                  onPaste={handlePasteSpecimen}
                  placeholder="Scan barcode or paste Sample ID / Barcode (e.g. AURA-SMP-2026-000055, AURA-BLD-2026-0001)..."
                  style={{
                    paddingLeft: '44px',
                    paddingRight: '12px',
                    height: '46px',
                    fontSize: '14px',
                    fontWeight: '600',
                    fontFamily: 'monospace',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                  }}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  padding: '0 22px',
                  height: '46px',
                  fontSize: '13px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>➕ Add Tube</span>
              </button>
            </form>

            {/* SCAN FEEDBACK ALERT BANNER */}
            {scanAlert && (
              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: scanAlert.type === 'success' 
                  ? 'rgba(16, 185, 129, 0.15)' 
                  : scanAlert.type === 'error' 
                    ? 'rgba(239, 68, 68, 0.15)' 
                    : 'rgba(245, 158, 11, 0.15)',
                border: `1px solid ${
                  scanAlert.type === 'success' 
                    ? 'rgba(16, 185, 129, 0.4)' 
                    : scanAlert.type === 'error' 
                      ? 'rgba(239, 68, 68, 0.4)' 
                      : 'rgba(245, 158, 11, 0.4)'
                }`,
                color: scanAlert.type === 'success' 
                  ? '#34d399' 
                  : scanAlert.type === 'error' 
                    ? '#f87171' 
                    : '#fbbf24',
                animation: 'fadeIn 0.2s ease-in'
              }}>
                <span>{scanAlert.message}</span>
              </div>
            )}
          </div>

          {/* SECTION 2: WORKSPACE GRID (MANIFEST + DISPATCH PARAMETERS) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'start' }}>
            
            {/* LEFT COLUMN: STAGED CARGO MANIFEST */}
            <div className="glass-card" style={{ padding: 0 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📦 Staged Cargo Manifest</span>
                    <span style={{ fontSize: '11px', background: 'rgba(0, 242, 254, 0.15)', color: 'var(--accent-cyan)', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                      {stagedItems.length} Specimens
                    </span>
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    Total volume compiled: <strong style={{ color: 'var(--text-primary)' }}>{totalVolume.toFixed(1)} mL</strong>
                  </span>
                </div>

                {stagedItems.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleClearManifest}
                    style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--accent-error)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  >
                    Clear All
                  </button>
                )}
              </div>

              {stagedItems.length === 0 ? (
                /* EMPTY STATE */
                <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  <div style={{ fontSize: '42px', marginBottom: '12px', opacity: 0.6 }}>🏷️</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    No Specimens Staged in Cargo Yet
                  </div>
                  <p style={{ fontSize: '12px', maxWidth: '380px', margin: '0 auto 16px auto', color: 'var(--text-secondary)' }}>
                    Scan tube barcodes one by one using the search bar above, or choose from available lab inventory to stage your cargo transfer.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowBrowseModal(true)}
                    style={{ padding: '8px 16px', fontSize: '12px' }}
                  >
                    + Pick from Available Inventory ({shippableSamples.length})
                  </button>
                </div>
              ) : (
                /* STAGED ITEMS TABLE */
                <div className="table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>#</th>
                        <th>Sample ID</th>
                        <th>Specimen Type</th>
                        <th>Volume</th>
                        <th>Participant</th>
                        <th>Consent</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stagedItems.map((item, index) => {
                        const badgeStyle = getSpecimenBadgeColor(item.specimen_type);
                        return (
                          <tr key={item.id}>
                            <td style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{index + 1}</td>
                            <td>
                              <div style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--text-primary)' }}>
                                {item.id}
                              </div>
                              {item.barcode_text && item.barcode_text !== item.id && (
                                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>
                                  🏷️ {item.barcode_text}
                                </div>
                              )}
                            </td>
                            <td>
                              <span style={{
                                fontSize: '11px',
                                fontWeight: '700',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: badgeStyle.bg,
                                color: badgeStyle.text,
                                border: `1px solid ${badgeStyle.border}`
                              }}>
                                {item.specimen_type || 'Biological'}
                              </span>
                            </td>
                            <td style={{ fontWeight: '600', fontSize: '12px' }}>
                              {item.sample_volume || '--'} {item.volume_unit || 'mL'}
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {item.subject_id || item.coded_participant_id || '--'}
                            </td>
                            <td>
                              <span style={{ fontSize: '10px', color: 'var(--accent-success)', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)' }}>
                                ✓ {item.consent_status || 'Verified'}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                onClick={() => handleRemoveStagedItem(item.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--accent-error)',
                                  cursor: 'pointer',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '13px',
                                  fontWeight: '700'
                                }}
                                title="Remove tube from manifest"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: DISPATCH PARAMETERS & ACTION */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, paddingBottom: '10px', borderBottom: '1px solid var(--border-color)' }}>
                Transport Parameters
              </h3>

              {/* Destination Selector */}
              <div className="form-group">
                <label htmlFor="ship-dest-select" style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                  Target Destination Bio-Depot *
                </label>
                <select
                  id="ship-dest-select"
                  className="form-control"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  style={{ fontSize: '12px', padding: '10px' }}
                >
                  {DESTINATIONS.map(d => (
                    <option key={d.value} value={d.value}>
                      {d.icon} {d.label}
                    </option>
                  ))}
                </select>

                {/* Target Temperature Pill */}
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0, 242, 254, 0.08)',
                  border: '1px solid rgba(0, 242, 254, 0.2)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Target Temperature:</span>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>
                    {destInfo.temp}
                  </span>
                </div>
              </div>

              {/* Courier / Cold Chain Seal Notes */}
              <div className="form-group">
                <label htmlFor="courier-notes" style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                  Transit Container / Seal Ref (Optional)
                </label>
                <input
                  id="courier-notes"
                  type="text"
                  className="form-control"
                  value={courierNotes}
                  onChange={(e) => setCourierNotes(e.target.value)}
                  placeholder="e.g. Dry Ice Bin #04, Courier: MediTrans"
                  style={{ fontSize: '12px', padding: '8px 10px' }}
                />
              </div>

              {/* Origin Facility */}
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                <div>Origin Facility: <strong style={{ color: 'var(--text-primary)' }}>{activeLabName || 'Kolkata Diagnostic Lab'}</strong></div>
              </div>

              {/* Summary Box */}
              <div style={{
                background: 'var(--bg-primary)',
                borderRadius: '8px',
                padding: '12px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Specimen Tubes:</span>
                  <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{stagedItems.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Volume:</span>
                  <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{totalVolume.toFixed(1)} mL</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Logistics Mode:</span>
                  <span style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>Cold-Chain Batch</span>
                </div>
              </div>

              {/* Big Dispatch Button */}
              <button
                type="button"
                className="btn btn-primary"
                disabled={dispatching || stagedItems.length === 0}
                onClick={handleDispatchBatch}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: '800',
                  letterSpacing: '0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {dispatching ? (
                  <span>⏳ Dispatching Cargo...</span>
                ) : (
                  <span>🚀 Dispatch Cargo Batch ({stagedItems.length})</span>
                )}
              </button>

              {stagedItems.length === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', fontStyle: 'italic' }}>
                  Scan or add specimens to enable dispatch.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CARGO REGISTRY LOGS VIEW */}
      {activeView === 'registry' && (
        <div className="glass-card" style={{ padding: 0 }}>
          
          {/* Filter & Search Bar */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Cargo Shipment Registry</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Complete audit ledger of dispatched cargo consignments and arrival check-ins.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search shipment ID, depot, barcode..."
                value={registrySearch}
                onChange={(e) => { setRegistrySearch(e.target.value); setCurrentPage(1); }}
                style={{ fontSize: '12px', width: '220px', padding: '6px 10px' }}
              />

              <select
                className="form-control"
                value={registryStatusFilter}
                onChange={(e) => { setRegistryStatusFilter(e.target.value); setCurrentPage(1); }}
                style={{ fontSize: '12px', padding: '6px 10px', width: '130px' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="In Transit">In Transit</option>
                <option value="Received">Received</option>
              </select>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={fetchShipments}
                style={{ padding: '6px 12px', fontSize: '12px' }}
                title="Refresh logs"
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>Loading cargo registry...</p>
          ) : filteredShipments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
              <div style={{ fontSize: '14px', fontWeight: '700' }}>No Cargo Shipments Found</div>
              <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                {registrySearch || registryStatusFilter !== 'ALL' 
                  ? "Try clearing search filters to see all shipments."
                  : "Dispatch your first shipment batch above."}
              </p>
            </div>
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Shipment ID</th>
                    <th>Origin Lab</th>
                    <th>Destination Bio-Depot</th>
                    <th>Dispatched Specimen Barcodes</th>
                    <th style={{ textAlign: 'center' }}>Tube Count</th>
                    <th>Dispatched Date</th>
                    <th>Arrival Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedShipments.map(shp => {
                    const isReceived = shp.status === 'Received';
                    const dispDate = shp.shipped_at ? new Date(shp.shipped_at).toLocaleString() : '--';
                    const arrDate = shp.received_at ? new Date(shp.received_at).toLocaleString() : 'In Transit';

                    return (
                      <tr key={shp.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {shp.id}
                        </td>
                        <td>{shp.origin_lab_name || activeLabName || 'Origin Lab'}</td>
                        <td style={{ fontWeight: '600' }}>{shp.destination}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--accent-teal)', maxWidth: '240px', wordBreak: 'break-all' }}>
                          {shp.barcodes || '--'}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: '800' }}>
                          <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
                            {shp.sample_count}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{dispDate}</td>
                        <td style={{ fontSize: '12px', color: isReceived ? '#34d399' : '#fbbf24' }}>{arrDate}</td>
                        <td>
                          <span className={`badge ${isReceived ? 'badge-verified' : 'badge-pending'}`}>
                            {shp.status}
                          </span>
                        </td>
                        <td>
                          {shp.status === 'In Transit' ? (
                            <button 
                              className="btn btn-secondary" 
                              onClick={() => handleReceiveShipment(shp.id)}
                              style={{ padding: '4px 10px', fontSize: '11px', borderColor: 'var(--accent-teal)', color: 'var(--accent-teal)', fontWeight: '700' }}
                            >
                              Check-In Cargo
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--accent-success)', fontWeight: '700' }}>
                              ✓ Checked In
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(filteredShipments.length, currentPage * pageSize)} of {filteredShipments.length} consignments
                  </span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      &larr; Previous
                    </button>
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: '700' }}>
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage >= totalPages}
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      Next &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL: BROWSE INVENTORY TO SELECT SPECIMENS MANUALLY */}
      {showBrowseModal && (
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
          <div className="glass-card" style={{ maxWidth: '680px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Available Inventory Picker</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Select one or more tubes from the laboratory inventory to add to the cargo manifest.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBrowseModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Search filter in modal */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search by Sample ID, Specimen Type, or Participant ID..."
                value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)}
                style={{ fontSize: '12px', padding: '8px 12px' }}
                autoFocus
              />
            </div>

            {/* Modal List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
              {(() => {
                const filtered = shippableSamples.filter(s => {
                  if (!browseSearch) return true;
                  const q = browseSearch.toLowerCase();
                  return s.id.toLowerCase().includes(q) ||
                    (s.specimen_type && s.specimen_type.toLowerCase().includes(q)) ||
                    (s.subject_id && s.subject_id.toLowerCase().includes(q)) ||
                    (s.barcode_text && s.barcode_text.toLowerCase().includes(q));
                });

                if (filtered.length === 0) {
                  return (
                    <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                      No matching specimens found in current inventory.
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filtered.map(s => {
                      const isStaged = stagedItems.some(item => item.id === s.id);
                      const badge = getSpecimenBadgeColor(s.specimen_type);

                      return (
                        <div
                          key={s.id}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            background: isStaged ? 'rgba(0, 242, 254, 0.08)' : 'var(--bg-primary)',
                            border: isStaged ? '1px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                              type="checkbox"
                              checked={isStaged}
                              onChange={() => {
                                if (isStaged) {
                                  handleRemoveStagedItem(s.id);
                                } else {
                                  setStagedItems(prev => [s, ...prev]);
                                  playBeep('success');
                                }
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--text-primary)', fontSize: '13px' }}>
                                  {s.id}
                                </span>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: badge.bg,
                                  color: badge.text,
                                  border: `1px solid ${badge.border}`
                                }}>
                                  {s.specimen_type || 'Specimen'}
                                </span>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                Vol: {s.sample_volume || '--'} {s.volume_unit || 'mL'} &bull; Participant: {s.subject_id || '--'}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            className={isStaged ? "btn btn-secondary" : "btn btn-primary"}
                            onClick={() => {
                              if (isStaged) {
                                handleRemoveStagedItem(s.id);
                              } else {
                                setStagedItems(prev => [s, ...prev]);
                                playBeep('success');
                              }
                            }}
                            style={{ padding: '4px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
                          >
                            {isStaged ? '✕ Remove' : '➕ Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-primary)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Staged for cargo: <strong style={{ color: 'var(--accent-cyan)' }}>{stagedItems.length} specimens</strong>
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowBrowseModal(false)}
                style={{ padding: '6px 16px', fontSize: '12px' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}