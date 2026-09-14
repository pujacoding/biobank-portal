import React, { useState, useEffect } from 'react';

export default function Dashboard({ samples, globalTotal, setActiveTab, user, activeLabId, activeLabName, backendUrl, token }) {
  const [stats, setStats] = useState({
    totalSamples: 0,
    todayCollection: 0,
    storedSamples: 0,
    releasedSamples: 0,
    disposedSamples: 0,
    availableStorage: 0,
    totalCapacity: 0,
    researchProjects: 0,
    tempAlerts: 0
  });
  const [loading, setLoading] = useState(true);

  // Compute local today string for display fallback
  const todayStr = new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    const fetchDashboardStats = async () => {
      if (!token || !backendUrl) return;
      try {
        const activeLab = sessionStorage.getItem('aura_active_lab_id') || localStorage.getItem('aura_active_lab_id') || activeLabId;
        const response = await fetch(`${backendUrl}/api/samples/dashboard-stats`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
          }
        });
        const data = await response.json();
        if (response.ok && data.success) {
          setStats(data.stats);
        }
      } catch (err) {
        console.error("Error fetching dashboard statistics:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardStats();
  }, [backendUrl, token, samples, activeLabId]);

  // Last 5 samples for the recent registrations table
  const recentSamples = samples.slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', letterSpacing: '-0.02em' }}>
          Welcome back, <span className="title-gradient">{user.name}</span>
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Ingestion overview for <strong style={{ color: 'var(--text-primary)' }}>{activeLabName || user.lab_name || (user?.role === 'Super Admin' ? 'Global Biobank Network' : 'Personal Workspace')}</strong> &bull; {user.lab_location || (activeLabName || user.lab_name ? 'Central Facility' : 'Demo Workspace')}
        </p>
      </div>

      {/* Telemetry Metrics Grid (8 Cards) */}
      <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        
        {/* 1. Total Samples */}
        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px' }}>
          <div style={{
            background: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-cyan)'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px' }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Samples</span>
            <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>{stats.totalSamples}</h3>
          </div>
        </div>

        {/* 2. Today's Collection */}
        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px' }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-success)'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today's Collection</span>
            <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>{stats.todayCollection}</h3>
          </div>
        </div>

        {/* 3. Stored Samples */}
        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px' }}>
          <div style={{
            background: 'rgba(20, 184, 166, 0.08)',
            border: '1px solid rgba(20, 184, 166, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#14b8a6'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px' }}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stored Samples</span>
            <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>{stats.storedSamples}</h3>
          </div>
        </div>

        {/* 4. Released Samples */}
        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px' }}>
          <div style={{
            background: 'rgba(168, 85, 247, 0.08)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-purple)'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px' }}>
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Released Samples</span>
            <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>{stats.releasedSamples}</h3>
          </div>
        </div>

        {/* 5. Disposed Samples */}
        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px' }}>
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-error)'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px' }}>
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Disposed Samples</span>
            <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>{stats.disposedSamples}</h3>
          </div>
        </div>

        {/* 6. Available Storage */}
        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px' }}>
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3b82f6'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px' }}>
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available Storage</span>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>
              {stats.availableStorage}
              {stats.totalCapacity ? (
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}> / {stats.totalCapacity}</span>
              ) : (
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}> / 0</span>
              )}
            </h3>
          </div>
        </div>

        {/* 7. Research Projects */}
        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px' }}>
          <div style={{
            background: 'rgba(244, 63, 94, 0.08)',
            border: '1px solid rgba(244, 63, 94, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f43f5e'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px' }}>
              <path d="M2 22h20"/>
              <path d="M7 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17"/>
              <line x1="12" y1="11" x2="12" y2="11.01"/>
              <line x1="12" y1="16" x2="12" y2="16.01"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Research Projects</span>
            <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '2px' }}>{stats.researchProjects}</h3>
          </div>
        </div>

        {/* 8. Temperature Alerts */}
        <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px' }}>
          <div style={{
            background: stats.tempAlerts > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
            border: stats.tempAlerts > 0 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 'var(--border-radius-md)',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: stats.tempAlerts > 0 ? 'var(--accent-error)' : 'var(--accent-success)'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px' }}>
              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Temp Alerts</span>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: stats.tempAlerts > 0 ? 'var(--accent-error)' : 'var(--accent-success)', marginTop: '4px' }}>
              {stats.tempAlerts > 0 ? `${stats.tempAlerts} Active` : '0 Alerts (OK)'}
            </h3>
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
                  if (sample.consent_status === 'Withdrawn') badgeClass = 'badge-rejected';

                  let statusBadge = 'badge-info';
                  if (sample.status === 'Consent Verified') statusBadge = 'badge-pending';
                  if (sample.status === 'Barcode Generated') statusBadge = 'badge-verified';
                  if (sample.status === 'Disposed') statusBadge = 'badge-rejected';

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

