import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from './config';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import SampleRegistration from './components/SampleRegistration';
import SampleList from './components/SampleList';
import ConsentManagement from './components/ConsentManagement';
import BarcodeDashboard from './components/BarcodeDashboard';
import AuditTrail from './components/AuditTrail';
import UserManagement from './components/UserManagement';
import BarcodePrintSettings from './components/BarcodePrintSettings';
import PublicSpecimenTracker from './components/PublicSpecimenTracker';
import InventoryStorage from './components/InventoryStorage';
import ShipmentManagement from './components/ShipmentManagement';
import TraceSpecimen from './components/TraceSpecimen';
import SpecimenTypeMaster from './components/SpecimenTypeMaster';
import Reports from './components/Reports';

const BACKEND_URL = API_BASE_URL;

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('aura_lab_token') || null);
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('aura_lab_user')) || null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [samples, setSamples] = useState([]);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [theme, setTheme] = useState(localStorage.getItem('aura_lab_theme') || 'dark');
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [preSelectedSampleId, setPreSelectedSampleId] = useState('');
  const [printBatchSamples, setPrintBatchSamples] = useState([]);
  const [reportsDropdownOpen, setReportsDropdownOpen] = useState(false);
  const [reportsCategory, setReportsCategory] = useState('all');

  // Active Lab Context States
  const [accessibleLabs, setAccessibleLabs] = useState([]);
  const [activeLabId, setActiveLabId] = useState(() => {
    const savedUser = JSON.parse(localStorage.getItem('aura_lab_user'));
    if (savedUser && savedUser.lab_id !== null && savedUser.lab_id !== undefined) {
      return savedUser.lab_id;
    }
    return localStorage.getItem('aura_active_lab_id') || '';
  });
  const [activeLabName, setActiveLabName] = useState(() => {
    const savedUser = JSON.parse(localStorage.getItem('aura_lab_user'));
    if (savedUser && savedUser.lab_id !== null && savedUser.lab_id !== undefined) {
      return savedUser.lab_name || '';
    }
    return localStorage.getItem('aura_active_lab_name') || '';
  });

  const hasPermission = (permissionName) => {
    if (!user) return false;
    if (user.role === 'Super Admin') return true;
    return Array.isArray(user.permissions) && user.permissions.includes(permissionName);
  };

  const fetchAccessibleLabs = async (authToken = token) => {
    if (!authToken) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/users/labs/accessible`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const data = await response.json();
      if (response.ok) {
        setAccessibleLabs(data.labs || []);
      }
    } catch (err) {
      console.error("Error fetching accessible labs:", err);
    }
  };

  const handlePrintBarcode = (sample) => {
    if (Array.isArray(sample)) {
      setPrintBatchSamples(sample);
    } else {
      setPrintBatchSamples([sample]);
    }
  };

  const handleGenerateAndPrintBarcode = async (sampleId) => {
    try {
      const activeLab = localStorage.getItem('aura_active_lab_id');
      const response = await fetch(`${BACKEND_URL}/api/barcode/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
        },
        body: JSON.stringify({ sample_id: sampleId })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate barcode');
      }
      
      // Update local samples directory
      await fetchSamples(token);
      
      // Locate the fresh label layout metadata and trigger the printing overlay
      const originalSample = (samples || []).find(s => s.id === sampleId);
      if (originalSample) {
        const printSample = {
          ...originalSample,
          barcode_text: data?.barcode?.barcode_value || data?.barcode?.barcode_text || sampleId,
          qr_code_base64: data?.barcode?.qr_code_base64,
          code128_base64: data?.barcode?.code128_base64
        };
        handlePrintBarcode(printSample);
      }
    } catch (error) {
      alert("Barcode Generation Error: " + error.message);
    }
  };

  // Initialize Theme on Mount
  useEffect(() => {
    const body = document.body;
    if (theme === 'light') {
      body.classList.add('light-theme');
    } else {
      body.classList.remove('light-theme');
    }
  }, [theme]);

  // Fetch Samples List
  const fetchSamples = async (authToken = token) => {
    if (!authToken) return;
    setLoadingSamples(true);
    try {
      const activeLab = localStorage.getItem('aura_active_lab_id');
      const response = await fetch(`${BACKEND_URL}/api/samples`, {
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          ...(activeLab ? { 'x-active-lab-id': activeLab } : {})
        }
      });
      const data = await response.json();
      if (response.ok) {
        setSamples(data.samples || []);
        setGlobalTotal(data.globalTotal || 0);
      }
    } catch (error) {
      console.error("Error fetching samples registry:", error);
    } finally {
      setLoadingSamples(false);
    }
  };

  // Fetch samples & accessible labs on load or token/activeLabId change
  useEffect(() => {
    if (token) {
      fetchSamples(token);
      fetchAccessibleLabs(token);
    }
  }, [token, activeLabId]);

  const handleLoginSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('aura_lab_token', newToken);
    localStorage.setItem('aura_lab_user', JSON.stringify(newUser));
    // If the user has a specific assigned lab, auto-set it as active
    if (newUser.lab_id !== null && newUser.lab_id !== undefined) {
      setActiveLabId(newUser.lab_id);
      setActiveLabName(newUser.lab_name);
      localStorage.setItem('aura_active_lab_id', newUser.lab_id);
      localStorage.setItem('aura_active_lab_name', newUser.lab_name);
    } else {
      localStorage.removeItem('aura_active_lab_id');
      localStorage.removeItem('aura_active_lab_name');
      setActiveLabId('');
      setActiveLabName('');
    }
    fetchSamples(newToken);
    fetchAccessibleLabs(newToken);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setSamples([]);
    localStorage.removeItem('aura_lab_token');
    localStorage.removeItem('aura_lab_user');
    localStorage.removeItem('aura_active_lab_id');
    localStorage.removeItem('aura_active_lab_name');
    setActiveLabId('');
    setActiveLabName('');
    setActiveTab('dashboard');
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('aura_lab_theme', nextTheme);
  };

  // 1. Detect public QR scanner tracking parameter
  const urlParams = new URLSearchParams(window.location.search);
  const scanSampleId = urlParams.get('scan');

  if (scanSampleId) {
    return <PublicSpecimenTracker sampleId={scanSampleId} backendUrl={BACKEND_URL} />;
  }

  // 2. Detect batch printing mode
  if (printBatchSamples.length > 0) {
    return <BarcodePrintSettings batchSamples={printBatchSamples} onClose={() => setPrintBatchSamples([])} />;
  }

  if (!token || !user) {
    return <Login onLoginSuccess={handleLoginSuccess} backendUrl={BACKEND_URL} />;
  }

  // Get initials for profile avatar
  const getInitials = (name) => {
    if (!name) return 'US';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      
      {/* Dynamic Sidebar Nav */}
      <aside style={{
        width: sidebarCollapsed ? '80px' : '260px',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        padding: sidebarCollapsed ? '24px 12px' : '24px 18px',
        justifyContent: 'space-between',
        flexShrink: 0,
        transition: 'var(--transition-smooth)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {/* Logo Branding + Collapse Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'space-between', gap: '10px', textAlign: 'left' }}>
            {!sidebarCollapsed ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))',
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 12px rgba(0, 242, 254, 0.2)'
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" style={{ width: '18px', height: '18px' }}>
                    <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z"/>
                    <circle cx="12" cy="12" r="2" fill="white"/>
                  </svg>
                </div>
                <div>
                  <h2 style={{ fontSize: '15px', fontWeight: '800', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>AURA PORTAL</h2>
                  <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lab Intake</span>
                </div>
              </div>
            ) : (
              <div style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))',
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 12px rgba(0, 242, 254, 0.2)'
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" style={{ width: '18px', height: '18px' }}>
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z"/>
                  <circle cx="12" cy="12" r="2" fill="white"/>
                </svg>
              </div>
            )}

            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '4px',
                transition: 'var(--transition-smooth)'
              }}
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {sidebarCollapsed ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '14px', height: '14px' }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '14px', height: '14px' }}>
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              )}
            </button>
          </div>

          {/* Nav Links */}
          <nav>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              
              {!sidebarCollapsed && (
                <li style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 8px' }}>
                  Operations
                </li>
              )}
              
              <li>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--border-radius-sm)',
                    background: activeTab === 'dashboard' ? 'var(--border-color)' : 'transparent',
                    border: 'none',
                    color: activeTab === 'dashboard' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: activeTab === 'dashboard' ? '700' : '500',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                  title={sidebarCollapsed ? "Dashboard" : undefined}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                    <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
                  </svg>
                  {!sidebarCollapsed && "Dashboard"}
                </button>
              </li>

              <li>
                <button
                  onClick={() => setActiveTab('register')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--border-radius-sm)',
                    background: activeTab === 'register' ? 'var(--border-color)' : 'transparent',
                    border: 'none',
                    color: activeTab === 'register' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: activeTab === 'register' ? '700' : '500',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                  title={sidebarCollapsed ? "Sample Registration" : undefined}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  {!sidebarCollapsed && "Sample Registration"}
                </button>
              </li>

              <li>
                <button
                  onClick={() => setActiveTab('samples')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--border-radius-sm)',
                    background: activeTab === 'samples' ? 'var(--border-color)' : 'transparent',
                    border: 'none',
                    color: activeTab === 'samples' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: activeTab === 'samples' ? '700' : '500',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                  title={sidebarCollapsed ? "View Samples" : undefined}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  {!sidebarCollapsed && "View Samples"}
                </button>
              </li>

              <li>
                <button
                  onClick={() => setActiveTab('consent')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--border-radius-sm)',
                    background: activeTab === 'consent' ? 'var(--border-color)' : 'transparent',
                    border: 'none',
                    color: activeTab === 'consent' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: activeTab === 'consent' ? '700' : '500',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                  title={sidebarCollapsed ? "Consent Management" : undefined}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  {!sidebarCollapsed && "Consent Management"}
                </button>
              </li>

              <li>
                <button
                  onClick={() => setActiveTab('shipments')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--border-radius-sm)',
                    background: activeTab === 'shipments' ? 'var(--border-color)' : 'transparent',
                    border: 'none',
                    color: activeTab === 'shipments' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: activeTab === 'shipments' ? '700' : '500',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                  title={sidebarCollapsed ? "Shipments & Receiving" : undefined}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  {!sidebarCollapsed && "Shipment & Receiving"}
                </button>
              </li>

              <li>
                <button
                  onClick={() => setActiveTab('storage')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--border-radius-sm)',
                    background: activeTab === 'storage' ? 'var(--border-color)' : 'transparent',
                    border: 'none',
                    color: activeTab === 'storage' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: activeTab === 'storage' ? '700' : '500',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                  title={sidebarCollapsed ? "Inventory & Storage" : undefined}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  </svg>
                  {!sidebarCollapsed && "Inventory & Storage"}
                </button>
              </li>

              <li>
                <button
                  onClick={() => setActiveTab('trace')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--border-radius-sm)',
                    background: activeTab === 'trace' ? 'var(--border-color)' : 'transparent',
                    border: 'none',
                    color: activeTab === 'trace' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: activeTab === 'trace' ? '700' : '500',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                  title={sidebarCollapsed ? "Trace Specimen" : undefined}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  {!sidebarCollapsed && "Trace Specimen"}
                </button>
              </li>

              <li>
                <button
                  onClick={() => setReportsDropdownOpen(prev => !prev)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--border-radius-sm)',
                    background: activeTab === 'reports' ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                    border: 'none',
                    color: activeTab === 'reports' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: activeTab === 'reports' ? '700' : '500',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed ? 'center' : 'space-between',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                  title={sidebarCollapsed ? "Biobank Reports" : undefined}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    {!sidebarCollapsed && "Biobank Reports"}
                  </div>
                  {!sidebarCollapsed && (
                    <span style={{ 
                      fontSize: '9px', 
                      color: 'var(--text-tertiary)',
                      transition: 'transform 0.2s', 
                      transform: reportsDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' 
                    }}>
                      ▼
                    </span>
                  )}
                </button>

                {reportsDropdownOpen && !sidebarCollapsed && (
                  <ul style={{ 
                    listStyle: 'none', 
                    paddingLeft: '24px', 
                    marginTop: '4px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '2px' 
                  }}>
                    <li>
                      <button
                        onClick={() => {
                          setActiveTab('reports');
                          setReportsCategory('operations');
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 'var(--border-radius-sm)',
                          background: activeTab === 'reports' && reportsCategory === 'operations' ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
                          border: 'none',
                          color: activeTab === 'reports' && reportsCategory === 'operations' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                          fontWeight: activeTab === 'reports' && reportsCategory === 'operations' ? '700' : '500',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        ⚙️ Operations
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => {
                          setActiveTab('reports');
                          setReportsCategory('administration');
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 'var(--border-radius-sm)',
                          background: activeTab === 'reports' && reportsCategory === 'administration' ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
                          border: 'none',
                          color: activeTab === 'reports' && reportsCategory === 'administration' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                          fontWeight: activeTab === 'reports' && reportsCategory === 'administration' ? '700' : '500',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        🛡️ Administration
                      </button>
                    </li>
                  </ul>
                )}
              </li>

              {(user.role === 'Lab Admin' || user.role === 'Super Admin') && (
                <li>
                  <button
                    onClick={() => setActiveTab('barcode')}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--border-radius-sm)',
                      background: activeTab === 'barcode' ? 'var(--border-color)' : 'transparent',
                      border: 'none',
                      color: activeTab === 'barcode' ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: activeTab === 'barcode' ? '700' : '500',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                      gap: '10px',
                      cursor: 'pointer',
                      transition: 'var(--transition-smooth)'
                    }}
                    title={sidebarCollapsed ? "Barcode Manager" : undefined}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                      <line x1="8" y1="21" x2="16" y2="21"/>
                      <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    {!sidebarCollapsed && "Barcode Manager"}
                  </button>
                </li>
              )}

              {/* Protected Administration Link (Admin Only) */}
              {(user.role === 'Lab Admin' || user.role === 'Super Admin' || hasPermission('View Users') || hasPermission('View Specimen Types') || hasPermission('View Audit Logs')) && (
                <>
                  {!sidebarCollapsed && (
                    <li style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 8px 6px' }}>
                      Administration
                    </li>
                  )}
                  
                  {(user.role === 'Lab Admin' || user.role === 'Super Admin' || hasPermission('View Users')) && (
                    <li>
                      <button
                        onClick={() => setActiveTab('users')}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 'var(--border-radius-sm)',
                          background: activeTab === 'users' ? 'var(--border-color)' : 'transparent',
                          border: 'none',
                          color: activeTab === 'users' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontWeight: activeTab === 'users' ? '700' : '500',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                          gap: '10px',
                          cursor: 'pointer',
                          transition: 'var(--transition-smooth)'
                        }}
                        title={sidebarCollapsed ? "User Management" : undefined}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        {!sidebarCollapsed && "User Management"}
                      </button>
                    </li>
                  )}

                  {(user.role === 'Lab Admin' || user.role === 'Super Admin' || hasPermission('View Specimen Types')) && (
                    <li>
                      <button
                        onClick={() => setActiveTab('specimen-types')}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 'var(--border-radius-sm)',
                          background: activeTab === 'specimen-types' ? 'var(--border-color)' : 'transparent',
                          border: 'none',
                          color: activeTab === 'specimen-types' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontWeight: activeTab === 'specimen-types' ? '700' : '500',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                          gap: '10px',
                          cursor: 'pointer',
                          transition: 'var(--transition-smooth)'
                        }}
                        title={sidebarCollapsed ? "Specimen Type Master" : undefined}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                        {!sidebarCollapsed && "Specimen Type Master"}
                      </button>
                    </li>
                  )}

                  {(user.role === 'Lab Admin' || user.role === 'Super Admin' || hasPermission('View Audit Logs')) && (
                    <li>
                      <button
                        onClick={() => setActiveTab('audit')}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 'var(--border-radius-sm)',
                          background: activeTab === 'audit' ? 'var(--border-color)' : 'transparent',
                          border: 'none',
                          color: activeTab === 'audit' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontWeight: activeTab === 'audit' ? '700' : '500',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                          gap: '10px',
                          cursor: 'pointer',
                          transition: 'var(--transition-smooth)'
                        }}
                        title={sidebarCollapsed ? "Audit Trail" : undefined}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        {!sidebarCollapsed && "Audit Trail"}
                      </button>
                    </li>
                  )}
                </>
              )}

            </ul>
          </nav>
        </div>

        {/* User Footer Profile */}
        <div style={{
          borderTop: '1px solid var(--border-color)',
          paddingTop: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: sidebarCollapsed ? 'center' : 'stretch',
          gap: '12px',
          textAlign: 'left'
        }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'var(--border-color)',
              color: 'var(--text-primary)',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              border: '1px solid var(--accent-cyan)',
              flexShrink: 0
            }}>
              {getInitials(user.name)}
            </div>
            {!sidebarCollapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {user.role}
                </div>
              </div>
            )}
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={handleLogout} 
            style={{ 
              width: '100%', 
              padding: sidebarCollapsed ? '8px 0' : '8px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            title={sidebarCollapsed ? "Sign Out" : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '13px', height: '13px', flexShrink: 0 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            {!sidebarCollapsed && <span style={{ marginLeft: '8px' }}>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        
        {/* Top Header */}
        <header style={{
          height: '64px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '0 24px',
          gap: '16px',
          flexShrink: 0
        }}>
          {/* Active Lab Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              🏥 Active Lab
            </span>
            {user.lab_id !== null && user.lab_id !== undefined ? (
              <span style={{
                fontSize: '12px',
                color: 'var(--text-primary)',
                fontWeight: '600',
                border: '1px solid var(--border-color)',
                padding: '6px 12px',
                borderRadius: '20px',
                background: 'var(--bg-primary)'
              }}>
                {user.lab_name}
              </span>
            ) : (
              <select
                id="active-lab-selector"
                value={activeLabId}
                className={(!activeLabId && activeTab === 'register') ? 'lab-selector-glow' : ''}
                onChange={(e) => {
                  const id = e.target.value;
                  const selectedLab = accessibleLabs.find(l => String(l.id) === String(id));
                  const name = selectedLab ? selectedLab.name : '';
                  setActiveLabId(id);
                  setActiveLabName(name);
                  if (id) {
                    localStorage.setItem('aura_active_lab_id', id);
                    localStorage.setItem('aura_active_lab_name', name);
                  } else {
                    localStorage.removeItem('aura_active_lab_id');
                    localStorage.removeItem('aura_active_lab_name');
                    setActiveLabId('');
                    setActiveLabName('');
                  }
                }}
                style={{
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  fontWeight: '600',
                  border: '1px solid var(--border-color)',
                  padding: '6px 24px 6px 12px',
                  borderRadius: '20px',
                  background: 'var(--bg-primary)',
                  cursor: 'pointer',
                  outline: 'none',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '12px'
                }}
              >
                <option value="">Select Lab ▼</option>
                {accessibleLabs.map(lab => (
                  <option key={lab.id} value={lab.id}>{lab.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* pulsing Connection Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-success)',
              boxShadow: '0 0 8px var(--accent-success)'
            }}></span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>SYS ONLINE</span>
          </div>

          {/* Theme Toggler */}
          <button
            onClick={toggleTheme}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px'
            }}
            title="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '18px', height: '18px' }}>
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '18px', height: '18px' }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </header>

        {/* Viewport Content */}
        <main style={{ flex: 1, padding: '32px' }}>
          {activeTab === 'dashboard' && (
            <Dashboard 
              samples={samples} 
              globalTotal={globalTotal}
              setActiveTab={setActiveTab} 
              user={user} 
              activeLabId={activeLabId}
              activeLabName={activeLabName}
              backendUrl={BACKEND_URL}
              token={token}
            />
          )}

          {activeTab === 'reports' && (
            <Reports 
              samples={samples} 
              backendUrl={BACKEND_URL} 
              token={token} 
              user={user} 
              setActiveTab={setActiveTab}
              reportsCategory={reportsCategory}
            />
          )}

          {activeTab === 'register' && (
            <SampleRegistration 
              user={user} 
              backendUrl={BACKEND_URL} 
              token={token} 
              onRegistrationSuccess={() => fetchSamples(token)} 
              setActiveTab={setActiveTab}
              setPreSelectedSampleId={setPreSelectedSampleId}
              activeLabId={activeLabId}
              activeLabName={activeLabName}
            />
          )}

          {activeTab === 'samples' && (
            <SampleList 
              samples={samples} 
              setActiveTab={setActiveTab} 
              user={user} 
              token={token}
              backendUrl={BACKEND_URL}
              onPrintBarcode={handlePrintBarcode}
              onGenerateBarcode={handleGenerateAndPrintBarcode}
              preSelectedSampleId={preSelectedSampleId}
              setPreSelectedSampleId={setPreSelectedSampleId}
              onRegistrationSuccess={() => fetchSamples(token)}
              activeLabId={activeLabId}
              activeLabName={activeLabName}
            />
          )}

          {activeTab === 'consent' && (
            <ConsentManagement 
              samples={samples} 
              user={user} 
              backendUrl={BACKEND_URL} 
              token={token} 
              onConsentAction={() => fetchSamples(token)} 
              preSelectedSampleId={preSelectedSampleId}
              setPreSelectedSampleId={setPreSelectedSampleId}
              setActiveTab={setActiveTab}
              activeLabId={activeLabId}
              activeLabName={activeLabName}
            />
          )}

          {activeTab === 'barcode' && (
            <BarcodeDashboard 
              samples={samples} 
              backendUrl={BACKEND_URL} 
              token={token} 
              user={user}
              onBarcodeAction={() => fetchSamples(token)} 
              onPrintBarcode={handlePrintBarcode}
              setActiveTab={setActiveTab}
              activeLabId={activeLabId}
              activeLabName={activeLabName}
            />
          )}

          {activeTab === 'storage' && (
            <InventoryStorage 
              samples={samples} 
              backendUrl={BACKEND_URL} 
              token={token} 
              user={user}
              onStorageAction={() => fetchSamples(token)} 
              activeLabId={activeLabId}
              activeLabName={activeLabName}
            />
          )}

          {activeTab === 'shipments' && (
            <ShipmentManagement 
              samples={samples} 
              backendUrl={BACKEND_URL} 
              token={token} 
              user={user}
              onShipmentAction={() => fetchSamples(token)} 
              activeLabId={activeLabId}
              activeLabName={activeLabName}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'trace' && (
            <TraceSpecimen 
              backendUrl={BACKEND_URL} 
              token={token} 
              user={user}
              activeLabId={activeLabId}
              activeLabName={activeLabName}
            />
          )}

          {activeTab === 'users' && (
            <UserManagement 
              backendUrl={BACKEND_URL} 
              token={token} 
              user={user} 
              setActiveTab={setActiveTab}
              activeLabId={activeLabId}
              activeLabName={activeLabName}
            />
          )}

          {activeTab === 'specimen-types' && (
            <SpecimenTypeMaster 
              backendUrl={BACKEND_URL} 
              token={token} 
              user={user} 
            />
          )}

          {activeTab === 'audit' && (
            <AuditTrail 
              backendUrl={BACKEND_URL} 
              token={token} 
              user={user} 
              setActiveTab={setActiveTab}
              activeLabId={activeLabId}
              activeLabName={activeLabName}
            />
          )}
        </main>

      </div>

    </div>
  );
}
