import React, { useState, useEffect } from 'react';

export default function ShipmentManagement({ samples, backendUrl, token, user, onShipmentAction, activeLabId, activeLabName, setActiveTab }) {
  const [shipments, setShipments] = useState([]);
  const [destination, setDestination] = useState('');
  const [selectedBarcodes, setSelectedBarcodes] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [shipments.length]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainContent = document.querySelector('aside + div');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage]);

  // Available specimens to ship (must be in status 'Collected', 'Consent Verified' or 'Barcode Generated')
  const shippableSamples = samples.filter(s => 
    s.status === 'Barcode Generated' || (s.barcode_text && s.status !== 'Shipped' && s.status !== 'Received' && s.status !== 'Stored')
  );

  const fetchShipments = async () => {
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
  };

  useEffect(() => {
    fetchShipments();
  }, [samples]);

  const handleCreateShipment = async (e) => {
    e.preventDefault();
    if (!destination || selectedBarcodes.length === 0) {
      alert("Please select a destination and at least one sample barcode.");
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/integration/shipments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          destination,
          barcodes: selectedBarcodes,
          origin_lab_id: activeLabId || 1
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to dispatch shipment');

      alert(`Shipment ${data.shipmentId} dispatched successfully with ${selectedBarcodes.length} specimens.`);
      setDestination('');
      setSelectedBarcodes([]);
      setShowCreateForm(false);
      fetchShipments();
      if (onShipmentAction) onShipmentAction();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleReceiveShipment = async (shipmentId) => {
    const confirmRec = window.confirm(`Confirm receipt check-in for shipment cargo: ${shipmentId}? All specimens in this batch will transition to 'Received' status.`);
    if (!confirmRec) return;

    try {
      const response = await fetch(`${backendUrl}/api/integration/shipments/receive/${shipmentId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to receive shipment');

      alert(`Shipment ${shipmentId} received and registered at target depot. Redirecting to Storage...`);
      fetchShipments();
      if (onShipmentAction) onShipmentAction();
      if (setActiveTab) {
        setTimeout(() => {
          setActiveTab('storage');
        }, 1500);
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleCheckboxChange = (barcode) => {
    setSelectedBarcodes(prev => 
      prev.includes(barcode) ? prev.filter(b => b !== barcode) : [...prev, barcode]
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'left' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '700' }}>Cold-Chain Shipment & Receiving Logs</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Monitor and log transportation shipments of biological sample tubes between processing laboratories.
          </p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => setShowCreateForm(!showCreateForm)}
          style={{ padding: '8px 16px', fontSize: '13px' }}
        >
          {showCreateForm ? 'View Cargo Registry' : '+ Dispatch Cargo Shipment'}
        </button>
      </div>

      {showCreateForm ? (
        /* Create Shipment Panel */
        <div className="glass-card" style={{ maxWidth: '640px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px' }}>Dispatch New Cargo Shipment</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Select verified specimens from the laboratory collection inventory, define the target destination depot, and compile the shipping cargo.
          </p>

          <form onSubmit={handleCreateShipment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="ship-destination">Destination Bio-Depot *</label>
              <select 
                id="ship-destination"
                className="form-control"
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">-- Choose Location --</option>
                <option value="ULT-03">ULT Freezer 03 (-80.4°C)</option>
                <option value="LN2-01">LN2 Tank 01 (-196.2°C)</option>
              </select>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label>Select Sample Tubes to Ship ({selectedBarcodes.length} Selected)</label>
              
              {shippableSamples.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '12px 0' }}>
                  No barcoded specimens are currently sitting in the laboratory inventory. Generate labels first!
                </div>
              ) : (
                <div style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  background: 'var(--bg-primary)',
                  padding: '8px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {shippableSamples.map(sample => (
                    <label key={sample.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 0' }}>
                      <input 
                        type="checkbox"
                        checked={selectedBarcodes.includes(sample.id)}
                        onChange={() => handleCheckboxChange(sample.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--text-primary)' }}>{sample.id}</span>
                      <span>({sample.specimen_type} &bull; Vol: {sample.sample_volume} mL &bull; Subj: {sample.subject_id})</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '10px' }} disabled={selectedBarcodes.length === 0}>
              Dispatch Cargo Batch
            </button>
          </form>
        </div>
      ) : (
        /* Shipments Directory */
        <div className="glass-card" style={{ padding: 0 }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>Loading cargo registry...</p>
          ) : shipments.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
              No transit shipments recorded in directory.
            </p>
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Shipment ID</th>
                    <th>Origin Lab</th>
                    <th>Destination Depot</th>
                    <th>Barcodes</th>
                    <th>Specimen Count</th>
                    <th>Dispatched Date</th>
                    <th>Arrival Date</th>
                    <th>Status State</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const pageSize = 10;
                    const totalPages = Math.ceil(shipments.length / pageSize);
                    const paginatedShipments = shipments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

                    return paginatedShipments.map(shp => {
                      const statusClass = shp.status === 'Received' ? 'badge-verified' : 'badge-pending';
                      const dispDate = shp.shipped_at ? new Date(shp.shipped_at).toLocaleString() : '--';
                      const arrDate = shp.received_at ? new Date(shp.received_at).toLocaleString() : 'In Transit';

                      return (
                         <tr key={shp.id}>
                          <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>{shp.id}</td>
                          <td>{shp.origin_lab_name || 'Metropolis Lab'}</td>
                          <td>{shp.destination}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--accent-teal)', maxWidth: '200px', wordBreak: 'break-all' }}>{shp.barcodes || '--'}</td>
                          <td style={{ textAlign: 'center', fontWeight: '700' }}>{shp.sample_count}</td>
                          <td>{dispDate}</td>
                          <td>{arrDate}</td>
                          <td>
                            <span className={`badge ${statusClass}`}>{shp.status}</span>
                          </td>
                          <td>
                            {shp.status === 'In Transit' && (
                              <button 
                                className="btn btn-secondary" 
                                onClick={() => handleReceiveShipment(shp.id)}
                                style={{ padding: '3px 8px', fontSize: '11px', borderColor: 'var(--accent-teal)', color: 'var(--accent-teal)' }}
                              >
                                Check-In Cargo
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>

              {/* Pagination Controls */}
              {shipments.length > 0 && (() => {
                const pageSize = 10;
                const totalPages = Math.ceil(shipments.length / pageSize);
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Showing {Math.min(shipments.length, (currentPage - 1) * pageSize + 1)} to {Math.min(shipments.length, currentPage * pageSize)} of {shipments.length} entries
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
