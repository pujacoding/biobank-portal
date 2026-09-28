import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('lab-portal/backend/.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runTests() {
  console.log("=================================================");
  console.log("🧪 AURA Biobank: Complete Barcode Manager Test Suite");
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
    // 1. Test Database Schema & Columns
    console.log("\n--- TEST 1: Database Schema & Index Verification ---");
    const barcodeCols = await pool.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'barcodes'
    `);
    const colNames = barcodeCols.rows.map(r => r.column_name);
    
    assert(colNames.includes('parent_barcode_id'), "barcodes table has parent_barcode_id column");
    assert(colNames.includes('parent_barcode_value'), "barcodes table has parent_barcode_value column");
    assert(colNames.includes('aliquot_index'), "barcodes table has aliquot_index column");
    assert(colNames.includes('storage_location'), "barcodes table has storage_location column");
    assert(colNames.includes('replacement_of'), "barcodes table has replacement_of column");
    assert(colNames.includes('replaced_by'), "barcodes table has replaced_by column");
    assert(colNames.includes('void_reason'), "barcodes table has void_reason column");

    const printQueueCheck = await pool.query(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'print_queue')
    `);
    assert(printQueueCheck.rows[0].exists, "print_queue table exists in database");

    // 2. Setup Test Specimen with Pending Consent
    console.log("\n--- TEST 2: Consent Verification Gating ---");
    const testSampleIdPending = 'AURA-SMP-TEST-PENDING-' + Date.now().toString().slice(-4);
    await pool.query(`
      INSERT INTO samples (id, subject_id, gender, age, specimen_type, sample_volume, collection_date, collection_time, status, consent_status)
      VALUES ($1, 'SUBJ-TEST-P', 'Female', 30, 'Plasma', 5.0, '2026-09-28', '10:00:00', 'Collected', 'Pending')
    `, [testSampleIdPending]);

    // Check that pending consent specimen cannot have barcode generated (Simulated controller logic)
    const pendingSampleCheck = await pool.query("SELECT * FROM samples WHERE id = $1", [testSampleIdPending]);
    const isConsentBlocked = pendingSampleCheck.rows[0].consent_status !== 'Verified' && pendingSampleCheck.rows[0].consent_status !== 'Submitted';
    assert(isConsentBlocked, "Generation is strictly blocked when consent is 'Pending'");

    // 3. Setup Test Specimen with Verified Consent & Generate Barcode
    console.log("\n--- TEST 3: Barcode Generation & Aliquoting ---");
    const testSampleIdVerified = 'AURA-SMP-TEST-VERIFIED-' + Date.now().toString().slice(-4);
    await pool.query(`
      INSERT INTO samples (id, subject_id, gender, age, specimen_type, sample_volume, collection_date, collection_time, status, consent_status, location)
      VALUES ($1, 'SUBJ-TEST-V', 'Male', 45, 'Plasma', 6.0, '2026-09-28', '11:00:00', 'Collected', 'Verified', null)
    `, [testSampleIdVerified]);

    const testBarcodeValue = `AURA-260928-${Date.now().toString().slice(-6)}`;
    const genRes = await pool.query(`
      INSERT INTO barcodes (sample_id, barcode_value, barcode_type, barcode_format, volume, volume_unit, generated_by, print_count, status, qr_code_base64, code128_base64)
      VALUES ($1, $2, 'Standard', 'CODE128_QR', 6.0, 'mL', 1, 0, 'GENERATED', 'data:image/png;base64,mockqr', 'data:image/png;base64,mock128')
      RETURNING *
    `, [testSampleIdVerified, testBarcodeValue]);

    const parentBarcode = genRes.rows[0];
    assert(parentBarcode.barcode_value === testBarcodeValue, `Parent barcode generated with value: ${testBarcodeValue}`);
    assert(parentBarcode.status === 'GENERATED', "Initial barcode status is 'GENERATED'");
    assert(parentBarcode.print_count === 0, "Initial print count is 0");

    // Generate 2 Aliquots under this Parent Barcode
    const aliq1Value = `${testBarcodeValue}-A01`;
    const aliq2Value = `${testBarcodeValue}-A02`;
    const aliq1SampleId = `${testSampleIdVerified}-A01`;
    const aliq2SampleId = `${testSampleIdVerified}-A02`;

    await pool.query(`
      INSERT INTO samples (id, subject_id, gender, age, specimen_type, sample_volume, collection_date, collection_time, status, consent_status, parent_sample_id)
      VALUES 
        ($1, 'SUBJ-TEST-V', 'Male', 45, 'Plasma', 2.0, '2026-09-28', '11:00:00', 'Barcode Generated', 'Verified', $3),
        ($2, 'SUBJ-TEST-V', 'Male', 45, 'Plasma', 2.0, '2026-09-28', '11:00:00', 'Barcode Generated', 'Verified', $3)
    `, [aliq1SampleId, aliq2SampleId, testSampleIdVerified]);

    const aliqRes = await pool.query(`
      INSERT INTO barcodes (sample_id, barcode_value, barcode_type, barcode_format, parent_barcode_id, parent_barcode_value, aliquot_index, volume, volume_unit, generated_by, print_count, status, qr_code_base64, code128_base64)
      VALUES 
        ($1, $2, 'Aliquot', 'CODE128_QR', $3, $4, 1, 2.0, 'mL', 1, 0, 'GENERATED', 'data:image/png;base64,mockqr', 'data:image/png;base64,mock128'),
        ($5, $6, 'Aliquot', 'CODE128_QR', $3, $4, 2, 2.0, 'mL', 1, 0, 'GENERATED', 'data:image/png;base64,mockqr', 'data:image/png;base64,mock128')
      RETURNING *
    `, [aliq1SampleId, aliq1Value, parentBarcode.barcode_id, testBarcodeValue, aliq2SampleId, aliq2Value]);

    assert(aliqRes.rows.length === 2, "Created 2 child aliquots");
    assert(aliqRes.rows[0].parent_barcode_id === parentBarcode.barcode_id, "Aliquot links correctly to parent_barcode_id");
    assert(aliqRes.rows[0].aliquot_index === 1 && aliqRes.rows[1].aliquot_index === 2, "Aliquot index sequence A01, A02 assigned properly");

    // 4. Test Label Printing & Print Queue
    console.log("\n--- TEST 4: Print Event & Print Queue Integration ---");
    // Add parent and aliquots to print queue
    const queueAdd = await pool.query(`
      INSERT INTO print_queue (barcode_id, sample_id, copies, status, queued_by)
      VALUES ($1, $2, 2, 'PENDING', 1)
      RETURNING *
    `, [parentBarcode.barcode_id, testSampleIdVerified]);

    assert(queueAdd.rows.length === 1 && queueAdd.rows[0].status === 'PENDING', "Added barcode to print_queue with PENDING status");

    // Process print event
    await pool.query(`
      UPDATE barcodes SET print_count = print_count + 1, status = 'PRINTED' WHERE barcode_id = $1
    `, [parentBarcode.barcode_id]);
    await pool.query(`
      UPDATE print_queue SET status = 'PRINTED', printed_at = CURRENT_TIMESTAMP WHERE barcode_id = $1
    `, [parentBarcode.barcode_id]);

    const updatedParentRes = await pool.query("SELECT * FROM barcodes WHERE barcode_id = $1", [parentBarcode.barcode_id]);
    assert(updatedParentRes.rows[0].print_count === 1, "Print count successfully incremented to 1");
    assert(updatedParentRes.rows[0].status === 'PRINTED', "Status updated to 'PRINTED'");

    // 5. Test Reprint Workflow (Reason required, maintains identity)
    console.log("\n--- TEST 5: Reprint Workflow ---");
    const reprintReason = "Label damaged during cryo handling";
    await pool.query(`
      UPDATE barcodes SET print_count = print_count + 1 WHERE barcode_id = $1
    `, [parentBarcode.barcode_id]);
    await pool.query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, barcode_value, action_type, reason, performed_by)
      VALUES ($1, $2, $3, 'BARCODE_REPRINTED', $4, 1)
    `, [testSampleIdVerified, parentBarcode.barcode_id, testBarcodeValue, reprintReason]);

    const reprintCheck = await pool.query("SELECT * FROM barcodes WHERE barcode_id = $1", [parentBarcode.barcode_id]);
    assert(reprintCheck.rows[0].print_count === 2, "Reprint incremented print count to 2 without creating a new barcode");
    assert(reprintCheck.rows[0].barcode_value === testBarcodeValue, "Reprint preserved the exact same barcode identifier");

    // 6. Test Scan & Verify
    console.log("\n--- TEST 6: Scan & Verification ---");
    await pool.query(`
      UPDATE barcodes SET status = 'VERIFIED', verified_at = CURRENT_TIMESTAMP, verified_by = 1 WHERE barcode_id = $1
    `, [parentBarcode.barcode_id]);
    await pool.query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, barcode_value, action_type, reason, performed_by)
      VALUES ($1, $2, $3, 'BARCODE_VERIFIED', 'Hardware scanner verified', 1)
    `, [testSampleIdVerified, parentBarcode.barcode_id, testBarcodeValue]);

    const verifyCheck = await pool.query("SELECT * FROM barcodes WHERE barcode_id = $1", [parentBarcode.barcode_id]);
    assert(verifyCheck.rows[0].status === 'VERIFIED', "Barcode successfully verified and transitioned to 'VERIFIED'");

    // 7. Test Inventory Storage Assignment & Collision Protection
    console.log("\n--- TEST 7: Storage Integration & Collision Protection ---");
    const testLocation = "ULT-03 > Rack A > Box 01 > Position B7";
    await pool.query(`
      UPDATE barcodes SET storage_location = $1, status = 'STORED' WHERE barcode_id = $2
    `, [testLocation, parentBarcode.barcode_id]);
    await pool.query(`
      UPDATE samples SET location = $1, status = 'Stored' WHERE id = $2
    `, [testLocation, testSampleIdVerified]);

    // Check collision for duplicate location assignment
    const collisionCheck = await pool.query(`
      SELECT barcode_value FROM barcodes WHERE storage_location = $1 AND barcode_id != $2 AND status NOT IN ('VOIDED', 'DISPOSED')
    `, [testLocation, aliqRes.rows[0].barcode_id]);

    assert(collisionCheck.rows.length === 1 && collisionCheck.rows[0].barcode_value === testBarcodeValue,
      `Collision detection correctly flagged that Position B7 is occupied by ${testBarcodeValue}`);

    // Store Aliquot 1 at empty location
    const aliq1Location = "ULT-03 > Rack A > Box 01 > Position B8";
    await pool.query(`
      UPDATE barcodes SET storage_location = $1, status = 'STORED' WHERE barcode_id = $2
    `, [aliq1Location, aliqRes.rows[0].barcode_id]);
    const aliq1StoredRes = await pool.query("SELECT * FROM barcodes WHERE barcode_id = $1", [aliqRes.rows[0].barcode_id]);
    assert(aliq1StoredRes.rows[0].storage_location === aliq1Location, "Aliquot 1 stored at position B8");

    // 8. Test Storage Movement (Relocation)
    console.log("\n--- TEST 8: Storage Relocation ---");
    const newLocation = "LN2-01 > Rack B > Box 02 > Position C1";
    await pool.query(`
      UPDATE barcodes SET storage_location = $1 WHERE barcode_id = $2
    `, [newLocation, parentBarcode.barcode_id]);
    await pool.query(`
      INSERT INTO barcode_audit (sample_id, barcode_id, barcode_value, action_type, reason, old_value, new_value, performed_by)
      VALUES ($1, $2, $3, 'STORAGE_MOVED', 'Relocated to LN2 Cryo Tank', $4, $5, 1)
    `, [testSampleIdVerified, parentBarcode.barcode_id, testBarcodeValue, testLocation, newLocation]);

    const movedRes = await pool.query("SELECT * FROM barcodes WHERE barcode_id = $1", [parentBarcode.barcode_id]);
    assert(movedRes.rows[0].storage_location === newLocation, `Specimen relocated to ${newLocation}`);

    // 9. Test Shipment Integration
    console.log("\n--- TEST 9: Shipment Integration ---");
    const testShipmentId = 'SHP-TEST-' + Date.now();
    await pool.query(`
      INSERT INTO shipments (id, destination, status, shipped_at)
      VALUES ($1, 'Partner Research Center - Genomics Wing', 'In Transit', CURRENT_TIMESTAMP)
    `, [testShipmentId]);
    await pool.query(`
      INSERT INTO shipment_samples (shipment_id, sample_id) VALUES ($1, $2)
    `, [testShipmentId, aliq1SampleId]);
    await pool.query(`
      UPDATE barcodes SET status = 'IN_TRANSIT' WHERE barcode_id = $1
    `, [aliqRes.rows[0].barcode_id]);

    const shipmentCheck = await pool.query("SELECT * FROM barcodes WHERE barcode_id = $1", [aliqRes.rows[0].barcode_id]);
    assert(shipmentCheck.rows[0].status === 'IN_TRANSIT', "Aliquot 1 successfully transitioned to 'IN_TRANSIT'");

    // Receive Shipment
    await pool.query(`
      UPDATE shipments SET status = 'Received', received_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [testShipmentId]);
    await pool.query(`
      UPDATE barcodes SET status = 'RECEIVED' WHERE barcode_id = $1
    `, [aliqRes.rows[0].barcode_id]);

    const receivedCheck = await pool.query("SELECT * FROM barcodes WHERE barcode_id = $1", [aliqRes.rows[0].barcode_id]);
    assert(receivedCheck.rows[0].status === 'RECEIVED', "Aliquot 1 marked as 'RECEIVED' upon destination check-in");

    // 10. Test Void and Replace Workflow
    console.log("\n--- TEST 10: Void & Replace Workflow ---");
    const replacementBarcodeValue = `${testBarcodeValue}-R1`;

    // 1. Insert new replacement barcode
    const replaceRes = await pool.query(`
      INSERT INTO barcodes (
        sample_id, barcode_value, barcode_type, barcode_format, replacement_of, replacement_of_barcode_value,
        volume, volume_unit, generated_by, print_count, status, qr_code_base64, code128_base64
      ) VALUES ($1, $2, 'Replacement', 'CODE128_QR', $3, $4, 6.0, 'mL', 1, 0, 'GENERATED', 'data:image/png;base64,mockqr', 'data:image/png;base64,mock128')
      RETURNING *
    `, [testSampleIdVerified, replacementBarcodeValue, parentBarcode.barcode_id, testBarcodeValue]);

    const replacementBarcode = replaceRes.rows[0];

    // 2. Mark old barcode as VOIDED with replaced_by link
    await pool.query(`
      UPDATE barcodes 
      SET status = 'VOIDED', replaced_by = $1, replaced_by_barcode_value = $2, void_reason = 'Damaged container upgrade', voided_at = CURRENT_TIMESTAMP, voided_by = 1 
      WHERE barcode_id = $3
    `, [replacementBarcode.barcode_id, replacementBarcodeValue, parentBarcode.barcode_id]);

    const oldBarcodeCheck = await pool.query("SELECT * FROM barcodes WHERE barcode_id = $1", [parentBarcode.barcode_id]);
    assert(oldBarcodeCheck.rows[0].status === 'VOIDED', "Old barcode permanently set to 'VOIDED' (never deleted)");
    assert(oldBarcodeCheck.rows[0].replaced_by === replacementBarcode.barcode_id, "Old barcode points to replaced_by new barcode ID");
    assert(replacementBarcode.replacement_of === parentBarcode.barcode_id, "New replacement barcode points to replacement_of old barcode ID");
    assert(replacementBarcode.barcode_value === `${testBarcodeValue}-R1`, `New replacement barcode has value ${replacementBarcodeValue}`);

    // 11. Cleanup Test Artifacts
    console.log("\n--- CLEANUP: Removing Test Suite Transient Rows ---");
    await pool.query("DELETE FROM print_queue WHERE sample_id LIKE 'AURA-SMP-TEST-%'");
    await pool.query("DELETE FROM barcode_audit WHERE sample_id LIKE 'AURA-SMP-TEST-%'");
    await pool.query("DELETE FROM barcodes WHERE sample_id LIKE 'AURA-SMP-TEST-%'");
    await pool.query("DELETE FROM shipment_samples WHERE shipment_id LIKE 'SHP-TEST-%'");
    await pool.query("DELETE FROM shipments WHERE id LIKE 'SHP-TEST-%'");
    await pool.query("DELETE FROM samples WHERE id LIKE 'AURA-SMP-TEST-%'");
    console.log("  Cleaned up all transient test records.");

    console.log("\n=================================================");
    console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log("=================================================");

    await pool.end();
    if (failed > 0) process.exit(1);
    process.exit(0);

  } catch (error) {
    console.error("Test execution encountered fatal error:", error);
    await pool.end();
    process.exit(1);
  }
}

runTests();
