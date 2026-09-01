// ==========================================
// AURA BIOBANK PORTAL: HYBRID DATABASE CONNECTOR
// ==========================================
import { firebaseConfig } from './firebase-config.js';
import { supabase } from './supabase.js';

const initialSpecimens = [];
const initialDonors = [];
const initialBlockchain = [];
const initialUsers = [
  { id: 'usr-1', username: 'Dr. Sarah Chen', role: 'Admin', status: 'Active' },
  { id: 'usr-2', username: 'John Doe', role: 'Technician', status: 'Active' },
  { id: 'usr-3', username: 'Bob Johnson', role: 'Researcher', status: 'Active' }
];

const initialSettings = {
  requireDoubleSignOff: false,
  autoTimeout: "30",
  complianceAudits: true
};

const initialAuditLogs = [
  { id: 'log-1', timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), username: 'Dr. Sarah Chen', role: 'Admin', action: 'System Config Change', details: 'Updated auto timeout security threshold to 30 minutes.' },
  { id: 'log-2', timestamp: new Date(Date.now() - 3600000 * 4).toISOString(), username: 'John Doe', role: 'Technician', action: 'Specimen Deposit', details: 'Deposited specimen tube DNA-4412-M inside ULT-03 rack Well B3.' },
  { id: 'log-3', timestamp: new Date(Date.now() - 3600000 * 3).toISOString(), username: 'Bob Johnson', role: 'Researcher', action: 'Donor Enrollment', details: 'Enrolled new clinical donor SUBJ-1102-Y under COVID-19 profile.' }
];


class LocalStorageDB {
  constructor() {
    console.log("AURA DB: Initializing LocalStorage persistence engine...");
    this.initDatabase();
  }

  initDatabase() {
    // Helper to check if a LocalStorage collection is empty or invalid
    const isCollectionEmpty = (key) => {
      try {
        const item = localStorage.getItem(key);
        if (!item) return true;
        const parsed = JSON.parse(item);
        if (Array.isArray(parsed) && parsed.length === 0) return true;
        if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length === 0) return true;
        return false;
      } catch (e) {
        return true;
      }
    };

    // Seed empty arrays if LocalStorage collections are empty to avoid seeding dummy data
    if (isCollectionEmpty('aura_specimens')) {
      console.log("AURA DB: Local inventory empty. Initializing empty specimens registry...");
      localStorage.setItem('aura_specimens', JSON.stringify([]));
    }
    if (isCollectionEmpty('aura_donors')) {
      console.log("AURA DB: Local donors empty. Initializing empty donor registry...");
      localStorage.setItem('aura_donors', JSON.stringify([]));
    }
    if (localStorage.getItem('aura_requests') === null) {
      localStorage.setItem('aura_requests', JSON.stringify([]));
    }
    if (isCollectionEmpty('aura_blockchain')) {
      console.log("AURA DB: Local blockchain empty. Initializing empty blockchain ledger...");
      localStorage.setItem('aura_blockchain', JSON.stringify([]));
    }
    if (isCollectionEmpty('aura_users')) {
      console.log("AURA DB: Local LIMS Users empty. Seeding directory...");
      localStorage.setItem('aura_users', JSON.stringify(initialUsers));
    }
    if (isCollectionEmpty('aura_settings')) {
      console.log("AURA DB: Local LIMS settings empty. Seeding settings...");
      localStorage.setItem('aura_settings', JSON.stringify(initialSettings));
    }
    if (isCollectionEmpty('aura_audit_logs')) {
      console.log("AURA DB: Local LIMS audit logs empty. Initializing empty logs...");
      localStorage.setItem('aura_audit_logs', JSON.stringify([]));
    }
  }

  async getSpecimens() {
    return JSON.parse(localStorage.getItem('aura_specimens') || '[]');
  }

  async getDonors() {
    return JSON.parse(localStorage.getItem('aura_donors') || '[]');
  }

  async addSpecimen(specimen) {
    const specimens = await this.getSpecimens();
    specimens.push(specimen);
    localStorage.setItem('aura_specimens', JSON.stringify(specimens));
    console.log(`AURA DB: Deposited new specimen [${specimen.barcode}] at [${specimen.location}] in Local Mode.`);
    return specimen;
  }

  async moveSpecimen(barcode, newLocation) {
    const specimens = await this.getSpecimens();
    const idx = specimens.findIndex(s => s.barcode === barcode);
    if (idx !== -1) {
      specimens[idx].location = newLocation;
      localStorage.setItem('aura_specimens', JSON.stringify(specimens));
      console.log(`AURA DB: Relocated specimen [${barcode}] to [${newLocation}] in Local Mode.`);
      return true;
    }
    return false;
  }

  async updateSpecimenQC(barcode, qcStatus, quality, analyst, notes) {
    const specimens = await this.getSpecimens();
    const idx = specimens.findIndex(s => s.barcode === barcode);
    if (idx !== -1) {
      specimens[idx].qcStatus = qcStatus;
      specimens[idx].quality = quality;
      if (!specimens[idx].qcHistory) specimens[idx].qcHistory = [];
      specimens[idx].qcHistory.push({
        date: new Date().toISOString().slice(0, 10),
        status: qcStatus,
        quality: quality,
        analyst: analyst,
        notes: notes
      });
      localStorage.setItem('aura_specimens', JSON.stringify(specimens));
      console.log(`AURA DB: Logged QC [${qcStatus}] for specimen [${barcode}] in Local Mode.`);
      return specimens[idx];
    }
    throw new Error(`Specimen [${barcode}] not found`);
  }

  async addDonor(donor) {
    const donors = await this.getDonors();
    donors.push(donor);
    localStorage.setItem('aura_donors', JSON.stringify(donors));
    console.log(`AURA DB: Enrolled new donor [${donor.donorId}] in Local Mode.`);

    // Add block to blockchain for enrollment
    const changeText = `Donor Enrolled: Diagnosis=${donor.diagnosis}, Consent: Academic=${donor.academic}, Genomic=${donor.genomic}, Commercial=${donor.commercial}`;
    await this.addBlockchainBlock(donor.donorId, changeText);

    return donor;
  }

  async updateDonorConsent(donorId, consent) {
    // 1. Update donor profile
    const donors = await this.getDonors();
    const idx = donors.findIndex(d => d.donorId === donorId);
    if (idx !== -1) {
      donors[idx] = { ...donors[idx], ...consent };
      localStorage.setItem('aura_donors', JSON.stringify(donors));
    }

    // 2. Cascading update: update consent permissions on all specimens belonging to this donor
    const specimens = await this.getSpecimens();
    specimens.forEach(spec => {
      if (spec.donorId === donorId) {
        spec.consent = { ...consent };
      }
    });
    localStorage.setItem('aura_specimens', JSON.stringify(specimens));

    // 3. Log to verifiable consent blockchain
    const changeText = `Consent Updated: Academic=${consent.academic}, Genomic=${consent.genomic}, Commercial=${consent.commercial}`;
    await this.addBlockchainBlock(donorId, changeText);

    console.log(`AURA DB: Updated donor [${donorId}] and cascaded permissions successfully in Local Mode.`);
    return true;
  }

  async updateDonor(donorId, updatedData) {
    const donors = await this.getDonors();
    const idx = donors.findIndex(d => d.donorId === donorId);
    if (idx !== -1) {
      donors[idx] = { ...donors[idx], ...updatedData };
      localStorage.setItem('aura_donors', JSON.stringify(donors));
      console.log(`AURA DB: Updated donor profile [${donorId}] successfully in Local Mode.`);
      return true;
    }
    return false;
  }

  async addResearchRequest(request) {
    const requests = JSON.parse(localStorage.getItem('aura_requests') || '[]');
    const newRequest = {
      requestId: `REQ-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...request
    };
    requests.push(newRequest);
    localStorage.setItem('aura_requests', JSON.stringify(requests));

    console.log(`AURA DB: Saved access request [${newRequest.requestId}] successfully in Local Mode.`);
    return newRequest;
  }

  async approveResearchRequest(requestId) {
    const requests = JSON.parse(localStorage.getItem('aura_requests') || '[]');
    const idx = requests.findIndex(r => r.requestId === requestId);
    if (idx !== -1) {
      requests[idx].status = 'Approved';
      localStorage.setItem('aura_requests', JSON.stringify(requests));
    }
    return true;
  }

  async rejectResearchRequest(requestId) {
    const requests = JSON.parse(localStorage.getItem('aura_requests') || '[]');
    const idx = requests.findIndex(r => r.requestId === requestId);
    if (idx !== -1) {
      requests[idx].status = 'Rejected';
      localStorage.setItem('aura_requests', JSON.stringify(requests));
    }
    return true;
  }

  async getResearchRequests() {
    const list = JSON.parse(localStorage.getItem('aura_requests') || '[]');
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async getBlockchainLedger() {
    const list = JSON.parse(localStorage.getItem('aura_blockchain') || '[]');
    return list.sort((a, b) => b.index - a.index); // Newest block first
  }

  async addBlockchainBlock(donorId, changeText) {
    const ledger = await this.getBlockchainLedger();
    const prevBlock = ledger[0]; // Newly sorted desc, index 0 is newest
    const prevHash = prevBlock ? prevBlock.txHash : "0000000000000000000000000000000000000000000000000000000000000000";
    const nextIndex = prevBlock ? prevBlock.index + 1 : 0;

    const txHash = "0x" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const newBlock = {
      index: nextIndex,
      timestamp: new Date().toISOString(),
      txHash: txHash,
      previousHash: prevHash,
      donorId: donorId,
      change: changeText
    };

    const allBlocks = JSON.parse(localStorage.getItem('aura_blockchain') || '[]');
    allBlocks.push(newBlock);
    localStorage.setItem('aura_blockchain', JSON.stringify(allBlocks));
    return newBlock;
  }

  // Expansion Options: Users & Settings Methods
  async getUsers() {
    return JSON.parse(localStorage.getItem('aura_users') || '[]');
  }

  async addUser(user) {
    const users = await this.getUsers();
    const newUser = {
      id: `usr-${Date.now()}`,
      status: 'Active',
      ...user
    };
    users.push(newUser);
    localStorage.setItem('aura_users', JSON.stringify(users));
    console.log(`AURA DB: Added LIMS User [${newUser.username}] in Local Mode.`);
    return newUser;
  }

  async updateUserRole(id, role) {
    const users = await this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx !== -1) {
      users[idx].role = role;
      localStorage.setItem('aura_users', JSON.stringify(users));
      console.log(`AURA DB: Updated User role [${id}] to [${role}] in Local Mode.`);
      return true;
    }
    return false;
  }

  async updateUserTheme(id, theme) {
    const users = await this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx !== -1) {
      users[idx].theme = theme;
      localStorage.setItem('aura_users', JSON.stringify(users));
      console.log(`AURA DB: Updated User theme [${id}] to [${theme}] in Local Mode.`);
      return true;
    }
    return false;
  }

  async getSystemSettings() {
    return JSON.parse(localStorage.getItem('aura_settings') || JSON.stringify(initialSettings));
  }

  async updateSystemSettings(settings) {
    localStorage.setItem('aura_settings', JSON.stringify(settings));
    console.log(`AURA DB: Updated LIMS Security Settings in Local Mode.`);
    return true;
  }

  async getAuditLogs() {
    const logs = JSON.parse(localStorage.getItem('aura_audit_logs') || '[]');
    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async addAuditLog(entry) {
    const logs = await this.getAuditLogs();
    const newLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...entry
    };
    logs.push(newLog);
    localStorage.setItem('aura_audit_logs', JSON.stringify(logs));
    console.log(`AURA DB: Logged audit event [${entry.action}] in Local Mode.`);
    return newLog;
  }
}

class FirestoreDB {
  constructor() {
    console.log("AURA DB: Initializing Google Cloud Firestore engine...");
    this.db = null;
    this.app = null;
  }

  async connect() {
    // Dynamically import Firebase libraries from the Google CDN
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
    const {
      getFirestore,
      collection,
      getDocs,
      doc,
      updateDoc,
      addDoc,
      setDoc,
      query,
      where
    } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');

    this.app = initializeApp(firebaseConfig);
    this.db = getFirestore(this.app);

    // Save standard firestore operations to the class instance for easy access
    this.fs = { collection, getDocs, doc, updateDoc, addDoc, setDoc, query, where };

    console.log("AURA DB: Cloud Firestore connected successfully.");

    // Perform auto-seeding if Cloud DB is blank
    await this.autoSeedCloud();
  }

  async autoSeedCloud() {
    // DO NOT seed specimens, donors, blockchain, or audit logs if they are empty
    // to ensure synchronization with the Lab Portal's clean state.
    const usersSnap = await this.fs.getDocs(this.fs.collection(this.db, 'users'));
    if (usersSnap.empty) {
      console.log("AURA DB: Cloud users registry is empty. Seeding default user accounts...");
      for (const user of initialUsers) {
        await this.fs.setDoc(this.fs.doc(this.db, 'users', user.id), user);
      }
    }

    const settingsSnap = await this.fs.getDocs(this.fs.collection(this.db, 'settings'));
    if (settingsSnap.empty) {
      console.log("AURA DB: Cloud settings profile is empty. Seeding configurations...");
      await this.fs.setDoc(this.fs.doc(this.db, 'settings', 'config'), initialSettings);
    }
  }

  async getSpecimens() {
    const snap = await this.fs.getDocs(this.fs.collection(this.db, 'specimens'));
    const results = [];
    snap.forEach(doc => {
      results.push(doc.data());
    });
    return results;
  }

  async getDonors() {
    const snap = await this.fs.getDocs(this.fs.collection(this.db, 'donors'));
    const results = [];
    snap.forEach(doc => {
      results.push(doc.data());
    });
    return results;
  }

  async addSpecimen(specimen) {
    await this.fs.setDoc(this.fs.doc(this.db, 'specimens', specimen.barcode), specimen);
    console.log(`AURA DB: Deposited new specimen [${specimen.barcode}] at [${specimen.location}] in Cloud Mode.`);
    return specimen;
  }

  async moveSpecimen(barcode, newLocation) {
    const specRef = this.fs.doc(this.db, 'specimens', barcode);
    await this.fs.updateDoc(specRef, { location: newLocation });
    console.log(`AURA DB: Relocated specimen [${barcode}] to [${newLocation}] in Cloud Mode.`);
    return true;
  }

  async updateSpecimenQC(barcode, qcStatus, quality, analyst, notes) {
    const specRef = this.fs.doc(this.db, 'specimens', barcode);
    const snap = await this.fs.getDocs(this.fs.collection(this.db, 'specimens'));
    const docData = snap.docs.find(d => d.id === barcode)?.data();
    if (docData) {
      const history = docData.qcHistory || [];
      history.push({
        date: new Date().toISOString().slice(0, 10),
        status: qcStatus,
        quality: quality,
        analyst: analyst,
        notes: notes
      });
      await this.fs.updateDoc(specRef, {
        qcStatus: qcStatus,
        quality: quality,
        qcHistory: history
      });
      console.log(`AURA DB: Logged QC [${qcStatus}] for specimen [${barcode}] in Cloud Mode.`);
      return { ...docData, qcStatus, quality, qcHistory: history };
    }
    throw new Error(`Specimen [${barcode}] not found`);
  }

  async addDonor(donor) {
    await this.fs.setDoc(this.fs.doc(this.db, 'donors', donor.donorId), donor);
    console.log(`AURA DB: Enrolled new donor [${donor.donorId}] in Cloud Mode.`);

    // Add block to blockchain for enrollment
    const changeText = `Donor Enrolled: Diagnosis=${donor.diagnosis}, Consent: Academic=${donor.academic}, Genomic=${donor.genomic}, Commercial=${donor.commercial}`;
    await this.addBlockchainBlock(donor.donorId, changeText);

    return donor;
  }

  async updateDonorConsent(donorId, consent) {
    // 1. Update donor doc
    const donorRef = this.fs.doc(this.db, 'donors', donorId);
    await this.fs.updateDoc(donorRef, consent);

    // 2. Cascade permissions to matching specimens
    const specimensRef = this.fs.collection(this.db, 'specimens');
    const q = this.fs.query(specimensRef, this.fs.where('donorId', '==', donorId));
    const querySnapshot = await this.fs.getDocs(q);

    for (const d of querySnapshot.docs) {
      await this.fs.updateDoc(this.fs.doc(this.db, 'specimens', d.id), {
        consent: { ...consent }
      });
    }

    // 3. Log to blockchain
    const changeText = `Consent Updated: Academic=${consent.academic}, Genomic=${consent.genomic}, Commercial=${consent.commercial}`;
    await this.addBlockchainBlock(donorId, changeText);

    console.log(`AURA DB: Updated donor [${donorId}] and cascaded permissions in Cloud Mode.`);
    return true;
  }

  async updateDonor(donorId, updatedData) {
    const donorRef = this.fs.doc(this.db, 'donors', donorId);
    await this.fs.updateDoc(donorRef, updatedData);
    console.log(`AURA DB: Updated donor profile [${donorId}] in Cloud Mode.`);
    return true;
  }

  async addResearchRequest(request) {
    const colRef = this.fs.collection(this.db, 'requests');
    const docData = {
      createdAt: new Date().toISOString(),
      ...request
    };
    const docRef = await this.fs.addDoc(colRef, docData);

    console.log(`AURA DB: Saved access request [${docRef.id}] in Cloud Mode.`);
    return { requestId: docRef.id, ...docData };
  }

  async approveResearchRequest(requestId) {
    const docRef = this.fs.doc(this.db, 'requests', requestId);
    await this.fs.updateDoc(docRef, { status: 'Approved' });
    return true;
  }

  async rejectResearchRequest(requestId) {
    const docRef = this.fs.doc(this.db, 'requests', requestId);
    await this.fs.updateDoc(docRef, { status: 'Rejected' });
    return true;
  }

  async getResearchRequests() {
    const snap = await this.fs.getDocs(this.fs.collection(this.db, 'requests'));
    const results = [];
    snap.forEach(doc => {
      results.push({ requestId: doc.id, ...doc.data() });
    });
    return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async getBlockchainLedger() {
    const snap = await this.fs.getDocs(this.fs.collection(this.db, 'blockchain'));
    const results = [];
    snap.forEach(doc => {
      results.push(doc.data());
    });
    return results.sort((a, b) => b.index - a.index);
  }

  async addBlockchainBlock(donorId, changeText) {
    const ledger = await this.getBlockchainLedger();
    const prevBlock = ledger[0]; // Newly sorted desc, index 0 is newest
    const prevHash = prevBlock ? prevBlock.txHash : "0000000000000000000000000000000000000000000000000000000000000000";
    const nextIndex = prevBlock ? prevBlock.index + 1 : 0;

    const txHash = "0x" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const newBlock = {
      index: nextIndex,
      timestamp: new Date().toISOString(),
      txHash: txHash,
      previousHash: prevHash,
      donorId: donorId,
      change: changeText
    };

    await this.fs.setDoc(this.fs.doc(this.db, 'blockchain', `block_${nextIndex}`), newBlock);
    console.log(`AURA DB: Added blockchain block [${nextIndex}] in Cloud Mode.`);
    return newBlock;
  }

  // Users & Settings Cloud Methods
  async getUsers() {
    const snap = await this.fs.getDocs(this.fs.collection(this.db, 'users'));
    const results = [];
    snap.forEach(doc => {
      results.push(doc.data());
    });
    return results;
  }

  async addUser(user) {
    const docId = `usr-${Date.now()}`;
    const docData = {
      id: docId,
      status: 'Active',
      ...user
    };
    await this.fs.setDoc(this.fs.doc(this.db, 'users', docId), docData);
    console.log(`AURA DB: Added LIMS User [${user.username}] in Cloud Mode.`);
    return docData;
  }

  async updateUserRole(id, role) {
    const userRef = this.fs.doc(this.db, 'users', id);
    await this.fs.updateDoc(userRef, { role: role });
    console.log(`AURA DB: Updated User role [${id}] to [${role}] in Cloud Mode.`);
    return true;
  }

  async updateUserTheme(id, theme) {
    const userRef = this.fs.doc(this.db, 'users', id);
    await this.fs.updateDoc(userRef, { theme: theme });
    console.log(`AURA DB: Updated User theme [${id}] to [${theme}] in Cloud Mode.`);
    return true;
  }

  async getSystemSettings() {
    const snap = await this.fs.getDocs(this.fs.collection(this.db, 'settings'));
    let settings = initialSettings;
    snap.forEach(doc => {
      if (doc.id === 'config') settings = doc.data();
    });
    return settings;
  }

  async updateSystemSettings(settings) {
    await this.fs.setDoc(this.fs.doc(this.db, 'settings', 'config'), settings);
    console.log(`AURA DB: Updated LIMS Security Settings in Cloud Mode.`);
    return true;
  }

  async getAuditLogs() {
    const snap = await this.fs.getDocs(this.fs.collection(this.db, 'audit_logs'));
    const results = [];
    snap.forEach(doc => {
      results.push(doc.data());
    });
    return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async addAuditLog(entry) {
    const docId = `log-${Date.now()}`;
    const docData = {
      id: docId,
      timestamp: new Date().toISOString(),
      ...entry
    };
    await this.fs.setDoc(this.fs.doc(this.db, 'audit_logs', docId), docData);
    console.log(`AURA DB: Logged audit event [${entry.action}] in Cloud Mode.`);
    return docData;
  }
}

class APIDB {
  constructor() {
    console.log("AURA DB: Initializing API Integration driver...");
    this.baseUrl = window.AURA_INTEGRATION_URL || "http://localhost:5001/api/integration";
    this.apiKey = "aura-integration-secret-key-2026";
  }

  async fetchApi(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      ...options.headers
    };
    const signal = options.signal || (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined);
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }
    return data;
  }

  async getSpecimens() {
    try {
      const data = await this.fetchApi('/catalog');
      return data.specimens || [];
    } catch (err) {
      console.warn("AURA DB: Failed to fetch specimens from API, falling back to empty list:", err.message);
      return [];
    }
  }

  async getDonors() {
    try {
      const data = await this.fetchApi('/donors');
      return data.donors || [];
    } catch (err) {
      console.warn("AURA DB: Failed to fetch donors from API, falling back to empty list:", err.message);
      return [];
    }
  }

  async addSpecimen(specimen) {
    const response = await this.fetchApi('/samples/store', {
      method: 'POST',
      body: JSON.stringify({
        barcode: specimen.barcode,
        location: specimen.location,
        quality: specimen.quality,
        diagnosis: specimen.diagnosis
      })
    });
    return response;
  }

  async moveSpecimen(barcode, newLocation) {
    const response = await this.fetchApi('/samples/relocate', {
      method: 'POST',
      body: JSON.stringify({ barcode, newLocation })
    });
    return response;
  }

  async updateSpecimenQC(barcode, qcStatus, quality) {
    const response = await this.fetchApi('/samples/qc', {
      method: 'POST',
      body: JSON.stringify({ barcode, quality, status: qcStatus })
    });
    return response;
  }

  async addDonor(donor) {
    return donor;
  }

  async updateDonorConsent(donorId, consent) {
    return true;
  }

  async updateDonor(donorId, updatedData) {
    if (updatedData && updatedData.consentStatus === 'Withdrawn') {
      try {
        const response = await this.fetchApi('/donors/withdraw', {
          method: 'POST',
          body: JSON.stringify({ donorId })
        });
        return response.success;
      } catch (err) {
        console.error("Failed to sync donor withdrawal to LIMS backend:", err);
        throw err;
      }
    }
    return true;
  }

  async addResearchRequest(request) {
    const payload = {
      researcher_name: request.researcherName,
      institution: request.institution,
      irb_code: request.irbCode,
      hypothesis: request.researchPurpose,
      specimens: request.samples.map(s => s.barcode).join(',')
    };
    const data = await this.fetchApi('/requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return {
      requestId: data.requestId
    };
  }

  async getResearchRequests() {
    try {
      const data = await this.fetchApi('/requests');
      const requests = data.requests || [];
      return requests.map(req => {
        const specimensArray = (req.specimens || '')
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .map(barcode => ({ barcode }));

        return {
          requestId: req.id,
          researcherName: req.researcher_name,
          institution: req.institution,
          irbCode: req.irb_code,
          hypothesis: req.hypothesis,
          samples: specimensArray,
          status: req.status,
          createdAt: req.created_at
        };
      });
    } catch (err) {
      console.warn("AURA DB: Failed to fetch research requests from API:", err.message);
      return [];
    }
  }

  async getStudies() {
    try {
      const data = await this.fetchApi('/studies');
      return data.studies || [];
    } catch (err) {
      console.warn("AURA DB: Failed to fetch studies from API:", err.message);
      return [];
    }
  }

  async addStudy(study) {
    const data = await this.fetchApi('/studies', {
      method: 'POST',
      body: JSON.stringify(study)
    });
    return data;
  }

  async getPublications() {
    try {
      const data = await this.fetchApi('/publications');
      return data.publications || [];
    } catch (err) {
      console.warn("AURA DB: Failed to fetch publications from API:", err.message);
      return [];
    }
  }

  async addPublication(pub) {
    const data = await this.fetchApi('/publications', {
      method: 'POST',
      body: JSON.stringify(pub)
    });
    return data;
  }

  async approveResearchRequest(requestId) {
    const data = await this.fetchApi(`/requests/approve/${requestId}`, {
      method: 'POST'
    });
    return data;
  }

  async rejectResearchRequest(requestId) {
    const data = await this.fetchApi(`/requests/reject/${requestId}`, {
      method: 'POST'
    });
    return data;
  }

  async getStats() {
    try {
      const data = await this.fetchApi('/stats');
      return data.stats || {
        totalSpecimens: 0,
        totalDonors: 0,
        totalRequests: 0,
        totalStudies: 0,
        totalPublications: 0
      };
    } catch (err) {
      return {
        totalSpecimens: 0,
        totalDonors: 0,
        totalRequests: 0,
        totalStudies: 0,
        totalPublications: 0
      };
    }
  }

  async getBlockchainLedger() {
    return [];
  }

  async addBlockchainBlock(donorId, changeText) {
    return true;
  }

  async getUsers() {
    try {
      const data = await this.fetchApi('/users');
      return data.users || [];
    } catch (err) {
      console.warn("Failed to fetch users from integration API, falling back to initialUsers:", err);
      return initialUsers;
    }
  }

  async addUser(user) {
    return user;
  }

  async updateUserRole(id, role) {
    return true;
  }

  async updateUserTheme(id, theme) {
    return true;
  }

  async getSystemSettings() {
    return {
      requireDoubleSignOff: false,
      autoTimeout: "30",
      complianceAudits: true
    };
  }

  async updateSystemSettings(settings) {
    return true;
  }

  async getAuditLogs() {
    return [];
  }

  async addAuditLog(entry) {
    return true;
  }
}

// Instantiate and Export appropriate driver
let dbDriver;
let cloudActive = false;

const isCloudConfigured = firebaseConfig &&
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "" &&
  !firebaseConfig.apiKey.includes("...") &&
  !firebaseConfig.apiKey.includes("YOUR_API_KEY");

if (isCloudConfigured) {
  try {
    const fdb = new FirestoreDB();
    await fdb.connect();
    dbDriver = fdb;
    cloudActive = true;
  } catch (err) {
    console.error("AURA DB: Failed to connect to Cloud Firestore. Falling back to APIDB.", err);
    dbDriver = new APIDB();
    cloudActive = false;
  }
} else {
  dbDriver = new APIDB();
  cloudActive = false;
}

export const db = dbDriver;
export const cloudMode = cloudActive;
export const dbMode = cloudActive ? 'Cloud' : (dbDriver.constructor.name === 'APIDB' ? 'API' : 'LocalStorage');
