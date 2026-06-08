// ==========================================
// AURA BIOBANK PORTAL: HYBRID DATABASE CONNECTOR
// ==========================================
import { firebaseConfig } from './firebase-config.js';

// Setup Initial Seed Datasets for empty database initialization
const initialSpecimens = [
  { barcode: 'BLD-8821-X', type: 'Blood', diagnosis: 'Healthy Control', gender: 'Female', age: 34, location: 'Shelf B > Drawer 3 > Box A12 > Well C4', quality: 'RIN: 9.8 / Viability: 97%', consent: { academic: true, genomic: true, commercial: false }, donorId: 'SUBJ-9942-F' },
  { barcode: 'SER-9941-K', type: 'Serum', diagnosis: 'Type 2 Diabetes', gender: 'Male', age: 56, location: 'Shelf B > Drawer 3 > Box A12 > Well A1', quality: 'Integrity: Excellent', consent: { academic: true, genomic: true, commercial: true }, donorId: 'SUBJ-8842-X' },
  { barcode: 'DNA-4412-M', type: 'DNA', diagnosis: 'Breast Cancer', gender: 'Female', age: 48, location: 'Shelf B > Drawer 3 > Box A12 > Well B3', quality: 'DIN: 8.9', consent: { academic: true, genomic: true, commercial: false }, donorId: 'SUBJ-9942-F' },
  { barcode: 'TIS-1092-P', type: 'Tissue', diagnosis: 'Breast Cancer', gender: 'Female', age: 48, location: 'Shelf B > Drawer 3 > Box A12 > Well D6', quality: 'Sufficient Slices', consent: { academic: true, genomic: true, commercial: false }, donorId: 'SUBJ-9942-F' },
  { barcode: 'BLD-3304-Y', type: 'Blood', diagnosis: 'COVID-19 Post-Acute', gender: 'Male', age: 29, location: 'Shelf B > Drawer 3 > Box A12 > Well E2', quality: 'RIN: 9.2', consent: { academic: true, genomic: false, commercial: false }, donorId: 'SUBJ-1102-Y' },
  { barcode: 'DNA-1290-R', type: 'DNA', diagnosis: 'Type 2 Diabetes', gender: 'Male', age: 56, location: 'Shelf B > Drawer 3 > Box A12 > Well A5', quality: 'DIN: 9.1', consent: { academic: true, genomic: true, commercial: true }, donorId: 'SUBJ-8842-X' },
  { barcode: 'SER-8822-Q', type: 'Serum', diagnosis: 'Healthy Control', gender: 'Male', age: 29, location: 'Shelf B > Drawer 3 > Box A12 > Well E5', quality: 'Integrity: Good', consent: { academic: true, genomic: true, commercial: false }, donorId: 'SUBJ-1102-Y' },
  { barcode: 'TIS-4491-A', type: 'Tissue', diagnosis: 'Healthy Control', gender: 'Female', age: 34, location: 'Shelf B > Drawer 3 > Box A12 > Well C2', quality: 'RIN: 9.5', consent: { academic: true, genomic: true, commercial: false }, donorId: 'SUBJ-9942-F' },
  { barcode: 'BLD-4451-B', type: 'Blood', diagnosis: 'Breast Cancer', gender: 'Female', age: 48, location: 'Shelf B > Drawer 3 > Box A12 > Well D1', quality: 'RIN: 9.6', consent: { academic: true, genomic: true, commercial: false }, donorId: 'SUBJ-9942-F' },
  { barcode: 'DNA-8899-W', type: 'DNA', diagnosis: 'COVID-19 Post-Acute', gender: 'Male', age: 29, location: 'Shelf B > Drawer 3 > Box A12 > Well E6', quality: 'DIN: 8.5', consent: { academic: true, genomic: true, commercial: false }, donorId: 'SUBJ-1102-Y' },
  { barcode: 'BLD-9031-D', type: 'Blood', diagnosis: 'Type 2 Diabetes', gender: 'Male', age: 29, location: 'Shelf B > Drawer 3 > Box A12 > Well F1', quality: 'RIN: 9.5 / Viability: 98%', consent: { academic: true, genomic: true, commercial: false }, donorId: 'SUBJ-9031-H' }
];

const initialDonors = [
  {
    donorId: 'SUBJ-8842-X',
    name: 'SUBJ-8842-X',
    uhid: 'UHID-492028-X',
    fullName: 'Alexander Mercer',
    dob: '1970-05-12',
    age: 56,
    gender: 'Male',
    email: 'a.mercer@clinicalmail.org',
    phone: '+1 (555) 234-5678',
    address: '452 Pine Hill Dr, Boston, MA 02111',
    familyHistory: 'Paternal Uncle diagnosed with Type 2 Diabetes at age 48. Mother had history of chronic mild hypertension.',
    diseaseHistory: 'Type 2 Diabetes Mellitus diagnosed in 2018. Chronic mild hypertension.',
    clinicalNotes: 'HbA1c stable at 6.8%. Adherent to diet and therapeutic regimen.',
    visits: [
      { date: '2026-02-15', purpose: 'Biobank Registration & Sample Collection', clinician: 'Dr. Sarah Chen', notes: 'Obtained informed consent. Extracted whole blood and serum aliquots.' },
      { date: '2026-04-20', purpose: 'Follow-up Metabolic Review', clinician: 'Dr. Sarah Chen', notes: 'Patient reported stable glycemic control, no issues.' }
    ],
    consentStatus: 'Active',
    consentExpiry: '2031-02-15',
    eSignature: 'Alexander Mercer',
    academic: true,
    genomic: true,
    commercial: true,
    researchSpecific: { cancer: false, diabetes: true, infectious: false, cardiovascular: true, neurological: false },
    dataSharing: true,
    genomicPermission: true,
    diagnosis: 'Type 2 Diabetes'
  },
  {
    donorId: 'SUBJ-9942-F',
    name: 'SUBJ-9942-F',
    uhid: 'UHID-902184-F',
    fullName: 'Eleanor Vance',
    dob: '1978-11-23',
    age: 48,
    gender: 'Female',
    email: 'evance@geneticslab.com',
    phone: '+1 (555) 987-6543',
    address: '12 Maple Terrace, Cambridge, MA 02139',
    familyHistory: 'Mother diagnosed with Breast Cancer (HER2+) at age 52. Maternal Grandmother also had breast cancer.',
    diseaseHistory: 'Infiltrating Duct Adenocarcinoma of Breast (diagnosed 2024). Status post lumpectomy and adjuvant hormone therapy.',
    clinicalNotes: 'Currently under monitoring. No active metastatic lesions detected in recent imaging.',
    visits: [
      { date: '2026-01-10', purpose: 'Tissue Donation Consent & Collection', clinician: 'Dr. Sarah Chen', notes: 'Donated surgical FFPE tumor block and normal blood control.' }
    ],
    consentStatus: 'Active',
    consentExpiry: '2031-01-10',
    eSignature: 'Eleanor Vance',
    academic: true,
    genomic: true,
    commercial: false,
    researchSpecific: { cancer: true, diabetes: false, infectious: false, cardiovascular: false, neurological: false },
    dataSharing: true,
    genomicPermission: true,
    diagnosis: 'Breast Cancer'
  },
  {
    donorId: 'SUBJ-1102-Y',
    name: 'SUBJ-1102-Y',
    uhid: 'UHID-110928-Y',
    fullName: 'Marcus Brody',
    dob: '1997-03-08',
    age: 29,
    gender: 'Male',
    email: 'mbrody@collegemail.edu',
    phone: '+1 (555) 345-6789',
    address: '88 Boylston St, Boston, MA 02116',
    familyHistory: 'No significant hereditary history reported.',
    diseaseHistory: 'Post-Acute COVID-19 Syndrome (Long COVID) diagnosed in 2025. Persistent fatigue and mild cognitive fog.',
    clinicalNotes: 'Participating in Long COVID recovery cohort. Laboratory findings show slightly elevated inflammatory markers.',
    visits: [
      { date: '2026-03-01', purpose: 'Long COVID Study Intake', clinician: 'John Doe', notes: 'Signed informed consent. Extracted blood for mononuclear cell isolation.' }
    ],
    consentStatus: 'Active',
    consentExpiry: '2027-03-01',
    eSignature: 'Marcus Brody',
    academic: true,
    genomic: false,
    commercial: false,
    researchSpecific: { cancer: false, diabetes: false, infectious: true, cardiovascular: false, neurological: true },
    dataSharing: false,
    genomicPermission: false,
    diagnosis: 'COVID-19 Post-Acute'
  },
  {
    donorId: 'SUBJ-9031-H',
    name: 'SUBJ-9031-H',
    uhid: 'UHID-110238-Z',
    fullName: 'Marcus Aurelius',
    dob: '1997-03-08',
    age: 29,
    gender: 'Male',
    email: 'm.aurelius@clinicalmail.org',
    phone: '+1 (555) 765-4321',
    address: '10 Via Appia, Boston, MA 02116',
    familyHistory: 'Father diagnosed with Type 2 Diabetes at age 48.',
    diseaseHistory: 'Type 2 Diabetes Mellitus diagnosed in 2021. Glycemic levels stable under Metformin therapy.',
    clinicalNotes: 'HbA1c stable at 6.2%. Patient exhibits excellent glycemic regulation.',
    visits: [
      { date: '2026-03-01', purpose: 'Biobank Registration & Initial Intake', clinician: 'Dr. Sarah Chen', notes: 'Obtained informed consent. Extracted blood for metabolic repository.' }
    ],
    consentStatus: 'Active',
    consentExpiry: '2032-10-10',
    eSignature: 'Marcus Aurelius',
    academic: true,
    genomic: true,
    commercial: false,
    researchSpecific: { cancer: false, diabetes: true, infectious: false, cardiovascular: false, neurological: false },
    dataSharing: true,
    genomicPermission: true,
    diagnosis: 'Type 2 Diabetes'
  }
];

const initialBlockchain = [
  {
    index: 0,
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    txHash: "0x8a92f02bd490ba12e5f3c990ee10b24d",
    previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
    donorId: "SUBJ-9942-F",
    change: "Initial Enrollment Consent: ACA=true, GEN=true, COM=false"
  },
  {
    index: 1,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    txHash: "0x3f5cb68d120aefba1c67d890fa2d03ef",
    previousHash: "0x8a92f02bd490ba12e5f3c990ee10b24d",
    donorId: "SUBJ-1102-Y",
    change: "Initial Enrollment Consent: ACA=true, GEN=false, COM=false"
  }
];

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
    
    const txHash = "0x" + Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('');
    
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
    
    const txHash = "0x" + Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('');
    
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
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }
    return data;
  }

  async getSpecimens() {
    const data = await this.fetchApi('/catalog');
    return data.specimens || [];
  }

  async getDonors() {
    const data = await this.fetchApi('/donors');
    return data.donors || [];
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
  }

  async getStudies() {
    const data = await this.fetchApi('/studies');
    return data.studies || [];
  }

  async addStudy(study) {
    const data = await this.fetchApi('/studies', {
      method: 'POST',
      body: JSON.stringify(study)
    });
    return data;
  }

  async getPublications() {
    const data = await this.fetchApi('/publications');
    return data.publications || [];
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

  async getStats() {
    const data = await this.fetchApi('/stats');
    return data.stats || {
      totalSpecimens: 0,
      totalDonors: 0,
      totalRequests: 0,
      totalStudies: 0,
      totalPublications: 0
    };
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
