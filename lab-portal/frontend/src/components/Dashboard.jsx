import React from 'react';

export default function Dashboard({ samples, globalTotal, setActiveTab, user }) {
  // Compute metrics
  const todayStr = new Date().toLocaleDateString('en-CA');
  
  const totalSamplesToday = samples.filter(s => s.collection_date === todayStr).length;
  
  // Pending Barcode: Consent is Verified, but barcode not generated yet (status === 'Consent Verified')
  const pendingBarcode = samples.filter(s => s.status === 'Consent Verified').length;
  
  // Pending Shipments: Barcode is generated (ready for shipping), but shipment not finalized (status === 'Barcode Generated')
  const pendingShipments = samples.filter(s => s.status === 'Barcode Generated').length;
  
  const totalSamples = globalTotal || samples.length;

  // Last 5 samples
  const recentSamples = samples.slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', letterSpacing: '-0.02em' }}>
          Welcome back, <span className="title-gradient">{user.name}</span>
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Ingestion overview for <strong style={{ color: 'var(--text-primary)' }}>{user.lab_name}</strong> &bull; {user.lab_location}
        </p>
      </div>

      {/* Telemetry Metrics Grid */}
      <div className="dashboard-grid">
        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{
            background: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-cyan)'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '22px', height: '22px' }}>
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Collected Today</span>
            <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>{totalSamplesToday}</h3>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-warning)'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '22px', height: '22px' }}>
              <path d="M4 7V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M4 14h16M4 17h16M20 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3M4 7h16v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Barcode</span>
            <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>{pendingBarcode}</h3>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{
            background: 'rgba(168, 85, 247, 0.08)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-purple)'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '22px', height: '22px' }}>
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Shipments</span>
            <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>{pendingShipments}</h3>
          </div>
        </div>

        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-success)'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '22px', height: '22px' }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Ingested</span>
            <h3 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>{totalSamples}</h3>
          </div>
        </div>
      </div>

      {/* Quick Action Panel */}
      <div className="glass-card" style={{ textAlign: 'left' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Portal Operation Shortcuts</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <button 
            className="btn btn-primary" 
            onClick={() => setActiveTab('register')}
            style={{ padding: '16px 20px', borderRadius: 'var(--border-radius-md)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New Sample Ingestion
          </button>
          
          <button 
            className="btn btn-secondary" 
            onClick={() => setActiveTab('samples')}
            style={{ padding: '16px 20px', borderRadius: 'var(--border-radius-md)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            View Sample Registry
          </button>

          <button 
            className="btn btn-secondary" 
            onClick={() => setActiveTab('barcode')}
            style={{ padding: '16px 20px', borderRadius: 'var(--border-radius-md)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
            </svg>
            Generate Barcode Labels
          </button>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="glass-card" style={{ textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Recent Specimen Registrations</h3>
          <button 
            onClick={() => setActiveTab('samples')}
            style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
          >
            View All →
          </button>
        </div>

        {recentSamples.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px 0', fontSize: '13px' }}>
            No specimens registered yet. Click "New Sample Ingestion" to start.
          </p>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Sample ID</th>
                  <th>Subject ID</th>
                  <th>Specimen Type</th>
                  <th>Volume</th>
                  <th>Date & Time</th>
                  <th>Consent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentSamples.map(sample => {
                  let badgeClass = 'badge-pending';
                  if (sample.consent_status === 'Verified') badgeClass = 'badge-verified';
                  if (sample.consent_status === 'Rejected') badgeClass = 'badge-rejected';

                  let statusBadge = 'badge-info';
                  if (sample.status === 'Consent Verified') statusBadge = 'badge-pending';
                  if (sample.status === 'Barcode Generated') statusBadge = 'badge-verified';

                  return (
                    <tr key={sample.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>{sample.id}</td>
                      <td style={{ fontFamily: 'monospace' }}>{sample.subject_id}</td>
                      <td>
                        <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                          {sample.specimen_type}
                        </span>
                      </td>
                      <td>{sample.sample_volume} mL</td>
                      <td>{sample.collection_date} {sample.collection_time}</td>
                      <td>
                        <span className={`badge ${badgeClass}`}>
                          {sample.consent_status || 'Missing'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${statusBadge}`}>
                          {sample.status}
                        </span>
                      </td>
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
