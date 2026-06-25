import React, { useState, useEffect } from 'react';

export default function SpecimenTypeMaster({ backendUrl, token, user }) {
  const [specimenTypes, setSpecimenTypes] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search/Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Form Modal States
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [specimenCode, setSpecimenCode] = useState('');
  const [specimenName, setSpecimenName] = useState('');
  const [category, setCategory] = useState('Blood');
  const [status, setStatus] = useState('Active');
  const [submitting, setSubmitting] = useState(false);

  const categories = [
    'Blood', 'Urine', 'Stool', 'Swab', 'Tissue',
    'Body Fluid', 'Molecular', 'Cell Therapy', 'Reproductive', 'Other'
  ];

  const fetchSpecimenTypes = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Fetch specimen types
      const res = await fetch(`${backendUrl}/api/specimen-types`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch specimen types.');
      setSpecimenTypes(data.specimen_types || []);

      // 2. Fetch recent activity audit logs
      const auditRes = await fetch(`${backendUrl}/api/audit`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const auditData = await auditRes.json();
      if (auditRes.ok) {
        // Filter logs locally for Specimen Type Master module
        const specMasterLogs = (auditData.logs || []).filter(
          log => log.module_name === 'Specimen Type Master'
        );
        setAuditLogs(specMasterLogs);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpecimenTypes();
  }, [backendUrl, token]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setSpecimenCode('');
    setSpecimenName('');
    setCategory('Blood');
    setStatus('Active');
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  const handleOpenEdit = (st) => {
    setEditingId(st.id);
    setSpecimenCode(st.specimen_code);
    setSpecimenName(st.specimen_name);
    setCategory(st.category);
    setStatus(st.status);
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  const handleToggleStatus = async (st) => {
    const updatedStatus = st.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const res = await fetch(`${backendUrl}/api/specimen-types/${st.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          specimen_code: st.specimen_code,
          specimen_name: st.specimen_name,
          category: st.category,
          status: updatedStatus
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update specimen type status.');
      setSuccess(`Specimen type "${st.specimen_name}" status updated to ${updatedStatus} successfully.`);
      fetchSpecimenTypes();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!specimenCode.trim() || !specimenName.trim() || !category) {
      setError("Please complete all required fields.");
      return;
    }

    setSubmitting(true);
    const payload = {
      specimen_code: specimenCode.trim(),
      specimen_name: specimenName.trim(),
      category: category,
      status: status
    };

    try {
      const url = editingId 
        ? `${backendUrl}/api/specimen-types/${editingId}`
        : `${backendUrl}/api/specimen-types`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save specimen type.');

      setSuccess(editingId ? "Specimen type updated successfully." : "Specimen type created successfully.");
      setShowModal(false);
      fetchSpecimenTypes();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Search/Filters logic
  const filteredTypes = specimenTypes.filter(st => {
    const matchesSearch = 
      st.specimen_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      st.specimen_code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || st.category === categoryFilter;
    const matchesStatus = statusFilter === 'All' || st.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', textAlign: 'left' }}>
      
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '700' }}>Specimen Type Master</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Maintain centralized biological specimen classifications and statuses used throughout Sample Registration, Inventories, and Analytics.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenAdd} style={{ padding: '8px 14px', fontSize: '13px' }}>
          + Add Specimen Type
        </button>
      </div>

      {/* Success/Error Banners */}
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

      {error && !showModal && (
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

      {/* Filters */}
      <div className="glass-card" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px 20px' }}>
        <div style={{ flex: 2, minWidth: '220px' }}>
          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Search</label>
          <input 
            type="text" 
            className="form-control"
            placeholder="Search specimen type or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Filter Category</label>
          <select 
            className="form-control"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Filter Status</label>
          <select 
            className="form-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="glass-card" style={{ padding: 0 }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '14px' }}>
            Loading specimen types...
          </p>
        ) : filteredTypes.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '14px' }}>
            No specimen master records match the active filters.
          </p>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Specimen Code</th>
                  <th>Specimen Name</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTypes.map(st => (
                  <tr key={st.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>{st.specimen_code}</td>
                    <td style={{ fontWeight: '600' }}>{st.specimen_name}</td>
                    <td>
                      <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                        {st.category}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${st.status === 'Active' ? 'badge-verified' : 'badge-rejected'}`}>
                        {st.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleOpenEdit(st)}
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => handleToggleStatus(st)}
                          style={{ 
                            padding: '4px 8px', 
                            fontSize: '11px', 
                            borderColor: st.status === 'Active' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)',
                            color: st.status === 'Active' ? 'var(--accent-error)' : 'var(--accent-success)'
                          }}
                        >
                          {st.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Logs Section */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          Specimen Type Master Audit History
        </h3>
        {auditLogs.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No auditable actions logged in this module yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '200px', overflowY: 'auto' }}>
            {auditLogs.slice(0, 10).map((log, index) => (
              <div 
                key={log.activity_id || index} 
                style={{ 
                  fontSize: '12px', 
                  borderBottom: '1px solid rgba(255,255,255,0.02)', 
                  paddingBottom: '8px',
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <span style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>[{log.action_type}]</span>{' '}
                  <span style={{ color: 'var(--text-primary)' }}>{log.new_value}</span>
                </div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                  by <strong>{log.user_name}</strong> ({log.role}) &bull; {new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '500px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius-md)',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {editingId ? 'Edit Specimen Type' : 'Add Specimen Type'}
              </h2>
              <button 
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '22px',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            {error && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--border-radius-sm)',
                padding: '10px 12px',
                color: 'var(--accent-error)',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                ✕ {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label htmlFor="spec-code">Specimen Code *</label>
                <input 
                  type="text" 
                  id="spec-code"
                  className="form-control"
                  placeholder="e.g. BLD, SER, PLA"
                  required
                  disabled={!!editingId}
                  value={specimenCode}
                  onChange={(e) => setSpecimenCode(e.target.value)}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="spec-name">Specimen Name *</label>
                <input 
                  type="text" 
                  id="spec-name"
                  className="form-control"
                  placeholder="e.g. Buffy Coat, Urine, Fresh Tissue"
                  required
                  value={specimenName}
                  onChange={(e) => setSpecimenName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="spec-category">Category *</label>
                <select 
                  id="spec-category"
                  className="form-control"
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="spec-status">Status</label>
                <select 
                  id="spec-status"
                  className="form-control"
                  required
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : 'Save Specimen Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
