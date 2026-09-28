import React, { useState, useEffect, useRef } from 'react';

export default function BarcodeManager({
  samples = [],
  backendUrl,
  token,
  user,
  onBarcodeAction,
  onPrintBarcode,
  setActiveTab,
  activeLabId,
  activeLabName
}) {
  // Navigation Sub-tabs: 'registry', 'generate', 'queue', 'scan', 'audit'
  const [currentTab, setCurrentTab] = useState('registry');

  // Summary Metrics
  const [summary, setSummary] = useState({
    totalBarcodes: 0,
    generatedToday: 0,
    pendingPrint: 0,
    storedSamples: 0,
    inTransit: 0,
    voidedReplaced: 0
  });

  // Global & Registry States
  const [registryList, setRegistryList] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Registry Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [specimenTypeFilter, setSpecimenTypeFilter] = useState('ALL');
  const [storageFilter, setStorageFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  // Selection
  const [selectedBarcodeIds, setSelectedBarcodeIds] = useState([]);

  // Generate Tab States
  const [eligibleSamples, setEligibleSamples] = useState([]);
  const [selectedSampleForGen, setSelectedSampleForGen] = useState(null);
  const [numAliquots, setNumAliquots] = useState(0);
  const [aliquotVolume, setAliquotVolume] = useState('');
  const [genVolumeUnit, setGenVolumeUnit] = useState('mL');
  const [generating, setGenerating] = useState(false);

  // Print Queue States
  const [printQueue, setPrintQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [selectedQueueIds, setSelectedQueueIds] = useState([]);

  // Scan & Verify States
  const [scanInput, setScanInput] = useState('');
  const [scannedResult, setScannedResult] = useState(null);
  const [scanError, setScanError] = useState('');
  const [scanSuccess, setScanSuccess] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const scanInputRef = useRef(null);

  // Audit History States
  const [auditList, setAuditList] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditSearch, setAuditSearch] = useState('');

  // Modals States
  const [activeModal, setActiveModal] = useState(null); // 'details', 'print', 'reprint', 'void', 'replace', 'storage', 'aliquot', 'shipment'
  const [targetBarcode, setTargetBarcode] = useState(null);
  const [detailedBarcode, setDetailedBarcode] = useState(null);

  // Modal Form Inputs
  const [reprintReason, setReprintReason] = useState('Label damaged');
  const [reprintNotes, setReprintNotes] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [replaceReason, setReplaceReason] = useState('');
  const [storageFreezer, setStorageFreezer] = useState('ULT-03');
  const [storageRack, setStorageRack] = useState('Rack A');
  const [storageBox, setStorageBox] = useState('Box 01');
  const [storagePosition, setStoragePosition] = useState('A1');
  const [storageNotes, setStorageNotes] = useState('');
  const [shipmentDestination, setShipmentDestination] = useState('AURA Central Biobank - LN2 Cryo Tank Yard');
  const [newAliquotCount, setNewAliquotCount] = useState(2);
  const [newAliquotVol, setNewAliquotVol] = useState(1.0);

  // Permissions helpers
  const isAdmin = user?.role === 'Super Admin' || user?.role === 'Lab Admin';
  const isTechnician = isAdmin || user?.role === 'Lab Technician';
  const isCollectionStaff = user?.role === 'Collection Staff';

  // Available specimen types list
  const availableSpecimenTypes = [
    'Blood', 'Serum', 'Plasma', 'Buffy Coat', 'PBMC', 'Urine', 'Stool', 'Saliva',
    'Buccal Swab', 'Sputum', 'Nasopharyngeal Swab', 'Tissue', 'FFPE Tissue',
    'Fresh Tissue', 'Frozen Tissue', 'Bone Marrow Aspirate', 'CSF', 'Pleural Fluid',
    'Ascitic Fluid', 'Synovial Fluid', 'Semen', 'DNA', 'RNA', 'Cell Line',
    'Stem Cell Product', 'Exosome', 'Other'
  ];

  // ========================================================
  // DATA FETCHING FUNCTIONS
  // ========================================================

  const fetchRegistryData = async () => {
    setLoading(true);
    setError('');
    try {
      const activeLab = sessionStorage.getItem('aura_active_lab_id') || localStorage.getItem('aura_active_lab_id');
      const params = new URLSearchParams({
        page: currentPage,
        limit: pageSize,
        search: searchQuery,
        status: statusFilter,
        specimen_type: specimenTypeFilter,
        storage_location: storageFilter,
        startDate: startDateFilter,
        endDate: endDateFilter
      });

      const response = await fetch(`${backendUrl}/api/barcode/registry?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
        }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch barcode registry');

      setRegistryList(data.barcodes || []);
      setTotalRecords(data.pagination?.total || 0);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEligibleSamples = async () => {
    try {
      const activeLab = sessionStorage.getItem('aura_active_lab_id') || localStorage.getItem('aura_active_lab_id');
      const response = await fetch(`${backendUrl}/api/barcode/eligible-samples`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
        }
      });
      const data = await response.json();
      if (response.ok) {
        setEligibleSamples(data.samples || []);
      }
    } catch (err) {
      console.error("Failed to fetch eligible samples:", err);
    }
  };

  const fetchPrintQueue = async () => {
    setQueueLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/barcode/print-queue`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setPrintQueue(data.queue || []);
      }
    } catch (err) {
      console.error("Failed to fetch print queue:", err);
    } finally {
      setQueueLoading(false);
    }
  };

  const fetchAuditHistory = async () => {
    try {
      const params = new URLSearchParams({
        page: auditPage,
        limit: 30,
        search: auditSearch,
        action_type: auditActionFilter
      });
      const response = await fetch(`${backendUrl}/api/barcode/audit-history?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setAuditList(data.events || []);
        setAuditTotal(data.pagination?.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch audit history:", err);
    }
  };

  const fetchBarcodeDetails = async (identifier) => {
    try {
      const response = await fetch(`${backendUrl}/api/barcode/details/${encodeURIComponent(identifier)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load details');
      setDetailedBarcode(data);
      return data;
    } catch (err) {
      alert("Error loading barcode details: " + err.message);
      return null;
    }
  };

  // Initial and reactive effects
  useEffect(() => {
    fetchRegistryData();
  }, [backendUrl, token, activeLabId, currentPage, pageSize, statusFilter, specimenTypeFilter]);

  useEffect(() => {
    if (currentTab === 'generate') {
      fetchEligibleSamples();
    } else if (currentTab === 'queue') {
      fetchPrintQueue();
    } else if (currentTab === 'audit') {
      fetchAuditHistory();
    } else if (currentTab === 'scan') {
      setTimeout(() => scanInputRef.current?.focus(), 200);
    }
  }, [currentTab, auditPage, auditActionFilter]);

  // Clean messages after 4 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // ========================================================
  // SELECTION HANDLERS
  // ========================================================

  const handleSelectAllRegistry = (e) => {
    if (e.target.checked) {
      setSelectedBarcodeIds(registryList.map(b => b.barcode_id));
    } else {
      setSelectedBarcodeIds([]);
    }
  };

  const handleToggleSelectBarcode = (barcodeId) => {
    setSelectedBarcodeIds(prev =>
      prev.includes(barcodeId) ? prev.filter(id => id !== barcodeId) : [...prev, barcodeId]
    );
  };

  const handleSelectAllQueue = (e) => {
    if (e.target.checked) {
      setSelectedQueueIds(printQueue.map(q => q.id));
    } else {
      setSelectedQueueIds([]);
    }
  };

  const handleToggleSelectQueue = (queueId) => {
    setSelectedQueueIds(prev =>
      prev.includes(queueId) ? prev.filter(id => id !== queueId) : [...prev, queueId]
    );
  };

  // ========================================================
  // TAB 2: GENERATION ACTION
  // ========================================================

  const handleSelectSampleToGenerate = (sample) => {
    setSelectedSampleForGen(sample);
    setNumAliquots(0);
    setAliquotVolume(sample.sample_volume ? (sample.sample_volume / 2).toFixed(1) : '1.0');
    setGenVolumeUnit(sample.volume_unit || 'mL');
    setError('');
  };

  const handleExecuteGenerate = async (andAddToQueue = false) => {
    if (!selectedSampleForGen) {
      setError("Please select a registered specimen first.");
      return;
    }

    if (selectedSampleForGen.consent_status !== 'Submitted' && selectedSampleForGen.consent_status !== 'Verified') {
      setError("Consent must be verified before specimen labels can be generated.");
      return;
    }

    setGenerating(true);
    setError('');
    setSuccess('');

    try {
      const activeLab = sessionStorage.getItem('aura_active_lab_id') || localStorage.getItem('aura_active_lab_id');
      const response = await fetch(`${backendUrl}/api/barcode/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
        },
        body: JSON.stringify({
          sample_id: selectedSampleForGen.sample_id,
          num_aliquots: numAliquots > 0 ? numAliquots : 0,
          aliquot_volume: numAliquots > 0 ? aliquotVolume : null,
          volume_unit: genVolumeUnit
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate barcode');

      setSuccess(`Barcode ${data.barcode.barcode_value} generated successfully!`);

      // Add to print queue if requested
      if (andAddToQueue) {
        const barcodeIdsToQueue = [data.barcode.barcode_id];
        if (data.aliquots && data.aliquots.length > 0) {
          data.aliquots.forEach(a => barcodeIdsToQueue.push(a.barcode_id));
        }

        await fetch(`${backendUrl}/api/barcode/print-queue/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ barcode_ids: barcodeIdsToQueue, copies: 1 })
        });
      }

      // Automatically open Label Preview for immediate physical print
      const fullPrintObj = {
        id: selectedSampleForGen.sample_id,
        sample_id: selectedSampleForGen.sample_id,
        barcode_id: data.barcode.barcode_id,
        barcode_value: data.barcode.barcode_value,
        barcode_text: data.barcode.barcode_value,
        specimen_type: selectedSampleForGen.specimen_type,
        sample_volume: selectedSampleForGen.sample_volume,
        volume_unit: genVolumeUnit,
        collection_date: selectedSampleForGen.collection_date,
        qr_code_base64: data.barcode.qr_code_base64,
        code128_base64: data.barcode.code128_base64,
        aliquots: data.aliquots || []
      };

      setTargetBarcode(fullPrintObj);
      setActiveModal('print');

      // Refresh data
      fetchEligibleSamples();
      fetchRegistryData();
      if (onBarcodeAction) onBarcodeAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  // ========================================================
  // TAB 3: PRINT QUEUE ACTIONS
  // ========================================================

  const handleAddBatchToPrintQueue = async () => {
    if (selectedBarcodeIds.length === 0) {
      alert("Please select at least one barcode to add to the print queue.");
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/barcode/print-queue/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ barcode_ids: selectedBarcodeIds, copies: 1 })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to add to queue');

      setSuccess(`Added ${selectedBarcodeIds.length} barcodes to the Print Queue.`);
      setSelectedBarcodeIds([]);
      fetchRegistryData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleProcessSelectedQueue = async () => {
    if (selectedQueueIds.length === 0) {
      alert("Please select print queue items to print.");
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/barcode/print-queue/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ queue_ids: selectedQueueIds, action: 'PRINT' })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to process print queue');

      setSuccess("Batch print completed successfully!");
      setSelectedQueueIds([]);
      fetchPrintQueue();
      fetchRegistryData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveQueueItem = async (id) => {
    try {
      await fetch(`${backendUrl}/api/barcode/print-queue/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchPrintQueue();
    } catch (err) {
      console.error("Delete queue error:", err);
    }
  };

  // ========================================================
  // TAB 4: SCAN & VERIFY ACTIONS
  // ========================================================

  const handlePerformScan = async (codeToScan = scanInput) => {
    if (!codeToScan || !codeToScan.trim()) {
      setScanError("Please enter or scan a barcode identifier.");
      return;
    }

    setScanError('');
    setScanSuccess('');
    setScannedResult(null);

    try {
      const response = await fetch(`${backendUrl}/api/barcode/scan-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ barcode_value: codeToScan.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.notFound) {
          setScanError("Barcode not found.");
        } else if (data.isVoided) {
          setScanError(data.error || "WARNING: Barcode is VOIDED.");
          setScannedResult(data.barcode);
        } else {
          setScanError(data.error || "Scan verification failed.");
          if (data.barcode) setScannedResult(data.barcode);
        }
        return;
      }

      setScanSuccess("Barcode verified successfully.");
      setScannedResult(data.barcode);
      fetchRegistryData();
    } catch (err) {
      setScanError(err.message);
    }
  };

  const toggleCamera = () => {
    if (!cameraActive) {
      setCameraActive(true);
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          .then(stream => {
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.play();
            }
          })
          .catch(err => {
            setScanError("Camera access denied: " + err.message);
            setCameraActive(false);
          });
      } else {
        setScanError("Camera scanner is not supported on this browser.");
        setCameraActive(false);
      }
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject;
        stream.getTracks().forEach(track => track.stop());
      }
      setCameraActive(false);
    }
  };

  // ========================================================
  // REPRINT WORKFLOW
  // ========================================================

  const handleOpenReprint = (barcode) => {
    setTargetBarcode(barcode);
    setReprintReason('Label damaged');
    setReprintNotes('');
    setActiveModal('reprint');
  };

  const handleSubmitReprint = async (e) => {
    e.preventDefault();
    if (!targetBarcode) return;

    if (reprintReason === 'Other' && !reprintNotes.trim()) {
      alert("Please provide explanatory notes for 'Other' reprint reason.");
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/barcode/reprint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          barcode_id: targetBarcode.barcode_id,
          sample_id: targetBarcode.sample_id,
          reason: reprintReason,
          notes: reprintNotes
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to log reprint');

      setActiveModal(null);
      setSuccess(`Reprint logged successfully for ${targetBarcode.barcode_value}.`);

      // Trigger physical label printing preview
      setTargetBarcode({
        ...targetBarcode,
        print_count: data.barcode.print_count
      });
      setActiveModal('print');
      fetchRegistryData();
    } catch (err) {
      alert("Reprint Error: " + err.message);
    }
  };

  // ========================================================
  // VOID WORKFLOW (Admin Only)
  // ========================================================

  const handleOpenVoid = (barcode) => {
    setTargetBarcode(barcode);
    setVoidReason('');
    setActiveModal('void');
  };

  const handleSubmitVoid = async (e) => {
    e.preventDefault();
    if (!voidReason.trim()) {
      alert("A specific reason is required to void a barcode.");
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/barcode/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          barcode_id: targetBarcode.barcode_id,
          reason: voidReason.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to void barcode');

      setActiveModal(null);
      setSuccess(`Barcode ${targetBarcode.barcode_value} has been marked VOIDED.`);
      fetchRegistryData();
      if (onBarcodeAction) onBarcodeAction();
    } catch (err) {
      alert("Void Error: " + err.message);
    }
  };

  // ========================================================
  // REPLACE WORKFLOW (Admin Only)
  // ========================================================

  const handleOpenReplace = (barcode) => {
    setTargetBarcode(barcode);
    setReplaceReason('');
    setActiveModal('replace');
  };

  const handleSubmitReplace = async (e) => {
    e.preventDefault();
    if (!replaceReason.trim()) {
      alert("A specific reason is required to generate a replacement barcode.");
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/barcode/replace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          barcode_id: targetBarcode.barcode_id,
          reason: replaceReason.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to replace barcode');

      setActiveModal(null);
      setSuccess(`Replacement barcode ${data.newBarcode.barcode_value} generated successfully!`);

      // Open print preview for replacement barcode
      setTargetBarcode({
        ...targetBarcode,
        barcode_id: data.newBarcode.barcode_id,
        barcode_value: data.newBarcode.barcode_value,
        barcode_text: data.newBarcode.barcode_value,
        qr_code_base64: data.newBarcode.qr_code_base64,
        code128_base64: data.newBarcode.code128_base64,
        status: 'GENERATED'
      });
      setActiveModal('print');
      fetchRegistryData();
      if (onBarcodeAction) onBarcodeAction();
    } catch (err) {
      alert("Replace Error: " + err.message);
    }
  };

  // ========================================================
  // STORAGE ASSIGNMENT / MOVE WORKFLOW
  // ========================================================

  const handleOpenStorage = (barcode) => {
    setTargetBarcode(barcode);
    setStorageFreezer('ULT-03');
    setStorageRack('Rack A');
    setStorageBox('Box 01');
    setStoragePosition('A1');
    setStorageNotes('');
    setActiveModal('storage');
  };

  const handleSubmitStorage = async (e) => {
    e.preventDefault();
    if (!targetBarcode) return;

    try {
      const location = `${storageFreezer} > ${storageRack} > ${storageBox} > Position ${storagePosition}`;
      const response = await fetch(`${backendUrl}/api/barcode/assign-storage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          barcode_value: targetBarcode.barcode_value,
          location,
          freezer: storageFreezer,
          rack: storageRack,
          box: storageBox,
          position: storagePosition,
          notes: storageNotes
        })
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          alert(`Position ${storagePosition} is already occupied! Please choose an empty position.`);
          return;
        }
        throw new Error(data.error || 'Failed to assign storage');
      }

      setActiveModal(null);
      setSuccess(`Storage coordinates assigned: ${location}`);
      fetchRegistryData();
      if (onBarcodeAction) onBarcodeAction();
    } catch (err) {
      alert("Storage Assignment Error: " + err.message);
    }
  };

  // ========================================================
  // SHIPMENT INTEGRATION WORKFLOW
  // ========================================================

  const handleOpenShipment = (barcode) => {
    setTargetBarcode(barcode);
    setShipmentDestination('AURA Central Biobank - LN2 Cryo Tank Yard');
    setActiveModal('shipment');
  };

  const handleSubmitShipment = async (e) => {
    e.preventDefault();
    if (!targetBarcode) return;

    try {
      const response = await fetch(`${backendUrl}/api/barcode/add-to-shipment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          barcode_value: targetBarcode.barcode_value,
          destination: shipmentDestination
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to add to shipment');

      setActiveModal(null);
      setSuccess(`Specimen added to shipment cargo: ${data.shipmentId}`);
      fetchRegistryData();
      if (onBarcodeAction) onBarcodeAction();
    } catch (err) {
      alert("Shipment Error: " + err.message);
    }
  };

  // ========================================================
  // ALIQUOT CREATION MODAL WORKFLOW
  // ========================================================

  const handleOpenAliquot = (barcode) => {
    setTargetBarcode(barcode);
    setNewAliquotCount(2);
    setNewAliquotVol(barcode.volume ? (barcode.volume / 3).toFixed(1) : 1.0);
    setActiveModal('aliquot');
  };

  const handleSubmitAliquot = async (e) => {
    e.preventDefault();
    if (!targetBarcode) return;

    try {
      const response = await fetch(`${backendUrl}/api/barcode/generate-aliquots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          parent_sample_id: targetBarcode.sample_id,
          num_aliquots: newAliquotCount,
          aliquot_volume: newAliquotVol,
          volume_unit: targetBarcode.volume_unit || 'mL'
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create aliquots');

      setActiveModal(null);
      setSuccess(`Successfully generated ${newAliquotCount} aliquot barcodes!`);
      fetchRegistryData();
      if (onBarcodeAction) onBarcodeAction();
    } catch (err) {
      alert("Aliquot Generation Error: " + err.message);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status) => {
    const s = (status || 'GENERATED').toUpperCase();
    let bg = 'rgba(0, 242, 254, 0.12)';
    let color = 'var(--accent-cyan)';
    let border = 'rgba(0, 242, 254, 0.3)';

    if (s === 'PRINTED' || s === 'APPLIED') {
      bg = 'rgba(102, 126, 234, 0.15)';
      color = '#8da4ff';
      border = 'rgba(102, 126, 234, 0.3)';
    } else if (s === 'VERIFIED') {
      bg = 'rgba(0, 230, 118, 0.15)';
      color = 'var(--accent-success)';
      border = 'rgba(0, 230, 118, 0.3)';
    } else if (s === 'STORED') {
      bg = 'rgba(16, 185, 129, 0.15)';
      color = '#10B981';
      border = 'rgba(16, 185, 129, 0.3)';
    } else if (s === 'IN_TRANSIT' || s === 'SHIPPED') {
      bg = 'rgba(245, 158, 11, 0.15)';
      color = 'var(--accent-warning)';
      border = 'rgba(245, 158, 11, 0.3)';
    } else if (s === 'RECEIVED') {
      bg = 'rgba(14, 165, 233, 0.15)';
      color = '#38bdf8';
      border = 'rgba(14, 165, 233, 0.3)';
    } else if (s === 'VOIDED' || s === 'DISPOSED') {
      bg = 'rgba(239, 68, 68, 0.15)';
      color = 'var(--accent-error)';
      border = 'rgba(239, 68, 68, 0.3)';
    } else if (s === 'REPLACED') {
      bg = 'rgba(168, 85, 247, 0.15)';
      color = 'var(--accent-purple)';
      border = 'rgba(168, 85, 247, 0.3)';
    }

    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        fontWeight: '700',
        padding: '3px 8px',
        borderRadius: '12px',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${border}`,
        letterSpacing: '0.03em'
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color }}></span>
        {s}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
      {/* ========================================================
          PAGE HEADER & SUMMARY DASHBOARD
          ======================================================== */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-primary))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              BARCODE MANAGER
            </span>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '20px',
              background: 'rgba(0, 242, 254, 0.1)',
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(0, 242, 254, 0.25)',
              fontWeight: '700'
            }}>
              ISO-15189 / ISBER COMPLIANT
            </span>
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Generate, print, verify, track and manage specimen barcodes.
          </p>
        </div>

        {/* Prominent Quick Scan CTA */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            id="btn-prominent-scan"
            className="btn btn-primary"
            onClick={() => {
              setCurrentTab('scan');
              setTimeout(() => scanInputRef.current?.focus(), 150);
            }}
            style={{
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 0 16px rgba(0, 242, 254, 0.25)',
              border: '1px solid var(--accent-cyan)'
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '18px', height: '18px' }}>
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
              <line x1="7" y1="12" x2="17" y2="12"/>
            </svg>
            Scan Barcode
          </button>
        </div>
      </div>

      {/* Notifications Alert Banner */}
      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--border-radius-md)',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: 'var(--accent-error)',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>⚠️</span>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {success && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--border-radius-md)',
          backgroundColor: 'rgba(0, 230, 118, 0.15)',
          border: '1px solid rgba(0, 230, 118, 0.3)',
          color: 'var(--accent-success)',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>✅</span>
          <span>{success}</span>
          <button onClick={() => setSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 6 Dashboard Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '16px'
      }}>
        {/* Card 1: Total Barcodes */}
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Barcodes
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
            {summary.totalBarcodes.toLocaleString()}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--accent-cyan)' }}>Active Registry</span>
        </div>

        {/* Card 2: Generated Today */}
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Generated Today
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent-primary)' }}>
            {summary.generatedToday.toLocaleString()}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{new Date().toLocaleDateString()}</span>
        </div>

        {/* Card 3: Pending Print */}
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pending Print
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent-warning)' }}>
            {summary.pendingPrint.toLocaleString()}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Queue / Unprinted</span>
        </div>

        {/* Card 4: Stored Samples */}
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Stored Samples
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent-success)' }}>
            {summary.storedSamples.toLocaleString()}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>In Cryo / Freezer</span>
        </div>

        {/* Card 5: In Transit */}
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            In Transit
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#38bdf8' }}>
            {summary.inTransit.toLocaleString()}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Shipments Active</span>
        </div>

        {/* Card 6: Voided/Replaced */}
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Voided / Replaced
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent-purple)' }}>
            {summary.voidedReplaced.toLocaleString()}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Audit Retained</span>
        </div>
      </div>

      {/* ========================================================
          NAVIGATION TAB BAR (5 TABS)
          ======================================================== */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-color)',
        gap: '4px',
        overflowX: 'auto'
      }}>
        {[
          { key: 'registry', label: '1. Registry', icon: '📋' },
          { key: 'generate', label: '2. Generate', icon: '⚡' },
          { key: 'queue', label: '3. Print Queue', icon: '🖨️', badge: summary.pendingPrint },
          { key: 'scan', label: '4. Scan & Verify', icon: '🔍' },
          { key: 'audit', label: '5. Audit History', icon: '🛡️' }
        ].map(tab => (
          <button
            key={tab.key}
            id={`tab-btn-${tab.key}`}
            onClick={() => {
              setCurrentTab(tab.key);
              setError('');
            }}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: currentTab === tab.key ? 'var(--bg-surface)' : 'transparent',
              color: currentTab === tab.key ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              fontWeight: currentTab === tab.key ? '700' : '500',
              fontSize: '13px',
              borderBottom: currentTab === tab.key ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'var(--transition-smooth)',
              whiteSpace: 'nowrap'
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '10px',
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                color: 'var(--accent-warning)',
                fontWeight: '700'
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ========================================================
          TAB 1: BARCODE REGISTRY
          ======================================================== */}
      {currentTab === 'registry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Global Search & Multi-Filter Bar */}
          <div className="glass-card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' }}>
              {/* Search Bar */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Global Search (Barcode ID, Sample ID, Participant ID, Storage)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search by AURA-..., SUBJ-..., position..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchRegistryData()}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 34px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '13px'
                    }}
                  />
                  <span style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-tertiary)' }}>🔍</span>
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Barcode Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="GENERATED">GENERATED</option>
                  <option value="PRINTED">PRINTED</option>
                  <option value="APPLIED">APPLIED</option>
                  <option value="VERIFIED">VERIFIED</option>
                  <option value="STORED">STORED</option>
                  <option value="IN_TRANSIT">IN_TRANSIT</option>
                  <option value="RECEIVED">RECEIVED</option>
                  <option value="CONSUMED">CONSUMED</option>
                  <option value="EXHAUSTED">EXHAUSTED</option>
                  <option value="DISPOSED">DISPOSED</option>
                  <option value="VOIDED">VOIDED</option>
                  <option value="REPLACED">REPLACED</option>
                </select>
              </div>

              {/* Specimen Type Filter */}
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Specimen Type
                </label>
                <select
                  value={specimenTypeFilter}
                  onChange={(e) => setSpecimenTypeFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                >
                  <option value="ALL">All Specimen Types</option>
                  {availableSpecimenTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Storage Filter */}
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Storage Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. ULT-03, LN2, Rack A"
                  value={storageFilter}
                  onChange={(e) => setStorageFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-primary"
                  onClick={fetchRegistryData}
                  style={{ flex: 1, padding: '8px 12px', fontSize: '12px', fontWeight: '700' }}
                >
                  Apply Filters
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('ALL');
                    setSpecimenTypeFilter('ALL');
                    setStorageFilter('');
                    setStartDateFilter('');
                    setEndDateFilter('');
                    setCurrentPage(1);
                  }}
                  style={{ padding: '8px 12px', fontSize: '12px' }}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Batch Actions Bar */}
            {selectedBarcodeIds.length > 0 && (
              <div style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-cyan)' }}>
                  ✓ {selectedBarcodeIds.length} specimen barcode(s) selected
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={handleAddBatchToPrintQueue}
                    style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    🖨️ Add to Print Queue
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Registry Table */}
          <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderBottom: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    fontSize: '10px',
                    letterSpacing: '0.05em'
                  }}>
                    <th style={{ padding: '12px 14px', width: '36px' }}>
                      <input
                        type="checkbox"
                        checked={registryList.length > 0 && selectedBarcodeIds.length === registryList.length}
                        onChange={handleSelectAllRegistry}
                      />
                    </th>
                    <th style={{ padding: '12px 14px' }}>Barcode ID</th>
                    <th style={{ padding: '12px 14px' }}>Sample ID</th>
                    <th style={{ padding: '12px 14px' }}>Participant ID</th>
                    <th style={{ padding: '12px 14px' }}>Specimen Type</th>
                    <th style={{ padding: '12px 14px' }}>Volume</th>
                    <th style={{ padding: '12px 14px' }}>Parent Barcode</th>
                    <th style={{ padding: '12px 14px' }}>Generated Date</th>
                    <th style={{ padding: '12px 14px' }}>Storage Location</th>
                    <th style={{ padding: '12px 14px' }}>Status</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="11" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid rgba(0, 242, 254, 0.2)', borderTopColor: 'var(--accent-cyan)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                        <div style={{ marginTop: '8px' }}>Loading specimen barcode registry...</div>
                      </td>
                    </tr>
                  ) : registryList.length === 0 ? (
                    <tr>
                      <td colSpan="11" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                        No specimen barcodes match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    registryList.map((row) => {
                      const isVoided = row.barcode_status === 'VOIDED';
                      const isStored = row.barcode_status === 'STORED';

                      return (
                        <tr
                          key={row.barcode_id}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            backgroundColor: selectedBarcodeIds.includes(row.barcode_id) ? 'rgba(0, 242, 254, 0.05)' : 'transparent',
                            opacity: isVoided ? 0.65 : 1
                          }}
                        >
                          <td style={{ padding: '12px 14px' }}>
                            <input
                              type="checkbox"
                              checked={selectedBarcodeIds.includes(row.barcode_id)}
                              onChange={() => handleToggleSelectBarcode(row.barcode_id)}
                            />
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: '700', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                            <span
                              onClick={() => {
                                fetchBarcodeDetails(row.barcode_value);
                                setActiveModal('details');
                              }}
                              style={{ cursor: 'pointer', textDecoration: 'underline', color: isVoided ? 'var(--accent-error)' : 'var(--accent-cyan)' }}
                              title="Click to view details"
                            >
                              {row.barcode_value}
                            </span>
                            {row.barcode_type === 'Aliquot' && (
                              <span style={{ marginLeft: '6px', fontSize: '9px', padding: '1px 4px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.2)', color: 'var(--accent-purple)' }}>
                                ALIQUOT
                              </span>
                            )}
                            {row.barcode_type === 'Replacement' && (
                              <span style={{ marginLeft: '6px', fontSize: '9px', padding: '1px 4px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-warning)' }}>
                                REPLACEMENT
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                            {row.sample_id}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                            {row.coded_participant_id || '—'}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              color: 'var(--text-primary)',
                              fontWeight: '600'
                            }}>
                              {row.specimen_type}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                            {row.volume} {row.volume_unit}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                            {row.parent_barcode_value ? (
                              <span
                                style={{ cursor: 'pointer', color: 'var(--accent-cyan)', textDecoration: 'underline' }}
                                onClick={() => {
                                  fetchBarcodeDetails(row.parent_barcode_value);
                                  setActiveModal('details');
                                }}
                              >
                                {row.parent_barcode_value}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                            {row.generated_at ? new Date(row.generated_at).toLocaleDateString() : '—'}
                          </td>
                          <td style={{ padding: '12px 14px', color: row.current_storage_location ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                            {row.current_storage_location ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                📍 {row.current_storage_location}
                              </span>
                            ) : (
                              'Unassigned'
                            )}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {getStatusBadge(row.barcode_status)}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              {/* View Details */}
                              <button
                                className="btn btn-secondary"
                                onClick={() => {
                                  fetchBarcodeDetails(row.barcode_value);
                                  setActiveModal('details');
                                }}
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                title="View Details"
                              >
                                👁️ Details
                              </button>

                              {/* Print */}
                              {!isVoided && (
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => {
                                    setTargetBarcode(row);
                                    setActiveModal('print');
                                  }}
                                  style={{ padding: '4px 8px', fontSize: '11px' }}
                                  title="Print Label"
                                >
                                  🖨️ Print
                                </button>
                              )}

                              {/* Reprint */}
                              {!isVoided && row.print_count > 0 && isTechnician && (
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => handleOpenReprint(row)}
                                  style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-warning)' }}
                                  title="Reprint Label (Reason Required)"
                                >
                                  🔄 Reprint
                                </button>
                              )}

                              {/* Storage */}
                              {!isVoided && isTechnician && (
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => handleOpenStorage(row)}
                                  style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-success)' }}
                                  title={isStored ? "Move Storage" : "Assign Storage"}
                                >
                                  📍 {isStored ? "Move" : "Store"}
                                </button>
                              )}

                              {/* Aliquot */}
                              {!isVoided && row.barcode_type !== 'Aliquot' && isTechnician && (
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => handleOpenAliquot(row)}
                                  style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-purple)' }}
                                  title="Create Aliquots"
                                >
                                  🧪 Aliquot
                                </button>
                              )}

                              {/* Shipment */}
                              {!isVoided && (row.barcode_status === 'VERIFIED' || row.barcode_status === 'STORED' || row.barcode_status === 'PRINTED') && (
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => handleOpenShipment(row)}
                                  style={{ padding: '4px 8px', fontSize: '11px', color: '#38bdf8' }}
                                  title="Add to Shipment"
                                >
                                  📦 Ship
                                </button>
                              )}

                              {/* Void (Admin Only) */}
                              {!isVoided && isAdmin && (
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => handleOpenVoid(row)}
                                  style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-error)' }}
                                  title="Void Barcode"
                                >
                                  🚫 Void
                                </button>
                              )}

                              {/* Replace (Admin Only) */}
                              {!isVoided && isAdmin && (
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => handleOpenReplace(row)}
                                  style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-purple)' }}
                                  title="Replace Barcode"
                                >
                                  🏷️ Replace
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderTop: '1px solid var(--border-color)',
              fontSize: '12px',
              color: 'var(--text-secondary)'
            }}>
              <div>
                Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} barcodes
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  style={{ padding: '4px 10px', fontSize: '11px' }}
                >
                  ◀ Prev
                </button>
                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                  Page {currentPage} of {Math.ceil(totalRecords / pageSize) || 1}
                </span>
                <button
                  className="btn btn-secondary"
                  disabled={currentPage >= Math.ceil(totalRecords / pageSize)}
                  onClick={() => setCurrentPage(p => p + 1)}
                  style={{ padding: '4px 10px', fontSize: '11px' }}
                >
                  Next ▶
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 2: BARCODE GENERATION
          ======================================================== */}
      {currentTab === 'generate' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', alignItems: 'start' }}>
          {/* Left Column: Eligible Samples List */}
          <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Select Registered Specimen</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Only registered specimens with verified patient consent are eligible for label generation.
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={fetchEligibleSamples}
                style={{ padding: '6px 12px', fontSize: '11px' }}
              >
                🔄 Refresh
              </button>
            </div>

            <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase' }}>
                    <th style={{ padding: '8px' }}>Sample ID</th>
                    <th style={{ padding: '8px' }}>Participant ID</th>
                    <th style={{ padding: '8px' }}>Specimen</th>
                    <th style={{ padding: '8px' }}>Volume</th>
                    <th style={{ padding: '8px' }}>Consent Status</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {eligibleSamples.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        No unmapped registered specimens found.
                      </td>
                    </tr>
                  ) : (
                    eligibleSamples.map(s => {
                      const isConsentVerified = s.consent_status === 'Verified' || s.consent_status === 'Submitted';
                      const isSelected = selectedSampleForGen?.sample_id === s.sample_id;

                      return (
                        <tr
                          key={s.sample_id}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            backgroundColor: isSelected ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleSelectSampleToGenerate(s)}
                        >
                          <td style={{ padding: '10px 8px', fontWeight: '700', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                            {s.sample_id}
                          </td>
                          <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>
                            {s.coded_participant_id || '—'}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            {s.specimen_type}
                          </td>
                          <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>
                            {s.sample_volume} {s.volume_unit}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            {s.consent_status === 'Verified' ? (
                              <span style={{ fontSize: '10px', color: 'var(--accent-success)', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0, 230, 118, 0.15)' }}>
                                ✓ VERIFIED
                              </span>
                            ) : s.consent_status === 'Submitted' ? (
                              <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0, 242, 254, 0.15)' }}>
                                SUBMITTED
                              </span>
                            ) : s.consent_status === 'Withdrawn' ? (
                              <span style={{ fontSize: '10px', color: 'var(--accent-error)', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)' }}>
                                WITHDRAWN
                              </span>
                            ) : (
                              <span style={{ fontSize: '10px', color: 'var(--accent-warning)', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)' }}>
                                PENDING
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                            <button
                              className={isSelected ? "btn btn-primary" : "btn btn-secondary"}
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectSampleToGenerate(s);
                              }}
                            >
                              {isSelected ? "Selected" : "Select"}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: Generation Form & Live Label Preview */}
          <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Barcode Configuration & Preview</h3>

            {!selectedSampleForGen ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                👈 Please select a registered specimen from the left panel to configure label parameters.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Consent verification warning block if not verified */}
                {selectedSampleForGen.consent_status !== 'Verified' && selectedSampleForGen.consent_status !== 'Submitted' && (
                  <div style={{
                    padding: '12px',
                    borderRadius: 'var(--border-radius-sm)',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--accent-error)',
                    fontSize: '12px',
                    fontWeight: '700'
                  }}>
                    ⚠️ Consent must be verified before specimen labels can be generated.
                  </div>
                )}

                {/* Selected Sample Details Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '10px',
                  padding: '12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 'var(--border-radius-sm)',
                  fontSize: '12px'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Sample ID</span>
                    <strong style={{ fontFamily: 'monospace' }}>{selectedSampleForGen.sample_id}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Coded Participant ID</span>
                    <strong>{selectedSampleForGen.coded_participant_id || 'N/A'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Specimen Type</span>
                    <strong>{selectedSampleForGen.specimen_type}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Container / Volume</span>
                    <strong>{selectedSampleForGen.container_type || 'Tube'} ({selectedSampleForGen.sample_volume} {selectedSampleForGen.volume_unit})</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Collection Date</span>
                    <strong>{selectedSampleForGen.collection_date}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Collection Site</span>
                    <strong>{selectedSampleForGen.collection_site || 'AURA Central Lab'}</strong>
                  </div>
                </div>

                {/* Aliquots configuration */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                      Number of Aliquots (Optional)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={numAliquots}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0;
                        setNumAliquots(val);
                        if (val > 0 && selectedSampleForGen.sample_volume) {
                          setAliquotVolume((selectedSampleForGen.sample_volume / val).toFixed(1));
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 'var(--border-radius-sm)',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                  {numAliquots > 0 && (
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                        Volume per Aliquot ({genVolumeUnit})
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={aliquotVolume}
                        onChange={(e) => setAliquotVolume(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 'var(--border-radius-sm)',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '12px'
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Tube Label Mockup */}
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                    Label Preview (Specimen Tube High-Contrast Mockup)
                  </label>
                  <div style={{
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '2px solid #000000',
                    fontFamily: 'monospace',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #000', paddingBottom: '4px' }}>
                      <span style={{ fontWeight: '900', fontSize: '12px', letterSpacing: '0.05em' }}>AURA BIOBANK</span>
                      <span style={{ fontSize: '10px' }}>ISBER Cryo</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '900' }}>
                          AURA-260928-XXXXXX
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: '700' }}>
                          {selectedSampleForGen.specimen_type} | {selectedSampleForGen.sample_volume} {selectedSampleForGen.volume_unit}
                        </span>
                        <span style={{ fontSize: '10px' }}>
                          Col: {selectedSampleForGen.collection_date}
                        </span>
                        <span style={{ fontSize: '9px', color: '#555' }}>
                          ID: {selectedSampleForGen.coded_participant_id || 'SUBJ-X'}
                        </span>
                      </div>

                      {/* Mock Barcode Graphic */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          border: '1px solid #000',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '8px',
                          fontWeight: '700'
                        }}>
                          [QR CODE]
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '4px', letterSpacing: '2px', fontSize: '10px', fontWeight: '700' }}>
                      ||| | |||| | || ||| || |||
                    </div>
                  </div>
                </div>

                {/* Generate Actions */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button
                    className="btn btn-primary"
                    disabled={generating || (selectedSampleForGen.consent_status !== 'Verified' && selectedSampleForGen.consent_status !== 'Submitted')}
                    onClick={() => handleExecuteGenerate(false)}
                    style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: '700' }}
                  >
                    {generating ? "Generating..." : "⚡ Generate Barcode"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={generating || (selectedSampleForGen.consent_status !== 'Verified' && selectedSampleForGen.consent_status !== 'Submitted')}
                    onClick={() => handleExecuteGenerate(true)}
                    style={{ flex: 1, padding: '10px', fontSize: '13px' }}
                  >
                    🖨️ Generate & Queue
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 3: PRINT QUEUE
          ======================================================== */}
      {currentTab === 'queue' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Active Label Print Queue</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Manage queued labels for bulk thermal or laser printing overlay.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-primary"
                disabled={selectedQueueIds.length === 0}
                onClick={handleProcessSelectedQueue}
                style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '700' }}
              >
                🖨️ Print Selected ({selectedQueueIds.length})
              </button>
              <button
                className="btn btn-secondary"
                onClick={fetchPrintQueue}
                style={{ padding: '8px 12px', fontSize: '12px' }}
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderBottom: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    fontSize: '10px',
                    letterSpacing: '0.05em'
                  }}>
                    <th style={{ padding: '12px 14px', width: '36px' }}>
                      <input
                        type="checkbox"
                        checked={printQueue.length > 0 && selectedQueueIds.length === printQueue.length}
                        onChange={handleSelectAllQueue}
                      />
                    </th>
                    <th style={{ padding: '12px 14px' }}>Barcode ID</th>
                    <th style={{ padding: '12px 14px' }}>Sample ID</th>
                    <th style={{ padding: '12px 14px' }}>Specimen Type</th>
                    <th style={{ padding: '12px 14px' }}>Copies</th>
                    <th style={{ padding: '12px 14px' }}>Queued By</th>
                    <th style={{ padding: '12px 14px' }}>Queued At</th>
                    <th style={{ padding: '12px 14px' }}>Status</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queueLoading ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                        Loading print queue items...
                      </td>
                    </tr>
                  ) : printQueue.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                        Print queue is currently empty.
                      </td>
                    </tr>
                  ) : (
                    printQueue.map((q) => (
                      <tr key={q.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <input
                            type="checkbox"
                            checked={selectedQueueIds.includes(q.id)}
                            onChange={() => handleToggleSelectQueue(q.id)}
                          />
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: '700', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>
                          {q.barcode_value}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                          {q.sample_id}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {q.specimen_type}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: '700' }}>
                          {q.copies}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                          {q.queued_by_name || 'System'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                          {q.queued_at ? new Date(q.queued_at).toLocaleTimeString() : '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: '700',
                            backgroundColor: q.status === 'PRINTED' ? 'rgba(0, 230, 118, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: q.status === 'PRINTED' ? 'var(--accent-success)' : 'var(--accent-warning)'
                          }}>
                            {q.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => {
                                setTargetBarcode({
                                  barcode_id: q.barcode_id,
                                  barcode_value: q.barcode_value,
                                  sample_id: q.sample_id,
                                  specimen_type: q.specimen_type,
                                  volume: q.sample_volume,
                                  volume_unit: q.volume_unit,
                                  collection_date: q.collection_date,
                                  qr_code_base64: q.qr_code_base64,
                                  code128_base64: q.code128_base64
                                });
                                setActiveModal('print');
                              }}
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                            >
                              Print
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleRemoveQueueItem(q.id)}
                              style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-error)' }}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 4: SCAN & VERIFY
          ======================================================== */}
      {currentTab === 'scan' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px', alignItems: 'start' }}>
          {/* Left Column: Scanner Inputs */}
          <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Scan Barcode / QR Code</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Works automatically with USB/Bluetooth hand-held 1D/2D laser scanners, keyboard emulators, or webcams.
            </p>

            {/* Hardware Scanner Input */}
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                Hardware Scanner Input (Auto-Detect)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  ref={scanInputRef}
                  type="text"
                  placeholder="Scan or type barcode string & press Enter..."
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handlePerformScan(scanInput);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--accent-cyan)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: '600',
                    boxShadow: '0 0 8px rgba(0, 242, 254, 0.2)'
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => handlePerformScan(scanInput)}
                  style={{ padding: '10px 18px', fontSize: '13px', fontWeight: '700' }}
                >
                  Verify
                </button>
              </div>
            </div>

            {/* Camera Scanner Toggle */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600' }}>📷 Camera Barcode Scanner</span>
                <button
                  className={cameraActive ? "btn btn-secondary" : "btn btn-primary"}
                  onClick={toggleCamera}
                  style={{ padding: '6px 12px', fontSize: '11px' }}
                >
                  {cameraActive ? "Stop Camera" : "Start Camera"}
                </button>
              </div>

              {cameraActive && (
                <div style={{ position: 'relative', width: '100%', height: '220px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#000' }}>
                  <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} autoPlay playsInline muted />
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '180px',
                    height: '100px',
                    border: '2px dashed var(--accent-cyan)',
                    borderRadius: '6px',
                    pointerEvents: 'none',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)'
                  }}></div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Verification Results */}
          <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Verification Telemetry</h3>

            {scanError && (
              <div style={{
                padding: '14px',
                borderRadius: 'var(--border-radius-sm)',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--accent-error)',
                fontSize: '13px',
                fontWeight: '700'
              }}>
                {scanError}
              </div>
            )}

            {scanSuccess && (
              <div style={{
                padding: '14px',
                borderRadius: 'var(--border-radius-sm)',
                backgroundColor: 'rgba(0, 230, 118, 0.15)',
                border: '1px solid rgba(0, 230, 118, 0.3)',
                color: 'var(--accent-success)',
                fontSize: '13px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>✅</span>
                <span>{scanSuccess}</span>
              </div>
            )}

            {!scannedResult ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                No specimen scanned yet. Scan a physical tube label to verify authenticity and coordinates.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '10px',
                  padding: '14px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 'var(--border-radius-sm)',
                  fontSize: '12px'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px', display: 'block' }}>Barcode ID</span>
                    <strong style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>{scannedResult.barcode_value}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px', display: 'block' }}>Status</span>
                    {getStatusBadge(scannedResult.status)}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px', display: 'block' }}>Sample ID</span>
                    <strong>{scannedResult.sample_id}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px', display: 'block' }}>Specimen Type</span>
                    <strong>{scannedResult.specimen_type}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px', display: 'block' }}>Volume</span>
                    <strong>{scannedResult.sample_volume || scannedResult.volume} {scannedResult.volume_unit || 'mL'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px', display: 'block' }}>Storage Location</span>
                    <strong>{scannedResult.storage_location || 'Unassigned'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px', display: 'block' }}>Consent Status</span>
                    <strong>{scannedResult.consent_status || 'Verified'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px', display: 'block' }}>Parent Sample</span>
                    <strong>{scannedResult.parent_sample_id || 'None (Primary)'}</strong>
                  </div>
                </div>

                {/* Contextual Quick Actions */}
                {scannedResult.status !== 'VOIDED' && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleOpenStorage(scannedResult)}
                      style={{ padding: '8px 14px', fontSize: '12px', color: 'var(--accent-success)' }}
                    >
                      📍 {scannedResult.storage_location ? "Move Sample" : "Assign Storage"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleOpenShipment(scannedResult)}
                      style={{ padding: '8px 14px', fontSize: '12px', color: '#38bdf8' }}
                    >
                      📦 Add to Shipment
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        fetchBarcodeDetails(scannedResult.barcode_value);
                        setActiveModal('details');
                      }}
                      style={{ padding: '8px 14px', fontSize: '12px' }}
                    >
                      👁️ Full Profile & History
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 5: AUDIT HISTORY
          ======================================================== */}
      {currentTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Immutable Barcode Audit Trail</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Chronological chain of custody and lifecycle events.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--border-radius-sm)',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px'
                }}
              >
                <option value="ALL">All Action Events</option>
                <option value="BARCODE_GENERATED">BARCODE_GENERATED</option>
                <option value="BARCODE_PRINTED">BARCODE_PRINTED</option>
                <option value="BARCODE_REPRINTED">BARCODE_REPRINTED</option>
                <option value="BARCODE_VERIFIED">BARCODE_VERIFIED</option>
                <option value="BARCODE_VOIDED">BARCODE_VOIDED</option>
                <option value="BARCODE_REPLACED">BARCODE_REPLACED</option>
                <option value="STORAGE_ASSIGNED">STORAGE_ASSIGNED</option>
                <option value="STORAGE_MOVED">STORAGE_MOVED</option>
                <option value="SHIPMENT_ADDED">SHIPMENT_ADDED</option>
                <option value="ALIQUOT_CREATED">ALIQUOT_CREATED</option>
              </select>

              <button
                className="btn btn-secondary"
                onClick={fetchAuditHistory}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderBottom: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    fontSize: '10px',
                    letterSpacing: '0.05em'
                  }}>
                    <th style={{ padding: '12px 14px' }}>Timestamp</th>
                    <th style={{ padding: '12px 14px' }}>Action</th>
                    <th style={{ padding: '12px 14px' }}>Barcode / Sample</th>
                    <th style={{ padding: '12px 14px' }}>Performed By</th>
                    <th style={{ padding: '12px 14px' }}>Role</th>
                    <th style={{ padding: '12px 14px' }}>Reason / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {auditList.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        No audit history records found.
                      </td>
                    </tr>
                  ) : (
                    auditList.map((a) => (
                      <tr key={a.audit_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {a.action_timestamp ? new Date(a.action_timestamp).toLocaleString() : '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: '700',
                            backgroundColor: 'rgba(0, 242, 254, 0.1)',
                            color: 'var(--accent-cyan)'
                          }}>
                            {a.action_type}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: '700' }}>
                          {a.barcode_value || a.sample_id}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-primary)' }}>
                          {a.performed_by_name || 'System Admin'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--accent-primary)', fontSize: '11px', fontWeight: '600' }}>
                          {a.performed_by_role || 'Super Admin'}
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                          {a.reason || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 1: BARCODE 360-DEGREE DETAILS & LIFECYCLE
          ======================================================== */}
      {activeModal === 'details' && detailedBarcode && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '750px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '800' }}>
                  Specimen Identity: {detailedBarcode.barcode.barcode_value}
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Sample Reference: {detailedBarcode.barcode.sample_id}
                </span>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setActiveModal(null)}
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                ✕ Close
              </button>
            </div>

            {/* Specimen Details Section */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              padding: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--border-radius-md)',
              fontSize: '12px'
            }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Participant ID</span>
                <strong>{detailedBarcode.barcode.coded_participant_id || 'N/A'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Specimen Type</span>
                <strong>{detailedBarcode.barcode.specimen_type}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Volume</span>
                <strong>{detailedBarcode.barcode.volume || detailedBarcode.barcode.sample_volume} {detailedBarcode.barcode.volume_unit || 'mL'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Current Status</span>
                {getStatusBadge(detailedBarcode.barcode.status)}
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Storage Location</span>
                <strong>{detailedBarcode.barcode.storage_location || 'Unassigned'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '10px' }}>Print Count</span>
                <strong>{detailedBarcode.barcode.print_count} time(s)</strong>
              </div>
            </div>

            {/* Child Aliquots (if any) */}
            {detailedBarcode.aliquots && detailedBarcode.aliquots.length > 0 && (
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--accent-purple)' }}>
                  Derived Aliquot Specimens ({detailedBarcode.aliquots.length})
                </h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {detailedBarcode.aliquots.map(aliq => (
                    <div
                      key={aliq.barcode_id}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'rgba(168, 85, 247, 0.1)',
                        border: '1px solid rgba(168, 85, 247, 0.25)',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontFamily: 'monospace'
                      }}
                    >
                      <strong>{aliq.barcode_value}</strong>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>({aliq.volume} {aliq.volume_unit})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lifecycle Timeline */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '12px' }}>
                Complete Lifecycle History & Chain of Custody
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {detailedBarcode.timeline && detailedBarcode.timeline.length > 0 ? (
                  detailedBarcode.timeline.map((evt, idx) => (
                    <div
                      key={evt.audit_id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '10px 14px',
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                        borderLeft: '3px solid var(--accent-cyan)',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ minWidth: '130px', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                        {new Date(evt.action_timestamp).toLocaleString()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{evt.action_type}</strong>
                        {evt.reason && <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>{evt.reason}</p>}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--accent-primary)', textAlign: 'right' }}>
                        {evt.performed_by_name || 'System'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>No timeline events recorded.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: LABEL PREVIEW & PRINTING MODAL
          ======================================================== */}
      {activeModal === 'print' && targetBarcode && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '500px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '800' }}>Specimen Tube Label Preview</h3>
              <button
                className="btn btn-secondary"
                onClick={() => setActiveModal(null)}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>

            {/* Physical Tube Label Layout */}
            <div
              id="specimen-printable-label"
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                padding: '20px',
                borderRadius: '8px',
                border: '2px solid #000000',
                fontFamily: 'monospace',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '4px' }}>
                <span style={{ fontWeight: '900', fontSize: '13px', letterSpacing: '0.05em' }}>AURA BIOBANK</span>
                <span style={{ fontSize: '10px', fontWeight: '700' }}>CRYO COMPLIANT</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '900', letterSpacing: '0.02em' }}>
                    {targetBarcode.barcode_value || targetBarcode.barcode_text}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: '700' }}>
                    {targetBarcode.specimen_type} | {targetBarcode.volume || targetBarcode.sample_volume} {targetBarcode.volume_unit || 'mL'}
                  </span>
                  <span style={{ fontSize: '10px' }}>
                    Date: {targetBarcode.collection_date || new Date().toLocaleDateString()}
                  </span>
                  <span style={{ fontSize: '10px', color: '#444' }}>
                    Sample: {targetBarcode.sample_id || targetBarcode.id}
                  </span>
                </div>

                {targetBarcode.qr_code_base64 && (
                  <img
                    src={targetBarcode.qr_code_base64}
                    alt="QR Code"
                    style={{ width: '64px', height: '64px', border: '1px solid #000' }}
                  />
                )}
              </div>

              {targetBarcode.code128_base64 && (
                <div style={{ textAlign: 'center', marginTop: '6px' }}>
                  <img
                    src={targetBarcode.code128_base64}
                    alt="Code 128"
                    style={{ maxWidth: '100%', height: '32px' }}
                  />
                </div>
              )}
            </div>

            {/* Print & Queue Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await fetch(`${backendUrl}/api/barcode/print`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify({ barcode_id: targetBarcode.barcode_id, sample_id: targetBarcode.sample_id })
                    });
                    if (onPrintBarcode) onPrintBarcode(targetBarcode);
                    window.print();
                    setActiveModal(null);
                    fetchRegistryData();
                  } catch (err) {
                    alert("Print error: " + err.message);
                  }
                }}
                style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: '700' }}
              >
                🖨️ Print Label Now
              </button>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    await fetch(`${backendUrl}/api/barcode/print-queue/add`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify({ barcode_ids: [targetBarcode.barcode_id], copies: 1 })
                    });
                    setSuccess("Label added to Print Queue.");
                    setActiveModal(null);
                  } catch (err) {
                    alert("Queue error: " + err.message);
                  }
                }}
                style={{ flex: 1, padding: '10px', fontSize: '13px' }}
              >
                📋 Add to Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 3: REPRINT DIALOG (Requires Reason)
          ======================================================== */}
      {activeModal === 'reprint' && targetBarcode && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '460px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800' }}>Reprint Specimen Label</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Reprinting maintains the original specimen identity ({targetBarcode.barcode_value}) and logs an audit entry.
            </p>

            <form onSubmit={handleSubmitReprint} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Select Reason for Reprint *
                </label>
                <select
                  value={reprintReason}
                  onChange={(e) => setReprintReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                  required
                >
                  <option value="Label damaged">Label damaged</option>
                  <option value="Label unreadable">Label unreadable</option>
                  <option value="Printer failure">Printer failure</option>
                  <option value="Label lost">Label lost</option>
                  <option value="Incorrect label placement">Incorrect label placement</option>
                  <option value="Other">Other (require notes)</option>
                </select>
              </div>

              {reprintReason === 'Other' && (
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                    Specific Notes / Justification *
                  </label>
                  <textarea
                    value={reprintNotes}
                    onChange={(e) => setReprintNotes(e.target.value)}
                    placeholder="Provide justification for reprinting..."
                    rows="3"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                    required
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveModal(null)}
                  style={{ padding: '8px 16px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '700' }}
                >
                  Confirm & Reprint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 4: VOID DIALOG (Admin Only)
          ======================================================== */}
      {activeModal === 'void' && targetBarcode && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '460px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--accent-error)' }}>
              Void Specimen Barcode
            </h3>

            <div style={{
              padding: '12px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderRadius: 'var(--border-radius-sm)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--text-primary)',
              fontSize: '12px'
            }}>
              Are you sure you want to void barcode <strong>{targetBarcode.barcode_value}</strong>? This action will remain permanently recorded in the audit history.
            </div>

            <form onSubmit={handleSubmitVoid} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Reason for Voiding *
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Specimen contaminated, broken container, patient revoked consent..."
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveModal(null)}
                  style={{ padding: '8px 16px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: '700',
                    backgroundColor: 'var(--accent-error)',
                    borderColor: 'var(--accent-error)'
                  }}
                >
                  Confirm Void
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 5: REPLACE DIALOG (Admin Only)
          ======================================================== */}
      {activeModal === 'replace' && targetBarcode && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '460px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--accent-purple)' }}>
              Replace Barcode Label
            </h3>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              The old barcode <strong>{targetBarcode.barcode_value}</strong> will become <strong>VOIDED</strong>, and a new replacement barcode (e.g. <code>{targetBarcode.barcode_value}-R1</code>) will be issued.
            </p>

            <form onSubmit={handleSubmitReplace} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Replacement Reason *
                </label>
                <textarea
                  value={replaceReason}
                  onChange={(e) => setReplaceReason(e.target.value)}
                  placeholder="e.g. Re-labeled due to aliquot container upgrade, damaged physical tube..."
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveModal(null)}
                  style={{ padding: '8px 16px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '700' }}
                >
                  Generate Replacement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 6: STORAGE ASSIGNMENT / MOVE MODAL
          ======================================================== */}
      {activeModal === 'storage' && targetBarcode && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '500px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800' }}>
              Assign Storage: {targetBarcode.barcode_value}
            </h3>

            <form onSubmit={handleSubmitStorage} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                    Freezer Unit *
                  </label>
                  <select
                    value={storageFreezer}
                    onChange={(e) => setStorageFreezer(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                  >
                    <option value="ULT-03">ULT-03 (-80°C Freezer Wing)</option>
                    <option value="LN2-01">LN2-01 (Cryogenic Tank Yard -196°C)</option>
                    <option value="CRYO-02">CRYO-02 (Secondary Bio-Bank)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                    Rack / Shelf *
                  </label>
                  <select
                    value={storageRack}
                    onChange={(e) => setStorageRack(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                  >
                    <option value="Rack A">Rack A</option>
                    <option value="Rack B">Rack B</option>
                    <option value="Rack C">Rack C</option>
                    <option value="Shelf 1">Shelf 1</option>
                    <option value="Shelf 2">Shelf 2</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                    Box ID *
                  </label>
                  <select
                    value={storageBox}
                    onChange={(e) => setStorageBox(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                  >
                    <option value="Box 01">Box 01</option>
                    <option value="Box 02">Box 02</option>
                    <option value="Box 03">Box 03</option>
                    <option value="Box 04">Box 04</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                    Position Coordinate *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. A1, B7, F6..."
                    value={storagePosition}
                    onChange={(e) => setStoragePosition(e.target.value.toUpperCase())}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      textTransform: 'uppercase'
                    }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Location Preview
                </label>
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 'var(--border-radius-sm)',
                  fontSize: '12px',
                  color: 'var(--accent-cyan)',
                  fontWeight: '700'
                }}>
                  📍 {storageFreezer} &gt; {storageRack} &gt; {storageBox} &gt; Position {storagePosition}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveModal(null)}
                  style={{ padding: '8px 16px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '700' }}
                >
                  Confirm Storage Coordinates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 7: ALIQUOT CREATION MODAL
          ======================================================== */}
      {activeModal === 'aliquot' && targetBarcode && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '460px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--accent-purple)' }}>
              Create Aliquots from {targetBarcode.barcode_value}
            </h3>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Total parent volume available: <strong>{targetBarcode.volume || targetBarcode.sample_volume} {targetBarcode.volume_unit || 'mL'}</strong>.
            </p>

            <form onSubmit={handleSubmitAliquot} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Number of Aliquots to Create *
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={newAliquotCount}
                  onChange={(e) => setNewAliquotCount(parseInt(e.target.value, 10) || 1)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Volume per Aliquot ({targetBarcode.volume_unit || 'mL'}) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={newAliquotVol}
                  onChange={(e) => setNewAliquotVol(parseFloat(e.target.value) || 0.1)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveModal(null)}
                  style={{ padding: '8px 16px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '700' }}
                >
                  Generate Aliquot Barcodes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 8: SHIPMENT MODAL
          ======================================================== */}
      {activeModal === 'shipment' && targetBarcode && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '460px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#38bdf8' }}>
              Add Specimen to Shipment
            </h3>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Dispatches specimen <strong>{targetBarcode.barcode_value}</strong> to external repository or central biobank.
            </p>

            <form onSubmit={handleSubmitShipment} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Target Destination *
                </label>
                <select
                  value={shipmentDestination}
                  onChange={(e) => setShipmentDestination(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '12px'
                  }}
                >
                  <option value="AURA Central Biobank - LN2 Cryo Tank Yard">AURA Central Biobank - LN2 Cryo Tank Yard</option>
                  <option value="AURA Central Biobank - ULT Storage Wing">AURA Central Biobank - ULT Storage Wing</option>
                  <option value="Partner Research Center - Genomics Wing">Partner Research Center - Genomics Wing</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveModal(null)}
                  style={{ padding: '8px 16px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '700' }}
                >
                  Dispatch to Shipment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
