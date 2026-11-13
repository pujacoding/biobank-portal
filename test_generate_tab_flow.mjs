import jwt from './lab-portal/backend/node_modules/jsonwebtoken/index.js';
import dotenv from './lab-portal/backend/node_modules/dotenv/lib/main.js';
import path from 'path';

dotenv.config({ path: path.resolve('lab-portal/backend/.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'aura-secret-key-2026';
const BASE_URL = 'http://localhost:5001';

// Tokens
const superAdminToken = jwt.sign({
  userId: 2,
  email: 'pujapramanik12451@gmail.com',
  name: 'Puja Pramanik',
  role: 'Super Admin',
  roleId: 1,
  labId: null
}, JWT_SECRET, { expiresIn: '2h' });

async function run() {
  console.log("=================================================");
  console.log("🧪 TESTING BARCODE MANAGER: GENERATE TAB & REGISTRY FLOW");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Fetch eligible samples for Super Admin (All Labs)
    console.log("\n--- STEP 1: Verify getEligibleSamples Returns Verified Specimen ---");
    const res1 = await fetch(`${BASE_URL}/api/barcode/eligible-samples`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert(res1.ok, "GET /api/barcode/eligible-samples responded with 200 OK");
    const data1 = await res1.json();
    assert(data1.success === true, "Response payload indicates success = true");
    assert(Array.isArray(data1.samples), "Response contains samples array");

    const sample51 = data1.samples.find(s => s.sample_id === 'AURA-SMP-2026-000051');
    assert(sample51 !== undefined, "Found existing verified specimen AURA-SMP-2026-000051 in eligible list");
    if (sample51) {
      assert(sample51.consent_status === 'Verified', `Specimen consent status is '${sample51.consent_status}'`);
      assert(!sample51.active_barcode, "Specimen currently has no active barcode");
      assert(sample51.specimen_type === 'Plasma', `Specimen type is '${sample51.specimen_type}'`);
      console.log(`     Eligible specimen details: ID: ${sample51.sample_id}, Participant: ${sample51.coded_participant_id}, Consent: ${sample51.consent_status}`);
    }

    // 2. Test Barcode Generation for AURA-SMP-2026-000051
    console.log("\n--- STEP 2: Generate Barcode for AURA-SMP-2026-000051 ---");
    const res2 = await fetch(`${BASE_URL}/api/barcode/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        sample_id: 'AURA-SMP-2026-000051',
        num_aliquots: 0,
        volume_unit: 'mL'
      })
    });

    assert(res2.ok, "POST /api/barcode/generate responded with 201/200");
    const data2 = await res2.json();
    assert(data2.success === true, "Barcode generation returned success = true");
    assert(data2.barcode !== undefined, "Barcode object returned in payload");
    assert(data2.barcode.status === 'GENERATED', `Barcode record saved with status: '${data2.barcode.status}'`);
    assert(data2.barcode.print_count === 0, `Initial print_count is 0`);
    assert(data2.barcode.barcode_value.startsWith('AURA-'), `Barcode value follows standard pattern: ${data2.barcode.barcode_value}`);
    console.log(`     Generated Barcode ID: ${data2.barcode.barcode_id}, Value: ${data2.barcode.barcode_value}, Status: ${data2.barcode.status}`);

    // 3. Verify Appearance in Barcode Manager -> Registry
    console.log("\n--- STEP 3: Verify Appearance in Registry with status GENERATED ---");
    const res3 = await fetch(`${BASE_URL}/api/barcode/registry?page=1&limit=15&status=ALL`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert(res3.ok, "GET /api/barcode/registry responded with 200 OK");
    const data3 = await res3.json();
    assert(data3.success === true, "Registry endpoint returned success = true");
    assert(Array.isArray(data3.barcodes), "Registry returns barcodes array");

    const foundInRegistry = data3.barcodes.find(b => b.sample_id === 'AURA-SMP-2026-000051');
    assert(foundInRegistry !== undefined, "Newly generated barcode is present in Registry");
    if (foundInRegistry) {
      assert(foundInRegistry.barcode_status === 'GENERATED', `Registry item displays status '${foundInRegistry.barcode_status}'`);
      assert(foundInRegistry.barcode_value === data2.barcode.barcode_value, `Registry value matches generated value: ${foundInRegistry.barcode_value}`);
      console.log(`     Registry Record: Sample ${foundInRegistry.sample_id} -> Barcode ${foundInRegistry.barcode_value} (Status: ${foundInRegistry.barcode_status})`);
    }

    // 4. Verify AURA-SMP-2026-000051 is no longer in eligible samples
    console.log("\n--- STEP 4: Verify Sample is Removed from Generate Tab ---");
    const res4 = await fetch(`${BASE_URL}/api/barcode/eligible-samples`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    const data4 = await res4.json();
    const stillEligible = data4.samples.find(s => s.sample_id === 'AURA-SMP-2026-000051');
    assert(!stillEligible, "AURA-SMP-2026-000051 is automatically removed from eligible samples list");

    // 5. Test Integration: Submit Consent -> Verify Consent -> Barcode Manager
    console.log("\n--- STEP 5: Test Full Lifecycle on AURA-SMP-2026-000050 ---");
    // Submit consent
    const res5a = await fetch(`${BASE_URL}/api/consent/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        sample_id: 'AURA-SMP-2026-000050',
        consent_version: 'v1.0',
        consent_date: '2026-10-23',
        document_name: 'test_consent.pdf',
        status: 'Submitted'
      })
    });
    assert(res5a.ok, "POST /api/consent/submit succeeded");
    const data5a = await res5a.json();
    const consentId = data5a.consent.id;
    console.log(`     Consent document submitted with ID: ${consentId}`);

    // Verify consent
    const res5b = await fetch(`${BASE_URL}/api/consent/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        consent_id: consentId,
        verification_status: 'Verified'
      })
    });
    assert(res5b.ok, "POST /api/consent/verify succeeded");
    const data5b = await res5b.json();
    assert(data5b.success === true, "Consent verification succeeded");
    console.log(`     Consent verified without auto-generating a barcode.`);

    // Check that 000050 now appears in eligible samples
    const res5c = await fetch(`${BASE_URL}/api/barcode/eligible-samples`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    const data5c = await res5c.json();
    const sample50 = data5c.samples.find(s => s.sample_id === 'AURA-SMP-2026-000050');
    assert(sample50 !== undefined, "AURA-SMP-2026-000050 now automatically appears in Generate tab");
    if (sample50) {
      assert(sample50.consent_status === 'Verified', "Sample 50 has verified consent");
    }

    // Generate barcode for sample 50
    const res5d = await fetch(`${BASE_URL}/api/barcode/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        sample_id: 'AURA-SMP-2026-000050',
        num_aliquots: 0,
        volume_unit: 'mL'
      })
    });
    assert(res5d.ok, "Generated barcode for sample 50");
    const data5d = await res5d.json();
    assert(data5d.barcode.status === 'GENERATED', "Sample 50 barcode has status GENERATED");
    console.log(`     Sample 50 Barcode generated: ${data5d.barcode.barcode_value}`);

    // Verify sample 50 appears in Registry
    const res5e = await fetch(`${BASE_URL}/api/barcode/registry?page=1&limit=15&status=ALL`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    const data5e = await res5e.json();
    const found50InRegistry = data5e.barcodes.find(b => b.sample_id === 'AURA-SMP-2026-000050');
    assert(found50InRegistry !== undefined, "Sample 50 appears in Registry");
    assert(found50InRegistry.barcode_status === 'GENERATED', "Sample 50 displays status GENERATED in Registry");

    console.log("\n=================================================");
    console.log(`🏁 SUMMARY: ${passed} PASSED | ${failed} FAILED`);
    console.log("=================================================");

    if (failed === 0) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution error:", err);
    process.exit(1);
  }
}

run();
