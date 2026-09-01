import React, { useState, useEffect } from 'react';

export default function AuditTrail({ backendUrl, token, user, activeLabId, activeLabName, setActiveTab }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterAction]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainContent = document.querySelector('aside + div');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage]);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const activeLab = sessionStorage.getItem('aura_active_lab_id') || localStorage.getItem('aura_active_lab_id');
      const response = await fetch(`${backendUrl}/api/audit`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
        }
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch audit logs');
      }

      setLogs(data.logs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user.role === 'Lab Admin' || user.role === 'Super Admin') {
      fetchLogs();
    }
  }, [backendUrl, token, user, activeLabId]);

  if (user.role !== 'Lab Admin' && user.role !== 'Super Admin') {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-error)" strokeWidth="2" style={{ width: '48px', height: '48px', marginBottom: '16px' }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <h3 style={{ fontSize: '18px', color: 'var(--accent-error)', fontWeight: '700' }}>Access Denied</h3>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px', maxWidth: '420px', margin: '8px auto 0' }}>
          The compliance Audit Trail is restricted. Only accounts holding the <strong>Lab Admin</strong> or <strong>Super Admin</strong> role are authorized to view security logs.
        </p>
      </div>
    );
  }

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.user_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.role || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.new_value || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.module_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesAction = filterAction === 'All' || log.action_type === filterAction;

    return matchesSearch && matchesAction;
  });

  // Get unique actions for filter select
  const uniqueActions = ['All', ...new Set(logs.map(l => l.action_type))];

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
          <h1 style={{ fontSize: '26px', fontWeight: '700' }}>Compliance Audit Trail</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            chronological ledger tracking operator logins, sample registrations, consent uploads, and barcode label mapping.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchLogs} disabled={loading} style={{ padding: '8px 14px', fontSize: '13px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '13px', height: '13px', marginRight: '4px' }}>
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          Refresh Logs
        </button>
      </div>

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

      {/* Filter and Search Panel */}
      <div className="glass-card" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px 20px' }}>
        <div style={{ flex: 2, minWidth: '240px' }}>
          <input 
            type="text" 
            className="form-control"
            placeholder="Search logs by username, details, role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <select 
            className="form-control"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
          >
            {uniqueActions.map(action => (
              <option key={action} value={action}>{action === 'All' ? 'All Actions' : action}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="glass-card" style={{ padding: 0 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '14px' }}>
            Loading audit trails...
          </p>
        ) : filteredLogs.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '14px' }}>
            No matching audit logs found.
          </p>
        ) : (() => {
          const pageSize = 10;
          const totalPages = Math.ceil(filteredLogs.length / pageSize);
          const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

          return (
            <>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Operator</th>
                      <th>Role</th>
                      <th>Action</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLogs.map(log => {
                      const localTime = new Date(log.timestamp).toLocaleString();
                      let actionBadge = 'badge-info';
                      if (log.action_type === 'User Login') actionBadge = 'badge-verified';
                      if (log.action_type === 'Consent Submission') actionBadge = 'badge-pending';
                      if (log.action_type === 'Consent Verification') actionBadge = 'badge-verified';
                      if (log.action_type === 'Barcode Generation') actionBadge = 'badge-verified';
                      
                      return (
                        <tr key={log.id}>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {localTime}
                          </td>
                          <td style={{ fontWeight: '600' }}>{log.user_name}</td>
                          <td>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                              {log.role}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${actionBadge}`}>
                              {log.action_type}
                            </span>
                          </td>
                          <td style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', wordBreak: 'break-word' }}>
                            {log.new_value}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Showing {Math.min(filteredLogs.length, (currentPage - 1) * pageSize + 1)} to {Math.min(filteredLogs.length, currentPage * pageSize)} of {filteredLogs.length} entries
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
            </>
          );
        })()}
      </div>
    </div>
  );
}
