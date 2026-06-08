import React, { useState, useEffect } from 'react';

export default function UserManagement({ backendUrl, token, user: currentUser, setActiveTab, activeLabId, activeLabName }) {
  // Directory & Tab state
  const [activeSubTab, setActiveSubTab] = useState('users'); // 'users' or 'labs'
  const [users, setUsers] = useState([]);
  const [labs, setLabs] = useState([]);
  const [roles, setRoles] = useState([]);
  const [locations, setLocations] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [rolePermissions, setRolePermissions] = useState([]); // Default role mappings

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search/Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, statusFilter]);

  // Modals state
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showLabModal, setShowLabModal] = useState(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [userHistory, setUserHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // User Form fields (Sections A - F)
  const [editingUserId, setEditingUserId] = useState(null);
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [designation, setDesignation] = useState('');
  const [assignedLabId, setAssignedLabId] = useState('');
  const [allowedLocations, setAllowedLocations] = useState([]); // Array of location IDs
  const [selectedLocationId, setSelectedLocationId] = useState(''); // Selected sub-unit location ID
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [customPermissions, setCustomPermissions] = useState([]); // Array of permission IDs
  const [accountStatus, setAccountStatus] = useState('Active');
  const [password, setPassword] = useState('');

  // Lab Form fields
  const [newLabName, setNewLabName] = useState('');
  const [newLabAddress, setNewLabAddress] = useState('');
  const [editingLabId, setEditingLabId] = useState(null);
  const [hasSubunits, setHasSubunits] = useState(false);
  const [subunitInputs, setSubunitInputs] = useState([]);

  // Consent Templates Form fields & states
  const [consentTemplates, setConsentTemplates] = useState([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [templatePurpose, setTemplatePurpose] = useState('');
  const [templateAllows, setTemplateAllows] = useState('');
  const [templateRestrictions, setTemplateRestrictions] = useState('');
  const [templateDetails, setTemplateDetails] = useState('');
  const [templateVersion, setTemplateVersion] = useState('v1.0');
  const [templateEffectiveDate, setTemplateEffectiveDate] = useState('');
  const [templateStatus, setTemplateStatus] = useState('Active');

  const isSuperAdmin = currentUser.role === 'Super Admin';
  const isAdmin = currentUser.role === 'Lab Admin' || isSuperAdmin;

  // Fetch initial selectors and users/labs directories
  const loadDirectoryData = async () => {
    setLoading(true);
    setError('');
    try {
      const activeLab = localStorage.getItem('aura_active_lab_id');
      const customHeaders = {
        'Authorization': `Bearer ${token}`,
        ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
      };

      // 1. Fetch metadata selectors
      const metaRes = await fetch(`${backendUrl}/api/users/metadata`, {
        headers: customHeaders
      });
      const metaData = await metaRes.json();
      if (!metaRes.ok) throw new Error(metaData.error || 'Failed to retrieve selector metadata');
      
      setRoles(metaData.roles || []);
      setLocations(metaData.locations || []);
      setPermissions(metaData.permissions || []);
      setRolePermissions(metaData.rolePermissions || []);

      // 2. Fetch users directory
      const usersRes = await fetch(`${backendUrl}/api/users`, {
        headers: customHeaders
      });
      const usersData = await usersRes.json();
      if (!usersRes.ok) throw new Error(usersData.error || 'Failed to retrieve users directory');
      setUsers(usersData.users || []);

      // 3. Fetch laboratories (always load if Super Admin)
      const labsRes = await fetch(`${backendUrl}/api/users/labs`, {
        headers: customHeaders
      });
      const labsData = await labsRes.json();
      if (labsRes.ok) {
        setLabs(labsData.labs || []);
      }

      // 4. Fetch Consent templates if Super Admin
      if (isSuperAdmin) {
        const ctRes = await fetch(`${backendUrl}/api/consent/templates/all`, {
          headers: customHeaders
        });
        const ctData = await ctRes.json();
        if (ctRes.ok) {
          setConsentTemplates(ctData.templates || []);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectoryData();
  }, [backendUrl, token, activeLabId]);

  // Deny access if not Admin or Super Admin
  if (!isAdmin) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-error)" strokeWidth="2" style={{ width: '48px', height: '48px', marginBottom: '16px' }}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <h3 style={{ fontSize: '18px', color: 'var(--accent-error)', fontWeight: '700' }}>Access Denied</h3>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px', maxWidth: '420px', margin: '8px auto 0' }}>
          The User Management interface is restricted. Only accounts holding the <strong>Lab Admin</strong> or <strong>Super Admin</strong> role are authorized to manage user directories.
        </p>
      </div>
    );
  }

  // Handle Role Selection change to autocheck Section E Action Permissions based on Default Matrix
  const handleRoleChange = (roleIdVal) => {
    setSelectedRoleId(roleIdVal);
    if (!roleIdVal) {
      setCustomPermissions([]);
      return;
    }
    const defaultIds = rolePermissions
      .filter(rp => parseInt(rp.role_id, 10) === parseInt(roleIdVal, 10))
      .map(rp => rp.permission_id);
    setCustomPermissions(defaultIds);
  };

  // Toggle dynamic permissions checkboxes
  const handlePermissionToggle = (permId) => {
    setCustomPermissions(prev => 
      prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
    );
  };

  // Toggle locations multi-select checkpoints
  const handleLocationToggle = (locId) => {
    setAllowedLocations(prev =>
      prev.includes(locId) ? prev.filter(id => id !== locId) : [...prev, locId]
    );
  };

  // Open Form Modal to create user
  const handleOpenAddUser = () => {
    setEditingUserId(null);
    setFullName('');
    setPhoneNumber('');
    setEmailAddress('');
    setEmployeeId('');
    setDesignation('');
    
    // Autofill Lab Assignment if Lab Admin
    if (!isSuperAdmin) {
      setAssignedLabId(currentUser.lab_id || '');
    } else {
      setAssignedLabId('');
    }
    
    setAllowedLocations([]);
    setSelectedLocationId('');
    setSelectedRoleId('');
    setCustomPermissions([]);
    setAccountStatus('Active');
    setPassword('');
    setError('');
    setSuccess('');
    setShowFormModal(true);
  };

  // Open Form Modal to edit user
  const handleOpenEditUser = (u) => {
    setEditingUserId(u.id);
    setFullName(u.full_name || u.name);
    setPhoneNumber(u.phone_number);
    setEmailAddress(u.email);
    setEmployeeId(u.employee_id || '');
    setDesignation(u.designation || '');
    setAssignedLabId(u.lab_id || '');
    setAllowedLocations(u.locations || []);
    setSelectedLocationId(u.locations && u.locations.length > 0 ? u.locations[0] : '');
    setSelectedRoleId(u.role_id || '');
    setCustomPermissions(u.permissions || []);
    setAccountStatus(u.status);
    setPassword('');
    setError('');
    setSuccess('');
    setShowFormModal(true);
  };

  // Submit User form (Create / Edit)
  const handleUserFormSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fullName.trim() || !phoneNumber.trim() || !emailAddress.trim() || !selectedRoleId) {
      setError("Please complete all required Basic Information and Role parameters.");
      return;
    }



    const payload = {
      full_name: fullName.trim(),
      phone_number: phoneNumber.trim(),
      email: emailAddress.trim(),
      employee_id: employeeId.trim() || null,
      designation: designation.trim() || null,
      role_id: parseInt(selectedRoleId, 10),
      lab_id: assignedLabId ? parseInt(assignedLabId, 10) : null,
      status: accountStatus,
      locations: selectedLocationId ? [parseInt(selectedLocationId, 10)] : [],
      permissions: customPermissions,
      password: password.trim() || null
    };

    try {
      const url = editingUserId 
        ? `${backendUrl}/api/users/${editingUserId}` 
        : `${backendUrl}/api/users`;
      
      const method = editingUserId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save staff profile record');

      setSuccess(editingUserId ? "User profile edited and audit-logged successfully." : "New user created and audit-logged successfully.");
      setShowFormModal(false);
      loadDirectoryData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Quick Action: Status Change direct update
  const handleUpdateStatus = async (u, targetStatus) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${backendUrl}/api/users/${u.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: targetStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user status');

      setSuccess(`User status updated to ${targetStatus} successfully.`);
      if (selectedUser && selectedUser.id === u.id) {
        setSelectedUser({ ...selectedUser, status: targetStatus });
      }
      loadDirectoryData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Quick Action: Reset Access Credentials invitation
  const handleResetAccess = async (u) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${backendUrl}/api/users/${u.id}/reset-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset access credentials');

      setSuccess("Bypass key invitation sent and audit logged successfully.");
    } catch (err) {
      setError(err.message);
    }
  };

  // Open Details Modal
  const handleViewDetails = (u) => {
    setSelectedUser(u);
    setShowDetailsModal(true);
  };

  // Open History Timeline Modal
  const handleViewHistory = async (u) => {
    setSelectedUser(u);
    setUserHistory([]);
    setLoadingHistory(true);
    setShowHistoryModal(true);
    try {
      const res = await fetch(`${backendUrl}/api/users/${u.id}/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to retrieve profile audits');
      setUserHistory(data.history || []);
    } catch (err) {
      alert("History Tracing Error: " + err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenAddLab = () => {
    setEditingLabId(null);
    setNewLabName('');
    setNewLabAddress('');
    setHasSubunits(false);
    setSubunitInputs([]);
    setError('');
    setSuccess('');
    setShowLabModal(true);
  };

  const handleOpenEditLab = async (l) => {
    setEditingLabId(l.id);
    setNewLabName(l.name);
    setNewLabAddress(l.location_address);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${backendUrl}/api/users/labs/${l.id}/subunits`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.subunits && data.subunits.length > 0) {
        setHasSubunits(true);
        setSubunitInputs(data.subunits.map(sub => ({
          location_id: sub.location_id,
          location_name: sub.location_name
        })));
      } else {
        setHasSubunits(false);
        setSubunitInputs([]);
      }
    } catch (err) {
      console.error("Failed to load subunits:", err);
      setHasSubunits(false);
      setSubunitInputs([]);
    }
    setShowLabModal(true);
  };

  const handleDeleteLab = async (labId, labName) => {
    if (!window.confirm(`Are you sure you want to delete the laboratory "${labName}"? All associated sub-units and user assignments will be permanently removed.`)) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${backendUrl}/api/users/labs/${labId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete laboratory');

      setSuccess(`Laboratory "${labName}" deleted successfully.`);
      loadDirectoryData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Super Admin Action: Create / Edit Lab
  const handleLabSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!newLabName.trim() || !newLabAddress.trim()) {
      setError("Please complete all lab parameters.");
      return;
    }

    const validSubunits = hasSubunits
      ? subunitInputs
          .map(item => ({ ...item, location_name: item.location_name.trim() }))
          .filter(item => item.location_name.length > 0)
      : [];

    if (hasSubunits && validSubunits.length === 0) {
      setError("Please configure at least one sub-unit location if 'Has sub-units' is checked.");
      return;
    }

    const payload = {
      name: newLabName.trim(),
      location_address: newLabAddress.trim(),
      has_subunits: hasSubunits,
      sub_units: validSubunits
    };

    try {
      const url = editingLabId 
        ? `${backendUrl}/api/users/labs/${editingLabId}` 
        : `${backendUrl}/api/users/labs`;
      const method = editingLabId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save laboratory record');

      setSuccess(editingLabId ? `Laboratory "${newLabName}" updated successfully.` : `Laboratory "${newLabName}" created successfully.`);
      setNewLabName('');
      setNewLabAddress('');
      setHasSubunits(false);
      setSubunitInputs([]);
      setEditingLabId(null);
      setShowLabModal(false);
      loadDirectoryData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Consent Template CRUD Handlers
  const handleOpenAddTemplate = () => {
    setEditingTemplateId(null);
    setTemplateName('');
    setTemplateCode('');
    setTemplatePurpose('');
    setTemplateAllows('');
    setTemplateRestrictions('');
    setTemplateDetails('');
    setTemplateVersion('v1.0');
    setTemplateEffectiveDate(new Date().toLocaleDateString('en-CA'));
    setTemplateStatus('Active');
    setError('');
    setShowTemplateModal(true);
  };

  const handleOpenEditTemplate = (t) => {
    setEditingTemplateId(t.template_id);
    setTemplateName(t.consent_name);
    setTemplateCode(t.consent_code);
    setTemplateVersion(t.version);
    setTemplateEffectiveDate(t.effective_date);
    setTemplateStatus(t.status);
    setTemplateDetails(t.consent_details);

    try {
      const summaryObj = JSON.parse(t.consent_summary);
      setTemplatePurpose(summaryObj.purpose || '');
      setTemplateAllows(summaryObj.allows ? summaryObj.allows.join('\n') : '');
      setTemplateRestrictions(summaryObj.restrictions ? summaryObj.restrictions.join('\n') : '');
    } catch (e) {
      setTemplatePurpose(t.consent_summary);
      setTemplateAllows('');
      setTemplateRestrictions('');
    }

    setError('');
    setShowTemplateModal(true);
  };

  const handleToggleTemplateStatus = async (t) => {
    const updatedStatus = t.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const res = await fetch(`${backendUrl}/api/consent/templates/${t.template_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: t.consent_name,
          code: t.consent_code,
          version: t.version,
          effective_date: t.effective_date,
          status: updatedStatus,
          details: t.consent_details,
          summary: t.consent_summary
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update template status');

      setSuccess(`Consent template "${t.consent_name}" status updated to ${updatedStatus}.`);
      loadDirectoryData();
    } catch (err) {
      alert(`Error toggling template status: ${err.message}`);
    }
  };

  const handleTemplateSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!templateName.trim() || !templateCode.trim() || !templatePurpose.trim() || !templateDetails.trim() || !templateVersion.trim()) {
      setError("Please complete all required fields for the template.");
      return;
    }

    const summaryObj = {
      purpose: templatePurpose.trim(),
      allows: templateAllows.split('\n').map(x => x.trim()).filter(Boolean),
      restrictions: templateRestrictions.split('\n').map(x => x.trim()).filter(Boolean)
    };

    const payload = {
      name: templateName.trim(),
      code: templateCode.trim().toUpperCase(),
      summary: JSON.stringify(summaryObj),
      details: templateDetails.trim(),
      version: templateVersion.trim(),
      effective_date: templateEffectiveDate || new Date().toLocaleDateString('en-CA'),
      status: templateStatus
    };

    const url = editingTemplateId 
      ? `${backendUrl}/api/consent/templates/${editingTemplateId}`
      : `${backendUrl}/api/consent/templates`;
    const method = editingTemplateId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save template record');

      setSuccess(editingTemplateId ? `Consent template "${templateName}" updated successfully.` : `Consent template "${templateName}" created successfully.`);
      setShowTemplateModal(false);
      loadDirectoryData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Search and filter mappings
  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.employee_id && u.employee_id.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesRole = roleFilter === 'All' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'All' || u.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

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

      {/* Directory Title Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '700' }}>Compliance User Directory</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Enterprise-grade User Profile Directory, role-based action permissions, and lifecycle auditable records.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          {isSuperAdmin && activeSubTab === 'labs' && (
            <button 
              className="btn btn-secondary" 
              onClick={handleOpenAddLab} 
              style={{ padding: '8px 14px', fontSize: '13px', borderColor: 'var(--accent-purple)', color: 'var(--accent-purple)' }}
            >
              + Create Laboratory
            </button>
          )}
          {isSuperAdmin && activeSubTab === 'consents' && (
            <button 
              className="btn btn-secondary" 
              onClick={handleOpenAddTemplate} 
              style={{ padding: '8px 14px', fontSize: '13px', borderColor: 'var(--accent-purple)', color: 'var(--accent-purple)' }}
            >
              + Create Consent Template
            </button>
          )}
          {activeSubTab === 'users' && (
            <button className="btn btn-primary" onClick={handleOpenAddUser} style={{ padding: '8px 14px', fontSize: '13px' }}>
              + Create New User
            </button>
          )}
        </div>
      </div>

      {/* Sub tabs mapping (If Super Admin, allow lab directory view) */}
      {isSuperAdmin && (
        <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          <button 
            style={{
              padding: '6px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'users' ? '2px solid var(--accent-cyan)' : 'none',
              color: activeSubTab === 'users' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: '700',
              cursor: 'pointer'
            }}
            onClick={() => setActiveSubTab('users')}
          >
            User Profiles List
          </button>
          <button 
            style={{
              padding: '6px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'labs' ? '2px solid var(--accent-cyan)' : 'none',
              color: activeSubTab === 'labs' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: '700',
              cursor: 'pointer'
            }}
            onClick={() => setActiveSubTab('labs')}
          >
            Laboratories Directory ({labs.length})
          </button>
          <button 
            style={{
              padding: '6px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeSubTab === 'consents' ? '2px solid var(--accent-cyan)' : 'none',
              color: activeSubTab === 'consents' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: '700',
              cursor: 'pointer'
            }}
            onClick={() => setActiveSubTab('consents')}
          >
            Consent Templates ({consentTemplates.length})
          </button>
        </div>
      )}

      {/* Success alert message banner */}
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

      {/* Error alert message banner */}
      {error && !showFormModal && (
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

      {activeSubTab === 'users' ? (
        <>
          {/* Filters Toolbar */}
          <div className="glass-card" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px 20px' }}>
            <div style={{ flex: 2, minWidth: '220px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Search</label>
              <input 
                type="text" 
                className="form-control"
                placeholder="Search name, email, employee ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Filter Role</label>
              <select 
                className="form-control"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="All">All Roles</option>
                {roles.map(r => (
                  <option key={r.role_id} value={r.role_name}>{r.role_name}</option>
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
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* User profiles Grid table list */}
          <div className="glass-card" style={{ padding: 0 }}>
            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '14px' }}>
                Loading profiles ledger...
              </p>
            ) : filteredUsers.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '14px' }}>
                No clinical user records matching current filters.
              </p>
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Full Name</th>
                      <th>Email Address</th>
                      <th>Role</th>
                      <th>Assigned Laboratory</th>
                      <th>Account Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const pageSize = 10;
                      const totalPages = Math.ceil(filteredUsers.length / pageSize);
                      const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

                      return paginatedUsers.map(u => {
                        let badgeClass = 'badge-verified';
                        if (u.status === 'Inactive') badgeClass = 'badge-pending';
                        if (u.status === 'Suspended') badgeClass = 'badge-rejected';

                        return (
                          <tr key={u.id}>
                            <td style={{ fontWeight: '600' }}>
                              {u.full_name || u.name}
                              {u.id === currentUser.id && (
                                <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', marginLeft: '6px' }}>(You)</span>
                              )}
                            </td>
                            <td style={{ fontFamily: 'monospace' }}>{u.email}</td>
                            <td>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase' }}>
                                {u.role}
                              </span>
                            </td>
                            <td>{u.lab_name || 'System Administrator'}</td>
                            <td>
                              <span className={`badge ${badgeClass}`}>{u.status}</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  className="btn btn-secondary" 
                                  onClick={() => handleViewDetails(u)} 
                                  style={{ padding: '3px 8px', fontSize: '11px' }}
                                >
                                  View details
                                </button>
                                <button 
                                  className="btn btn-secondary" 
                                  onClick={() => handleOpenEditUser(u)} 
                                  style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)' }}
                                >
                                  Edit
                                </button>
                                <button 
                                  className="btn btn-secondary" 
                                  onClick={() => handleViewHistory(u)} 
                                  style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--accent-purple)', borderColor: 'var(--accent-purple)' }}
                                >
                                  History
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                {filteredUsers.length > 0 && (() => {
                  const pageSize = 10;
                  const totalPages = Math.ceil(filteredUsers.length / pageSize);
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Showing {Math.min(filteredUsers.length, (currentPage - 1) * pageSize + 1)} to {Math.min(filteredUsers.length, currentPage * pageSize)} of {filteredUsers.length} entries
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
        </>
      ) : activeSubTab === 'labs' ? (
        /* Lab List Directory (Super Admin Only) */
        <div className="glass-card" style={{ padding: 0 }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '14px' }}>
              Loading laboratories...
            </p>
          ) : labs.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '14px' }}>
              No laboratories configured. Click Create Laboratory to add one.
            </p>
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Lab Name</th>
                    <th>Location Address</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {labs.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: '700' }}>{l.name}</td>
                      <td>{l.location_address}</td>
                      <td>
                        <span className={`badge ${l.status === 'Active' ? 'badge-verified' : 'badge-rejected'}`}>{l.status}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => handleOpenEditLab(l)} 
                            style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)' }}
                          >
                            Edit
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => handleDeleteLab(l.id, l.name)} 
                            style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--accent-error)', borderColor: 'var(--accent-error)' }}
                          >
                            Delete
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
      ) : (
        /* Consent Templates List (Super Admin Only) */
        <div className="glass-card" style={{ padding: 0 }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '14px' }}>
              Loading consent templates...
            </p>
          ) : consentTemplates.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px 0', fontSize: '14px' }}>
              No consent templates configured. Click Create Consent Template to add one.
            </p>
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Template Name</th>
                    <th>Code</th>
                    <th>Version</th>
                    <th>Effective Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {consentTemplates.map(t => (
                    <tr key={t.template_id}>
                      <td style={{ fontWeight: '700' }}>{t.consent_name}</td>
                      <td style={{ fontFamily: 'monospace' }}>{t.consent_code}</td>
                      <td>{t.version}</td>
                      <td>{t.effective_date}</td>
                      <td>
                        <span className={`badge ${t.status === 'Active' ? 'badge-verified' : 'badge-rejected'}`}>{t.status}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => handleOpenEditTemplate(t)} 
                            style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)' }}
                          >
                            Edit / View
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            onClick={() => handleToggleTemplateStatus(t)} 
                            style={{ 
                              padding: '3px 8px', 
                              fontSize: '11px', 
                              color: t.status === 'Active' ? 'var(--accent-error)' : 'var(--accent-success)', 
                              borderColor: t.status === 'Active' ? 'var(--accent-error)' : 'var(--accent-success)' 
                            }}
                          >
                            {t.status === 'Active' ? 'Deactivate' : 'Activate'}
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
      )}

      {/* 1. Create/Edit User Modal dialog (A - F sections) */}
      {showFormModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.9)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {editingUserId ? 'Modify User Profile & Permissions' : 'Configure New User Profile'}
              </h3>
              <button onClick={() => setShowFormModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            {error && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--border-radius-sm)',
                padding: '10px 14px',
                color: 'var(--accent-error)',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                ✕ {error}
              </div>
            )}

            <form onSubmit={handleUserFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* SECTION A – BASIC INFORMATION */}
              <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <legend style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  SECTION A – Basic Information
                </legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Full Name *</label>
                    <input type="text" className="form-control" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. John Doe" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Phone Number *</label>
                    <input type="tel" className="form-control" required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="e.g. 555-123-4567" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Email Address *</label>
                    <input type="email" className="form-control" required value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="e.g. jdoe@aura.com" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Employee ID</label>
                    <input type="text" className="form-control" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="e.g. EMP-998" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Designation</label>
                    <input type="text" className="form-control" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior Specimen Collector" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Login Password / Passcode</label>
                    <input 
                      type="password" 
                      className="form-control" 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      placeholder={editingUserId ? "Leave blank to keep unchanged" : "Default: lims2026"} 
                    />
                  </div>
                </div>
              </fieldset>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: 0 }} />

              {/* SECTION B – LAB ASSIGNMENT */}
              <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <legend style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  SECTION B – Lab Assignment
                </legend>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Assigned Lab *</label>
                  <select 
                    className="form-control" 
                    value={assignedLabId} 
                    onChange={(e) => { setAssignedLabId(e.target.value); setSelectedLocationId(''); }}
                    disabled={!isAdmin}
                  >
                    <option value="">All Laboratories / Centres (Global Access)</option>
                    {labs.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </fieldset>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: 0 }} />

              {/* SECTION C – LOCATION ASSIGNMENT */}
              <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <legend style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  SECTION C – Location Assignment
                </legend>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Assigned Unit / Sub-Unit</label>
                  <select 
                    className="form-control"
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    disabled={!assignedLabId}
                  >
                    {!assignedLabId ? (
                      <option value="">-- Please select Assigned Lab first --</option>
                    ) : (
                      (() => {
                        const filtered = locations.filter(loc => loc.lab_id && parseInt(loc.lab_id, 10) === parseInt(assignedLabId, 10));
                        if (filtered.length === 0) {
                          return <option value="">No sub-units available (Whole Lab Access)</option>;
                        }
                        return (
                          <>
                            <option value="">-- Choose Unit / Sub-Unit Location --</option>
                            {filtered.map(loc => (
                              <option key={loc.location_id} value={loc.location_id}>
                                {loc.location_name}
                              </option>
                            ))}
                          </>
                        );
                      })()
                    )}
                  </select>
                </div>
              </fieldset>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: 0 }} />

              {/* SECTION D – ROLE ASSIGNMENT */}
              <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <legend style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  SECTION D – Role Assignment
                </legend>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Primary Role *</label>
                  <select 
                    className="form-control" 
                    required 
                    value={selectedRoleId} 
                    onChange={(e) => handleRoleChange(e.target.value)}
                  >
                    <option value="">-- Select Primary Role --</option>
                    {roles
                      .filter(r => isSuperAdmin || parseInt(r.role_id, 10) !== 1)
                      .map(r => (
                        <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                      ))
                    }
                  </select>
                </div>
              </fieldset>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: 0 }} />

              {/* SECTION E – ACTION-BASED PERMISSIONS */}
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px' }}>
                  SECTION E – Action-Based Permissions
                </legend>
                
                {/* Permissions grouped by module */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '12px' }}>
                  {Array.from(new Set(permissions.map(p => p.module_name))).map(module => (
                    <div key={module} style={{ border: '1px solid var(--border-color)', borderRadius: '4px', padding: '12px' }}>
                      <h4 style={{ fontWeight: '700', color: 'var(--accent-cyan)', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>
                        {module}
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {permissions.filter(p => p.module_name === module).map(p => (
                          <label key={p.permission_id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                            <input 
                              type="checkbox" 
                              checked={customPermissions.includes(p.permission_id)}
                              onChange={() => handlePermissionToggle(p.permission_id)}
                            />
                            {p.permission_name}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: 0 }} />

              {/* SECTION F – ACCOUNT STATUS */}
              <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <legend style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  SECTION F – Account Status
                </legend>
                <div style={{ display: 'flex', gap: '24px' }}>
                  {['Active', 'Inactive', 'Suspended'].map(st => (
                    <label key={st} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                      <input 
                        type="radio" 
                        name="accountStatus"
                        value={st}
                        checked={accountStatus === st}
                        onChange={() => setAccountStatus(st)}
                      />
                      {st}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowFormModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5 }}>Save Profile Ledger</button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 2. User Details Page Modal */}
      {showDetailsModal && selectedUser && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.9)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                  User Accountability Details
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  Profile ID: {selectedUser.id} &bull; Designation: {selectedUser.designation || 'None'}
                </span>
              </div>
              <button onClick={() => setShowDetailsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Profile Info Columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px' }}>
              <div>
                <h4 style={{ color: 'var(--accent-cyan)', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>
                  User Profile Information
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div><strong>Full Name:</strong> {selectedUser.full_name || selectedUser.name}</div>
                  <div><strong>Email Address:</strong> {selectedUser.email}</div>
                  <div><strong>Phone Number:</strong> {selectedUser.phone_number}</div>
                  <div><strong>Employee ID:</strong> {selectedUser.employee_id || 'N/A'}</div>
                </div>
              </div>

              <div>
                <h4 style={{ color: 'var(--accent-cyan)', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>
                  System Assignment
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div><strong>Assigned Lab:</strong> {selectedUser.lab_name || 'System Admin Center'}</div>
                  <div><strong>Primary Role:</strong> {selectedUser.role}</div>
                  <div><strong>Locations:</strong> {selectedUser.locations && selectedUser.locations.length > 0
                    ? selectedUser.locations.map(id => locations.find(loc => loc.location_id === id)?.location_name).join(', ')
                    : 'None Assigned'
                  }</div>
                  <div><strong>Account Status:</strong> <span className="badge badge-verified" style={{ padding: '2px 6px', fontSize: '10px' }}>{selectedUser.status}</span></div>
                </div>
              </div>
            </div>

            {/* Accountability Log Metadata */}
            <div style={{ border: '1px dashed var(--border-color)', borderRadius: '4px', padding: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ fontWeight: '700', color: 'var(--accent-purple)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Accountability Fields
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: 'var(--text-secondary)' }}>
                <div><strong>Created By:</strong> {selectedUser.created_by || 'System'}</div>
                <div><strong>Created Date:</strong> {selectedUser.created_date ? new Date(selectedUser.created_date).toLocaleString() : 'N/A'}</div>
                <div><strong>Modified By:</strong> {selectedUser.modified_by || 'None'}</div>
                <div><strong>Modified Date:</strong> {selectedUser.modified_date || 'N/A'}</div>
                
                {selectedUser.activated_by && (
                  <>
                    <div><strong>Activated By:</strong> {selectedUser.activated_by}</div>
                    <div><strong>Activated Date:</strong> {selectedUser.activated_date}</div>
                  </>
                )}
                {selectedUser.deactivated_by && (
                  <>
                    <div><strong>Deactivated By:</strong> {selectedUser.deactivated_by}</div>
                    <div><strong>Deactivated Date:</strong> {selectedUser.deactivated_date}</div>
                  </>
                )}
                {selectedUser.suspended_by && (
                  <>
                    <div><strong>Suspended By:</strong> {selectedUser.suspended_by}</div>
                    <div><strong>Suspended Date:</strong> {selectedUser.suspended_date}</div>
                  </>
                )}
              </div>
            </div>

            {/* Active Permissions List */}
            <div>
              <h4 style={{ color: 'var(--accent-cyan)', fontWeight: '700', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px', fontSize: '13px' }}>
                Assigned Action-Based Permissions
              </h4>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {selectedUser.permissions && selectedUser.permissions.length > 0 ? (
                  selectedUser.permissions.map(permId => {
                    const pName = permissions.find(p => p.permission_id === permId)?.permission_name;
                    return pName ? (
                      <span key={permId} style={{ backgroundColor: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: 'var(--accent-cyan)' }}>
                        {pName}
                      </span>
                    ) : null;
                  })
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No custom overrides. Utilizing role defaults.</span>
                )}
              </div>
            </div>

            {/* Actions list */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', flexWrap: 'wrap' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => { setShowDetailsModal(false); handleOpenEditUser(selectedUser); }}
                style={{ padding: '8px 16px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}
              >
                Edit User
              </button>

              {selectedUser.status !== 'Active' && (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => handleUpdateStatus(selectedUser, 'Active')}
                  style={{ padding: '8px 16px', borderColor: 'var(--accent-success)', color: 'var(--accent-success)' }}
                >
                  Activate User
                </button>
              )}

              {selectedUser.status === 'Active' && (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => handleUpdateStatus(selectedUser, 'Inactive')}
                  style={{ padding: '8px 16px', borderColor: 'var(--accent-warning)', color: 'var(--accent-warning)' }}
                >
                  Deactivate User
                </button>
              )}

              {selectedUser.status !== 'Suspended' && (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => handleUpdateStatus(selectedUser, 'Suspended')}
                  style={{ padding: '8px 16px', borderColor: 'var(--accent-error)', color: 'var(--accent-error)' }}
                >
                  Suspend User
                </button>
              )}

              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => handleResetAccess(selectedUser)}
                style={{ padding: '8px 16px' }}
              >
                Reset Access
              </button>

              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => { setShowDetailsModal(false); handleViewHistory(selectedUser); }}
                style={{ padding: '8px 16px', borderColor: 'var(--accent-purple)', color: 'var(--accent-purple)' }}
              >
                View History
              </button>

              <button type="button" className="btn btn-secondary" style={{ marginLeft: 'auto', width: '100px' }} onClick={() => setShowDetailsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. View History Modal */}
      {showHistoryModal && selectedUser && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.9)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                  Profile Lifecycle History Trail
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Timeline logs for {selectedUser.full_name || selectedUser.name}
                </span>
              </div>
              <button onClick={() => setShowHistoryModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Audit History Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loadingHistory ? (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '13px' }}>Loading history trail logs...</p>
              ) : userHistory.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: '13px' }}>No profile tracking events found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto', paddingRight: '6px' }}>
                  {userHistory.map(log => {
                    const dt = new Date(log.timestamp).toLocaleString();
                    let actionColor = 'var(--text-primary)';
                    if (log.action_type === 'CREATE') actionColor = 'var(--accent-success)';
                    if (log.action_type === 'UPDATE') actionColor = 'var(--accent-cyan)';
                    if (log.action_type === 'DEACTIVATE' || log.action_type === 'SUSPEND') actionColor = 'var(--accent-error)';
                    if (log.action_type === 'ACTIVATE') actionColor = 'var(--accent-success)';

                    return (
                      <div key={log.activity_id} style={{ border: '1px dashed var(--border-color)', borderRadius: '4px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: actionColor, fontWeight: '700', textTransform: 'uppercase' }}>
                            {log.action_type}
                          </span>
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{dt}</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          {log.new_value ? (
                            <span>{typeof log.new_value === 'string' ? log.new_value : 'Details updated.'}</span>
                          ) : (
                            <span>Action triggered</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)', fontSize: '10px', marginTop: '4px', borderTop: '1px dotted var(--border-color)', paddingTop: '4px' }}>
                          <span>By: {log.user_name} ({log.role})</span>
                          <span>IP: {log.ip_address || 'System'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <button type="button" className="btn btn-secondary" style={{ width: '120px', marginLeft: 'auto' }} onClick={() => setShowHistoryModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Super Admin: Create/Edit Lab Modal */}
      {showLabModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.9)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700' }}>
                {editingLabId ? 'Modify Laboratory' : 'Create Laboratory'}
              </h3>
              <button onClick={() => setShowLabModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            {error && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--border-radius-sm)',
                padding: '10px 14px',
                color: 'var(--accent-error)',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                ✕ {error}
              </div>
            )}

            <form onSubmit={handleLabSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Laboratory Name *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  required 
                  value={newLabName} 
                  onChange={(e) => setNewLabName(e.target.value)} 
                  placeholder="e.g. Cambridge Biomedical Center" 
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Location Address *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  required 
                  value={newLabAddress} 
                  onChange={(e) => setNewLabAddress(e.target.value)} 
                  placeholder="e.g. 245 First St, Cambridge, MA 02142" 
                />
              </div>

              {editingLabId && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Status *</label>
                  <select 
                    className="form-control"
                    value={labs.find(l => l.id === editingLabId)?.status || 'Active'}
                    onChange={(e) => {
                      const updatedStatus = e.target.value;
                      setLabs(prev => prev.map(l => l.id === editingLabId ? { ...l, status: updatedStatus } : l));
                    }}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0' }}>
                <input 
                  type="checkbox" 
                  id="has-subunits-checkbox"
                  checked={hasSubunits} 
                  onChange={(e) => {
                    setHasSubunits(e.target.checked);
                    if (e.target.checked && subunitInputs.length === 0) {
                      setSubunitInputs([{ location_id: null, location_name: '' }]);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="has-subunits-checkbox" style={{ cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  This laboratory has sub-units (e.g. collection clinics or internal centers)
                </label>
              </div>

              {hasSubunits && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)', padding: '12px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-cyan)', textTransform: 'uppercase', margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Sub-Unit Locations Details</span>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      onClick={() => setSubunitInputs(prev => [...prev, { location_id: null, location_name: '' }])}
                      style={{ padding: '2px 8px', fontSize: '10px' }}
                    >
                      + Add Sub-Unit
                    </button>
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                    {subunitInputs.map((sub, index) => (
                      <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input 
                          type="text" 
                          className="form-control"
                          required
                          value={sub.location_name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSubunitInputs(prev => prev.map((item, idx) => idx === index ? { ...item, location_name: val } : item));
                          }}
                          placeholder="Sub-unit Name (e.g. Unit A)"
                          style={{ flex: 1, padding: '6px 10px', fontSize: '12px' }}
                        />
                        <button 
                          type="button" 
                          className="btn btn-secondary"
                          onClick={() => {
                            setSubunitInputs(prev => prev.filter((_, idx) => idx !== index));
                          }}
                          style={{ padding: '6px 10px', fontSize: '12px', color: 'var(--accent-error)', borderColor: 'var(--accent-error)' }}
                          disabled={subunitInputs.length === 1}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowLabModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5 }}>
                  {editingLabId ? 'Update Lab' : 'Create Lab'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Super Admin: Create/Edit Consent Template Modal */}
      {showTemplateModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(8, 12, 24, 0.9)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700' }}>
                {editingTemplateId ? 'Modify Consent Template' : 'Create Consent Template'}
              </h3>
              <button onClick={() => setShowTemplateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            {error && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--border-radius-sm)',
                padding: '10px 14px',
                color: 'var(--accent-error)',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                ✕ {error}
              </div>
            )}

            <form onSubmit={handleTemplateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Template Name *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    required 
                    value={templateName} 
                    onChange={(e) => setTemplateName(e.target.value)} 
                    placeholder="e.g. Future Research Use & Data Sharing Consent" 
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Consent Code *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    required 
                    value={templateCode} 
                    onChange={(e) => setTemplateCode(e.target.value)} 
                    placeholder="e.g. FRC" 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Version *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    required 
                    value={templateVersion} 
                    onChange={(e) => setTemplateVersion(e.target.value)} 
                    placeholder="e.g. v1.0" 
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Effective Date</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={templateEffectiveDate} 
                    onChange={(e) => setTemplateEffectiveDate(e.target.value)} 
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Status *</label>
                  <select 
                    className="form-control"
                    value={templateStatus}
                    onChange={(e) => setTemplateStatus(e.target.value)}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Purpose (Brief description of the objective) *</label>
                <textarea 
                  className="form-control" 
                  required 
                  rows="2"
                  value={templatePurpose} 
                  onChange={(e) => setTemplatePurpose(e.target.value)} 
                  placeholder="e.g. Authorizes storage of biological samples in the AURA Biobank."
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Allows (Permitted actions, one per line)</label>
                  <textarea 
                    className="form-control" 
                    rows="3"
                    value={templateAllows} 
                    onChange={(e) => setTemplateAllows(e.target.value)} 
                    placeholder="e.g.&#10;Sample storage&#10;Future research"
                    style={{ resize: 'vertical', fontSize: '12px', fontFamily: 'monospace' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Restrictions (Limits, one per line)</label>
                  <textarea 
                    className="form-control" 
                    rows="3"
                    value={templateRestrictions} 
                    onChange={(e) => setTemplateRestrictions(e.target.value)} 
                    placeholder="e.g.&#10;Personal identity protected"
                    style={{ resize: 'vertical', fontSize: '12px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Full legal document text *</label>
                <textarea 
                  className="form-control" 
                  required 
                  rows="6"
                  value={templateDetails} 
                  onChange={(e) => setTemplateDetails(e.target.value)} 
                  placeholder="Enter full legal guidelines and requirements text..."
                  style={{ resize: 'vertical', fontSize: '12px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowTemplateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1.5 }}>
                  {editingTemplateId ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
