// ==========================================
// AURA BIOBANK PORTAL CORE INTELLIGENCE (JS)
// ==========================================
import { db, cloudMode, dbMode } from './db.js';

// Global Memory cache to prevent repeated database hits on active filters
let specimensCache = [];
let donorsCache = [];
let requestsCache = [];
let studiesCache = [];
let publicationsCache = [];
let blockchainCache = [];
let usersCache = [];
let auditCache = [];
let limsSettings = {};
let currentUser = null;

// Global Cart State
let requestCart = [];
try {
  const savedCart = localStorage.getItem('aura_request_cart');
  if (savedCart) {
    requestCart = JSON.parse(savedCart);
  }
} catch (e) {
  console.warn("Failed to load requestCart from localStorage:", e);
}

// Global Relocation State
let relocateMode = false;
let relocateSourceBarcode = null;

// Global Reports Preview pagination state
let previewPageIndex = 0;
const previewPageSize = 10;

// Global pagination states for lists
let catalogPageIndex = 0;
const catalogPageSize = 10;

let ledgerPageIndex = 0;
const ledgerPageSize = 10;

let requestsPageIndex = 0;
const requestsPageSize = 10;

let publicationsPageIndex = 0;
const publicationsPageSize = 10;

let previewSearchQuery = "";
let previewSelectedKeys = [];
let columnFilterQueries = {};
let activeReportType = "";

// A helper to refresh the catalog table view using active filters
function refreshCatalogView() {
  if (window.applyCatalogFilters) {
    window.applyCatalogFilters();
  } else {
    renderCatalogTable(specimensCache);
  }
}

// Enforces granular legal consent validation: checks expiry, withdrawal, research-specific, data sharing, and genomic permissions.
function checkSpecimenConsentBlocked(specimen) {
  // 0. Quality Control (QC) Failed Safeguard
  if (specimen.qcStatus === 'Failed') {
    return { isBlocked: true, reason: 'Failed QC Check' };
  }

  const donor = donorsCache.find(d => d.donorId === specimen.donorId);
  if (!donor) return { isBlocked: false, reason: '' };

  const today = new Date().toISOString().slice(0, 10);

  // 1. Withdrawal Safeguard
  if (donor.consentStatus === 'Withdrawn') {
    return { isBlocked: true, reason: 'Consent Withdrawn' };
  }

  // 2. Expiry Safeguard
  if (donor.consentExpiry && donor.consentExpiry < today) {
    return { isBlocked: true, reason: 'Consent Expired' };
  }

  // 3. Research-specific Consent Enforcement
  const research = donor.researchSpecific || { cancer: true, diabetes: true, infectious: true, cardiovascular: true, neurological: true };
  if (specimen.diagnosis) {
    const diag = specimen.diagnosis.toLowerCase();
    if (diag.includes('cancer') && !research.cancer) {
      return { isBlocked: true, reason: 'No Cancer Research Consent' };
    }
    if (diag.includes('diabetes') && !research.diabetes) {
      return { isBlocked: true, reason: 'No Diabetes Research Consent' };
    }
    if (diag.includes('covid') && !research.infectious) {
      return { isBlocked: true, reason: 'No Infectious Research Consent' };
    }
    if (diag.includes('alzheimer') && !research.neurological) {
      return { isBlocked: true, reason: 'No Neurological Research Consent' };
    }
    if ((diag.includes('cardio') || diag.includes('heart') || diag.includes('hypertension')) && !research.cardiovascular) {
      return { isBlocked: true, reason: 'No Cardiovascular Research Consent' };
    }
  }

  // 4. Genomic Permission Enforcement (Specimens of type DNA require genomic permission)
  if (specimen.type === 'DNA' && donor.genomicPermission === false) {
    return { isBlocked: true, reason: 'No Genomic Consent' };
  }

  // 5. Data Sharing Permission Enforcement
  if (donor.dataSharing === false) {
    return { isBlocked: true, reason: 'No Data Sharing Consent' };
  }

  return { isBlocked: false, reason: '' };
}

// ==========================================
// Initialization & Startup
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Theme Swapper first to avoid screen flicker
  initThemeManager();
  
  // Initialize user profile logout menu trigger
  initUserProfileMenu();

  // Update header connection indicator based on database mode
  const connectionIndicator = document.querySelector('.system-status-indicator span:last-child');
  const connectionDot = document.querySelector('.status-dot');
  
  if (cloudMode) {
    connectionIndicator.textContent = "LIMS Cloud Firestore Active";
    connectionDot.style.backgroundColor = "var(--accent-cyan)";
    connectionDot.style.boxShadow = "0 0 8px var(--accent-cyan)";
  } else if (dbMode === 'API') {
    connectionIndicator.textContent = "LIMS Integration API Active";
    connectionDot.style.backgroundColor = "var(--accent-teal)";
    connectionDot.style.boxShadow = "0 0 8px var(--accent-teal)";
  } else {
    connectionIndicator.textContent = "LIMS Local Storage Active";
  }

  // Load database arrays into local cache
  await refreshDatabaseCache();

  // Populate LIMS login selector and bind events
  await initLoginPortal();

  // Restore user session or fall back to login screen (stored in sessionStorage for tab-level lifecycle)
  const isLoggedIn = sessionStorage.getItem('aura_logged_in');
  const savedUserJson = sessionStorage.getItem('aura_current_user');
  
  if (isLoggedIn === 'true' && savedUserJson) {
    try {
      currentUser = JSON.parse(savedUserJson);
      document.body.classList.add('authenticated');
      updateProfileUI(currentUser);
      updateAdminMenuVisibility(currentUser.role);
      updateRequestsBadge();
      
      const userTheme = currentUser.theme || localStorage.getItem('aura_theme_' + currentUser.username) || localStorage.getItem('aura_theme') || 'system';
      applyTheme(userTheme);
    } catch (e) {
      currentUser = null;
      document.body.classList.remove('authenticated');
    }
  } else {
    // Show login screen by default
    currentUser = null;
    document.body.classList.remove('authenticated');
  }
  
  const dashBtn = document.querySelector('.nav-btn[data-tab="dashboard-tab"]');
  if (dashBtn) dashBtn.click();

  // Initialize specific tab modules
  initDashboardFilters();
  initTabs();
  initCatalog();
  initStorageGrid();
  
  // Active Storage Unit change listener
  const freezerSelect = document.getElementById('freezer-select');
  if (freezerSelect) {
    freezerSelect.addEventListener('change', () => {
      // Clear detail panes
      const detailsPane = document.getElementById('well-details-pane');
      if (detailsPane) {
        const placeholder = detailsPane.querySelector('.well-placeholder-text');
        if (placeholder) placeholder.style.display = 'block';
        const dataContent = document.getElementById('well-data-content');
        if (dataContent) dataContent.classList.add('hidden');
        const depositContainer = document.getElementById('well-deposit-form-container');
        if (depositContainer) depositContainer.classList.add('hidden');
      }
      initStorageGrid();
    });
  }

  initConsentManager();
  initCartListeners();
  initDonorRegistry();
  initBlockModalListeners();
  initQCModalListeners();
  initStudyManagement();
  initPublications();
  initResearchRequestsFilter();
  
  // Left Sidebar Collapse/Expand Toggle
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const appLayout = document.querySelector('.app-layout');
  if (btnToggleSidebar && appLayout) {
    btnToggleSidebar.addEventListener('click', () => {
      appLayout.classList.toggle('sidebar-collapsed');
    });
  }

  // Right Side - Enroll New Participant panel close/open toggles
  const enrollPanel = document.getElementById('enroll-donor-panel');
  const closePanelBtn = document.getElementById('btn-toggle-enroll-panel');
  const openPanelBtn = document.getElementById('btn-open-enroll-panel');
  const donorsConsentContainer = document.querySelector('#donors-tab .consent-container');
  
  if (closePanelBtn && enrollPanel && openPanelBtn) {
    closePanelBtn.addEventListener('click', () => {
      enrollPanel.style.display = 'none';
      openPanelBtn.style.display = 'inline-block';
      if (donorsConsentContainer) {
        donorsConsentContainer.classList.add('panel-closed');
      }
    });
    
    openPanelBtn.addEventListener('click', () => {
      enrollPanel.style.display = 'block';
      openPanelBtn.style.display = 'none';
      if (donorsConsentContainer) {
        donorsConsentContainer.classList.remove('panel-closed');
      }
    });
  }
  
  // Initialize request details modal
  initRequestDetailsModal();
  
  // Render submitted request histories in the UI ledger
  renderRequestsLedger();
  
  // Prime shopping cart feedback badges
  updateCartUI();
});

// Helper to pull fresh snapshots from the DB Connector
async function refreshDatabaseCache() {
  specimensCache = await db.getSpecimens();
  donorsCache = await db.getDonors();
  requestsCache = await db.getResearchRequests();
  blockchainCache = await db.getBlockchainLedger();
  usersCache = await db.getUsers();
  auditCache = await db.getAuditLogs();
  limsSettings = await db.getSystemSettings();
  studiesCache = await db.getStudies();
  publicationsCache = await db.getPublications();

  const auditPanel = document.getElementById('audit-tab');
  if (auditPanel && auditPanel.classList.contains('active')) {
    renderAuditLogs();
  }

  updateRequestsBadge();
  updateCohortDiscoveryBadge();
}

function updateCohortDiscoveryBadge() {
  const catalogCountBadge = document.getElementById('catalog-count-badge');
  if (catalogCountBadge && specimensCache) {
    catalogCountBadge.textContent = specimensCache.length;
  }
}

function updateRequestsBadge() {
  const requestsBadge = document.getElementById('requests-count-badge');
  if (!requestsBadge) return;
  let userRequests = requestsCache || [];
  const pendingRequests = userRequests.filter(req => (req.status || '').toLowerCase() === 'pending');
  requestsBadge.textContent = pendingRequests.length;
}

// ==========================================
// Theme Management Engine
// ==========================================
function initThemeManager() {
  const trigger = document.getElementById('theme-menu-trigger');
  const dropdown = document.getElementById('theme-dropdown-list');
  const themeItems = document.querySelectorAll('.theme-dropdown-item');
  
  if (!trigger || !dropdown) return;
  
  // Toggle dropdown menu visibility
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  });
  
  // Close dropdown on click outside
  document.addEventListener('click', () => {
    dropdown.classList.remove('show');
  });
  
  // Handle click on specific theme option
  themeItems.forEach(item => {
    item.addEventListener('click', () => {
      const selectedTheme = item.getAttribute('data-theme');
      localStorage.setItem('aura_theme', selectedTheme);
      if (currentUser) {
        localStorage.setItem('aura_theme_' + currentUser.username, selectedTheme);
        currentUser.theme = selectedTheme;
        sessionStorage.setItem('aura_current_user', JSON.stringify(currentUser));
        db.updateUserTheme(currentUser.id, selectedTheme).catch(console.error);
      }
      applyTheme(selectedTheme);
      dropdown.classList.remove('show');
    });
  });
  
  // Load saved theme preference (default: system)
  const savedTheme = localStorage.getItem('aura_theme') || 'system';
  applyTheme(savedTheme);
  
  // Listen to OS theme changes reactively
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const currentPref = localStorage.getItem('aura_theme') || 'system';
    if (currentPref === 'system') {
      applyTheme('system');
    }
  });
}

function applyTheme(theme) {
  const body = document.body;
  const headerIcon = document.getElementById('header-theme-icon');
  
  // Set active class indicators in dropdown list
  document.querySelectorAll('.theme-dropdown-item').forEach(item => {
    if (item.getAttribute('data-theme') === theme) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  let resolvedTheme = theme;
  if (theme === 'system') {
    resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  if (resolvedTheme === 'light') {
    body.classList.add('light-theme');
    body.classList.remove('dark-theme');
    // Swap main header icon to Sun
    if (headerIcon) {
      headerIcon.innerHTML = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
    }
  } else {
    body.classList.add('dark-theme');
    body.classList.remove('light-theme');
    // Swap main header icon to Moon
    if (headerIcon) {
      headerIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
    }
  }
}

// ==========================================
// 1. Navigation & Tab Switching Controls
// ==========================================
function initTabs() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Update button active state
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update panel active state
      tabPanels.forEach(panel => {
        if (panel.id === targetTab) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });

      // Reset relocation states if switching tabs
      relocateMode = false;
      relocateSourceBarcode = null;

      // Update specific views dynamically on tab switch
      if (targetTab === 'dashboard-tab') {
        renderDashboardStats();
        renderSVGCharts();
        renderRequestsLedger();
      } else if (targetTab === 'catalog-tab') {
        refreshCatalogView();
      } else if (targetTab === 'requests-tab') {
        renderResearchRequests();
      } else if (targetTab === 'study-tab') {
        renderStudiesGrid();
      } else if (targetTab === 'allocation-tab') {
        renderSampleAllocation();
      } else if (targetTab === 'publications-tab') {
        renderPublications();
      } else if (targetTab === 'storage-tab') {
        initStorageGrid();
        const depositForm = document.getElementById('well-deposit-form-container');
        if (depositForm) depositForm.classList.add('hidden');
        const dataContent = document.getElementById('well-data-content');
        if (dataContent) dataContent.classList.add('hidden');
        const detailsPane = document.getElementById('well-details-pane');
        if (detailsPane) {
          const placeholder = detailsPane.querySelector('.well-placeholder-text');
          if (placeholder) placeholder.style.display = 'block';
        }
      } else if (targetTab === 'consent-tab') {
        populateConsentDonorDropdown();
        renderBlockchainLedger();
      } else if (targetTab === 'donors-tab') {
        renderDonorsDirectory();
      } else if (targetTab === 'access-tab') {
        initAccessControl();
      } else if (targetTab === 'audit-tab') {
        renderAuditLogs();
      } else if (targetTab === 'reports-tab') {
        initReports();
        renderReportPreview();
      }
    });
  });
}

// ==========================================
// 2. Dashboard Dynamic Stats & SVG Charts
// ==========================================
async function renderDashboardStats() {
  const statsTotalSpecimens = document.getElementById('stats-total-specimens');
  const statsSpecimenCount = document.getElementById('stats-specimen-count');
  const statsDonorCount = document.getElementById('stats-donor-count');
  const statsRequestCount = document.getElementById('stats-request-count');
  const statsBlockCount = document.getElementById('stats-block-count');
  
  try {
    const stats = await db.getStats();
    if (statsTotalSpecimens) statsTotalSpecimens.textContent = stats.totalSpecimens;
    if (statsSpecimenCount) statsSpecimenCount.textContent = stats.totalSpecimens;
    if (statsDonorCount) statsDonorCount.textContent = stats.totalDonors;
    if (statsRequestCount) statsRequestCount.textContent = stats.totalRequests;
    if (statsBlockCount) statsBlockCount.textContent = stats.totalStudies + stats.totalPublications;
  } catch (err) {
    console.error("Failed to render dashboard stats from server, falling back to cache:", err);
    const specLen = specimensCache.length;
    const donorLen = donorsCache.length;
    const requestLen = requestsCache.length;
    const blockLen = blockchainCache.length;
    
    if (statsTotalSpecimens) statsTotalSpecimens.textContent = specLen;
    if (statsSpecimenCount) statsSpecimenCount.textContent = specLen;
    if (statsDonorCount) statsDonorCount.textContent = donorLen;
    if (statsRequestCount) statsRequestCount.textContent = requestLen;
    if (statsBlockCount) statsBlockCount.textContent = blockLen;
  }
}

function renderSVGCharts() {
  renderDashboard();
}

function getCohortCategory(diagnosis) {
  const diag = (diagnosis || '').toLowerCase();
  if (diag.includes('healthy') || diag.includes('control')) return 'Healthy Control';
  if (diag.includes('cancer') || diag.includes('tumor') || diag.includes('carcinoma') || diag.includes('malignan')) return 'Cancer';
  if (diag.includes('diabetes') || diag.includes('diabetic')) return 'Diabetes';
  if (diag.includes('cardio') || diag.includes('heart') || diag.includes('hypertension') || diag.includes('vascular')) return 'Cardiovascular Disease';
  if (diag.includes('neuro') || diag.includes('alzheimer') || diag.includes('parkinson') || diag.includes('dementia') || diag.includes('sclerosis')) return 'Neurological Disorders';
  if (diag.includes('rare') || diag.includes('genetic') || diag.includes('huntington') || diag.includes('cystic')) return 'Rare Disease';
  return 'Other';
}

function renderDashboard() {
  // 1. Get current filters
  const cohortFilter = document.getElementById('dash-filter-cohort');
  const diseaseFilter = document.getElementById('dash-filter-disease');
  const typeFilter = document.getElementById('dash-filter-sample-type');
  const projectFilter = document.getElementById('dash-filter-project');
  const dateStart = document.getElementById('dash-filter-date-start');
  const dateEnd = document.getElementById('dash-filter-date-end');

  const cohortVal = cohortFilter ? cohortFilter.value : 'all';
  const diseaseVal = diseaseFilter ? diseaseFilter.value.toLowerCase().trim() : '';
  const typeVal = typeFilter ? typeFilter.value : 'all';
  const projectVal = projectFilter ? projectFilter.value : 'all';
  const dateStartVal = dateStart ? dateStart.value : '';
  const dateEndVal = dateEnd ? dateEnd.value : '';

  // 2. Compute date boundaries
  const startLimit = dateStartVal ? new Date(dateStartVal + 'T00:00:00') : null;
  const endLimit = dateEndVal ? new Date(dateEndVal + 'T23:59:59.999') : null;
  
  const filterByDate = (dateStr) => {
    if (!dateStr) return true;
    const d = new Date(dateStr);
    if (startLimit && d < startLimit) return false;
    if (endLimit && d > endLimit) return false;
    return true;
  };

  // 3. Project specimen barcode list if filtered
  let allowedBarcodes = new Set();
  if (projectVal !== 'all') {
    const study = studiesCache.find(st => String(st.id) === String(projectVal));
    if (study) {
      requestsCache.forEach(req => {
        if (req.irbCode === study.irb_code) {
          (req.samples || []).forEach(sample => {
            allowedBarcodes.add(sample.barcode);
          });
        }
      });
    }
  }

  // 4. Filter specimens
  const filteredSpecimens = specimensCache.filter(s => {
    const matchDate = filterByDate(s.createdAt);
    const matchType = typeVal === 'all' || s.type === typeVal;
    const matchCohort = cohortVal === 'all' || getCohortCategory(s.diagnosis) === cohortVal;
    const matchDisease = !diseaseVal || (s.diagnosis && s.diagnosis.toLowerCase().includes(diseaseVal));
    const matchProject = projectVal === 'all' || allowedBarcodes.has(s.barcode);
    return matchDate && matchType && matchCohort && matchDisease && matchProject;
  });

  // 5. Filter donors
  const filteredDonors = donorsCache.filter(d => {
    const matchDate = filterByDate(d.createdAt);
    const matchCohort = cohortVal === 'all' || getCohortCategory(d.diagnosis) === cohortVal;
    const matchDisease = !diseaseVal || (d.diagnosis && d.diagnosis.toLowerCase().includes(diseaseVal));
    return matchDate && matchCohort && matchDisease;
  });

  // 6. Filter studies & requests
  const filteredStudies = studiesCache.filter(st => filterByDate(st.created_at));
  const filteredRequests = requestsCache.filter(req => filterByDate(req.createdAt));

  // 7. Update top KPI card values
  const statsTotalDonors = document.getElementById('stats-total-donors');
  const statsTotalSpecimens = document.getElementById('stats-total-specimens');
  const statsAvailableAliquots = document.getElementById('stats-available-aliquots');
  const statsActiveConsents = document.getElementById('stats-active-consents');
  const statsActiveProjects = document.getElementById('stats-active-projects');
  const statsAvailableRequest = document.getElementById('stats-available-request');

  if (statsTotalDonors) statsTotalDonors.textContent = donorsCache.length;
  if (statsTotalSpecimens) statsTotalSpecimens.textContent = specimensCache.length;
  if (statsAvailableAliquots) {
    statsAvailableAliquots.textContent = specimensCache.filter(s => s.retrievalStatus === 'Stored').length;
  }
  if (statsActiveConsents) {
    statsActiveConsents.textContent = donorsCache.filter(d => d.consentStatus === 'Active' || d.consentStatus === 'Verified').length;
  }
  if (statsActiveProjects) statsActiveProjects.textContent = studiesCache.length;
  if (statsAvailableRequest) {
    statsAvailableRequest.textContent = specimensCache.filter(s => s.retrievalStatus === 'Stored' && s.consent && (s.consent.academic || s.consent.genomic || s.consent.commercial)).length;
  }

  // 8. Render Section 1: Specimen Type Distribution
  const typeCounts = {
    'Blood': 0, 'Plasma': 0, 'Serum': 0, 'Buffy Coat': 0, 'PBMC': 0,
    'DNA': 0, 'RNA': 0, 'Fresh Tissue': 0, 'FFPE Tissue': 0, 'Urine': 0,
    'Saliva': 0, 'Other': 0
  };
  filteredSpecimens.forEach(s => {
    const type = s.type;
    if (typeCounts[type] !== undefined) {
      typeCounts[type]++;
    } else {
      typeCounts['Other']++;
    }
  });

  const specimenColors = {
    'Blood': 'var(--accent-red)',
    'Plasma': 'var(--accent-orange)',
    'Serum': '#eab308',
    'Buffy Coat': '#3b82f6',
    'PBMC': '#6366f1',
    'DNA': 'var(--accent-cyan)',
    'RNA': 'var(--accent-teal)',
    'Fresh Tissue': 'var(--accent-purple)',
    'FFPE Tissue': '#ec4899',
    'Urine': '#10b981',
    'Saliva': '#8b5cf6',
    'Other': '#6b7280'
  };

  drawDonutChart('specimen-pie-container', typeCounts, specimenColors);
  drawBarChart('specimen-bar-container', typeCounts, specimenColors);

  // 9. Render Section 2: Cohort Distribution
  const cohortCounts = {
    'Healthy Control': 0,
    'Cancer': 0,
    'Diabetes': 0,
    'Cardiovascular Disease': 0,
    'Neurological Disorders': 0,
    'Rare Disease': 0,
    'Other': 0
  };
  filteredSpecimens.forEach(s => {
    const cat = getCohortCategory(s.diagnosis);
    if (cohortCounts[cat] !== undefined) {
      cohortCounts[cat]++;
    } else {
      cohortCounts['Other']++;
    }
  });

  const cohortColors = {
    'Healthy Control': 'var(--accent-teal)',
    'Cancer': 'var(--accent-red)',
    'Diabetes': 'var(--accent-orange)',
    'Cardiovascular Disease': '#3b82f6',
    'Neurological Disorders': 'var(--accent-purple)',
    'Rare Disease': 'var(--accent-cyan)',
    'Other': '#6b7280'
  };

  drawDonutChart('cohort-donut-container', cohortCounts, cohortColors);
  drawBarChart('cohort-bar-container', cohortCounts, cohortColors);

  // 10. Render Section 3: Sample Availability Matrix
  const matrixData = {};
  filteredSpecimens.forEach(s => {
    const type = s.type || 'Other';
    if (!matrixData[type]) {
      matrixData[type] = { total: 0, available: 0, reserved: 0, released: 0 };
    }
    matrixData[type].total++;
    if (s.retrievalStatus === 'Stored') {
      matrixData[type].available++;
    } else if (s.retrievalStatus === 'Reserved') {
      matrixData[type].reserved++;
    } else if (s.retrievalStatus === 'Released') {
      matrixData[type].released++;
    }
  });

  const matrixTbody = document.getElementById('stats-availability-matrix-tbody');
  if (matrixTbody) {
    matrixTbody.innerHTML = '';
    const entries = Object.entries(matrixData);
    if (entries.length === 0) {
      matrixTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 12px 0;">No specimens match the active filters.</td></tr>';
    } else {
      entries.forEach(([type, counts]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${type}</strong></td>
          <td style="font-family: monospace;">${counts.total}</td>
          <td style="font-family: monospace; color: var(--accent-teal);">${counts.available}</td>
          <td style="font-family: monospace; color: var(--accent-orange);">${counts.reserved}</td>
          <td style="font-family: monospace; color: var(--accent-purple);">${counts.released}</td>
        `;
        matrixTbody.appendChild(tr);
      });
    }
  }

  // 11. Render Section 4: Consent Analytics
  const totalD = filteredDonors.length;
  let generalCount = 0;
  let genomicsCount = 0;
  let sharingCount = 0;
  let commercialCount = 0;
  let internationalCount = 0;

  filteredDonors.forEach(d => {
    if (d.academic || d.consentStatus === 'Active') generalCount++;
    if (d.genomic) genomicsCount++;
    if (d.dataSharing) sharingCount++;
    if (d.commercial) commercialCount++;
    if (d.academic && d.genomic) internationalCount++;
  });

  const renderConsentBar = (label, count) => {
    const pct = totalD > 0 ? Math.round((count / totalD) * 100) : 0;
    return `
      <div style="margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
          <span style="color: var(--text-secondary); font-weight: 500;">${label}</span>
          <span style="color: var(--text-primary); font-weight: 700; font-family: monospace;">${count} (${pct}%)</span>
        </div>
        <div style="height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden;">
          <div style="height: 100%; width: ${pct}%; background: var(--accent-teal); transition: width 0.5s ease;"></div>
        </div>
      </div>
    `;
  };

  const consentContainer = document.getElementById('stats-consent-analytics-container');
  if (consentContainer) {
    consentContainer.innerHTML = `
      ${renderConsentBar('General Research Consent', generalCount)}
      ${renderConsentBar('Genomics Consent', genomicsCount)}
      ${renderConsentBar('Data Sharing Consent', sharingCount)}
      ${renderConsentBar('Commercial Use Consent', commercialCount)}
      ${renderConsentBar('International Collaboration Consent', internationalCount)}
    `;
  }

  // 12. Render Section 5: Omics Data Availability
  const omicsTbody = document.getElementById('stats-omics-availability-tbody');
  if (omicsTbody) {
    const dnaLen = filteredSpecimens.filter(s => s.type === 'DNA').length;
    const rnaLen = filteredSpecimens.filter(s => s.type === 'RNA').length;
    const proteinLen = filteredSpecimens.filter(s => s.type === 'Serum' || s.type === 'Plasma').length;
    
    omicsTbody.innerHTML = `
      <tr>
        <td><strong>Genomics (WGS / Exome)</strong></td>
        <td style="font-family: monospace;">${dnaLen} datasets</td>
        <td style="font-family: monospace; color: var(--accent-cyan);">${dnaLen * 24} records</td>
      </tr>
      <tr>
        <td><strong>Transcriptomics (RNA-Seq)</strong></td>
        <td style="font-family: monospace;">${rnaLen} datasets</td>
        <td style="font-family: monospace; color: var(--accent-teal);">${rnaLen * 16} records</td>
      </tr>
      <tr>
        <td><strong>Proteomics (Mass Spectrometry)</strong></td>
        <td style="font-family: monospace;">${proteinLen} datasets</td>
        <td style="font-family: monospace; color: var(--accent-purple);">${proteinLen * 48} records</td>
      </tr>
    `;
  }

  // 13. Render Section 6: Sample Lifecycle Status (Funnel)
  const collected = filteredSpecimens.length;
  const processed = filteredSpecimens.filter(s => s.qcStatus === 'Verified' || s.qcStatus === 'Passed' || s.retrievalStatus === 'Released' || s.retrievalStatus === 'Reserved').length;
  const stored = filteredSpecimens.filter(s => s.retrievalStatus === 'Stored' || s.retrievalStatus === 'Reserved').length;
  const distributed = filteredSpecimens.filter(s => s.retrievalStatus === 'Released').length;

  const funnelContainer = document.getElementById('lifecycle-funnel-container');
  if (funnelContainer) {
    const getFunnelBar = (label, count, max, color) => {
      const pct = max > 0 ? Math.round((count / max) * 100) : 0;
      return `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
          <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary); width: 80px; text-align: right;">${label}</span>
          <div style="flex: 1; height: 20px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; position: relative;">
            <div style="height: 100%; width: ${pct}%; background: ${color}; transition: width 0.5s ease; border-radius: 4px 0 0 4px;"></div>
            <span style="position: absolute; left: 10px; top: 3px; font-size: 10px; font-weight: 700; color: #fff; font-family: monospace;">${count} (${pct}%)</span>
          </div>
        </div>
      `;
    };
    funnelContainer.innerHTML = `
      ${getFunnelBar('Collected', collected, collected, 'var(--accent-cyan)')}
      ${getFunnelBar('Processed (QC)', processed, collected, 'var(--accent-teal)')}
      ${getFunnelBar('Stored', stored, collected, 'var(--accent-orange)')}
      ${getFunnelBar('Distributed', distributed, collected, 'var(--accent-purple)')}
    `;
  }

  // 14. Render Section 7: Research Access Requests Summary
  let reqPending = 0;
  let reqApproved = 0;
  let reqRejected = 0;
  let reqAllocated = 0;

  filteredRequests.forEach(req => {
    const status = (req.status || '').toLowerCase();
    if (status === 'pending') reqPending++;
    else if (status === 'approved') reqApproved++;
    else if (status === 'rejected') reqRejected++;
    else if (status === 'allocated' || status === 'released') reqAllocated++;
  });
  
  const requestsSummaryContainer = document.getElementById('stats-requests-summary-container');
  if (requestsSummaryContainer) {
    const renderStatBox = (label, count) => `
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); padding: 10px; border-radius: 8px;">
        <span style="font-size: 9px; text-transform: uppercase; color: var(--text-secondary); display: block; font-weight: 700; margin-bottom: 4px;">${label}</span>
        <strong style="font-size: 16px; color: var(--text-primary); font-family: monospace;">${count}</strong>
      </div>
    `;
    requestsSummaryContainer.innerHTML = `
      ${renderStatBox('Total', filteredRequests.length)}
      ${renderStatBox('Pending', reqPending)}
      ${renderStatBox('Approved', reqApproved)}
      ${renderStatBox('Allocated', reqAllocated)}
      ${renderStatBox('Rejected', reqRejected)}
    `;
  }

  // 15. Render Section 8: Research Impact Metrics
  const totalPubs = publicationsCache.filter(pub => {
    if (!pub.linked_study_id) return filterByDate(pub.created_at);
    const study = studiesCache.find(st => String(st.id) === String(pub.linked_study_id));
    return study ? filterByDate(study.created_at) : filterByDate(pub.created_at);
  }).length;

  const approvedRequests = filteredRequests.filter(req => req.status === 'Approved' || req.status === 'Allocated' || req.status === 'Released');
  const totalRequestedSamples = approvedRequests.reduce((sum, req) => sum + (req.samples ? req.samples.length : 0), 0);
  const avgSpecimens = approvedRequests.length > 0 ? (totalRequestedSamples / approvedRequests.length).toFixed(1) : '0.0';

  const impactContainer = document.getElementById('stats-impact-container');
  if (impactContainer) {
    impactContainer.innerHTML = `
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; text-align: center;">
        <span style="font-size: 9px; text-transform: uppercase; color: var(--text-secondary); display: block; font-weight: 700; margin-bottom: 6px;">Publications</span>
        <strong style="font-size: 20px; color: var(--accent-cyan); font-family: monospace;">${totalPubs}</strong>
      </div>
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; text-align: center;">
        <span style="font-size: 9px; text-transform: uppercase; color: var(--text-secondary); display: block; font-weight: 700; margin-bottom: 6px;">Avg. Specimens / Approved Request</span>
        <strong style="font-size: 20px; color: var(--accent-teal); font-family: monospace;">${avgSpecimens}</strong>
      </div>
    `;
  }

  // 16. Render Section 9: Recent Research Activity
  const activityList = [];
  filteredRequests.forEach(req => {
    activityList.push({
      category: 'Access Request',
      details: `${req.researcherName} requested ${req.samples ? req.samples.length : 0} specimens (IRB: ${req.irbCode})`,
      timestamp: req.createdAt,
      status: req.status
    });
  });

  auditCache.forEach(log => {
    if (filterByDate(log.timestamp)) {
      activityList.push({
        category: log.action || 'Audit Event',
        details: `${log.username} (${log.role}): ${log.details}`,
        timestamp: log.timestamp,
        status: 'Logged'
      });
    }
  });

  activityList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const recentActivity = activityList.slice(0, 10);

  const recentActivityTbody = document.getElementById('stats-recent-activity-tbody');
  if (recentActivityTbody) {
    recentActivityTbody.innerHTML = '';
    if (recentActivity.length === 0) {
      recentActivityTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 12px 0;">No recent research activity found.</td></tr>`;
    } else {
      recentActivity.forEach(act => {
        const tr = document.createElement('tr');
        const dateStr = new Date(act.timestamp).toLocaleString();
        
        let statusBadgeClass = 'orange-bg';
        if (act.status === 'Approved' || act.status === 'Logged' || act.status === 'Active') {
          statusBadgeClass = 'green-bg';
        } else if (act.status === 'Rejected' || act.status === 'Failed') {
          statusBadgeClass = 'red-bg';
        } else if (act.status === 'Allocated' || act.status === 'Released') {
          statusBadgeClass = 'cyan-bg';
        }
        
        tr.innerHTML = `
          <td><span class="badge" style="background: rgba(0, 242, 254, 0.05); color: var(--accent-cyan); font-size:10px;">${act.category}</span></td>
          <td><span style="font-size:12px; color:var(--text-secondary);">${act.details}</span></td>
          <td style="font-family: monospace; font-size:11px; white-space:nowrap;">${dateStr}</td>
          <td><span class="badge ${statusBadgeClass}">${act.status}</span></td>
        `;
        recentActivityTbody.appendChild(tr);
      });
    }
  }

  // 17. Render Secure Access Request Ledger
  renderRequestsLedger(filteredRequests);
}

function drawDonutChart(containerId, counts, colors) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    container.innerHTML = `<svg viewBox="0 0 140 140" style="width: 100%; height: 100%;"><text x="70" y="75" text-anchor="middle" font-size="9" fill="var(--text-secondary)">No records</text></svg>`;
    return;
  }

  const r = 40;
  const circ = 2 * Math.PI * r;
  let cumulativePercent = 0;
  
  let svgContent = `<svg viewBox="0 0 140 140" style="width: 100%; height: 100%;">
    <circle cx="70" cy="70" r="${r}" fill="transparent" stroke="var(--bg-tertiary)" stroke-width="10"/>`;

  for (const [key, count] of Object.entries(counts)) {
    if (count === 0) continue;
    const percent = count / total;
    const strokeLength = percent * circ;
    const color = colors[key] || '#9ca3af';

    svgContent += `
      <circle cx="70" cy="70" r="${r}" fill="transparent"
        stroke="${color}"
        stroke-width="10"
        stroke-dasharray="${strokeLength} ${circ}"
        stroke-dashoffset="-${cumulativePercent * circ}"
        transform="rotate(-90 70 70)"
        style="transition: stroke-dashoffset 0.5s ease;"
      />`;

    cumulativePercent += percent;
  }

  svgContent += `
    <circle cx="70" cy="70" r="32" fill="var(--bg-secondary)"/>
    <text x="70" y="68" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text-primary)" font-family="var(--font-title)">${total}</text>
    <text x="70" y="80" text-anchor="middle" font-size="7" font-weight="600" fill="var(--text-secondary)" font-family="var(--font-body)">TOTAL</text>
  </svg>`;

  container.innerHTML = svgContent;
}

function drawBarChart(containerId, counts, colors) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const sortedData = Object.entries(counts).filter(([_, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCount = Math.max(...Object.values(counts), 1);
  
  let svgContent = `<svg viewBox="0 0 200 150" style="width: 100%; height: 130px;">`;
  let y = 10;
  
  sortedData.forEach(([key, count]) => {
    const barWidth = (count / maxCount) * 110;
    const color = colors[key] || '#9ca3af';
    
    svgContent += `
      <text x="5" y="${y + 9}" font-size="8" font-weight="500" fill="var(--text-secondary)">${key.slice(0, 10)}</text>
      <rect x="65" y="${y}" width="${barWidth}" height="10" rx="3" fill="${color}"/>
      <text x="${70 + barWidth}" y="${y + 9}" font-size="8" font-weight="700" fill="var(--text-primary)" font-family="monospace">${count}</text>
    `;
    y += 26;
  });

  if (sortedData.length === 0) {
    svgContent += `<text x="100" y="75" text-anchor="middle" font-size="9" fill="var(--text-secondary)">No records found</text>`;
  }

  svgContent += `</svg>`;
  container.innerHTML = svgContent;
}

let selectedDatePreset = '30days';

function getPresetDates(preset) {
  const today = new Date();
  let start = new Date();
  let end = new Date();
  
  end.setHours(23, 59, 59, 999);

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      start.setDate(today.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(today.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case '7days':
      start.setDate(today.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case '30days':
      start.setDate(today.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    case 'thismonth':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case 'lastmonth':
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      break;
    default:
      return null;
  }
  return { start, end };
}

function formatDateLabel(start, end) {
  const opt = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', opt)} - ${end.toLocaleDateString('en-US', opt)}`;
}

function validateDateRangeInput(startStr, endStr) {
  const errorEl = document.getElementById('date-validation-error');
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }

  if (!startStr || !endStr) {
    if (errorEl) {
      errorEl.textContent = 'Please select both start and end dates.';
      errorEl.style.display = 'block';
    }
    return false;
  }

  const start = new Date(startStr);
  const end = new Date(endStr);
  
  if (end < start) {
    if (errorEl) {
      errorEl.textContent = 'End date cannot be earlier than start date.';
      errorEl.style.display = 'block';
    }
    return false;
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  const isAdmin = currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Super Admin' || currentUser.role === 'Lab Admin');
  
  if (!isAdmin) {
    if (start > today || end > today) {
      if (errorEl) {
        errorEl.textContent = 'Future dates are only allowed for administrators.';
        errorEl.style.display = 'block';
      }
      return false;
    }
  }

  return true;
}

function updateDateInputMaxAttributes() {
  const dateStart = document.getElementById('dash-filter-date-start');
  const dateEnd = document.getElementById('dash-filter-date-end');
  if (!dateStart || !dateEnd) return;

  const isAdmin = currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Super Admin' || currentUser.role === 'Lab Admin');
  
  if (!isAdmin) {
    const todayStr = new Date().toISOString().split('T')[0];
    dateStart.setAttribute('max', todayStr);
    dateEnd.setAttribute('max', todayStr);
  } else {
    dateStart.removeAttribute('max');
    dateEnd.removeAttribute('max');
  }
}

function applySelectedPreset(preset) {
  selectedDatePreset = preset;
  
  document.querySelectorAll('.preset-btn').forEach(btn => {
    if (btn.getAttribute('data-preset') === preset) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const customDiv = document.getElementById('custom-date-inputs');
  const dateStart = document.getElementById('dash-filter-date-start');
  const dateEnd = document.getElementById('dash-filter-date-end');
  const pickerBtnLabel = document.getElementById('selected-date-range-text');
  const headerLabel = document.getElementById('dashboard-range-text');

  if (preset === 'custom') {
    if (customDiv) customDiv.style.display = 'flex';
    return;
  }

  if (customDiv) customDiv.style.display = 'none';

  const range = getPresetDates(preset);
  if (range) {
    const startStr = range.start.toISOString().split('T')[0];
    const endStr = range.end.toISOString().split('T')[0];
    
    if (dateStart) dateStart.value = startStr;
    if (dateEnd) dateEnd.value = endStr;
    
    const labelText = preset.charAt(0).toUpperCase() + preset.slice(1).replace('days', ' Days').replace('thismonth', 'This Month').replace('lastmonth', 'Last Month');
    const formattedLabel = labelText.replace('7 Days', 'Last 7 Days').replace('30 Days', 'Last 30 Days');
    
    if (pickerBtnLabel) pickerBtnLabel.textContent = formattedLabel;
    if (headerLabel) {
      headerLabel.textContent = `${formattedLabel} (${formatDateLabel(range.start, range.end)})`;
    }
    
    const dropdown = document.getElementById('date-picker-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    
    renderDashboard();
  }
}

function initDashboardFilters() {
  const cohortFilter = document.getElementById('dash-filter-cohort');
  const diseaseFilter = document.getElementById('dash-filter-disease');
  const typeFilter = document.getElementById('dash-filter-sample-type');
  const projectFilter = document.getElementById('dash-filter-project');
  const dateStart = document.getElementById('dash-filter-date-start');
  const dateEnd = document.getElementById('dash-filter-date-end');
  const btnReset = document.getElementById('btn-reset-dashboard-filters');
  const btnClear = document.getElementById('btn-clear-dashboard-filters');
  const btnRefresh = document.getElementById('btn-refresh-dashboard');
  
  const pickerBtn = document.getElementById('date-range-picker-btn');
  const dropdown = document.getElementById('date-picker-dropdown');
  const applyCustomBtn = document.getElementById('apply-custom-date-btn');

  const onFilterChange = () => {
    renderDashboard();
  };

  if (cohortFilter) cohortFilter.addEventListener('change', onFilterChange);
  if (diseaseFilter) diseaseFilter.addEventListener('input', onFilterChange);
  if (typeFilter) typeFilter.addEventListener('change', onFilterChange);
  if (projectFilter) projectFilter.addEventListener('change', onFilterChange);

  if (pickerBtn && dropdown) {
    pickerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display === 'flex';
      dropdown.style.display = isVisible ? 'none' : 'flex';
      updateDateInputMaxAttributes();
    });
  }

  document.addEventListener('click', (e) => {
    if (dropdown && !dropdown.contains(e.target) && pickerBtn && !pickerBtn.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      applySelectedPreset(btn.getAttribute('data-preset'));
    });
  });

  if (applyCustomBtn) {
    applyCustomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const startStr = dateStart ? dateStart.value : '';
      const endStr = dateEnd ? dateEnd.value : '';
      
      if (!validateDateRangeInput(startStr, endStr)) return;
      
      const start = new Date(startStr);
      const end = new Date(endStr);
      const formatted = formatDateLabel(start, end);
      
      const pickerBtnLabel = document.getElementById('selected-date-range-text');
      const headerLabel = document.getElementById('dashboard-range-text');
      
      if (pickerBtnLabel) pickerBtnLabel.textContent = 'Custom Range';
      if (headerLabel) {
        headerLabel.textContent = `Custom Range (${formatted})`;
      }
      
      if (dropdown) dropdown.style.display = 'none';
      renderDashboard();
    });
  }

  applySelectedPreset('30days');

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (cohortFilter) cohortFilter.value = 'all';
      if (diseaseFilter) diseaseFilter.value = '';
      if (typeFilter) typeFilter.value = 'all';
      if (projectFilter) projectFilter.value = 'all';
      applySelectedPreset('30days');
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (cohortFilter) cohortFilter.value = 'all';
      if (diseaseFilter) diseaseFilter.value = '';
      if (typeFilter) typeFilter.value = 'all';
      if (projectFilter) projectFilter.value = 'all';
      applySelectedPreset('30days');
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.disabled = true;
      btnRefresh.innerHTML = '<span>🔄</span> Refreshing...';
      try {
        await refreshDatabaseCache();
        renderDashboard();
      } catch (err) {
        console.error("Error refreshing dashboard:", err);
      } finally {
        btnRefresh.disabled = false;
        btnRefresh.innerHTML = '<span>🔄</span> Refresh Dashboard';
      }
    });
  }

  populateDashboardProjectFilter();
}

function populateDashboardProjectFilter() {
  const projectFilter = document.getElementById('dash-filter-project');
  if (!projectFilter) return;

  const currentSelection = projectFilter.value || 'all';
  projectFilter.innerHTML = '<option value="all">All Projects</option>';
  
  studiesCache.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st.id;
    opt.textContent = `${st.title} (${st.irb_code})`;
    projectFilter.appendChild(opt);
  });

  projectFilter.value = currentSelection;
}

// ==========================================
// 3. Specimen Catalog & Cohort Builder
function initCatalog() {
  const filterType = document.getElementById('filter-sample-type');
  const filterDiag = document.getElementById('filter-diagnosis');
  const filterGender = document.getElementById('filter-gender');
  const filterSearchText = document.getElementById('filter-search-text');
  const globalSearchInput = document.getElementById('global-search-input');
  const resetBtn = document.getElementById('btn-reset-filters');

  // Filter application event loop
  const applyFilters = () => {
    const typeVal = filterType.value;
    const diagVal = filterDiag.value;
    const genderVal = filterGender.value;
    const searchVal = (filterSearchText ? filterSearchText.value : (globalSearchInput ? globalSearchInput.value : '')).toLowerCase().trim();

    const filtered = specimensCache.filter(item => {
      const matchType = typeVal === 'all' || item.type === typeVal;
      const matchDiag = diagVal === 'all' || item.diagnosis === diagVal;
      const matchGender = genderVal === 'all' || item.gender === genderVal;
      
      let matchSearch = true;
      if (searchVal) {
        matchSearch = 
          (item.barcode && item.barcode.toLowerCase().includes(searchVal)) ||
          (item.diagnosis && item.diagnosis.toLowerCase().includes(searchVal)) ||
          (item.donorId && item.donorId.toLowerCase().includes(searchVal)) ||
          (item.location && item.location.toLowerCase().includes(searchVal)) ||
          (item.type && item.type.toLowerCase().includes(searchVal));
      }
      
      return matchType && matchDiag && matchGender && matchSearch;
    });

    catalogPageIndex = 0;
    renderCatalogTable(filtered);
  };

  window.applyCatalogFilters = applyFilters;

  filterType.addEventListener('change', applyFilters);
  filterDiag.addEventListener('change', applyFilters);
  filterGender.addEventListener('change', applyFilters);

  if (filterSearchText) {
    filterSearchText.addEventListener('input', (e) => {
      if (globalSearchInput) {
        globalSearchInput.value = e.target.value;
      }
      applyFilters();
    });
  }

  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (e) => {
      if (filterSearchText) {
        filterSearchText.value = e.target.value;
      }
      
      // Auto-switch to catalog tab when searching
      const activeTabBtn = document.querySelector('.nav-btn.active');
      if (activeTabBtn && activeTabBtn.getAttribute('data-tab') !== 'catalog-tab') {
        const catalogBtn = document.querySelector('.nav-btn[data-tab="catalog-tab"]');
        if (catalogBtn) {
          catalogBtn.click();
        }
      }
      
      applyFilters();
    });
  }

  resetBtn.addEventListener('click', () => {
    filterType.value = 'all';
    filterDiag.value = 'all';
    filterGender.value = 'all';
    if (filterSearchText) filterSearchText.value = '';
    if (globalSearchInput) globalSearchInput.value = '';
    applyFilters();
  });

  // Initial table render
  applyFilters();
}

function renderCatalogTable(data) {
  const tbody = document.getElementById('catalog-table-body');
  const matchCount = document.getElementById('cohort-match-count');
  
  if (!tbody) return;
  
  // Update matching cohort counter
  matchCount.textContent = `${data.length} specimen${data.length === 1 ? '' : 's'} matched`;
  
  tbody.innerHTML = '';
  
  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 32px 0;">
          No specimens match the active cohort filter criteria.
        </td>
      </tr>
    `;
    // Update pagination controls to show empty state
    const paginationInfo = document.getElementById('catalog-pagination-info');
    const pageInfo = document.getElementById('catalog-page-info');
    const btnPrev = document.getElementById('catalog-btn-prev');
    const btnNext = document.getElementById('catalog-btn-next');
    if (paginationInfo) paginationInfo.textContent = "Showing 0 to 0 of 0 entries";
    if (pageInfo) pageInfo.textContent = "Page 1 of 1";
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }

  // Calculate Pagination bounds
  const totalRecords = data.length;
  const totalPages = Math.max(Math.ceil(totalRecords / catalogPageSize), 1);
  
  if (catalogPageIndex >= totalPages) {
    catalogPageIndex = totalPages - 1;
  }
  if (catalogPageIndex < 0) {
    catalogPageIndex = 0;
  }
  
  const startIdx = catalogPageIndex * catalogPageSize;
  const endIdx = Math.min(startIdx + catalogPageSize, totalRecords);
  
  const pagedRecords = data.slice(startIdx, endIdx);

  // Update pagination badges and controls
  const paginationInfo = document.getElementById('catalog-pagination-info');
  const pageInfo = document.getElementById('catalog-page-info');
  const btnPrev = document.getElementById('catalog-btn-prev');
  const btnNext = document.getElementById('catalog-btn-next');
  
  if (paginationInfo) {
    paginationInfo.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${totalRecords} entries`;
  }
  if (pageInfo) {
    pageInfo.textContent = `Page ${catalogPageIndex + 1} of ${totalPages}`;
  }
  if (btnPrev) {
    btnPrev.disabled = (catalogPageIndex === 0);
    btnPrev.onclick = () => {
      catalogPageIndex--;
      renderCatalogTable(data);
      const viewport = document.querySelector('.content-viewport');
      if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }
  if (btnNext) {
    btnNext.disabled = (endIdx >= totalRecords);
    btnNext.onclick = () => {
      catalogPageIndex++;
      renderCatalogTable(data);
      const viewport = document.querySelector('.content-viewport');
      if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }

  pagedRecords.forEach(item => {
    const inCart = requestCart.some(c => c.barcode === item.barcode);
    const row = document.createElement('tr');
    
    // Check if donor's consent has expired, been withdrawn, or failed granular permissions
    const blockCheck = checkSpecimenConsentBlocked(item);
    const isBlocked = blockCheck.isBlocked;
    const blockReason = blockCheck.reason;

    // Create consent level badges
    const consentLabels = [];
    if (item.consent.academic) consentLabels.push('ACA');
    if (item.consent.genomic) consentLabels.push('GEN');
    if (item.consent.commercial) consentLabels.push('COM');
    const consentText = consentLabels.join(' | ') || 'NONE';

    let actionCellHTML = '';
    if (isBlocked) {
      actionCellHTML = `<span class="badge red-bg" style="font-size:10px; font-weight:600; padding:6px; cursor:not-allowed;" title="${blockReason}">🚫 Blocked (${blockReason.split(' ')[1]})</span>`;
    } else {
      actionCellHTML = `
        <button class="action-btn-sm ${inCart ? 'added' : ''}" data-barcode="${item.barcode}">
          ${inCart ? 'Selected' : 'Add to Cart'}
        </button>
      `;
    }

    row.innerHTML = `
      <td><span class="barcode-txt">${item.barcode}</span></td>
      <td><span class="specimen-tag">${item.type}</span></td>
      <td><strong>${item.diagnosis}</strong></td>
      <td>${item.gender}, Age ${item.age} (${item.donorId})</td>
      <td><span style="font-family: monospace; font-size:11px;">${item.location ? item.location.split('>').pop().trim() : 'Unassigned'}</span></td>
      <td>${item.quality}</td>
      <td><span class="badge" style="background: rgba(149, 0, 255, 0.08); color: #c084fc;">${consentText}</span></td>
      <td style="text-align: center; vertical-align: middle;">
        ${actionCellHTML}
      </td>
    `;
    
    // Wire up Add to Cart button if not blocked
    if (!isBlocked) {
      const btn = row.querySelector('.action-btn-sm');
      if (btn) {
        if (!inCart) {
          btn.addEventListener('click', () => {
            addToCart(item);
            btn.classList.add('added');
            btn.textContent = 'Selected';
            btn.disabled = true;
          });
        } else {
          btn.disabled = true;
        }
      }
    }

    tbody.appendChild(row);
  });
}

// 4. Freezer Storage Grid Matrix
// ==========================================
function initStorageGrid() {
  const gridContainer = document.getElementById('storage-rack-grid');
  if (!gridContainer) return;
  
  const freezerSelect = document.getElementById('freezer-select');
  const activeUnit = freezerSelect ? freezerSelect.value : 'ULT-03';
  const allowedTypes = activeUnit === 'LN2-01' ? ['DNA', 'Tissue'] : ['Blood', 'Serum'];

  // Update header h3 title dynamically
  const rackHeaderH3 = document.querySelector('.rack-header h3');
  if (rackHeaderH3) {
    if (activeUnit === 'LN2-01') {
      rackHeaderH3.textContent = 'LN2 Tank 01 > Shelf B, Drawer 3, Box A12';
    } else {
      rackHeaderH3.textContent = 'ULT Freezer 03 > Shelf B, Drawer 3, Box A12';
    }
  }

  // Generate 36 wells (Rows A to F, Cols 1 to 6)
  const rows = ['A', 'B', 'C', 'D', 'E', 'F'];
  const cols = [1, 2, 3, 4, 5, 6];

  gridContainer.innerHTML = '';

  rows.forEach(r => {
    cols.forEach(c => {
      const wellId = `${r}${c}`;
      const wellElement = document.createElement('button');
      wellElement.className = 'rack-well';
      wellElement.setAttribute('aria-label', `Well ${wellId}`);
      
      const label = document.createElement('span');
      label.className = 'well-label';
      label.textContent = wellId;
      wellElement.appendChild(label);

      // Check if specimen is located inside this specific well and matches unit types
      const matchingSpecimen = specimensCache.find(item => 
        item.location && item.location.endsWith(`Well ${wellId}`) && allowedTypes.includes(item.type)
      );
      
      if (matchingSpecimen) {
        wellElement.classList.add('occupied');
        wellElement.dataset.barcode = matchingSpecimen.barcode;
      }

      // Add glow targets if relocation mode is active
      if (relocateMode) {
        if (matchingSpecimen) {
          if (matchingSpecimen.barcode === relocateSourceBarcode) {
            wellElement.classList.add('relocating');
          }
        } else {
          wellElement.classList.add('relocation-target-candidate');
        }
      }

      // Handle clicking a slot
      wellElement.addEventListener('click', async () => {
        if (relocateMode) {
          // Relocate action trigger
          if (!matchingSpecimen) {
            const activeUnitName = activeUnit === 'LN2-01' ? 'LN2 Tank 01' : 'ULT Freezer 03';
            const newWellCoords = `${activeUnitName} > Shelf B > Drawer 3 > Box A12 > Well ${wellId}`;
            const barcodeToMove = relocateSourceBarcode;
            
            // Turn off relocation state
            relocateMode = false;
            relocateSourceBarcode = null;
            
            try {
              await db.moveSpecimen(barcodeToMove, newWellCoords);
              
              // Log Audit Event
              await db.addAuditLog({
                username: currentUser ? currentUser.username : "Unknown Operator",
                role: currentUser ? currentUser.role : "Guest",
                action: "Specimen Relocate",
                details: `Relocated specimen [${barcodeToMove}] to coordinate: ${newWellCoords}.`
              });
              
              // Refresh caches and UI
              await refreshDatabaseCache();
              renderDashboardStats();
              renderSVGCharts();
              refreshCatalogView();
              initStorageGrid();
              
              // Reset detail panes
              const depositForm = document.getElementById('well-deposit-form-container');
              if (depositForm) depositForm.classList.add('hidden');
              const dataContent = document.getElementById('well-data-content');
              if (dataContent) dataContent.classList.add('hidden');
              const detailsPane = document.getElementById('well-details-pane');
              if (detailsPane) {
                const placeholder = detailsPane.querySelector('.well-placeholder-text');
                if (placeholder) placeholder.style.display = 'block';
              }
              
              alert(`Success: Specimen [${barcodeToMove}] relocated to Well [${wellId}] successfully.`);
            } catch (err) {
              console.error("Relocate failure: ", err);
              alert("Error: Could not relocate specimen.");
            }
          } else {
            alert("Error: Destination well is already occupied. Please select an empty slot.");
          }
          return;
        }

        document.querySelectorAll('.rack-well').forEach(w => w.classList.remove('selected'));
        wellElement.classList.add('selected');
        
        showWellDetails(wellId, matchingSpecimen);
      });

      gridContainer.appendChild(wellElement);
    });
  });

  // Bind deposit specimen form submit once
  const depositForm = document.getElementById('deposit-specimen-form');
  if (depositForm) {
    depositForm.onsubmit = async (e) => {
      e.preventDefault();
      
      const depositContainer = document.getElementById('well-deposit-form-container');
      const wellId = depositContainer.dataset.wellId;
      
      const barcode = document.getElementById('dep-barcode').value.trim();
      const type = document.getElementById('dep-type').value;
      const donorId = document.getElementById('dep-donor').value;
      const quality = document.getElementById('dep-quality').value.trim();
      
      if (!barcode) return;

      // Validate duplicate barcodes
      const duplicate = specimensCache.some(s => s.barcode.toLowerCase() === barcode.toLowerCase());
      if (duplicate) {
        alert(`Error: A specimen with barcode [${barcode}] already exists in the catalog registry.`);
        return;
      }

      // Read selected donor metadata to auto-seed properties for compliance
      const donor = donorsCache.find(d => d.donorId === donorId);
      if (!donor) return;

      const activeUnit = document.getElementById('freezer-select')?.value || 'ULT-03';
      const activeUnitName = activeUnit === 'LN2-01' ? 'LN2 Tank 01' : 'ULT Freezer 03';

      const newSpecimen = {
        barcode: barcode,
        type: type,
        diagnosis: donor.diagnosis,
        gender: donorId.endsWith('X') ? 'Male' : 'Female',
        age: donorId.endsWith('X') ? 56 : (donorId.endsWith('F') ? 48 : 29),
        location: `${activeUnitName} > Shelf B > Drawer 3 > Box A12 > Well ${wellId}`,
        quality: quality,
        consent: {
          academic: donor.academic,
          genomic: donor.genomic,
          commercial: donor.commercial
        },
        donorId: donorId
      };

      try {
        await db.addSpecimen(newSpecimen);
        
        // Log Audit Event
        await db.addAuditLog({
          username: currentUser ? currentUser.username : "Unknown Operator",
          role: currentUser ? currentUser.role : "Guest",
          action: "Specimen Deposit",
          details: `Deposited specimen barcode [${barcode}] inside coordinate: ${activeUnitName} > Shelf B > Drawer 3 > Box A12 > Well ${wellId}.`
        });

        // Refresh cache and layout
        await refreshDatabaseCache();
        renderDashboardStats();
        renderSVGCharts();
        refreshCatalogView();
        initStorageGrid();
        
        // Reset panel view
        const depositForm = document.getElementById('well-deposit-form-container');
        if (depositForm) depositForm.classList.add('hidden');
        const detailsPane = document.getElementById('well-details-pane');
        if (detailsPane) {
          const placeholder = detailsPane.querySelector('.well-placeholder-text');
          if (placeholder) placeholder.style.display = 'block';
        }
        
        depositForm.reset();
        alert(`Success: Specimen [${barcode}] has been successfully deposited in Well [${wellId}] under compliance rules.`);
      } catch (err) {
        console.error("Deposit specimen failed: ", err);
        alert("Database error: Could not complete deposition.");
      }
    };
  }
}

function showWellDetails(wellId, specimen) {
  const placeholder = document.querySelector('.well-placeholder-text');
  const content = document.getElementById('well-data-content');
  const depositContainer = document.getElementById('well-deposit-form-container');
  
  const detailsWellId = document.getElementById('details-well-id');
  const detailsBarcode = document.getElementById('details-sample-barcode');
  const detailsType = document.getElementById('details-sample-type');
  const detailsDonor = document.getElementById('details-donor-id');
  const detailsCoords = document.getElementById('details-coords');
  const detailsQuality = document.getElementById('details-quality');
  const detailsStatus = document.getElementById('details-status');
  const btnAddToCart = document.getElementById('btn-add-well-to-cart');
  const btnRelocate = document.getElementById('btn-relocate-specimen');

  placeholder.style.display = 'none';

  if (specimen) {
    depositContainer.classList.add('hidden');
    content.classList.remove('hidden');

    detailsWellId.textContent = `Well ${wellId}`;
    detailsStatus.textContent = 'Occupied';
    detailsStatus.className = 'status-badge green-bg';
    detailsBarcode.textContent = specimen.barcode;
    detailsType.textContent = specimen.type;
    detailsDonor.textContent = specimen.donorId;
    detailsCoords.textContent = specimen.location;
    detailsQuality.textContent = specimen.quality;

    // Render QC Verification Status
    const detailsQCStatus = document.getElementById('details-qc-status');
    if (detailsQCStatus) {
      const qcS = specimen.qcStatus || 'Pending Verification';
      detailsQCStatus.textContent = qcS;
      if (qcS === 'Passed') {
        detailsQCStatus.className = 'group-value text-green';
        detailsQCStatus.style.color = '#10b981';
      } else if (qcS === 'Failed') {
        detailsQCStatus.className = 'group-value text-red';
        detailsQCStatus.style.color = '#ef4444';
      } else if (qcS === 'Warning') {
        detailsQCStatus.className = 'group-value text-orange';
        detailsQCStatus.style.color = '#f97316';
      } else {
        detailsQCStatus.className = 'group-value';
        detailsQCStatus.style.color = 'var(--text-secondary)';
      }
    }

    // Wire up Perform QC Action button
    const btnQC = document.getElementById('btn-qc-specimen');
    if (btnQC) {
      btnQC.onclick = () => {
        const qcModal = document.getElementById('qc-modal');
        const barcodeDisplay = document.getElementById('qc-modal-barcode-display');
        const barcodeInput = document.getElementById('qc-specimen-barcode');
        const statusSelect = document.getElementById('qc-status-select');
        const metricInput = document.getElementById('qc-metric-input');
        const notesInput = document.getElementById('qc-notes-input');
        const analystInput = document.getElementById('qc-analyst-display');
        
        if (qcModal) {
          barcodeDisplay.textContent = specimen.barcode;
          barcodeInput.value = specimen.barcode;
          statusSelect.value = specimen.qcStatus || 'Passed';
          metricInput.value = specimen.quality || '';
          notesInput.value = '';
          analystInput.value = currentUser ? `${currentUser.username} (${currentUser.role})` : 'System Analyst';
          
          qcModal.showModal();
        }
      };
    }
    
    // Manage Add to Cart status and check block restrictions
    // Check if donor's consent has expired, been withdrawn, or failed granular permissions
    const blockCheck = checkSpecimenConsentBlocked(specimen);
    const isBlocked = blockCheck.isBlocked;
    const blockReason = blockCheck.reason ? blockCheck.reason.replace('No ', '').replace(' Consent', '') : '';

    if (isBlocked) {
      btnAddToCart.disabled = true;
      btnAddToCart.textContent = `Blocked (Consent ${blockReason})`;
      btnAddToCart.style.background = 'var(--accent-red)';
      btnAddToCart.style.color = '#fff';
      btnAddToCart.style.boxShadow = 'none';
    } else {
      const inCart = requestCart.some(c => c.barcode === specimen.barcode);
      btnAddToCart.disabled = inCart;
      btnAddToCart.textContent = inCart ? 'In Request Cart' : 'Add to Request Cart';
      btnAddToCart.style.background = ''; // reset to stylesheet
      btnAddToCart.style.color = '';
      btnAddToCart.style.boxShadow = '';
      
      btnAddToCart.onclick = () => {
        addToCart(specimen);
        btnAddToCart.disabled = true;
        btnAddToCart.textContent = 'In Request Cart';
        refreshCatalogView();
      };
    }

    // Manage relocation trigger click
    btnRelocate.textContent = "Relocate";
    btnRelocate.disabled = false;
    btnRelocate.onclick = () => {
      relocateMode = true;
      relocateSourceBarcode = specimen.barcode;
      
      btnRelocate.textContent = "Select Destination...";
      btnRelocate.disabled = true;
      
      // Update grid layout with pulse classes
      initStorageGrid();
      alert(`Relocation mode active!\n\nClick any empty well coordinate in the freezer grid map to relocate specimen [${specimen.barcode}].`);
    };
  } else {
    // Empty well: Show deposit form
    content.classList.add('hidden');
    depositContainer.classList.remove('hidden');

    const depositWellId = document.getElementById('deposit-well-id');
    depositWellId.textContent = `Well ${wellId}`;
    depositContainer.dataset.wellId = wellId;

    // Filter the dep-type dropdown based on active unit
    const depTypeSelect = document.getElementById('dep-type');
    if (depTypeSelect) {
      const activeUnit = document.getElementById('freezer-select')?.value || 'ULT-03';
      depTypeSelect.innerHTML = '';
      if (activeUnit === 'LN2-01') {
        depTypeSelect.innerHTML = `
          <option value="DNA">DNA</option>
          <option value="Tissue">Tissue</option>
        `;
      } else {
        depTypeSelect.innerHTML = `
          <option value="Blood">Blood</option>
          <option value="Serum">Serum</option>
        `;
      }
    }

    // Populate Enrolled Donor Options dynamically
    const depDonorSelect = document.getElementById('dep-donor');
    if (depDonorSelect) {
      depDonorSelect.innerHTML = '';
      donorsCache.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.donorId;
        opt.textContent = `${d.donorId} (${d.diagnosis})`;
        depDonorSelect.appendChild(opt);
      });
    }
  }
}

// ==========================================
// 5. Patient Consent Manager & Blockchain Ledger
// ==========================================
function initConsentManager() {
  const donorSelect = document.getElementById('consent-donor-select');
  if (!donorSelect) {
    console.warn("AURA Portal: Consent donor select element not found. Skipping initConsentManager.");
    return;
  }
  const chkAcademic = document.getElementById('consent-academic');
  const chkGenomic = document.getElementById('consent-genomic');
  const chkCommercial = document.getElementById('consent-commercial');
  const saveConsentBtn = document.getElementById('btn-save-consent');

  const canvas = document.getElementById('signature-canvas');
  const clearCanvasBtn = document.getElementById('btn-clear-sig-canvas');
  const typedSigInput = document.getElementById('consent-typed-sig');
  const signaturePreview = document.getElementById('cursive-signature-preview');
  const expiryInput = document.getElementById('consent-expiry-date');
  const chkDataSharing = document.getElementById('consent-data-sharing');
  const chkGenomicPermission = document.getElementById('consent-genomic-permission');
  const withdrawBtn = document.getElementById('btn-withdraw-consent');

  let ctx = null;
  let drawing = false;

  // eSignature Canvas Drawing Engine
  if (canvas) {
    ctx = canvas.getContext('2d');
    
    const getMousePos = (canvasDom, touchOrMouseEvent) => {
      const rect = canvasDom.getBoundingClientRect();
      const clientX = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientX : touchOrMouseEvent.clientX;
      const clientY = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientY : touchOrMouseEvent.clientY;
      return {
        x: (clientX - rect.left) * (canvasDom.width / rect.width),
        y: (clientY - rect.top) * (canvasDom.height / rect.height)
      };
    };

    const startDrawing = (e) => {
      drawing = true;
      ctx.strokeStyle = '#00f2fe'; // Neon cyan line color matching theme
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const pos = getMousePos(canvas, e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      e.preventDefault();
    };

    const draw = (e) => {
      if (!drawing) return;
      const pos = getMousePos(canvas, e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      e.preventDefault();
    };

    const stopDrawing = () => {
      drawing = false;
    };

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);
  }

  const clearCanvas = () => {
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  if (clearCanvasBtn) {
    clearCanvasBtn.onclick = clearCanvas;
  }

  // Typed Cursive Signature Preview Binder
  if (typedSigInput && signaturePreview) {
    typedSigInput.oninput = (e) => {
      signaturePreview.textContent = e.target.value;
    };
  }

  const loadDonorConsent = () => {
    const selectedDonorId = donorSelect.value;
    const donorData = donorsCache.find(d => d.donorId === selectedDonorId);
    
    if (donorData) {
      const isWithdrawn = donorData.consentStatus === 'Withdrawn';

      chkAcademic.checked = donorData.academic;
      chkAcademic.disabled = isWithdrawn;

      chkGenomic.checked = donorData.genomic;
      chkGenomic.disabled = isWithdrawn;

      chkCommercial.checked = donorData.commercial;
      chkCommercial.disabled = isWithdrawn;

      // Sync status badge
      const badgeInline = document.getElementById('consent-status-badge-inline');
      if (badgeInline) {
        let statusClass = 'green-bg';
        let statusText = 'Active';
        const today = new Date().toISOString().slice(0, 10);
        if (isWithdrawn) {
          statusClass = 'red-bg';
          statusText = 'Withdrawn';
        } else if (donorData.consentExpiry && donorData.consentExpiry < today) {
          statusClass = 'orange-bg';
          statusText = 'Expired';
        } else if (donorData.consentStatus) {
          statusText = donorData.consentStatus;
          if (statusText === 'Expired') statusClass = 'orange-bg';
        }
        badgeInline.className = `status-badge ${statusClass}`;
        badgeInline.textContent = statusText;
      }

      // Sync data sharing & genomic dataset release toggles
      if (chkDataSharing) {
        chkDataSharing.checked = donorData.dataSharing ?? true;
        chkDataSharing.disabled = isWithdrawn;
      }
      if (chkGenomicPermission) {
        chkGenomicPermission.checked = donorData.genomicPermission ?? true;
        chkGenomicPermission.disabled = isWithdrawn;
      }

      // Sync research-specific checkboxes
      const res = donorData.researchSpecific || { cancer: true, diabetes: true, infectious: true, cardiovascular: true, neurological: true };
      const chkCancer = document.getElementById('research-cancer');
      if (chkCancer) {
        chkCancer.checked = res.cancer ?? true;
        chkCancer.disabled = isWithdrawn;
      }
      const chkDiabetes = document.getElementById('research-diabetes');
      if (chkDiabetes) {
        chkDiabetes.checked = res.diabetes ?? true;
        chkDiabetes.disabled = isWithdrawn;
      }
      const chkInfectious = document.getElementById('research-infectious');
      if (chkInfectious) {
        chkInfectious.checked = res.infectious ?? true;
        chkInfectious.disabled = isWithdrawn;
      }
      const chkCardio = document.getElementById('research-cardio');
      if (chkCardio) {
        chkCardio.checked = res.cardio ?? true;
        chkCardio.disabled = isWithdrawn;
      }
      const chkNeuro = document.getElementById('research-neuro');
      if (chkNeuro) {
        chkNeuro.checked = res.neuro ?? true;
        chkNeuro.disabled = isWithdrawn;
      }

      // Sync consent expiry date picker
      if (expiryInput) {
        expiryInput.value = donorData.consentExpiry || '';
        expiryInput.disabled = isWithdrawn;
      }

      // Sync typed signature input and cursive preview
      if (typedSigInput) {
        typedSigInput.value = donorData.eSignature || '';
        typedSigInput.disabled = isWithdrawn;
        if (signaturePreview) signaturePreview.textContent = donorData.eSignature || '';
      }

      if (saveConsentBtn) {
        saveConsentBtn.disabled = isWithdrawn;
      }

      if (withdrawBtn) {
        const isSuperAdmin = currentUser && currentUser.role === 'Super Admin';
        withdrawBtn.disabled = isWithdrawn || !isSuperAdmin;
        if (isWithdrawn) {
          withdrawBtn.title = "This consent has already been withdrawn.";
        } else if (!isSuperAdmin) {
          withdrawBtn.title = "Revocation/Withdrawal requires Super Admin access.";
        } else {
          withdrawBtn.removeAttribute('title');
        }
      }

      if (clearCanvasBtn) {
        clearCanvasBtn.disabled = isWithdrawn;
      }

      if (canvas) {
        canvas.style.pointerEvents = isWithdrawn ? 'none' : 'auto';
        canvas.style.opacity = isWithdrawn ? '0.5' : '1';
      }

      // Clear signature canvas on change
      clearCanvas();
    }
  };

  donorSelect.addEventListener('change', loadDonorConsent);
  
  saveConsentBtn.onclick = null; // Reset click bindings
  saveConsentBtn.addEventListener('click', async () => {
    const selectedDonorId = donorSelect.value;
    const donorData = donorsCache.find(d => d.donorId === selectedDonorId);
    
    if (donorData) {
      const typedSigVal = typedSigInput ? typedSigInput.value.trim() : '';
      const expiryVal = expiryInput ? expiryInput.value : '';

      if (!typedSigVal) {
        alert("Verification Error: A typed electronic signature (Full Name) is required to authorize covenants.");
        return;
      }

      if (!expiryVal) {
        alert("Verification Error: A consent expiry date is required.");
        return;
      }

      // Convert canvas to image string to store as signature representation
      const canvasSigData = canvas ? canvas.toDataURL() : '';

      const updatedConsent = {
        academic: chkAcademic.checked,
        genomic: chkGenomic.checked,
        commercial: chkCommercial.checked,
        dataSharing: chkDataSharing ? chkDataSharing.checked : true,
        genomicPermission: chkGenomicPermission ? chkGenomicPermission.checked : true,
        researchSpecific: {
          cancer: document.getElementById('research-cancer')?.checked ?? true,
          diabetes: document.getElementById('research-diabetes')?.checked ?? true,
          infectious: document.getElementById('research-infectious')?.checked ?? true,
          cardiovascular: document.getElementById('research-cardio')?.checked ?? true,
          neurological: document.getElementById('research-neuro')?.checked ?? true
        },
        consentExpiry: expiryVal,
        eSignature: typedSigVal,
        eSignatureCanvas: canvasSigData,
        consentStatus: 'Active'
      };

      saveConsentBtn.disabled = true;
      saveConsentBtn.textContent = "Signing Blockchain ledger...";

      try {
        // We call updateDonorConsent to cascade academic/genomic/commercial rules to specimens cache
        await db.updateDonorConsent(selectedDonorId, {
          academic: updatedConsent.academic,
          genomic: updatedConsent.genomic,
          commercial: updatedConsent.commercial
        });
        
        // Save the rest of the metadata directly
        await db.updateDonor(selectedDonorId, updatedConsent);
        
        // Log Blockchain Block
        const changeText = `Consent Signoff: eSignature="${typedSigVal}", Expiry=${expiryVal}, Domains: Academic=${chkAcademic.checked}, Genomic=${chkGenomic.checked}, Commercial=${chkCommercial.checked}`;
        await db.addBlockchainBlock(selectedDonorId, changeText);
        
        // Log Audit Event
        await db.addAuditLog({
          username: currentUser ? currentUser.username : "Unknown Operator",
          role: currentUser ? currentUser.role : "Guest",
          action: "Consent Signoff",
          details: `Digitally signed consent for participant [${selectedDonorId}] with expiry ${expiryVal}.`
        });
        
        await refreshDatabaseCache();

        renderDashboardStats();
        renderSVGCharts();
        refreshCatalogView();
        renderBlockchainLedger();
        
        // Reload details if selected
        loadDonorConsent();

        alert(`Cryptographic Consent signed and authorized successfully for donor [${selectedDonorId}]. Settings recorded to blockchain ledger.`);
      } catch (err) {
        console.error("Consent save failed: ", err);
        alert("Error: Database connection timeout.");
      } finally {
        saveConsentBtn.disabled = false;
        saveConsentBtn.textContent = "Sign and Update Consent Covenant";
      }
    }
  });

  if (withdrawBtn) {
    withdrawBtn.onclick = async () => {
      const selectedDonorId = donorSelect.value;
      const donorData = donorsCache.find(d => d.donorId === selectedDonorId);
      
      if (donorData) {
        const confirmRevoke = confirm(`WARNING: Consent Revocation Audit\n\nAre you sure you want to withdraw all research consents for patient [${selectedDonorId}]?\n\nThis will immediately flag their biological specimens as blocked and restrict checkout.`);
        
        if (confirmRevoke) {
          const isSuperAdmin = currentUser && currentUser.role === 'Super Admin';
          if (!isSuperAdmin) {
            alert("Access Denied: Only Super Admin is authorized to withdraw patient consent.");
            return;
          }
          withdrawBtn.disabled = true;
          
          const withdrawnSettings = {
            academic: false,
            genomic: false,
            commercial: false,
            dataSharing: false,
            genomicPermission: false,
            consentStatus: 'Withdrawn',
            researchSpecific: {
              cancer: false,
              diabetes: false,
              infectious: false,
              cardiovascular: false,
              neurological: false
            }
          };

          try {
            await db.updateDonorConsent(selectedDonorId, {
              academic: false,
              genomic: false,
              commercial: false
            });
            await db.updateDonor(selectedDonorId, withdrawnSettings);
            
            // Log to blockchain specifically for revocation
            await db.addBlockchainBlock(selectedDonorId, `Consent Revoked / Withdrawn: All permissions disabled.`);
            
            await db.addAuditLog({
              username: currentUser ? currentUser.username : "Unknown Operator",
              role: currentUser ? currentUser.role : "Guest",
              action: "Consent Revocation",
              details: `Withdrew all research consents for participant [${selectedDonorId}]. All specimens blocked.`
            });

            await refreshDatabaseCache();

            renderDashboardStats();
            renderSVGCharts();
            refreshCatalogView();
            renderBlockchainLedger();
            
            loadDonorConsent();
            alert(`Autonomy Revocation Complete: Patient [${selectedDonorId}] has withdrawn from research studies. All biological materials are blocked.`);
          } catch (err) {
            console.error("Revocation failed: ", err);
            alert("Database error: Could not complete revocation.");
          } finally {
            withdrawBtn.disabled = false;
          }
        }
      }
    };
  }

  // Wire up Consent Copies and Compliance buttons
  const printBtn = document.getElementById('btn-print-consent');
  if (printBtn) {
    printBtn.onclick = () => {
      const donorId = donorSelect.value;
      const donor = donorsCache.find(d => d.donorId === donorId);
      if (donor) {
        const printSection = document.getElementById('print-section');
        if (printSection) {
          printSection.innerHTML = generateConsentCertificateHTML(donor);
          window.print();
        }
      }
    };
  }

  const pdfBtn = document.getElementById('btn-pdf-consent');
  if (pdfBtn) {
    pdfBtn.onclick = () => {
      const donorId = donorSelect.value;
      const donor = donorsCache.find(d => d.donorId === donorId);
      if (donor) {
        downloadConsentHTML(donor);
      }
    };
  }

  const emailBtn = document.getElementById('btn-email-consent');
  if (emailBtn) {
    emailBtn.onclick = async () => {
      const donorId = donorSelect.value;
      const donor = donorsCache.find(d => d.donorId === donorId);
      if (donor) {
        emailBtn.disabled = true;
        const originalHTML = emailBtn.innerHTML;
        emailBtn.textContent = "Packaging copy...";
        
        setTimeout(async () => {
          alert(`Encrypted Email Dispatched!\n\nSent official compliance copy of signed consent covenant to participant's verified clinical address:\n👉 ${donor.email || 'N/A'}\n\nEncryption verification token logged to LIMS blockchain and audit ledger.`);
          
          await db.addAuditLog({
            username: currentUser ? currentUser.username : "Unknown Operator",
            role: currentUser ? currentUser.role : "Guest",
            action: "Consent Dispatch",
            details: `Emailed digital consent copy to participant [${donor.donorId}] at ${donor.email || 'N/A'}.`
          });
          
          await refreshDatabaseCache();
          emailBtn.disabled = false;
          emailBtn.innerHTML = originalHTML;
        }, 1200);
      }
    };
  }

  const portalBtn = document.getElementById('btn-portal-consent');
  const portalModal = document.getElementById('patient-portal-modal');
  const portalCloseBtn = document.getElementById('btn-close-portal-modal');
  
  if (portalBtn && portalModal) {
    portalBtn.onclick = () => {
      const donorId = donorSelect.value;
      const donor = donorsCache.find(d => d.donorId === donorId);
      if (donor) {
        renderPatientPortal(donor);
        portalModal.showModal();
      }
    };
  }
  
  if (portalCloseBtn && portalModal) {
    portalCloseBtn.onclick = () => {
      portalModal.close();
    };
  }

  populateConsentDonorDropdown();
  loadDonorConsent();
}

// Enforces regulatory-compliant legal consent certificate print/download layouts
// Enforces regulatory-compliant legal consent certificate print/download layouts
function generateConsentCertificateHTML(donor) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const isWithdrawn = donor.consentStatus === 'Withdrawn';
  const isExpired = donor.consentExpiry && new Date(donor.consentExpiry) < new Date();
  
  const status = isWithdrawn ? 'REVOKED / WITHDRAWN' : (isExpired ? 'EXPIRED' : 'ACTIVE / ENFORCED');
  const statusColor = isWithdrawn ? '#ef4444' : (isExpired ? '#f97316' : '#10b981');
  const research = donor.researchSpecific || { cancer: true, diabetes: true, infectious: true, cardiovascular: true, neurological: true };
  
  // Dynamic query of registered samples to show "What sample is collected"
  const donorSpecimens = specimensCache.filter(s => s.donorId === donor.donorId);
  const specimensListHTML = donorSpecimens.length > 0 
    ? donorSpecimens.map(s => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 6px 0; font-family: monospace; font-size: 11px; font-weight: 700; color: #0f172a;">${s.barcode}</td>
          <td style="padding: 6px 0; font-size: 11px; color: #334155;">${s.type}</td>
          <td style="padding: 6px 0; font-size: 11px; color: #334155;">${s.diagnosis}</td>
          <td style="padding: 6px 0; font-size: 11px; font-family: monospace; color: #64748b;">${s.location || 'Unassigned'}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" style="padding: 8px 0; text-align: center; color: #94a3b8; font-size: 11px; font-style: italic;">No samples registered under this subject ID yet.</td></tr>`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; border: 2px solid #334155; border-radius: 12px; max-width: 800px; margin: 0 auto; color: #1e293b; background: #ffffff;">
      <div style="text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 25px;">
        <h2 style="margin: 0; font-size: 24px; color: #0f172a; font-weight: 800; letter-spacing: -0.025em; text-transform: uppercase;">AURA Biomedical Repository</h2>
        <h3 style="margin: 5px 0 0 0; font-size: 14px; color: #64748b; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;">Certificate of Informed Legal Consent</h3>
        <p style="margin: 10px 0 0 0; font-size: 11px; color: #94a3b8;">ISO 20387 Biobank Governance | HIPAA Security Compliant | GDPR Right of Autonomy Enforced</p>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; margin-bottom: 25px;">
        <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 3px;">Covenant Status</span>
        <span style="font-size: 18px; font-weight: 800; color: ${statusColor};">${status}</span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 25px;">
        <div>
          <h4 style="margin: 0 0 10px 0; font-size: 11px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Subject Information</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">De-identified ID:</td><td style="padding: 4px 0; font-weight: 700; color: #0f172a;">${donor.donorId}</td></tr>
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">Patient Name:</td><td style="padding: 4px 0; font-weight: 600;">${donor.fullName || donor.name}</td></tr>
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">Intake UHID/MRN:</td><td style="padding: 4px 0; font-family: monospace; font-size: 11px;">${donor.uhid || 'N/A'}</td></tr>
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">Date of Birth:</td><td style="padding: 4px 0;">${donor.dob || 'N/A'} (Age ${donor.age || 'N/A'})</td></tr>
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">Biological Gender:</td><td style="padding: 4px 0;">${donor.gender || 'N/A'}</td></tr>
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">Primary Diagnosis:</td><td style="padding: 4px 0; font-weight: 600;">${donor.diagnosis}</td></tr>
          </table>
        </div>

        <div>
          <h4 style="margin: 0 0 10px 0; font-size: 11px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Covenant Configuration</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">Academic Research:</td><td style="padding: 4px 0; font-weight: 700; color: ${donor.academic ? '#10b981' : '#ef4444'};">${donor.academic ? 'AUTHORIZED' : 'RESTRICTED'}</td></tr>
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">Genomic Sequencing:</td><td style="padding: 4px 0; font-weight: 700; color: ${donor.genomic ? '#10b981' : '#ef4444'};">${donor.genomic ? 'AUTHORIZED' : 'RESTRICTED'}</td></tr>
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">Commercial Use:</td><td style="padding: 4px 0; font-weight: 700; color: ${donor.commercial ? '#10b981' : '#ef4444'};">${donor.commercial ? 'AUTHORIZED' : 'RESTRICTED'}</td></tr>
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">Secondary Data Sharing:</td><td style="padding: 4px 0; font-weight: 700; color: ${donor.dataSharing !== false ? '#10b981' : '#ef4444'};">${donor.dataSharing !== false ? 'AUTHORIZED' : 'RESTRICTED'}</td></tr>
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">Genomic Release:</td><td style="padding: 4px 0; font-weight: 700; color: ${donor.genomicPermission !== false ? '#10b981' : '#ef4444'};">${donor.genomicPermission !== false ? 'AUTHORIZED' : 'RESTRICTED'}</td></tr>
            <tr><td style="padding: 4px 0; color: #64748b; font-weight:500;">Consent Expiry Date:</td><td style="padding: 4px 0; font-weight: 600; color: #0f172a;">${donor.consentExpiry || 'N/A'}</td></tr>
          </table>
        </div>
      </div>

      <div style="margin-bottom: 25px;">
        <h4 style="margin: 0 0 10px 0; font-size: 11px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Approved Disease Research Domains</h4>
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; text-align: center; margin-top: 10px;">
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; font-size: 10px; background: ${research.cancer ? '#f0fdf4' : '#fef2f2'}; border-color: ${research.cancer ? '#bbf7d0' : '#fecaca'};">
            <div style="font-weight: 700; color: ${research.cancer ? '#166534' : '#991b1b'}; font-size:11px;">Oncology</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 4px;">${research.cancer ? '✔ Yes' : '✕ No'}</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; font-size: 10px; background: ${research.diabetes ? '#f0fdf4' : '#fef2f2'}; border-color: ${research.diabetes ? '#bbf7d0' : '#fecaca'};">
            <div style="font-weight: 700; color: ${research.diabetes ? '#166534' : '#991b1b'}; font-size:11px;">Metabolic</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 4px;">${research.diabetes ? '✔ Yes' : '✕ No'}</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; font-size: 10px; background: ${research.infectious ? '#f0fdf4' : '#fef2f2'}; border-color: ${research.infectious ? '#bbf7d0' : '#fecaca'};">
            <div style="font-weight: 700; color: ${research.infectious ? '#166534' : '#991b1b'}; font-size:11px;">Infectious</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 4px;">${research.infectious ? '✔ Yes' : '✕ No'}</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; font-size: 10px; background: ${research.cardiovascular ? '#f0fdf4' : '#fef2f2'}; border-color: ${research.cardiovascular ? '#bbf7d0' : '#fecaca'};">
            <div style="font-weight: 700; color: ${research.cardiovascular ? '#166534' : '#991b1b'}; font-size:11px;">Cardiac</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 4px;">${research.cardiovascular ? '✔ Yes' : '✕ No'}</div>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; font-size: 10px; background: ${research.neurological ? '#f0fdf4' : '#fef2f2'}; border-color: ${research.neurological ? '#bbf7d0' : '#fecaca'};">
            <div style="font-weight: 700; color: ${research.neurological ? '#166534' : '#991b1b'}; font-size:11px;">Neuro</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 4px;">${research.neurological ? '✔ Yes' : '✕ No'}</div>
          </div>
        </div>
      </div>

      <!-- What sample is collected -->
      <div style="margin-bottom: 25px;">
        <h4 style="margin: 0 0 10px 0; font-size: 11px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Registered Samples Collected</h4>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="border-bottom: 2px solid #cbd5e1; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;">
              <th style="padding-bottom: 6px; font-weight: 700;">Barcode</th>
              <th style="padding-bottom: 6px; font-weight: 700;">Type</th>
              <th style="padding-bottom: 6px; font-weight: 700;">Diagnosis Domain</th>
              <th style="padding-bottom: 6px; font-weight: 700;">Storage Address</th>
            </tr>
          </thead>
          <tbody>
            ${specimensListHTML}
          </tbody>
        </table>
      </div>

      <!-- Compliance disclosures mapping to standard HIPAA, GDPR, ICMR, ISO 20387 requirements -->
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; font-size: 11px; line-height: 1.5; color: #475569; margin-bottom: 25px;">
        <strong style="color: #0f172a; text-transform: uppercase; display: block; margin-bottom: 6px; font-size: 11px;">Legal Consent & Autonomy Disclosures (Compliance Notice):</strong>
        <div style="display: grid; grid-template-columns: 1fr; gap: 6px;">
          <div><strong>Why samples are collected:</strong> To compile high-quality biological and molecular data representing ${donor.diagnosis} pathology to support scientific research and therapeutic breakthroughs.</div>
          <div><strong>How data will be used:</strong> Specimen parameters and de-identified clinical notes are digitized, securely cryptographed, and linked to the biobank's private ledgers for study analysis.</div>
          <div><strong>Who can access it:</strong> Restricted to authorized LIMS operators, researchers with Institutional Review Board (IRB) approved protocols, and state compliance auditors.</div>
          <div><strong>Risks & benefits:</strong> Minimal risk of data disclosure (mitigated by strict de-identification/pseudonymization under HIPAA/GDPR). No direct therapeutic benefits to the donor, but contributions advance global medical discovery.</div>
          <div><strong>How to withdraw consent:</strong> The participant maintains full autonomy. You can revoke consent at any time through the Patient Autonomy Portal or by contacting a Biobank Administrator. Upon withdrawal, all samples are immediately locked and flagged as blocked, halting all clinical checkouts.</div>
        </div>
        <div style="margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 10px; color: #64748b; font-style: italic;">
          Verified compliant with: HIPAA Security Rule (25 CFR § 164) | EU General Data Protection Regulation (GDPR Art. 7 & 17) | ICMR Guidelines for Biomedical Research | ISO 20387 Biobanking Standards.
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 30px; align-items: flex-end; border-top: 1px dashed #cbd5e1; padding-top: 20px;">
        <div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 2px;">Subject Electronic Signature verification:</div>
          <div style="font-family: 'Georgia', 'Times New Roman', cursive; font-size: 24px; font-style: italic; color: #0f172a; border-bottom: 1px solid #0f172a; padding: 4px 8px 8px 8px; min-height: 32px;">
            ${donor.eSignature || 'N/A'}
          </div>
          <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Digitally signed on AURA Blockchain Ledger | Verified Document</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; color: #64748b;">LIMS Verification Code</div>
          <div style="font-family: monospace; font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 4px; letter-spacing: 0.05em;">
            ${donor.donorId.replace('SUBJ-', 'AURA-')}-${donor.consentExpiry ? donor.consentExpiry.replace(/-/g, '') : 'NONE'}
          </div>
          <div style="font-size: 9px; color: #94a3b8; margin-top: 4px;">Compiled Date: ${today}</div>
        </div>
      </div>
    </div>
  `;
}

function downloadConsentHTML(donor) {
  const certificateHTML = generateConsentCertificateHTML(donor);
  const standaloneHTML = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Consent Certificate - ${donor.donorId}</title>
      <style>
        body {
          background-color: #f1f5f9;
          padding: 40px 20px;
          margin: 0;
        }
        @media print {
          body {
            background: #fff;
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      ${certificateHTML}
    </body>
    </html>
  `;
  const blob = new Blob([standaloneHTML], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AURA-Consent-Certificate-${donor.donorId}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderPatientPortal(donor) {
  const container = document.getElementById('patient-portal-content');
  if (!container) return;

  const isWithdrawn = donor.consentStatus === 'Withdrawn';
  const today = new Date().toISOString().slice(0, 10);
  const isExpired = donor.consentExpiry && donor.consentExpiry < today;
  
  let statusText = 'Active';
  let statusClass = 'green-bg';
  if (isWithdrawn) {
    statusText = 'Withdrawn';
    statusClass = 'red-bg';
  } else if (isExpired) {
    statusText = 'Expired';
    statusClass = 'orange-bg';
  }

  // Count specimens contributed by this donor
  const sampleCount = specimensCache.filter(s => s.donorId === donor.donorId).length;

  container.innerHTML = `
    <div style="font-family: var(--font-body); font-size: 13px;">
      <!-- Welcome Header -->
      <div style="background: rgba(0, 242, 254, 0.04); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <h3 style="margin: 0; font-size: 15px; color: var(--text-primary); font-family: var(--font-title); font-weight: 700;">Welcome back, ${donor.fullName || donor.name}</h3>
          <span style="font-size:11px; color: var(--text-secondary);">Participant Subject ID: <strong>${donor.donorId}</strong></span>
        </div>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>

      <!-- Contributions -->
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 8px 0; color: var(--accent-teal); font-size: 12px; text-transform: uppercase; font-family: var(--font-title); font-weight: 600;">Your Biobank Contributions</h4>
        <p style="margin: 0; line-height: 1.4; color: var(--text-secondary); font-size: 12px;">
          Our repositories currently store <strong>${sampleCount}</strong> biological specimen aliquot(s) contributed by you under compliance standards.
        </p>
      </div>

      <!-- Why Consent Copy is Important -->
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 8px 0; color: var(--accent-cyan); font-size: 12px; text-transform: uppercase; font-family: var(--font-title); font-weight: 600;">Why a Consent Copy is Important</h4>
        <p style="margin: 0 0 10px 0; line-height: 1.4; font-size: 12px; color: var(--text-secondary);">
          Under regulatory standards (such as **HIPAA**, **GDPR**, **ICMR Guidelines**, and **ISO 20387**), you must receive a copy of your signed document to clearly know:
        </p>
        <ul style="margin: 0; padding-left: 20px; color: var(--text-secondary); line-height: 1.5; font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
          <li><strong>What sample is collected:</strong> Registered biospecimen extracts (diagnosis: ${donor.diagnosis}).</li>
          <li><strong>Why it is collected:</strong> For non-commercial molecular profiling & research studies.</li>
          <li><strong>How data will be used:</strong> To compile anonymized disease databases for metabolic/oncological analysis.</li>
          <li><strong>Who can access it:</strong> Authorized LIMS operators and verified research institutions under IRB approvals.</li>
          <li><strong>Risks & benefits:</strong> Minimal physical discomfort; contribution to global health discovery.</li>
          <li><strong>Whether genomic sequencing will happen:</strong> <strong>${donor.genomic ? 'YES (Authorized)' : 'NO (Restricted)'}</strong>.</li>
          <li><strong>Whether commercial/research use is allowed:</strong> Academic = <strong>${donor.academic ? 'Yes' : 'No'}</strong> | Commercial = <strong>${donor.commercial ? 'Yes' : 'No'}</strong>.</li>
          <li><strong>How to withdraw consent later:</strong> Revocation can be initiated directly below at any time.</li>
        </ul>
      </div>

      <!-- Portal Actions -->
      <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 16px;">
        <div style="display: flex; gap: 8px;">
          <button type="button" class="secondary-btn" id="portal-btn-print" style="padding: 8px 12px; font-size: 11px; display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print
          </button>
          <button type="button" class="secondary-btn" id="portal-btn-download" style="padding: 8px 12px; font-size: 11px; display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download HTML
          </button>
        </div>
        
        ${isWithdrawn ? `
          <div style="font-size: 11px; color: var(--accent-red); padding: 8px; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 6px; background: rgba(239, 68, 68, 0.04); margin-top: 8px; display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left;">
            <span><strong>Consent Status:</strong> WITHDRAWN</span>
            <span><strong>Withdrawn Date & Time:</strong> ${donor.withdrawnAt || 'N/A'}</span>
            <span><strong>Withdrawn By:</strong> ${donor.withdrawnBy || 'N/A'}</span>
          </div>
        ` : (currentUser && currentUser.role !== 'Super Admin' ? `
          <div style="display: flex; flex-direction: column; gap: 4px; text-align: left;">
            <button type="button" class="secondary-btn" id="portal-btn-revoke" style="background: rgba(255, 255, 255, 0.02); border-color: var(--border-color); color: var(--text-tertiary); padding: 8px 14px; font-size: 11px; font-weight: 600; cursor: not-allowed;" disabled>
              ✕ Revoke Consent & Block Samples
            </button>
            <span style="font-size: 10px; color: var(--text-tertiary);">Withdrawal requires Super Admin access.</span>
          </div>
        ` : `
          <button type="button" class="secondary-btn" id="portal-btn-revoke" style="background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.3); color: var(--accent-red); padding: 8px 14px; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px; cursor: pointer;">
            ✕ Revoke Consent & Block Samples
          </button>
        `)}
      </div>
    </div>
  `;

  // Bind Portal Actions
  const btnPrint = document.getElementById('portal-btn-print');
  if (btnPrint) {
    btnPrint.onclick = () => {
      const printSection = document.getElementById('print-section');
      if (printSection) {
        printSection.innerHTML = generateConsentCertificateHTML(donor);
        window.print();
      }
    };
  }

  const btnDownload = document.getElementById('portal-btn-download');
  if (btnDownload) {
    btnDownload.onclick = () => {
      downloadConsentHTML(donor);
    };
  }

  const btnRevoke = document.getElementById('portal-btn-revoke');
  if (btnRevoke) {
    btnRevoke.onclick = async () => {
      const isSuperAdmin = currentUser && currentUser.role === 'Super Admin';
      if (!isSuperAdmin) {
        alert("Access Denied: Only Super Admin is authorized to withdraw patient consent.");
        return;
      }
      const confirmRevoke = confirm(`WARNING: Ethical Revocation Request\n\nAre you sure you want to withdraw all research consents for patient [${donor.donorId}]?\n\nThis will immediately flag all biological materials as blocked and prevent further research access.`);
      if (confirmRevoke) {
        btnRevoke.disabled = true;
        btnRevoke.textContent = "Processing Revocation...";
        
        const withdrawnSettings = {
          academic: false,
          genomic: false,
          commercial: false,
          dataSharing: false,
          genomicPermission: false,
          consentStatus: 'Withdrawn',
          researchSpecific: {
            cancer: false,
            diabetes: false,
            infectious: false,
            cardiovascular: false,
            neurological: false
          }
        };

        try {
          await db.updateDonorConsent(donor.donorId, {
            academic: false,
            genomic: false,
            commercial: false
          });
          await db.updateDonor(donor.donorId, withdrawnSettings);
          
          await db.addBlockchainBlock(donor.donorId, `Consent Revoked / Withdrawn: Revocation initiated by patient from Autonomy Portal.`);
          
          await db.addAuditLog({
            username: donor.fullName || donor.name,
            role: "Patient (Portal Access)",
            action: "Consent Revocation",
            details: `Patient initiated consent revocation from patient portal workspace. All specimens blocked.`
          });

          await refreshDatabaseCache();

          // Refresh underlying LIMS layout views
          renderDashboardStats();
          renderSVGCharts();
          refreshCatalogView();
          renderBlockchainLedger();
          
          // Re-render the portal views
          const updatedDonor = donorsCache.find(d => d.donorId === donor.donorId);
          renderPatientPortal(updatedDonor);
          
          // Sync LIMS consent tab manager if opened
          const activeDonorSelect = document.getElementById('consent-donor-select');
          if (activeDonorSelect && activeDonorSelect.value === donor.donorId) {
            // Trigger local reload
            const changeEvent = new Event('change');
            activeDonorSelect.dispatchEvent(changeEvent);
          }

          alert(`Autonomy Revocation Complete: Patient [${donor.donorId}] has withdrawn from study. All biological resources blocked.`);
        } catch (err) {
          console.error("Portal revocation failed: ", err);
          alert("Database Error: Could not complete revocation.");
          btnRevoke.disabled = false;
          btnRevoke.innerHTML = "✕ Revoke Consent & Block Samples";
        }
      }
    };
  }
}

function populateConsentDonorDropdown() {
  const donorSelect = document.getElementById('consent-donor-select');
  if (!donorSelect) return;

  const currentSelection = donorSelect.value;
  donorSelect.innerHTML = '';
  donorsCache.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.donorId;
    opt.textContent = `${d.donorId} (${d.diagnosis})`;
    donorSelect.appendChild(opt);
  });

  if (currentSelection && donorsCache.some(d => d.donorId === currentSelection)) {
    donorSelect.value = currentSelection;
  }
}

function renderBlockchainLedger() {
  const container = document.getElementById('blockchain-timeline-container');
  if (!container) return;

  container.innerHTML = '';

  if (blockchainCache.length === 0) {
    container.innerHTML = `<p style="font-size:12px; color:var(--text-secondary); text-align:center; padding: 24px;">No blockchain transactions recorded.</p>`;
    return;
  }

  blockchainCache.forEach(block => {
    const blockEl = document.createElement('div');
    blockEl.className = 'blockchain-block-item';
    blockEl.setAttribute('tabindex', '0');
    blockEl.setAttribute('role', 'button');
    blockEl.setAttribute('aria-label', `Verify Block ${block.index} details`);

    const dateStr = new Date(block.timestamp).toLocaleString();

    blockEl.innerHTML = `
      <div class="blockchain-block-header">
        <span class="block-index-tag">BLOCK #${block.index}</span>
        <span class="block-time">${dateStr}</span>
      </div>
      <div class="blockchain-block-body">
        <strong>Participant:</strong> ${block.donorId} <br>
        <strong>Change details:</strong> <span style="color:var(--text-secondary); font-size:12px;">${block.change}</span>
      </div>
      <div class="blockchain-block-footer">
        TxHash: ${block.txHash} | PrevHash: ${block.previousHash.slice(0, 14)}...
      </div>
    `;

    // Click block to open verification popup details
    blockEl.addEventListener('click', () => {
      openBlockDetailsModal(block);
    });

    container.appendChild(blockEl);
  });
}

function openBlockDetailsModal(block) {
  const modal = document.getElementById('block-detail-modal');
  const jsonContent = document.getElementById('block-json-content');
  if (!modal || !jsonContent) return;

  // Pretty stringify block
  jsonContent.textContent = JSON.stringify(block, null, 2);
  modal.showModal();
}

function initBlockModalListeners() {
  const modal = document.getElementById('block-detail-modal');
  const btnClose = document.getElementById('btn-close-block-modal');
  const btnCloseFooter = document.getElementById('btn-close-block-modal-footer');

  if (modal) {
    const closeBlockModal = () => modal.close();
    if (btnClose) btnClose.onclick = closeBlockModal;
    if (btnCloseFooter) btnCloseFooter.onclick = closeBlockModal;
  }
}

function initQCModalListeners() {
  const modal = document.getElementById('qc-modal');
  const btnClose = document.getElementById('btn-close-qc-modal');
  const form = document.getElementById('qc-form');
  
  if (modal && btnClose) {
    btnClose.onclick = () => modal.close();
  }
  
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      
      const barcode = document.getElementById('qc-specimen-barcode').value;
      const qcStatus = document.getElementById('qc-status-select').value;
      const quality = document.getElementById('qc-metric-input').value.trim();
      const notes = document.getElementById('qc-notes-input').value.trim();
      const analyst = currentUser ? currentUser.username : "System Analyst";
      
      try {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Recording QC verification...";
        }
        
        await db.updateSpecimenQC(barcode, qcStatus, quality, analyst, notes);
        
        // Log to blockchain
        await db.addBlockchainBlock(
          barcode, 
          `QC Assessment: Status=${qcStatus}, Score=${quality}, Analyst=${analyst}`
        );
        
        // Log Audit Event
        await db.addAuditLog({
          username: analyst,
          role: currentUser ? currentUser.role : "Operator",
          action: "QC Certification",
          details: `Logged specimen [${barcode}] Quality Control report: Status=${qcStatus}, Quality Score=[${quality}].`
        });
        
        await refreshDatabaseCache();
        
        // UI refreshes
        renderDashboardStats();
        renderSVGCharts();
        refreshCatalogView();
        renderBlockchainLedger();
        
        // Close modal
        modal.close();
        
        // Refresh detail view for active well
        const detailsPane = document.getElementById('well-details-pane');
        if (detailsPane && detailsPane.querySelector('.well-placeholder-text').style.display === 'none') {
          // Re-find and render active specimen details
          const activeSpecimen = specimensCache.find(s => s.barcode === barcode);
          if (activeSpecimen) {
            // Find active well id
            const wellIdText = document.getElementById('details-well-id')?.textContent;
            const wellId = wellIdText ? parseInt(wellIdText.replace('Well ', '')) : null;
            if (wellId) {
              showWellDetails(wellId, activeSpecimen);
            }
          }
        }
        
        alert(`Quality Control validation committed successfully!\n\nSpecimen [${barcode}] is verified as [${qcStatus}]. Compliance rules updated on secure blockchain ledger.`);
      } catch (err) {
        console.error("QC save failed: ", err);
        alert("Database Error: Could not record Quality Control report.");
      } finally {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Commit QC Report & Sign Audit";
        }
      }
    };
  }
}

// ==========================================
// 6. Donor Enrolment Registry Manager
// ==========================================
function initDonorRegistry() {
  const form = document.getElementById('enroll-donor-form');
  const btnOpen = document.getElementById('btn-open-enroll-panel');
  const modal = document.getElementById('enroll-modal');
  const btnClose = document.getElementById('btn-close-enroll-modal');
  const btnCancel = document.getElementById('btn-cancel-enroll');

  if (btnOpen && modal) {
    btnOpen.onclick = () => {
      // Set default expiry date to 5 years from now
      const expiryInput = document.getElementById('enroll-consent-expiry');
      if (expiryInput) {
        const fiveYearsLater = new Date();
        fiveYearsLater.setFullYear(fiveYearsLater.getFullYear() + 5);
        expiryInput.value = fiveYearsLater.toISOString().slice(0, 10);
      }
      modal.showModal();
    };
  }

  const closeModal = () => {
    if (modal) modal.close();
  };

  if (btnClose) btnClose.onclick = closeModal;
  if (btnCancel) btnCancel.onclick = closeModal;

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();

      const donorId = document.getElementById('enroll-donor-id').value.trim();
      const uhid = document.getElementById('enroll-uhid').value.trim();
      const fullName = document.getElementById('enroll-fullname').value.trim();
      const dob = document.getElementById('enroll-dob').value;
      const gender = document.getElementById('enroll-gender').value;
      const phone = document.getElementById('enroll-phone').value.trim();
      const email = document.getElementById('enroll-email').value.trim();
      const address = document.getElementById('enroll-address').value.trim();
      const diagnosis = document.getElementById('enroll-diagnosis').value;
      const diseaseHistory = document.getElementById('enroll-disease-history').value.trim();
      const familyHistory = document.getElementById('enroll-family-history').value.trim();
      const clinicalNotes = document.getElementById('enroll-clinical-notes').value.trim();
      const consentExpiry = document.getElementById('enroll-consent-expiry').value;
      const academic = document.getElementById('enroll-academic').checked;
      const genomic = document.getElementById('enroll-genomic').checked;
      const commercial = document.getElementById('enroll-commercial').checked;

      if (!donorId) return;

      // Validate duplicate donor ID
      const duplicate = donorsCache.some(d => d.donorId.toLowerCase() === donorId.toLowerCase());
      if (duplicate) {
        alert(`Error: A donor with identifier ID [${donorId}] is already enrolled in the registry.`);
        return;
      }

      const birthDate = new Date(dob);
      const age = new Date().getFullYear() - birthDate.getFullYear();

      const newDonor = {
        donorId: donorId,
        name: donorId,
        uhid: uhid,
        fullName: fullName,
        dob: dob,
        age: age,
        gender: gender,
        phone: phone || 'N/A',
        email: email || 'N/A',
        address: address || 'N/A',
        diagnosis: diagnosis,
        diseaseHistory: diseaseHistory || 'No previous clinical history logged.',
        familyHistory: familyHistory || 'No family history reported.',
        clinicalNotes: clinicalNotes || 'No notes.',
        consentStatus: 'Active',
        consentExpiry: consentExpiry,
        eSignature: fullName,
        academic: academic,
        genomic: genomic,
        commercial: commercial,
        researchSpecific: {
          cancer: diagnosis === 'Breast Cancer',
          diabetes: diagnosis === 'Type 2 Diabetes',
          infectious: diagnosis === 'COVID-19 Post-Acute',
          cardiovascular: false,
          neurological: diagnosis === "Alzheimer's Disease"
        },
        dataSharing: true,
        genomicPermission: genomic,
        visits: [
          {
            date: new Date().toISOString().slice(0, 10),
            purpose: 'Biobank Registration & Initial Intake',
            clinician: currentUser ? currentUser.username : 'Dr. Sarah Chen',
            notes: `Patient registered under clinical profile for ${diagnosis}. Initial consent rules activated.`
          }
        ]
      };

      try {
        await db.addDonor(newDonor);
        
        // Log Audit Event
        await db.addAuditLog({
          username: currentUser ? currentUser.username : "Unknown Operator",
          role: currentUser ? currentUser.role : "Guest",
          action: "Donor Registry",
          details: `Registered and enrolled participant ID [${donorId}] under clinical diagnosis [${diagnosis}].`
        });
        
        // Refresh cache data
        await refreshDatabaseCache();
        renderDashboardStats();
        renderSVGCharts();
        renderDonorsDirectory();
        populateConsentDonorDropdown();
        
        form.reset();
        closeModal();
        
        alert(`Success: Patient [${donorId}] successfully enrolled and signed on LIMS Blockchain registry!`);
      } catch (err) {
        console.error("Enrolment failed: ", err);
        alert("Database error: Could not enroll donor.");
      }
    };
  }

  const searchInput = document.getElementById('donors-search-input');
  if (searchInput) {
    searchInput.oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('.donor-row-item');
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(q)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    };
  }

  renderDonorsDirectory();
}

function renderDonorsDirectory() {
  const container = document.getElementById('donors-directory-list');
  if (!container) return;

  container.innerHTML = '';

  if (donorsCache.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding: 32px 16px; font-size: 13px;">No patients enrolled in directory.</div>`;
    return;
  }

  donorsCache.forEach(d => {
    const card = document.createElement('div');
    card.className = 'donor-card donor-row-item';
    card.setAttribute('data-donor-id', d.donorId);

    // Check status
    let statusClass = 'green-bg';
    let statusText = 'Active';
    const today = new Date().toISOString().slice(0, 10);
    if (d.consentStatus === 'Withdrawn') {
      statusClass = 'red-bg';
      statusText = 'Withdrawn';
    } else if (d.consentExpiry && d.consentExpiry < today) {
      statusClass = 'orange-bg';
      statusText = 'Expired';
    } else if (d.consentStatus) {
      statusText = d.consentStatus;
      if (statusText === 'Expired') statusClass = 'orange-bg';
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <span class="barcode-txt" style="color:var(--accent-teal); font-weight:bold; font-size:12px;">${d.donorId}</span>
        <span class="status-badge ${statusClass}" style="font-size:10px; padding: 2px 8px; border-radius: 6px;">${statusText}</span>
      </div>
      <div style="font-size:14px; font-weight:600; color:var(--text-primary); margin-top: 2px;">${d.fullName || d.name}</div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-secondary); margin-top: 2px; width: 100%;">
        <span>UHID: <code style="color:var(--accent-cyan); font-weight:500;">${d.uhid || 'N/A'}</code></span>
        <span style="font-style: italic; font-weight: 500; color: var(--text-tertiary); max-width: 180px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${d.diagnosis}">${d.diagnosis}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.donor-card').forEach(r => r.classList.remove('selected-row'));
      card.classList.add('selected-row');
      showDonorDetails(d.donorId);
    });

    container.appendChild(card);
  });
}

function showDonorDetails(donorId) {
  const donor = donorsCache.find(d => d.donorId === donorId);
  if (!donor) return;

  const placeholder = document.getElementById('donor-details-placeholder-pane');
  const content = document.getElementById('donor-details-content-pane');

  if (placeholder) placeholder.style.display = 'none';
  if (content) {
    content.classList.remove('hidden');

    // Check status
    let statusClass = 'green-bg';
    let statusText = 'Active';
    const today = new Date().toISOString().slice(0, 10);
    if (donor.consentStatus === 'Withdrawn') {
      statusClass = 'red-bg';
      statusText = 'Withdrawn';
    } else if (donor.consentExpiry && donor.consentExpiry < today) {
      statusClass = 'orange-bg';
      statusText = 'Expired';
    } else if (donor.consentStatus) {
      statusText = donor.consentStatus;
      if (statusText === 'Expired') statusClass = 'orange-bg';
    }

    // Build visits table
    let visitsHTML = '';
    if (donor.visits && donor.visits.length > 0) {
      visitsHTML = `
        <table class="catalog-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>Date</th>
              <th>Purpose</th>
              <th>Clinician</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${donor.visits.map(v => `
              <tr>
                <td style="font-family:monospace; font-size:11px;">${v.date}</td>
                <td><strong>${v.purpose}</strong></td>
                <td>${v.clinician}</td>
                <td style="color:var(--text-secondary);">${v.notes}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      visitsHTML = `<p style="font-size:12px; color:var(--text-secondary); padding: 12px 0;">No visit history recorded for this patient.</p>`;
    }

    // Build specimens listing for timeline mapping
    const donorSpecimens = specimensCache.filter(s => s.donorId === donorId);

    // Build Timeline Events
    const timelineEvents = [];

    // 1. Enrollment Event
    const enrollDate = donor.visits && donor.visits.length > 0 ? donor.visits[0].date : '2026-01-01';
    timelineEvents.push({
      date: enrollDate,
      title: 'Registry Enrollment',
      desc: `Patient enrolled under clinical profile for ${donor.diagnosis}. Pseudonym assigned: ${donor.donorId}.`,
      icon: '👤',
      type: 'enroll'
    });

    // 2. Consent signing
    timelineEvents.push({
      date: enrollDate,
      title: 'Consent Agreement Signed',
      desc: `Academic=${donor.academic ? 'Yes' : 'No'}, Genomic=${donor.genomic ? 'Yes' : 'No'}, Commercial=${donor.commercial ? 'Yes' : 'No'}. eSigned by ${donor.fullName || donor.name}.`,
      icon: '✍',
      type: 'consent'
    });

    // 3. Clinical Visits
    if (donor.visits) {
      donor.visits.forEach((v, idx) => {
        if (idx === 0 && v.purpose.includes('Registration')) return; // Avoid duplicate node
        timelineEvents.push({
          date: v.date,
          title: `Clinical Visit: ${v.purpose}`,
          desc: `Clinician: ${v.clinician}. Notes: ${v.notes}`,
          icon: '🏥',
          type: 'visit'
        });
      });
    }

    // 4. Specimen Depositions
    donorSpecimens.forEach(s => {
      const auditLog = auditCache.find(log => log.action === 'Specimen Deposit' && log.details.includes(s.barcode));
      const depDate = auditLog ? auditLog.timestamp.slice(0, 10) : '2026-02-15';
      timelineEvents.push({
        date: depDate,
        title: `Specimen Deposit [${s.barcode}]`,
        desc: `Deposited aliquot of type ${s.type} in storage ${s.location ? s.location.split('>')[0].trim() : 'Unassigned'} (Coordinate: ${s.location ? s.location.split('>').pop().trim() : 'Unassigned'}).`,
        icon: '❄',
        type: 'specimen'
      });
    });

    // 5. Withdrawal Event (if withdrawn)
    if (donor.consentStatus === 'Withdrawn') {
      const bcBlock = blockchainCache.find(b => b.donorId === donorId && b.change.includes('Withdrawn'));
      const withdrawDate = bcBlock ? bcBlock.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10);
      timelineEvents.push({
        date: withdrawDate,
        title: 'Consent Revocation / Withdrawal',
        desc: 'Patient exercised autonomy to withdraw all consent rules. Specimens blocked.',
        icon: '✕',
        type: 'withdrawn'
      });
    }

    // Sort timeline events chronologically
    timelineEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Render Timeline HTML
    const timelineHTML = `
      <div class="patient-timeline-vertical">
        ${timelineEvents.map(ev => `
          <div class="timeline-node-item ${ev.type}">
            <div class="timeline-node-badge">${ev.icon}</div>
            <div class="timeline-node-content">
              <div class="timeline-node-meta">
                <span class="timeline-node-title">${ev.title}</span>
                <span class="timeline-node-date">${ev.date}</span>
              </div>
              <p class="timeline-node-desc">${ev.desc}</p>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Inject HTML
    content.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="margin: 0; font-size: 20px;">${donor.fullName || donor.name}</h2>
          <p style="font-size: 11px; color: var(--text-secondary); margin: 4px 0 0 0;">
            De-identified ID: <strong style="color:var(--accent-teal);">${donor.donorId}</strong> | UHID: <code>${donor.uhid || 'N/A'}</code>
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="status-badge ${statusClass}">${statusText}</span>
          <button type="button" class="secondary-btn" id="btn-show-consent-tab" style="padding: 6px 12px; font-size: 11px; border-radius: 6px; border-color:var(--accent-cyan); color:var(--accent-cyan); cursor:pointer;">
            Manage Consent
          </button>
        </div>
      </div>

      <!-- Detail subgrids -->
      <div class="details-grid-wrapper" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
        <!-- Demographics -->
        <div class="details-card-box" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px;">
          <h3 style="font-size: 13px; color: var(--accent-teal); margin-bottom: 12px; font-weight: 600; text-transform: uppercase;">Demographic Information</h3>
          <div class="data-group-list" style="gap: 8px; display: flex; flex-direction: column;">
            <div class="data-group" style="display: flex; justify-content: space-between; font-size:12px;"><span class="group-label" style="color:var(--text-secondary);">Birth Date</span><span class="group-value">${donor.dob || 'N/A'} (Age ${donor.age || 'N/A'})</span></div>
            <div class="data-group" style="display: flex; justify-content: space-between; font-size:12px;"><span class="group-label" style="color:var(--text-secondary);">Gender</span><span class="group-value">${donor.gender || 'N/A'}</span></div>
            <div class="data-group" style="display: flex; justify-content: space-between; font-size:12px;"><span class="group-label" style="color:var(--text-secondary);">Email</span><span class="group-value">${donor.email || 'N/A'}</span></div>
            <div class="data-group" style="display: flex; justify-content: space-between; font-size:12px;"><span class="group-label" style="color:var(--text-secondary);">Phone</span><span class="group-value">${donor.phone || 'N/A'}</span></div>
            <div class="data-group" style="display: flex; justify-content: space-between; font-size:12px;"><span class="group-label" style="color:var(--text-secondary);">Address</span><span class="group-value" style="text-align: right; max-width: 60%;">${donor.address || 'N/A'}</span></div>
          </div>
        </div>

        <!-- Clinical profiles -->
        <div class="details-card-box" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px;">
          <h3 style="font-size: 13px; color: var(--accent-teal); margin-bottom: 12px; font-weight: 600; text-transform: uppercase;">Clinical Baseline</h3>
          <div class="data-group-list" style="gap: 8px; display: flex; flex-direction: column;">
            <div class="data-group" style="display: flex; justify-content: space-between; font-size:12px;"><span class="group-label" style="color:var(--text-secondary);">Diagnosis</span><span class="group-value"><strong>${donor.diagnosis}</strong></span></div>
            <div class="data-group" style="display: flex; flex-direction: column; font-size:12px; gap: 4px;"><span class="group-label" style="color:var(--text-secondary);">Disease History</span><span class="group-value" style="color:var(--text-secondary); line-height: 1.4; background: rgba(0,0,0,0.15); padding: 6px; border-radius: 6px;">${donor.diseaseHistory || 'No previous clinical history logged.'}</span></div>
            <div class="data-group" style="display: flex; flex-direction: column; font-size:12px; gap: 4px;"><span class="group-label" style="color:var(--text-secondary);">Family History</span><span class="group-value" style="color:var(--text-secondary); line-height: 1.4; background: rgba(0,0,0,0.15); padding: 6px; border-radius: 6px;">${donor.familyHistory || 'No family history logged.'}</span></div>
            <div class="data-group" style="display: flex; flex-direction: column; font-size:12px; gap: 4px;"><span class="group-label" style="color:var(--text-secondary);">Clinical Notes</span><span class="group-value" style="color:var(--text-secondary); line-height: 1.4; background: rgba(0,0,0,0.15); padding: 6px; border-radius: 6px;">${donor.clinicalNotes || 'No notes.'}</span></div>
          </div>
        </div>
      </div>

      <!-- Visit Ledger -->
      <div class="details-card-box" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="font-size: 13px; color: var(--accent-teal); margin: 0; font-weight: 600; text-transform: uppercase;">Visit History Log</h3>
          <button type="button" class="secondary-btn" id="btn-toggle-visit-form" style="padding: 4px 8px; font-size: 10px; border-radius: 4px; cursor: pointer;">+ Log New Visit</button>
        </div>

        <!-- Collapsible Log Visit Form -->
        <div id="log-visit-form-container" class="hidden" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <form id="log-visit-form" style="display:flex; flex-direction:column; gap:10px;">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
              <div class="form-group" style="display:flex; flex-direction:column; gap:4px;">
                <label for="visit-date" style="font-size:10px; color:var(--text-secondary);">Visit Date *</label>
                <input type="date" id="visit-date" required style="font-size:11px; padding:6px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px;">
              </div>
              <div class="form-group" style="display:flex; flex-direction:column; gap:4px;">
                <label for="visit-purpose" style="font-size:10px; color:var(--text-secondary);">Purpose *</label>
                <input type="text" id="visit-purpose" required placeholder="e.g. Follow-up Sample Extraction" style="font-size:11px; padding:6px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; outline:none;">
              </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr; gap:10px;">
              <div class="form-group" style="display:flex; flex-direction:column; gap:4px;">
                <label for="visit-clinician" style="font-size:10px; color:var(--text-secondary);">Clinician Name *</label>
                <input type="text" id="visit-clinician" required value="${currentUser ? currentUser.username : 'Dr. Sarah Chen'}" style="font-size:11px; padding:6px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; outline:none;">
              </div>
            </div>
            <div class="form-group" style="display:flex; flex-direction:column; gap:4px;">
              <label for="visit-notes" style="font-size:10px; color:var(--text-secondary);">Visit Notes *</label>
              <textarea id="visit-notes" required rows="2" placeholder="Describe biological extracts, vital thresholds, or general remarks..." style="font-size:11px; padding:6px; background:var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; outline:none; resize:none;"></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button type="button" class="secondary-btn" id="btn-cancel-visit" style="padding:4px 8px; font-size:10px; border-radius:4px;">Cancel</button>
              <button type="submit" class="primary-btn" style="padding:4px 8px; font-size:10px; border-radius:4px; font-weight:700;">Save Visit</button>
            </div>
          </form>
        </div>

        <div class="catalog-table-container" style="max-height: 180px; overflow-y: auto;">
          ${visitsHTML}
        </div>
      </div>

      <!-- Patient Lifecycle Timeline -->
      <div class="details-card-box" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <h3 style="font-size: 13px; color: var(--accent-teal); margin-bottom: 12px; font-weight: 600; text-transform: uppercase;">Patient Biobank Lifecycle Timeline</h3>
        ${timelineHTML}
      </div>

      <!-- Consent Agreement Summary -->
      <div class="details-card-box" style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px;">
        <h3 style="font-size: 13px; color: var(--accent-teal); margin-bottom: 12px; font-weight: 600; text-transform: uppercase;">Signed Ethical Covenants</h3>
        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; text-align:center;">
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); padding:10px; border-radius:8px;">
            <div style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">Academic</div>
            <strong style="color:${donor.academic ? 'var(--accent-green)' : 'var(--text-tertiary)'}">${donor.academic ? '✔ Enabled' : '✕ Disabled'}</strong>
          </div>
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); padding:10px; border-radius:8px;">
            <div style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">Genomic</div>
            <strong style="color:${donor.genomic ? 'var(--accent-green)' : 'var(--text-tertiary)'}">${donor.genomic ? '✔ Enabled' : '✕ Disabled'}</strong>
          </div>
          <div style="background:var(--bg-primary); border:1px solid var(--border-color); padding:10px; border-radius:8px;">
            <div style="font-size:10px; color:var(--text-secondary); margin-bottom:4px;">Commercial</div>
            <strong style="color:${donor.commercial ? 'var(--accent-green)' : 'var(--text-tertiary)'}">${donor.commercial ? '✔ Enabled' : '✕ Disabled'}</strong>
          </div>
        </div>
        <div style="margin-top:12px; font-size:11px; color:var(--text-secondary); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <span>Consent Expiry: <strong>${donor.consentExpiry || 'N/A'}</strong></span>
          <span>eSigned: <strong style="font-family:monospace; color:var(--accent-cyan);">${donor.eSignature || 'N/A'}</strong></span>
        </div>
      </div>
    `;

    // Wire up events
    const btnShowConsent = document.getElementById('btn-show-consent-tab');
    if (btnShowConsent) {
      btnShowConsent.onclick = () => {
        const consentTabBtn = document.querySelector('.nav-btn[data-tab="consent-tab"]');
        if (consentTabBtn) {
          const consentSelect = document.getElementById('consent-donor-select');
          if (consentSelect) {
            consentSelect.value = donorId;
            const event = new Event('change');
            consentSelect.dispatchEvent(event);
          }
          consentTabBtn.click();
        }
      };
    }

    const btnToggleVisitForm = document.getElementById('btn-toggle-visit-form');
    const visitFormContainer = document.getElementById('log-visit-form-container');
    const btnCancelVisit = document.getElementById('btn-cancel-visit');
    const visitForm = document.getElementById('log-visit-form');

    if (btnToggleVisitForm && visitFormContainer) {
      btnToggleVisitForm.onclick = () => {
        visitFormContainer.classList.toggle('hidden');
        const dateInput = document.getElementById('visit-date');
        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
      };
    }

    if (btnCancelVisit && visitFormContainer) {
      btnCancelVisit.onclick = () => {
        visitFormContainer.classList.add('hidden');
        if (visitForm) visitForm.reset();
      };
    }

    if (visitForm) {
      visitForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const date = document.getElementById('visit-date').value;
        const purpose = document.getElementById('visit-purpose').value.trim();
        const clinician = document.getElementById('visit-clinician').value.trim();
        const notes = document.getElementById('visit-notes').value.trim();

        const updatedVisits = [...(donor.visits || [])];
        updatedVisits.push({ date, purpose, clinician, notes });
        
        updatedVisits.sort((a, b) => new Date(a.date) - new Date(b.date));

        try {
          await db.updateDonor(donorId, { visits: updatedVisits });
          
          await db.addAuditLog({
            username: currentUser ? currentUser.username : "Unknown Operator",
            role: currentUser ? currentUser.role : "Guest",
            action: "Log Patient Visit",
            details: `Logged clinical visit for patient [${donorId}]: ${purpose}.`
          });

          await refreshDatabaseCache();
          showDonorDetails(donorId);
          renderDonorsDirectory();
          alert(`Visit logged successfully for patient [${donorId}].`);
        } catch (err) {
          console.error("Failed to log visit: ", err);
          alert("Database error: Could not log patient visit.");
        }
      };
    }
  }
}

// ==========================================
// 7. Access Control Tab Controller (Access Rule)
// ==========================================
function initAccessControl() {
  const inviteForm = document.getElementById('invite-user-form');
  const settingsForm = document.getElementById('lims-settings-form');
  
  if (inviteForm) {
    inviteForm.onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('invite-username').value.trim();
      const role = document.getElementById('invite-role').value;
      
      if (!username) return;
      
      try {
        await db.addUser({ username, role });
        
        // Log Audit Event
        await db.addAuditLog({
          username: currentUser ? currentUser.username : "Unknown Operator",
          role: currentUser ? currentUser.role : "Guest",
          action: "User Register",
          details: `Registered new LIMS operator [${username}] with role [${role}].`
        });
        
        await refreshDatabaseCache();
        renderDashboardStats();
        renderSVGCharts();
        renderUsersDirectory();
        
        inviteForm.reset();
        alert(`Success: Operator [${username}] registered successfully under role [${role}]!`);
      } catch (err) {
        console.error("Invite user failed: ", err);
        alert("Database error: Could not invite user.");
      }
    };
  }
  
  if (settingsForm) {
    // Sync UI settings input states from Cache
    document.getElementById('settings-double-sign').checked = limsSettings.requireDoubleSignOff;
    document.getElementById('settings-audits').checked = limsSettings.complianceAudits;
    document.getElementById('settings-timeout').value = limsSettings.autoTimeout;
    
    settingsForm.onsubmit = async (e) => {
      e.preventDefault();
      const doubleSign = document.getElementById('settings-double-sign').checked;
      const audits = document.getElementById('settings-audits').checked;
      const timeout = document.getElementById('settings-timeout').value;
      
      try {
        await db.updateSystemSettings({
          requireDoubleSignOff: doubleSign,
          complianceAudits: audits,
          autoTimeout: timeout
        });
        
        // Log Audit Event
        await db.addAuditLog({
          username: currentUser ? currentUser.username : "Unknown Operator",
          role: currentUser ? currentUser.role : "Guest",
          action: "Settings Config",
          details: `Updated security parameters: Double Sign-off=${doubleSign}, Compliance Audits=${audits}, Session Timeout=${timeout} min.`
        });
        
        await refreshDatabaseCache();
        alert("LIMS compliance configurations synced successfully.");
      } catch (err) {
        console.error("Settings save failed: ", err);
        alert("Database error: Could not update configurations.");
      }
    };
  }
  
  renderUsersDirectory();
}

function renderUsersDirectory() {
  const tbody = document.getElementById('users-directory-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (usersCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary); padding: 16px;">No users registered.</td></tr>`;
    return;
  }
  
  usersCache.forEach(u => {
    const row = document.createElement('tr');
    
    row.innerHTML = `
      <td><span class="barcode-txt" style="color:var(--text-tertiary);">${u.id}</span></td>
      <td><strong>${u.username}</strong></td>
      <td><span class="badge" style="background: rgba(255,255,255,0.03); color: var(--text-primary); font-weight:600;">${u.role}</span></td>
      <td><span class="badge green-bg" style="color: var(--accent-green);">● Active</span></td>
      <td>
        <select class="role-reassign-select" data-id="${u.id}" style="padding: 4px 8px; font-size:11px; background:var(--bg-primary); color:var(--text-primary); border:1px solid var(--border-color); border-radius:6px; cursor:pointer;">
          <option value="Researcher" ${u.role === 'Researcher' ? 'selected' : ''}>Researcher</option>
          <option value="Technician" ${u.role === 'Technician' ? 'selected' : ''}>Technician</option>
          <option value="Auditor" ${u.role === 'Auditor' ? 'selected' : ''}>Auditor</option>
          <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
    `;
    
    // Wire dropdown select reassign
    row.querySelector('.role-reassign-select').addEventListener('change', async (e) => {
      const newRole = e.target.value;
      const uid = e.target.getAttribute('data-id');
      try {
        await db.updateUserRole(uid, newRole);
        
        // Log Audit Event
        await db.addAuditLog({
          username: currentUser ? currentUser.username : "Unknown Operator",
          role: currentUser ? currentUser.role : "Guest",
          action: "Role Reassignment",
          details: `Reassigned user role for [${uid}] to [${newRole}].`
        });
        
        await refreshDatabaseCache();
        renderUsersDirectory();
        alert(`Security: Role reassigned to [${newRole}] successfully.`);
      } catch (err) {
        console.error("Reassign role failed: ", err);
        alert("Database error: Could not complete role re-assignment.");
      }
    });
    
    tbody.appendChild(row);
  });
}

// ==========================================
// 8. Reports & Exports Controller (Reports Rule)
// ==========================================
function getFilteredRecords(reportType) {
  let headers = [];
  let rawRecords = [];
  
  const dateStart = document.getElementById('dash-filter-date-start');
  const dateEnd = document.getElementById('dash-filter-date-end');
  const startLimit = dateStart && dateStart.value ? new Date(dateStart.value + 'T00:00:00') : null;
  const endLimit = dateEnd && dateEnd.value ? new Date(dateEnd.value + 'T23:59:59.999') : null;

  const isWithinDateRange = (dateStr) => {
    if (!dateStr) return true;
    const d = new Date(dateStr);
    if (startLimit && d < startLimit) return false;
    if (endLimit && d > endLimit) return false;
    return true;
  };
  
  if (reportType === 'specimens') {
    headers = ["Barcode", "Type", "Diagnosis", "Gender", "Age", "Location", "Quality", "Consent"];
    rawRecords = specimensCache.filter(s => isWithinDateRange(s.createdAt)).map(s => {
      const consents = [];
      if (s.consent.academic) consents.push("ACA");
      if (s.consent.genomic) consents.push("GEN");
      if (s.consent.commercial) consents.push("COM");
      const consentStr = consents.join(' | ') || 'NONE';
      const locShort = s.location ? s.location.split('>').pop().trim() : 'Unassigned';
      return {
        id: s.barcode,
        preview: [s.barcode, s.type, s.diagnosis, s.gender, s.age, locShort, s.quality, consentStr],
        csv: [s.barcode, s.type, `"${s.diagnosis}"`, s.gender, s.age, `"${s.location || 'Unassigned'}"`, s.quality, s.consent.academic, s.consent.genomic, s.consent.commercial, s.donorId],
        csvHeaders: ["Barcode", "Specimen Type", "ICD-10 Pathology", "Gender", "Age", "Coordinates", "Quality score", "Academic Consent", "Genomic Consent", "Commercial Consent", "Donor ID"]
      };
    });
  } else if (reportType === 'donors') {
    headers = ["Donor ID", "Diagnosis", "Academic", "Genomic", "Commercial"];
    rawRecords = donorsCache.filter(d => isWithinDateRange(d.createdAt)).map(d => {
      const acad = d.academic ? "✔ Enabled" : "✕ Disallowed";
      const geno = d.genomic ? "✔ Enabled" : "✕ Disallowed";
      const comm = d.commercial ? "✔ Enabled" : "✕ Disallowed";
      return {
        id: d.donorId,
        preview: [d.donorId, d.diagnosis, acad, geno, comm],
        csv: [d.donorId, `"${d.diagnosis}"`, d.academic, d.genomic, d.commercial],
        csvHeaders: ["Donor ID", "Clinical Diagnosis", "Academic Consent", "Genomic Consent", "Commercial Consent"]
      };
    });
  } else if (reportType === 'requests') {
    headers = ["Request ID", "Researcher", "Institution", "IRB Code", "Samples", "Status"];
    rawRecords = (requestsCache || []).filter(r => isWithinDateRange(r.createdAt)).map(r => {
      const idSlice = r.requestId ? r.requestId.slice(0, 12) : '';
      const samplesCount = (r.samples || []).length;
      const samplesStr = `${samplesCount} vial(s)`;
      return {
        id: idSlice,
        preview: [idSlice, r.researcherName, r.institution, r.irbCode, samplesStr, "Approved"],
        csv: [r.requestId, `"${r.researcherName}"`, `"${r.institution}"`, r.irbCode, samplesCount, "Approved", r.createdAt],
        csvHeaders: ["Request ID", "Researcher", "Institution", "IRB Code", "Samples Count", "Status", "Submitted At"]
      };
    });
  } else if (reportType === 'blockchain') {
    headers = ["Block", "Timestamp", "Hash", "Donor ID", "Change Payload"];
    rawRecords = blockchainCache.filter(b => isWithinDateRange(b.timestamp)).map(b => {
      const blockNum = `#${b.index}`;
      const dateStr = new Date(b.timestamp).toLocaleDateString() + ' ' + new Date(b.timestamp).toTimeString().slice(0, 5);
      const hashSlice = b.txHash.slice(0, 10) + "...";
      return {
        id: blockNum,
        preview: [blockNum, dateStr, hashSlice, b.donorId, b.change],
        csv: [b.index, b.timestamp, b.txHash, b.previousHash, b.donorId, `"${b.change}"`],
        csvHeaders: ["Block Index", "Timestamp", "Transaction Hash", "Previous Block Hash", "Donor ID", "Change Payload"]
      };
    });
  }
  
  // Apply quick search filter
  let filtered = rawRecords;
  if (previewSearchQuery) {
    filtered = filtered.filter(rec => {
      return rec.preview.some(cell => String(cell).toLowerCase().includes(previewSearchQuery));
    });
  }
  
  // Apply column-specific filters
  Object.keys(columnFilterQueries).forEach(colIdx => {
    const query = columnFilterQueries[colIdx];
    if (query) {
      filtered = filtered.filter(rec => {
        const cellVal = rec.preview[colIdx];
        return String(cellVal).toLowerCase().includes(query);
      });
    }
  });
  
  // Filter by selected keys if there are any
  let selected = filtered;
  if (previewSelectedKeys.length > 0) {
    selected = filtered.filter(rec => previewSelectedKeys.includes(rec.id));
  }
  
  return {
    headers,
    filteredRecords: filtered,
    selectedRecords: selected
  };
}

// ==========================================
// 8. Reports & Exports Controller (Reports Rule)
// ==========================================
function initReports() {
  const btnExport = document.getElementById('btn-export-csv');
  const btnPrint = document.getElementById('btn-print-report');
  const reportSelect = document.getElementById('export-report-type');
  const searchInput = document.getElementById('report-preview-search');
  const btnPrev = document.getElementById('btn-prev-preview');
  const btnNext = document.getElementById('btn-next-preview');
  
  if (btnExport) {
    btnExport.onclick = () => {
      const reportType = document.getElementById('export-report-type').value;
      exportToCSV(reportType);
    };
  }
  
  if (btnPrint) {
    btnPrint.onclick = () => {
      const reportType = document.getElementById('export-report-type').value;
      const { selectedRecords } = getFilteredRecords(reportType);
      
      if (selectedRecords.length === 0) {
        alert("Print: No records selected or match current filters.");
        return;
      }
      
      const printSection = document.getElementById('print-section');
      if (!printSection) return;
      
      let title = "";
      let description = "";
      if (reportType === 'specimens') {
        title = "AURA Biobank - Specimens Catalog Registry Report";
        description = "Cryogenic biobank specimen inventory registry and consent states.";
      } else if (reportType === 'donors') {
        title = "AURA Biobank - Patient Registry & Diagnoses Report";
        description = "Donor registry tracking clinical profiles and authorized usage policies.";
      } else if (reportType === 'requests') {
        title = "AURA Biobank - LIMS Access Request History Report";
        description = "Official record of verified research specimen access clearances.";
      } else if (reportType === 'blockchain') {
        title = "AURA Biobank - Blockchain Consent Ledger Report";
        description = "Immutable transaction ledger tracking individual participant consent changes.";
      }
      
      const csvHeaders = selectedRecords[0].csvHeaders;
      
      let html = `
        <h1>${title}</h1>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()} | <strong>Filter Scope:</strong> ${previewSelectedKeys.length > 0 ? 'Selected IDs' : 'Active Query Match'} (${selectedRecords.length} records)</p>
        <table>
          <thead>
            <tr>
              ${csvHeaders.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${selectedRecords.map(rec => {
              const cleanRow = rec.csv.map(val => {
                const sVal = String(val);
                if (sVal.startsWith('"') && sVal.endsWith('"')) {
                  return sVal.slice(1, -1);
                }
                return sVal;
              });
              return `
                <tr>
                  ${cleanRow.map(cell => `<td>${cell}</td>`).join('')}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
      
      printSection.innerHTML = html;
      window.print();
    };
  }
  
  if (reportSelect) {
    reportSelect.onchange = () => {
      previewPageIndex = 0;
      previewSearchQuery = "";
      if (searchInput) searchInput.value = "";
      previewSelectedKeys = [];
      columnFilterQueries = {};
      activeReportType = "";
      renderReportPreview();
    };
  }
  
  if (searchInput) {
    searchInput.oninput = (e) => {
      previewSearchQuery = e.target.value.toLowerCase().trim();
      previewPageIndex = 0;
      renderReportPreview();
    };
  }
  
  if (btnPrev) {
    btnPrev.onclick = () => {
      if (previewPageIndex > 0) {
        previewPageIndex--;
        renderReportPreview();
        const viewport = document.querySelector('.content-viewport');
        if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
  }
  
  if (btnNext) {
    btnNext.onclick = () => {
      previewPageIndex++;
      renderReportPreview();
      const viewport = document.querySelector('.content-viewport');
      if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }
  
  renderFreezerUtilization();
}

function renderFreezerUtilization() {
  const ultSpecimens = specimensCache.filter(s => s.type === 'Blood' || s.type === 'Serum').length;
  const ln2Specimens = specimensCache.filter(s => s.type === 'DNA' || s.type === 'Tissue').length;
  
  const ultPct = Math.round((ultSpecimens / 36) * 100);
  const ln2Pct = Math.round((ln2Specimens / 36) * 100);
  
  const ultText = document.getElementById('report-ult-text');
  const ultBar = document.getElementById('report-ult-bar');
  const ln2Text = document.getElementById('report-ln2-text');
  const ln2Bar = document.getElementById('report-ln2-bar');
  
  if (ultText) ultText.textContent = `${ultSpecimens} / 36 Wells (${ultPct}%)`;
  if (ultBar) ultBar.style.width = `${ultPct}%`;
  if (ln2Text) ln2Text.textContent = `${ln2Specimens} / 36 Wells (${ln2Pct}%)`;
  if (ln2Bar) ln2Bar.style.width = `${ln2Pct}%`;
}

function exportToCSV(reportType) {
  const { selectedRecords } = getFilteredRecords(reportType);
  if (selectedRecords.length === 0) {
    alert("Export: No records selected or match current filters.");
    return;
  }
  
  let csvContent = "";
  let filename = "";
  
  if (reportType === 'specimens') {
    filename = "aura_specimens_report.csv";
    csvContent = "Barcode,Specimen Type,ICD-10 Pathology,Gender,Age,Coordinates,Quality score,Academic Consent,Genomic Consent,Commercial Consent,Donor ID\n";
  } else if (reportType === 'donors') {
    filename = "aura_donors_report.csv";
    csvContent = "Donor ID,Clinical Diagnosis,Academic Consent,Genomic Consent,Commercial Consent\n";
  } else if (reportType === 'requests') {
    filename = "aura_requests_report.csv";
    csvContent = "Request ID,Researcher,Institution,IRB Code,Samples Count,Status,Submitted At\n";
  } else if (reportType === 'blockchain') {
    filename = "aura_blockchain_report.csv";
    csvContent = "Block Index,Timestamp,Transaction Hash,Previous Block Hash,Donor ID,Change Payload\n";
  }
  
  selectedRecords.forEach(rec => {
    csvContent += rec.csv.join(",") + "\n";
  });
  
  // Dynamic downloader trigger
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// ==========================================
// 9. Research Request Cart Actions
// ==========================================
function initCartListeners() {
  const reqForm = document.getElementById('request-checkout-form');
  const requestModal = document.getElementById('request-modal');
  const cartTrigger = document.getElementById('sidebar-cart-trigger');

  if (cartTrigger && requestModal) {
    cartTrigger.addEventListener('click', () => {
      if (!requestModal.open) {
        if (reqForm) {
          reqForm.reset();
        }
        const nameInput = document.getElementById('req-name');
        if (nameInput && currentUser) {
          nameInput.value = currentUser.username || currentUser.name;
        }
        requestModal.showModal();
      }
    });
  }

  if (requestModal) {
    // Close triggers (buttons with command="close" or secondary cancel buttons)
    const closeButtons = requestModal.querySelectorAll('[command="close"], .secondary-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        requestModal.close();
      });
    });
  }

  if (!reqForm) return;

  reqForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (requestCart.length === 0) {
      alert('Your Request Cart is empty! Please add matching biospecimens first.');
      return;
    }

    // Double check consent validation (expiry, withdrawal, research-specific, genomic, data sharing) for any item in cart
    let blockReason = '';
    const blockedItem = requestCart.find(item => {
      const blockCheck = checkSpecimenConsentBlocked(item);
      if (blockCheck.isBlocked) {
        blockReason = blockCheck.reason;
        return true;
      }
      return false;
    });

    if (blockedItem) {
      alert(`Safety Clearance Violation:\n\nSpecimen [${blockedItem.barcode}] cannot be checked out due to: ${blockReason}.\n\nCheckout has been cancelled. Please remove this specimen from your cart and try again.`);
      return;
    }

    const name = document.getElementById('req-name').value;
    const inst = document.getElementById('req-inst').value;
    const irb = document.getElementById('req-irb').value;
    const purpose = document.getElementById('req-purpose').value;
    
    const submitBtn = document.getElementById('btn-submit-request');
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting Access Request...";

    try {
      // Save full research request details into the database collection!
      const requestPayload = {
        researcherName: currentUser ? (currentUser.username || currentUser.name) : name,
        institution: inst,
        irbCode: irb,
        researchPurpose: purpose,
        samples: requestCart.map(c => ({ barcode: c.barcode, type: c.type, donorId: c.donorId }))
      };

      const result = await db.addResearchRequest(requestPayload);
      
      // Log Audit Event
      await db.addAuditLog({
        username: currentUser ? currentUser.username : "Unknown Operator",
        role: currentUser ? currentUser.role : "Guest",
        action: "Access Checkout",
        details: `Submitted specimen access checkout [${result.requestId}] for ${requestPayload.samples.length} sample aliquots.`
      });

      alert(`Access Request Submitted Successfully!\n\nTransaction ID: ${result.requestId || 'REQ-SUCCESS'}\nResearcher: ${currentUser ? (currentUser.username || currentUser.name) : name}\nInstitution: ${inst}\n\nYour request is pending administrative review. You can track its status in the Research Requests tab.`);
      
      // Clear cart
      requestCart = [];
      localStorage.removeItem('aura_request_cart');
      updateCartUI();
      refreshCatalogView();
      
      // Clear storage grid well panels
      initStorageGrid();
      const detailsPane = document.getElementById('well-details-pane');
      if (detailsPane) {
        const placeholder = detailsPane.querySelector('.well-placeholder-text');
        if (placeholder) placeholder.style.display = 'block';
      }
      const wellDataContent = document.getElementById('well-data-content');
      if (wellDataContent) wellDataContent.classList.add('hidden');

      // Close the dialog modal natively
      requestModal.close();

      // Reset the request form fields
      reqForm.reset();

      // Refresh database cache and redraw the ledger immediately
      await refreshDatabaseCache();
      renderDashboardStats();
      renderSVGCharts();
      renderRequestsLedger();
    } catch (err) {
      console.error("Access Request failed: ", err);
      alert(`Database error: ${err.message || 'Could not submit access request. Please verify internet connection.'}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Secure Access Request";
    }
  });
}

function addToCart(specimen) {
  if (!requestCart.some(c => c.barcode === specimen.barcode)) {
    requestCart.push(specimen);
    localStorage.setItem('aura_request_cart', JSON.stringify(requestCart));
    updateCartUI();
  }
}

function removeFromCart(barcode) {
  requestCart = requestCart.filter(item => item.barcode !== barcode);
  localStorage.setItem('aura_request_cart', JSON.stringify(requestCart));
  updateCartUI();
  
  // Re-enable table action button
  refreshCatalogView();
  
  // Re-enable well details button if matching
  const detailsBarcode = document.getElementById('details-sample-barcode');
  if (detailsBarcode && detailsBarcode.textContent === barcode) {
    const btnAddToCart = document.getElementById('btn-add-well-to-cart');
    btnAddToCart.disabled = false;
    btnAddToCart.textContent = 'Add to Request Cart';
  }
}

function updateCartUI() {
  const catalogCountBadge = document.getElementById('catalog-count-badge');
  const cartCounterText = document.getElementById('cart-counter-text');
  const modalCartCount = document.getElementById('modal-cart-count');
  const modalList = document.getElementById('modal-cart-items-list');

  if (!catalogCountBadge) return;

  // Update badge quantities
  const count = requestCart.length;
  cartCounterText.textContent = `${count} specimen${count === 1 ? '' : 's'} selected`;
  if (modalCartCount) modalCartCount.textContent = count;

  // Build list of item tags in modal
  if (modalList) {
    modalList.innerHTML = '';
    
    if (count === 0) {
      modalList.innerHTML = `<li style="color: var(--text-secondary); width:100%; font-size:12px;">No specimens added to request cart yet. Use the Catalog to select.</li>`;
      return;
    }

    requestCart.forEach(item => {
      const li = document.createElement('li');
      li.className = 'modal-cart-item';
      li.innerHTML = `
        <span class="modal-cart-barcode">${item.barcode}</span>
        <span class="specimen-tag">${item.type}</span>
        <button type="button" class="modal-cart-remove" data-barcode="${item.barcode}">✕</button>
      `;
      
      li.querySelector('.modal-cart-remove').addEventListener('click', () => {
        removeFromCart(item.barcode);
      });

      modalList.appendChild(li);
    });
  }
}

function renderRequestsLedger() {
  const tbody = document.getElementById('ledger-table-body');
  const ledgerBadge = document.getElementById('requests-ledger-badge');
  
  if (!tbody || !ledgerBadge) return;
  
  let userRequests = requestsCache || [];
  
  ledgerBadge.textContent = `${userRequests.length} Active`;
  
  tbody.innerHTML = '';
  
  if (userRequests.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 24px 0;">
          No secure requests found in database. Select specimens in the catalog to submit a request.
        </td>
      </tr>
    `;
    const paginationInfo = document.getElementById('ledger-pagination-info');
    const pageInfo = document.getElementById('ledger-page-info');
    const btnPrev = document.getElementById('ledger-btn-prev');
    const btnNext = document.getElementById('ledger-btn-next');
    if (paginationInfo) paginationInfo.textContent = "Showing 0 to 0 of 0 entries";
    if (pageInfo) pageInfo.textContent = "Page 1 of 1";
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }
  
  // Render all records directly (pagination removed from dashboard ledger)
  const pagedRecords = userRequests || [];
  pagedRecords.forEach(req => {
    const row = document.createElement('tr');
    const samplesList = req.samples || [];
    const sampleBarcodes = samplesList.map(s => s.barcode).join(', ');
    const truncatedSamples = sampleBarcodes.length > 25 ? sampleBarcodes.slice(0, 25) + '...' : sampleBarcodes;
    
    const dateStr = req.createdAt ? new Date(req.createdAt).toISOString().slice(0, 10) + ' ' + new Date(req.createdAt).toTimeString().slice(0, 5) : 'N/A';
    
    // Dynamic status display
    const statusVal = req.status || 'Pending';
    const statusLower = statusVal.toLowerCase();
    let statusClass = 'orange-bg';
    if (statusLower === 'approved' || statusLower === 'allocated' || statusLower === 'released') {
      statusClass = 'green-bg';
    } else if (statusLower === 'rejected') {
      statusClass = 'red-bg';
    }
    
    row.innerHTML = `
      <td><span class="barcode-txt" style="color: var(--accent-cyan); font-weight: bold;">${req.requestId ? req.requestId.slice(0, 12) : ''}</span></td>
      <td><strong>${req.researcherName || ''}</strong></td>
      <td>${req.institution || ''}</td>
      <td><code>${req.irbCode || ''}</code></td>
      <td title="${sampleBarcodes}"><strong>${samplesList.length}</strong> vial(s) (${truncatedSamples})</td>
      <td><span class="badge ${statusClass}">${statusVal}</span></td>
      <td style="font-family: monospace; font-size: 11px;">${dateStr}</td>
    `;
    tbody.appendChild(row);
  });
}

// ==========================================
// 10. Report Registry Live Preview
// ==========================================
export function renderReportPreview() {
  const reportType = document.getElementById('export-report-type').value;
  const thead = document.getElementById('report-preview-thead');
  const tbody = document.getElementById('report-preview-tbody');
  const rowCountBadge = document.getElementById('preview-row-count');
  
  const btnPrev = document.getElementById('btn-prev-preview');
  const btnNext = document.getElementById('btn-next-preview');
  const pageInfo = document.getElementById('preview-page-info');
  
  if (!thead || !tbody) return;

  const { headers, filteredRecords } = getFilteredRecords(reportType);

  // Re-draw headers only if reportType changed to preserve search inputs focus
  if (activeReportType !== reportType) {
    activeReportType = reportType;
    thead.innerHTML = "";
    
    // Header Labels & filter buttons
    const trHead = document.createElement('tr');
    
    // Select-all checkbox header cell
    const thSelect = document.createElement('th');
    thSelect.style.width = "40px";
    thSelect.innerHTML = `<input type="checkbox" id="preview-select-all" class="preview-row-select" style="margin: 0; vertical-align: middle;">`;
    trHead.appendChild(thSelect);
    
    headers.forEach((h, idx) => {
      const th = document.createElement('th');
      th.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span>${h}</span>
          <button type="button" class="header-filter-toggle-btn" data-col-idx="${idx}" style="background: none; border: none; padding: 2px; cursor: pointer; color: var(--text-secondary); display: inline-flex; align-items: center; justify-content: center; transition: color 0.2s;" title="Toggle column filter">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px; pointer-events: none;"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          </button>
        </div>
      `;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    
    // Filter Inputs Row
    const trFilter = document.createElement('tr');
    trFilter.className = "column-filter-row";
    
    const thFilterSelect = document.createElement('th');
    trFilter.appendChild(thFilterSelect);
    
    headers.forEach((h, idx) => {
      const th = document.createElement('th');
      th.innerHTML = `<input type="text" class="column-filter-input" data-col-idx="${idx}" placeholder="Filter ${h}..." style="margin: 0; width: 100%;">`;
      trFilter.appendChild(th);
    });
    thead.appendChild(trFilter);
    
    // Bind toggle filters buttons
    thead.querySelectorAll('.header-filter-toggle-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const table = thead.closest('table');
        if (table) {
          table.classList.toggle('show-filters');
          if (table.classList.contains('show-filters')) {
            const colIdx = btn.getAttribute('data-col-idx');
            const input = thead.querySelector(`.column-filter-input[data-col-idx="${colIdx}"]`);
            if (input) input.focus();
          }
        }
      };
    });
    
    // Bind column filters inputs
    thead.querySelectorAll('.column-filter-input').forEach(input => {
      input.oninput = (e) => {
        const colIdx = e.target.getAttribute('data-col-idx');
        columnFilterQueries[colIdx] = e.target.value.toLowerCase().trim();
        previewPageIndex = 0;
        renderReportPreview();
      };
    });
    
    // Master checkbox behavior
    const selectAllCheckbox = thead.querySelector('#preview-select-all');
    if (selectAllCheckbox) {
      selectAllCheckbox.onclick = (e) => {
        const checked = e.target.checked;
        const visibleIds = filteredRecords.map(rec => rec.id);
        if (checked) {
          visibleIds.forEach(id => {
            if (!previewSelectedKeys.includes(id)) {
              previewSelectedKeys.push(id);
            }
          });
        } else {
          visibleIds.forEach(id => {
            const idx = previewSelectedKeys.indexOf(id);
            if (idx > -1) {
              previewSelectedKeys.splice(idx, 1);
            }
          });
        }
        renderReportPreview();
      };
    }
  }
  
  // Calculate Pagination bounds
  const totalRecords = filteredRecords.length;
  const totalPages = Math.max(Math.ceil(totalRecords / previewPageSize), 1);
  
  if (previewPageIndex >= totalPages) {
    previewPageIndex = totalPages - 1;
  }
  if (previewPageIndex < 0) {
    previewPageIndex = 0;
  }
  
  const startIdx = previewPageIndex * previewPageSize;
  const endIdx = Math.min(startIdx + previewPageSize, totalRecords);
  
  const pagedRecords = filteredRecords.slice(startIdx, endIdx);
  
  // Update pagination badges and controls
  if (rowCountBadge) {
    if (totalRecords === 0) {
      rowCountBadge.textContent = "0 records";
    } else {
      rowCountBadge.textContent = `Showing ${startIdx + 1}-${endIdx} of ${totalRecords} records`;
    }
  }
  if (pageInfo) {
    pageInfo.textContent = `Page ${previewPageIndex + 1} of ${totalPages}`;
  }
  if (btnPrev) {
    btnPrev.disabled = (previewPageIndex === 0);
  }
  if (btnNext) {
    btnNext.disabled = (endIdx >= totalRecords);
  }
  
  // Update select-all checkbox state
  const selectAllCheckbox = thead.querySelector('#preview-select-all');
  if (selectAllCheckbox) {
    const visibleIds = filteredRecords.map(rec => rec.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => previewSelectedKeys.includes(id));
    selectAllCheckbox.checked = allSelected;
  }
  
  // Render paged records in tbody
  tbody.innerHTML = "";
  if (pagedRecords.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${headers.length + 1}" style="text-align: center; color: var(--text-secondary); padding: 16px;">No records match your query.</td>`;
    tbody.appendChild(tr);
  } else {
    pagedRecords.forEach(rec => {
      const tr = document.createElement('tr');
      const isSelected = previewSelectedKeys.includes(rec.id);
      
      const tdSelect = document.createElement('td');
      tdSelect.innerHTML = `<input type="checkbox" class="preview-row-select" data-id="${rec.id}" ${isSelected ? 'checked' : ''} style="margin: 0; vertical-align: middle;">`;
      tr.appendChild(tdSelect);
      
      rec.preview.forEach(val => {
        const td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    
    // Bind checkbox change handlers
    tbody.querySelectorAll('.preview-row-select').forEach(cb => {
      cb.onchange = (e) => {
        const id = e.target.getAttribute('data-id');
        if (e.target.checked) {
          if (!previewSelectedKeys.includes(id)) {
            previewSelectedKeys.push(id);
          }
        } else {
          const idx = previewSelectedKeys.indexOf(id);
          if (idx > -1) {
            previewSelectedKeys.splice(idx, 1);
          }
        }
        
        // Sync select-all state
        if (selectAllCheckbox) {
          const visibleIds = filteredRecords.map(r => r.id);
          const allSelected = visibleIds.length > 0 && visibleIds.every(vid => previewSelectedKeys.includes(vid));
          selectAllCheckbox.checked = allSelected;
        }
      };
    });
  }
}

// ==========================================
// 11. User Profile Menu Dropdown Controls
// ==========================================
function initUserProfileMenu() {
  const trigger = document.getElementById('user-profile-menu-trigger');
  const dropdown = document.getElementById('user-dropdown-list');
  const logoutBtn = document.getElementById('btn-logout');
  
  if (!trigger || !dropdown) return;
  
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  });
  
  document.addEventListener('click', () => {
    dropdown.classList.remove('show');
  });
  
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('show');
      const confirmLogout = confirm("Security Audit: Are you sure you want to end your LIMS session and logout?");
      if (confirmLogout) {
        performLogout();
      }
    });
  }
}

// ==========================================
// 12. Authentication Helpers & State Machine
// ==========================================
async function initLoginPortal() {
  const userSelect = document.getElementById('login-user-select');
  const form = document.getElementById('login-form');
  const errorMsg = document.getElementById('login-error-msg');
  
  if (!userSelect || !form) return;
  
  // Make sure database cache has users loaded
  if (usersCache.length === 0) {
    await refreshDatabaseCache();
  }
  
  // Populate dropdown list with registered LIMS users
  userSelect.innerHTML = "";
  usersCache.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.username} (${u.role})`;
    userSelect.appendChild(opt);
  });
  
  form.onsubmit = async (e) => {
    e.preventDefault();
    const selectedUid = userSelect.value;
    const password = document.getElementById('login-password').value;
    
    // Find user using string conversion to avoid type mismatches (SQLite returns number, select value is string)
    const authUser = usersCache.find(u => String(u.id) === String(selectedUid));
    if (authUser && authUser.password === password) {
      currentUser = authUser;
      sessionStorage.setItem('aura_logged_in', 'true');
      sessionStorage.setItem('aura_current_user', JSON.stringify(authUser));
      
      const userTheme = authUser.theme || localStorage.getItem('aura_theme_' + authUser.username) || localStorage.getItem('aura_theme') || 'system';
      applyTheme(userTheme);
      
      // Log Audit Event
      await db.addAuditLog({
        username: authUser.username,
        role: authUser.role,
        action: "LIMS Sign-in",
        details: `Operator session authorized successfully.`
      });
      
      // Refresh cache to include the new sign-in log
      await refreshDatabaseCache();
      
      document.body.classList.add('authenticated');
      updateProfileUI(authUser);
      updateAdminMenuVisibility(authUser.role);
      const dashBtn = document.querySelector('.nav-btn[data-tab="dashboard-tab"]');
      if (dashBtn) dashBtn.click();
      if (errorMsg) errorMsg.style.display = 'none';
      
      // Reset password text
      document.getElementById('login-password').value = "";
    } else {
      if (errorMsg) errorMsg.style.display = 'block';
    }
  };
}

async function performLogout() {
  if (currentUser) {
    await db.addAuditLog({
      username: currentUser.username,
      role: currentUser.role,
      action: "LIMS Sign-out",
      details: `Operator session terminated by logout.`
    });
  }
  
  sessionStorage.setItem('aura_logged_in', 'false');
  sessionStorage.removeItem('aura_current_user');
  currentUser = null;
  document.body.classList.remove('authenticated');
  updateAdminMenuVisibility(null);
  
  // Clean password form input
  const passInput = document.getElementById('login-password');
  if (passInput) passInput.value = "";
  
  // Refresh login portal with correct user options
  await initLoginPortal();
}

function updateProfileUI(user) {
  const nameEl = document.querySelector('.profile-name');
  const roleEl = document.querySelector('.profile-role');
  const avatarEl = document.querySelector('.avatar');
  
  if (nameEl) nameEl.textContent = user.username;
  if (roleEl) roleEl.textContent = user.role;
  if (avatarEl) {
    const initials = user.username.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    avatarEl.textContent = initials;
  }
}

function updateAdminMenuVisibility(role) {
  const adminElements = document.querySelectorAll('.LIMS-admin-only');
  const isAdmin = role === 'Admin' || role === 'Super Admin' || role === 'Lab Admin';
  adminElements.forEach(el => {
    if (isAdmin) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });

  if (!isAdmin) {
    const activePanel = document.querySelector('.tab-panel.active');
    if (activePanel && (activePanel.id === 'access-tab' || activePanel.id === 'audit-tab' || activePanel.id === 'allocation-tab')) {
      const dashBtn = document.querySelector('.nav-btn[data-tab="dashboard-tab"]');
      if (dashBtn) dashBtn.click();
    }
  }
}

function renderAuditLogs() {
  const tbody = document.getElementById('audit-logs-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (auditCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-secondary);">No audit logs recorded in database.</td></tr>`;
    return;
  }
  
  auditCache.forEach(log => {
    const row = document.createElement('tr');
    const dateStr = new Date(log.timestamp).toLocaleString();
    row.innerHTML = `
      <td style="font-family: monospace; font-size:11px; white-space:nowrap;">${dateStr}</td>
      <td><strong>${log.username}</strong></td>
      <td><span class="badge" style="background: rgba(255,255,255,0.03); color: var(--text-primary); font-weight:600;">${log.role}</span></td>
      <td><span class="badge" style="background: rgba(0, 242, 254, 0.05); color: var(--accent-cyan); font-size:11px;">${log.action}</span></td>
      <td><span style="font-size:12px; color:var(--text-secondary);">${log.details}</span></td>
    `;
    tbody.appendChild(row);
  });
}

// ==========================================
// 12. Researcher Study Management (Study & Publications, Sample Allocation, Requests)
// ==========================================

function initStudyManagement() {
  const openModalBtn = document.getElementById('btn-open-study-modal');
  const studyModal = document.getElementById('study-modal');
  const studyForm = document.getElementById('study-registration-form');
  
  if (openModalBtn && studyModal) {
    openModalBtn.addEventListener('click', () => {
      if (studyForm) studyForm.reset();
      studyModal.showModal();
    });
    
    const closeButtons = studyModal.querySelectorAll('#btn-close-study-modal-x, #btn-close-study-modal-footer');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        studyModal.close();
      });
    });
  }
  
  if (studyForm) {
    studyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const title = document.getElementById('study-title').value;
      const irb_code = document.getElementById('study-irb').value;
      const investigator = document.getElementById('study-investigator').value;
      const description = document.getElementById('study-desc').value;
      
      try {
        await db.addStudy({ title, irb_code, investigator, description });
        alert("Study registered successfully!");
        studyModal.close();
        await refreshDatabaseCache();
        renderStudiesGrid();
      } catch (err) {
        console.error("Study registration failed: ", err);
        alert("Error: Could not save study.");
      }
    });
  }
}

function renderStudiesGrid() {
  const grid = document.getElementById('studies-directory-grid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  if (studiesCache.length === 0) {
    grid.innerHTML = `
      <div class="well-placeholder-text" style="grid-column: 1 / -1; padding: 48px; text-align: center;">
        <p>No research studies registered yet. Click "+ Register Study" to add one.</p>
      </div>
    `;
    return;
  }
  
  studiesCache.forEach(study => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.style.padding = '24px';
    card.style.borderRadius = '16px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '12px';
    card.style.border = '1px solid var(--border-color)';
    
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <h3 style="color: var(--accent-teal); font-size:16px; margin:0; font-weight:700;">${study.title}</h3>
        <span class="badge" style="background: rgba(0, 242, 254, 0.08); color: var(--accent-cyan); font-size:10px;">IRB: ${study.irb_code}</span>
      </div>
      <p style="font-size:12px; color: var(--text-secondary); line-height: 1.4; margin:0;">${study.description || 'No description provided.'}</p>
      <div style="margin-top:auto; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05); font-size:11px; color: var(--text-tertiary); display:flex; justify-content:space-between;">
        <span>Investigator: <strong>${study.investigator}</strong></span>
        <span>ID: <code>${study.id}</code></span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function initResearchRequestsFilter() {
  const buttons = document.querySelectorAll('.filter-tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-secondary)';
      });
      btn.classList.add('active');
      btn.style.background = 'var(--bg-primary)';
      btn.style.color = 'var(--text-primary)';
      requestsPageIndex = 0;
      renderResearchRequests();
    });
  });
}

function renderResearchRequests() {
  const tbody = document.getElementById('research-requests-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  const activeFilter = document.querySelector('.filter-tab-btn.active')?.dataset.filter || 'all';
  
  const isAdmin = currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Super Admin' || currentUser.role === 'Lab Admin');
  let userRequests = requestsCache || [];

  // Populate Requests Status Summary Bar
  const summaryBar = document.getElementById('requests-status-summary-bar');
  if (summaryBar) {
    const totalSent = userRequests.length;
    const pendingCount = userRequests.filter(req => (req.status || '').toLowerCase() === 'pending').length;
    const approvedCount = userRequests.filter(req => {
      const s = (req.status || '').toLowerCase();
      return s === 'approved' || s === 'allocated' || s === 'released';
    }).length;
    const rejectedCount = userRequests.filter(req => (req.status || '').toLowerCase() === 'rejected').length;

    summaryBar.innerHTML = `
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-title">Total Requests</span>
          <span class="metric-icon cyan-bg" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </span>
        </div>
        <div class="metric-body">
          <h3>${totalSent}</h3>
          <p class="metric-desc text-cyan">● Total sent</p>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-title">Pending Approval</span>
          <span class="metric-icon orange-bg" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </span>
        </div>
        <div class="metric-body">
          <h3>${pendingCount}</h3>
          <p class="metric-desc text-orange">● Under review</p>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-title">Approved Requests</span>
          <span class="metric-icon green-bg" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
        </div>
        <div class="metric-body">
          <h3>${approvedCount}</h3>
          <p class="metric-desc text-green">● Ready / Allocated</p>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-title">Rejected Requests</span>
          <span class="metric-icon red-bg" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </span>
        </div>
        <div class="metric-body">
          <h3>${rejectedCount}</h3>
          <p class="metric-desc text-red">● Disapproved requests</p>
        </div>
      </div>
    `;
  }

  let filteredRequests = userRequests;
  if (activeFilter === 'pending') {
    filteredRequests = userRequests.filter(req => (req.status || '').toLowerCase() === 'pending');
  } else if (activeFilter === 'approved') {
    filteredRequests = userRequests.filter(req => {
      const s = (req.status || '').toLowerCase();
      return s === 'approved' || s === 'allocated' || s === 'released';
    });
  }
  
  if (filteredRequests.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 24px 0;">
          No requests registered.
        </td>
      </tr>
    `;
    const paginationInfo = document.getElementById('requests-pagination-info');
    const pageInfo = document.getElementById('requests-page-info');
    const btnPrev = document.getElementById('requests-btn-prev');
    const btnNext = document.getElementById('requests-btn-next');
    if (paginationInfo) paginationInfo.textContent = "Showing 0 to 0 of 0 entries";
    if (pageInfo) pageInfo.textContent = "Page 1 of 1";
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }
  
  // Calculate Pagination bounds
  const totalRecords = filteredRequests.length;
  const totalPages = Math.max(Math.ceil(totalRecords / requestsPageSize), 1);
  
  if (requestsPageIndex >= totalPages) {
    requestsPageIndex = totalPages - 1;
  }
  if (requestsPageIndex < 0) {
    requestsPageIndex = 0;
  }
  
  const startIdx = requestsPageIndex * requestsPageSize;
  const endIdx = Math.min(startIdx + requestsPageSize, totalRecords);
  
  const pagedRecords = filteredRequests.slice(startIdx, endIdx);

  // Update pagination badges and controls
  const paginationInfo = document.getElementById('requests-pagination-info');
  const pageInfo = document.getElementById('requests-page-info');
  const btnPrev = document.getElementById('requests-btn-prev');
  const btnNext = document.getElementById('requests-btn-next');
  
  if (paginationInfo) {
    paginationInfo.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${totalRecords} entries`;
  }
  if (pageInfo) {
    pageInfo.textContent = `Page ${requestsPageIndex + 1} of ${totalPages}`;
  }
  if (btnPrev) {
    btnPrev.disabled = (requestsPageIndex === 0);
    btnPrev.onclick = () => {
      requestsPageIndex--;
      renderResearchRequests();
      const viewport = document.querySelector('.content-viewport');
      if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }
  if (btnNext) {
    btnNext.disabled = (endIdx >= totalRecords);
    btnNext.onclick = () => {
      requestsPageIndex++;
      renderResearchRequests();
      const viewport = document.querySelector('.content-viewport');
      if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }
  
  pagedRecords.forEach(req => {
    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    const samplesList = req.samples || [];
    const sampleBarcodes = samplesList.map(s => s.barcode).join(', ');
    
    const statusVal = req.status || 'Pending';
    const statusLower = statusVal.toLowerCase();
    let statusClass = 'orange-bg';
    if (statusLower === 'approved' || statusLower === 'allocated' || statusLower === 'released') {
      statusClass = 'green-bg';
    } else if (statusLower === 'rejected') {
      statusClass = 'red-bg';
    }
    
    let actionHTML = `<span class="badge ${statusClass}">${statusVal}</span>`;
    if (isAdmin && (req.status || '').toLowerCase() === 'pending') {
      actionHTML = `
        <div style="display: flex; gap: 6px; align-items: center;">
          <button class="secondary-btn btn-action-approve" data-id="${req.requestId}" style="padding: 4px 8px; font-size: 11px; background: rgba(0, 250, 150, 0.1); border-color: var(--accent-teal); color: var(--accent-teal); cursor: pointer; border-radius: 6px;">Approve</button>
          <button class="secondary-btn btn-action-reject" data-id="${req.requestId}" style="padding: 4px 8px; font-size: 11px; background: rgba(255, 50, 50, 0.1); border-color: var(--accent-red); color: var(--accent-red); cursor: pointer; border-radius: 6px;">Reject</button>
        </div>
      `;
    }
    
    row.innerHTML = `
      <td><span class="barcode-txt" style="color: var(--accent-cyan); font-weight: bold;">${req.requestId || ''}</span></td>
      <td><strong>${req.researcherName || ''}</strong></td>
      <td>${req.institution || ''}</td>
      <td><code>${req.irbCode || ''}</code></td>
      <td><span style="font-size:12px; color: var(--text-secondary);">${req.hypothesis || ''}</span></td>
      <td title="${sampleBarcodes}"><strong>${samplesList.length}</strong> vial(s)</td>
      <td>${actionHTML}</td>
    `;
    
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      showRequestDetailsModal(req);
    });

    tbody.appendChild(row);
  });

  // Attach event listeners for admin approve/reject buttons
  tbody.querySelectorAll('.btn-action-approve').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const requestId = btn.getAttribute('data-id');
      btn.disabled = true;
      btn.textContent = 'Approve...';
      try {
        await db.approveResearchRequest(requestId);
        alert(`Request ${requestId} approved successfully.`);
        await refreshDatabaseCache();
        renderResearchRequests();
        renderDashboardStats();
      } catch (err) {
        console.error("Failed to approve request:", err);
        alert("Error: Could not approve request.");
        btn.disabled = false;
        btn.textContent = 'Approve';
      }
    });
  });

  tbody.querySelectorAll('.btn-action-reject').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const requestId = btn.getAttribute('data-id');
      btn.disabled = true;
      btn.textContent = 'Reject...';
      try {
        await db.rejectResearchRequest(requestId);
        alert(`Request ${requestId} rejected successfully.`);
        await refreshDatabaseCache();
        renderResearchRequests();
        renderDashboardStats();
      } catch (err) {
        console.error("Failed to reject request:", err);
        alert("Error: Could not reject request.");
        btn.disabled = false;
        btn.textContent = 'Reject';
      }
    });
  });
}

function initRequestDetailsModal() {
  const modal = document.getElementById('request-details-modal');
  const btnClose = document.getElementById('btn-close-details-modal');
  if (modal && btnClose) {
    btnClose.onclick = () => modal.close();
  }
}

function showRequestDetailsModal(req) {
  const modal = document.getElementById('request-details-modal');
  const body = document.getElementById('request-details-modal-body');
  if (!modal || !body) return;

  const samplesList = req.samples || [];
  
  // Construct HTML listing specimens and their current status in the biobank/LIMS database
  const specimensHTML = samplesList.map(s => {
    // Look up the full specimen info from specimensCache to get its actual current status
    const fullSpecimen = specimensCache.find(spec => spec.barcode === s.barcode) || {};
    const type = fullSpecimen.type || 'Unknown';
    const location = fullSpecimen.location || 'Unstored';
    const qcStatus = fullSpecimen.qcStatus || 'Pending';
    const status = fullSpecimen.status || 'Unknown';
    
    // Status colors
    let badgeClass = 'pending-bg';
    if (status === 'Allocated' || status === 'Received' || status === 'Consent Verified') badgeClass = 'green-bg';
    if (status === 'Retrieved') badgeClass = 'orange-bg';
    if (status === 'Shipped') badgeClass = 'purple-bg';
    
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:12px 16px; border:1px solid rgba(255,255,255,0.05); border-radius:10px; margin-bottom:8px;">
        <div>
          <div style="font-family:monospace; font-weight:bold; color:var(--text-primary); font-size:13px;">${s.barcode}</div>
          <div style="font-size:11px; color:var(--text-secondary); margin-top:3px;">
            Type: <span style="color: var(--accent-purple); font-weight:600;">${type}</span> | Location: <code>${location}</code>
          </div>
        </div>
        <div style="text-align:right;">
          <span class="badge ${badgeClass}" style="font-size:10px; padding:3px 8px;">${status}</span>
          <div style="font-size:10px; color:var(--text-tertiary); margin-top:4px;">QC: ${qcStatus}</div>
        </div>
      </div>
    `;
  }).join('');

  body.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; font-size:12px; background: rgba(255,255,255,0.01); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);">
        <div>
          <span style="color:var(--text-tertiary); display:block; margin-bottom:2px;">Researcher Name</span>
          <strong>${req.researcherName || 'N/A'}</strong>
        </div>
        <div>
          <span style="color:var(--text-tertiary); display:block; margin-bottom:2px;">Institution</span>
          <strong>${req.institution || 'N/A'}</strong>
        </div>
        <div>
          <span style="color:var(--text-tertiary); display:block; margin-bottom:2px;">IRB Approval Code</span>
          <code>${req.irbCode || 'N/A'}</code>
        </div>
        <div>
          <span style="color:var(--text-tertiary); display:block; margin-bottom:2px;">Submission Date</span>
          <strong>${req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A'}</strong>
        </div>
      </div>
      
      <div>
        <span style="color:var(--text-tertiary); font-size:11px; text-transform: uppercase; font-weight:600; display:block; margin-bottom:4px;">Research Hypothesis / Purpose</span>
        <p style="font-size:12px; color:var(--text-secondary); background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.03); line-height:1.4; margin:0;">${req.hypothesis || 'N/A'}</p>
      </div>
      
      <div>
        <span style="color:var(--text-tertiary); font-size:11px; text-transform: uppercase; font-weight:600; display:block; margin-bottom:8px;">Requested Specimen Aliquots (${samplesList.length})</span>
        <div style="max-height: 250px; overflow-y:auto; padding-right:4px;">
          ${specimensHTML || '<div style="color: var(--text-secondary); font-size:12px;">No specimens found in this request.</div>'}
        </div>
      </div>
    </div>
  `;

  modal.showModal();
}

function renderSampleAllocation() {
  const pendingList = document.getElementById('allocation-pending-list');
  const detailsPanel = document.getElementById('allocation-details-panel');
  if (!pendingList || !detailsPanel) return;
  
  pendingList.innerHTML = '';
  
  const pendingRequests = requestsCache; 
  
  if (pendingRequests.length === 0) {
    pendingList.innerHTML = `
      <div style="color: var(--text-secondary); text-align: center; padding: 24px 0; font-size: 12px;">
        No access requests found.
      </div>
    `;
    detailsPanel.innerHTML = `
      <div class="well-placeholder-text">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="placeholder-icon" style="width: 48px; height: 48px; margin-bottom: 12px; color: var(--accent-teal);"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <p>Select a pending research access request from the list to allocate and approve target storage specimens.</p>
      </div>
    `;
    return;
  }
  
  pendingRequests.forEach(req => {
    const card = document.createElement('div');
    card.className = 'donor-card';
    card.style.cursor = 'pointer';
    card.style.padding = '14px';
    card.style.border = '1px solid var(--border-color)';
    card.style.borderRadius = '10px';
    card.style.marginBottom = '10px';
    card.style.transition = 'all 0.2s';
    
    const statusBadge = req.status === 'Approved' 
      ? `<span class="badge green-bg" style="font-size:10px;">Approved</span>` 
      : `<span class="badge orange-bg" style="font-size:10px;">Pending</span>`;
      
    const samplesList = req.samples || [];
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong style="color:var(--accent-cyan); font-family:monospace;">${req.requestId || ''}</strong>
        ${statusBadge}
      </div>
      <div style="font-size:12px; color:var(--text-primary); font-weight:500;">${req.researcherName || ''}</div>
      <div style="font-size:11px; color:var(--text-secondary);">${req.institution || ''}</div>
      <div style="font-size:10px; color:var(--text-tertiary); margin-top:6px;">${samplesList.length} specimen(s) requested</div>
    `;
    
    card.addEventListener('click', () => {
      pendingList.querySelectorAll('.donor-card').forEach(c => c.style.borderColor = 'var(--border-color)');
      card.style.borderColor = 'var(--accent-cyan)';
      showAllocationDetails(req);
    });
    
    pendingList.appendChild(card);
  });
}

function showAllocationDetails(req) {
  const detailsPanel = document.getElementById('allocation-details-panel');
  if (!detailsPanel) return;
  
  const specimensListHTML = (req.samples || []).map(s => {
    const fullSpecimen = specimensCache.find(spec => spec.barcode === s.barcode) || {};
    const type = fullSpecimen.type || 'Unknown';
    const location = fullSpecimen.location || 'Unstored';
    const qcStatus = fullSpecimen.qcStatus || 'Pending';
    const quality = fullSpecimen.quality || 'N/A';
    
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:10px 14px; border:1px solid rgba(255,255,255,0.05); border-radius:8px; margin-bottom:8px;">
        <div>
          <div style="font-family:monospace; font-weight:bold; color:var(--text-primary);">${s.barcode}</div>
          <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">Location: <code>${location}</code></div>
        </div>
        <div style="text-align:right;">
          <span class="specimen-tag" style="font-size:10px; padding:3px 6px;">${type}</span>
          <div style="font-size:10px; color:var(--text-tertiary); margin-top:4px;">QC: ${qcStatus} | Quality: ${quality}</div>
        </div>
      </div>
    `;
  }).join('');
  
  const isApproved = req.status === 'Approved';
  const actionButtonHTML = isApproved
    ? `<div style="text-align:center; padding:12px; background:rgba(0,250,150,0.05); border:1px dashed var(--accent-teal); border-radius:10px; color:var(--accent-teal); font-weight:600; font-size:13px;">✓ Request Approved & Specimens Allocated</div>`
    : `<button class="primary-btn w-full" id="btn-allocate-approve" style="padding:14px; font-weight:600;">Release & Allocate Specimens</button>`;
    
  detailsPanel.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border-color); padding-bottom:12px;">
        <h2 style="margin:0; font-size:18px; color:var(--text-primary); font-family:var(--font-title);">${req.requestId} Details</h2>
        <span class="badge ${isApproved ? 'green-bg' : 'orange-bg'}" style="font-size:11px;">${req.status}</span>
      </div>
      
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; font-size:12px;">
        <div>
          <span style="color:var(--text-tertiary); display:block; margin-bottom:2px;">Researcher</span>
          <strong>${req.researcherName}</strong>
        </div>
        <div>
          <span style="color:var(--text-tertiary); display:block; margin-bottom:2px;">Institution</span>
          <strong>${req.institution}</strong>
        </div>
        <div style="grid-column: span 2;">
          <span style="color:var(--text-tertiary); display:block; margin-bottom:2px;">IRB Approval Code</span>
          <code>${req.irbCode}</code>
        </div>
      </div>
      
      <div>
        <span style="color:var(--text-tertiary); font-size:12px; display:block; margin-bottom:4px;">Scientific Purpose / Hypothesis</span>
        <p style="font-size:12px; color:var(--text-secondary); background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.03); line-height:1.4; margin:0;">${req.hypothesis || 'N/A'}</p>
      </div>
      
      <div>
        <span style="color:var(--text-tertiary); font-size:12px; display:block; margin-bottom:8px;">Target Aliquot Allocation (${(req.samples || []).length})</span>
        <div style="max-height: 200px; overflow-y:auto; padding-right:4px;">
          ${specimensListHTML}
        </div>
      </div>
      
      <div style="margin-top:10px;">
        ${actionButtonHTML}
      </div>
    </div>
  `;
  
  if (!isApproved) {
    const btnApprove = document.getElementById('btn-allocate-approve');
    btnApprove.addEventListener('click', async () => {
      btnApprove.disabled = true;
      btnApprove.textContent = 'Allocating Specimens in LIMS...';
      try {
        await db.approveResearchRequest(req.requestId);
        alert(`Success!\n\nAccess Request ${req.requestId} approved.\nTarget freezer coordinates flagged as 'Allocated' for checkout.`);
        await refreshDatabaseCache();
        renderSampleAllocation();
        renderDashboardStats();
      } catch (err) {
        console.error("Allocation approval failed: ", err);
        alert("Error: Could not approve allocation.");
        btnApprove.disabled = false;
        btnApprove.textContent = 'Release & Allocate Specimens';
      }
    });
  }
}

function initPublications() {
  const openModalBtn = document.getElementById('btn-open-pub-modal');
  const pubModal = document.getElementById('pub-modal');
  const pubForm = document.getElementById('pub-registration-form');
  const studySelect = document.getElementById('pub-study-select');
  
  if (openModalBtn && pubModal) {
    openModalBtn.addEventListener('click', () => {
      if (pubForm) pubForm.reset();
      
      if (studySelect) {
        studySelect.innerHTML = '<option value="">None / Unlinked</option>';
        studiesCache.forEach(st => {
          const opt = document.createElement('option');
          opt.value = st.id;
          opt.textContent = `${st.title} (${st.irb_code})`;
          studySelect.appendChild(opt);
        });
      }
      
      pubModal.showModal();
    });
    
    const closeButtons = pubModal.querySelectorAll('#btn-close-pub-modal-x, #btn-close-pub-modal-footer');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        pubModal.close();
      });
    });
  }
  
  if (pubForm) {
    pubForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const title = document.getElementById('pub-title').value;
      const authors = document.getElementById('pub-authors').value;
      const journal = document.getElementById('pub-journal').value;
      const doi = document.getElementById('pub-doi').value;
      const linked_study_id = document.getElementById('pub-study-select').value;
      
      try {
        await db.addPublication({ title, authors, journal, doi, linked_study_id });
        alert("Publication logged successfully!");
        pubModal.close();
        await refreshDatabaseCache();
        renderPublications();
      } catch (err) {
        console.error("Publication logging failed: ", err);
        alert("Error: Could not save publication.");
      }
    });
  }
}

function renderPublications() {
  const tbody = document.getElementById('publications-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (publicationsCache.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 24px 0;">
          No peer-reviewed publications logged in the registry.
        </td>
      </tr>
    `;
    const paginationInfo = document.getElementById('publications-pagination-info');
    const pageInfo = document.getElementById('publications-page-info');
    const btnPrev = document.getElementById('publications-btn-prev');
    const btnNext = document.getElementById('publications-btn-next');
    if (paginationInfo) paginationInfo.textContent = "Showing 0 to 0 of 0 entries";
    if (pageInfo) pageInfo.textContent = "Page 1 of 1";
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    return;
  }
  
  // Calculate Pagination bounds
  const totalRecords = publicationsCache.length;
  const totalPages = Math.max(Math.ceil(totalRecords / publicationsPageSize), 1);
  
  if (publicationsPageIndex >= totalPages) {
    publicationsPageIndex = totalPages - 1;
  }
  if (publicationsPageIndex < 0) {
    publicationsPageIndex = 0;
  }
  
  const startIdx = publicationsPageIndex * publicationsPageSize;
  const endIdx = Math.min(startIdx + publicationsPageSize, totalRecords);
  
  const pagedRecords = publicationsCache.slice(startIdx, endIdx);

  // Update pagination badges and controls
  const paginationInfo = document.getElementById('publications-pagination-info');
  const pageInfo = document.getElementById('publications-page-info');
  const btnPrev = document.getElementById('publications-btn-prev');
  const btnNext = document.getElementById('publications-btn-next');
  
  if (paginationInfo) {
    paginationInfo.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${totalRecords} entries`;
  }
  if (pageInfo) {
    pageInfo.textContent = `Page ${publicationsPageIndex + 1} of ${totalPages}`;
  }
  if (btnPrev) {
    btnPrev.disabled = (publicationsPageIndex === 0);
    btnPrev.onclick = () => {
      publicationsPageIndex--;
      renderPublications();
      const viewport = document.querySelector('.content-viewport');
      if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }
  if (btnNext) {
    btnNext.disabled = (endIdx >= totalRecords);
    btnNext.onclick = () => {
      publicationsPageIndex++;
      renderPublications();
      const viewport = document.querySelector('.content-viewport');
      if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }
  
  pagedRecords.forEach(pub => {
    const row = document.createElement('tr');
    
    const linkedStudy = studiesCache.find(st => st.id === pub.linked_study_id);
    const studyText = linkedStudy 
      ? `<strong style="color:var(--accent-teal);">${linkedStudy.title}</strong>`
      : '<span style="color:var(--text-tertiary);">Unlinked</span>';
      
    const dateStr = pub.created_at ? new Date(pub.created_at).toISOString().slice(0, 10) : 'N/A';
    const doiText = pub.doi 
      ? `<a href="https://doi.org/${pub.doi}" target="_blank" style="color:var(--accent-cyan); text-decoration:none; font-family:monospace;">${pub.doi}</a>`
      : '<span style="color:var(--text-tertiary);">None</span>';
      
    row.innerHTML = `
      <td><strong>${pub.title}</strong></td>
      <td>${pub.authors}</td>
      <td><em>${pub.journal}</em></td>
      <td>${doiText}</td>
      <td>${studyText}</td>
      <td style="font-family: monospace; font-size: 11px;">${dateStr}</td>
    `;
    tbody.appendChild(row);
  });
}

