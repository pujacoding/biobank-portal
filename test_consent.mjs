import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
const { Client } = pg;

let globalPage = null;

async function resetDatabase() {
  const envPath = path.resolve('lab-portal/backend/.env');
  if (!fs.existsSync(envPath)) {
    console.log("No backend .env file found at " + envPath + ", skipping DB reset.");
    return;
  }
  const envContent = fs.readFileSync(envPath, 'utf8');
  const dbUrlLine = envContent.split('\n').find(line => line.startsWith('DATABASE_URL='));
  if (!dbUrlLine) {
    console.log("No DATABASE_URL found in backend .env, skipping DB reset.");
    return;
  }
  const connectionString = dbUrlLine.split('DATABASE_URL=')[1].trim();
  console.log("Connecting to database to reset E2E test records...");
  try {
    const client = new Client({ connectionString });
    await client.connect();

    // Delete dependent rows
    await client.query("DELETE FROM barcode_history WHERE sample_id = 'AURA-SMP-2026-000013'");
    await client.query("DELETE FROM barcode_audit WHERE sample_id = 'AURA-SMP-2026-000013'");
    await client.query("DELETE FROM barcodes WHERE sample_id = 'AURA-SMP-2026-000013'");

    // Reset the consent record
    await client.query(`
      UPDATE consent 
      SET consent_version = 'v1.0', 
          verification_status = 'Draft', 
          consent_type = 'General Biobank Consent',
          document_url = '/uploads/consent/cns-draft-001_consent.pdf'
      WHERE id = 'CNS-DRAFT-001'
    `);
    
    // Reset the sample record
    await client.query(`
      UPDATE samples 
      SET consent_id = 'CNS-DRAFT-001', 
          consent_status = 'Draft', 
          consent_version = 'v1.0', 
          status = 'Collected',
          barcode_status = 'Unassigned'
      WHERE id = 'AURA-SMP-2026-000013'
    `);

    await client.end();
    console.log("Database reset complete.");
  } catch (err) {
    console.error("Database reset failed:", err);
  }
}

async function runTest() {
  console.log("Starting E2E validation script...");
  await resetDatabase();
  const browser = await chromium.launch({ headless: true });
  
  // Step 1: Login as Collection Staff
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  globalPage = staffPage;
  
  console.log("Navigating to Lab Portal login page...");
  await staffPage.goto('http://localhost:5173/lab/');
  
  // Handle alerts/confirm dialogs
  staffPage.on('dialog', async dialog => {
    console.log(`[Collection Staff Page Dialog]: "${dialog.message()}"`);
    await dialog.accept();
  });

  console.log("Logging in as Collection Staff (puja@gmail.com)...");
  await staffPage.fill('#login-identifier', 'puja@gmail.com');
  await staffPage.click('button:has-text("Send Authorization OTP")');
  await staffPage.waitForSelector('#login-otp');
  await staffPage.fill('#login-otp', '123456');
  await staffPage.click('button:has-text("Verify & Login")');
  
  // Wait for dashboard to load
  await staffPage.waitForSelector('text=Total Ingested');
  console.log("Logged in successfully as Collection Staff.");

  // Select active lab
  const activeLabSelector = staffPage.locator('select#active-lab-selector');
  if (await activeLabSelector.count() > 0) {
    await activeLabSelector.selectOption({ index: 1 });
    console.log("Selected active working lab.");
  }

  // Step 2: Navigate to Consent Management tab
  console.log("Switching to Consent Management tab...");
  await staffPage.click('button:has-text("Consent Management")');
  await staffPage.waitForSelector('text=Consent Governance');
  console.log("Consent Management tab loaded.");

  // Step 3: Select the seeded draft sample "AURA-SMP-2026-000013"
  console.log("Selecting draft sample AURA-SMP-2026-000013 from the dropdown...");
  await staffPage.waitForSelector('select#consent-sample-select option[value="AURA-SMP-2026-000013"]', { state: 'attached' });
  await staffPage.selectOption('select#consent-sample-select', 'AURA-SMP-2026-000013');
  await staffPage.waitForTimeout(1000);

  // Click Edit Consent Details
  console.log("Clicking Edit Consent Details button...");
  await staffPage.click('button:has-text("Edit Consent Details")');
  
  // Modify details and save as draft
  await staffPage.fill('#consent-ver-mgr', 'v1.5-draft-edit');
  console.log("Saving changes as Draft...");
  
  // Wait for the samples fetch request that occurs in onConsentAction after submit
  const saveDraftSamplesPromise = staffPage.waitForResponse(
    response => response.url().includes('/api/samples') && response.status() === 200,
    { timeout: 15000 }
  );
  
  await staffPage.click('button:has-text("Save as Draft")');
  await saveDraftSamplesPromise;
  await staffPage.waitForTimeout(1000); // Stable render time
  console.log("Saved as Draft successfully.");

  // Re-select, edit and submit
  console.log("Re-selecting draft sample to submit...");
  await staffPage.waitForSelector('select#consent-sample-select option[value="AURA-SMP-2026-000013"]:has-text("Consent DRAFT")', { state: 'attached' });
  await staffPage.waitForTimeout(1000); // Wait for React state to settle
  await staffPage.selectOption('select#consent-sample-select', 'AURA-SMP-2026-000013');
  await staffPage.waitForTimeout(1000); // Allow selection change to propagate
  
  // Verify selection and retry if React wiped it out
  let selectedVal = await staffPage.$eval('select#consent-sample-select', el => el.value);
  if (selectedVal !== 'AURA-SMP-2026-000013') {
    console.log("React value binding reset selection. Retrying selection...");
    await staffPage.selectOption('select#consent-sample-select', 'AURA-SMP-2026-000013');
    await staffPage.waitForTimeout(1000);
  }

  await staffPage.waitForSelector('button:has-text("Edit Consent Details")');
  await staffPage.click('button:has-text("Edit Consent Details")');
  await staffPage.fill('#consent-ver-mgr', 'v2.0-submitted');
  console.log("Submitting Consent...");
  
  // Wait for the samples fetch request after submitting consent
  const submitConsentSamplesPromise = staffPage.waitForResponse(
    response => response.url().includes('/api/samples') && response.status() === 200,
    { timeout: 15000 }
  );
  
  await staffPage.click('button:has-text("Submit Consent")');
  await submitConsentSamplesPromise;
  await staffPage.waitForTimeout(1000);
  console.log("Consent submitted successfully.");

  // Step 4: Login as Admin to Approve/Reject
  console.log("\nLogging in as Super Admin (superadmin@aura.com)...");
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  globalPage = adminPage;
  
  adminPage.on('dialog', async dialog => {
    console.log(`[Admin Page Dialog]: "${dialog.message()}"`);
    await dialog.accept();
  });

  await adminPage.goto('http://localhost:5173/lab/');
  await adminPage.fill('#login-identifier', 'superadmin@aura.com');
  await adminPage.click('button:has-text("Send Authorization OTP")');
  await adminPage.waitForSelector('#login-otp');
  await adminPage.fill('#login-otp', '123456');
  await adminPage.click('button:has-text("Verify & Login")');
  await adminPage.waitForSelector('text=Total Ingested');
  console.log("Logged in successfully as Super Admin.");

  // Select active lab for admin
  const adminActiveLabSelector = adminPage.locator('select#active-lab-selector');
  if (await adminActiveLabSelector.count() > 0) {
    await adminActiveLabSelector.selectOption({ index: 1 });
    console.log("Selected active working lab for admin.");
  }

  console.log("Switching to Consent Management tab as Admin...");
  await adminPage.click('button:has-text("Consent Management")');
  await adminPage.waitForSelector('text=Consent Governance');

  // Let's filter by Submitted
  console.log("Filtering queue by Submitted status...");
  await adminPage.locator('button', { hasText: 'Submitted' }).first().click();
  await adminPage.waitForTimeout(1000);

  // Look for our sample subject SUBJ-HK08PI and check for Approve/Reject buttons
  console.log("Checking if Approve/Reject buttons are visible for SUBJ-HK08PI...");
  await adminPage.waitForSelector('tr:has-text("SUBJ-HK08PI")');
  const row = adminPage.locator(`tr:has-text("SUBJ-HK08PI")`);
  const approveBtn = row.locator('button:has-text("Approve")');
  
  if (await approveBtn.count() > 0) {
    console.log("Approve button is visible. Clicking Approve...");
    
    // Wait for samples fetch request after approval
    const approveConsentSamplesPromise = adminPage.waitForResponse(
      response => response.url().includes('/api/samples') && response.status() === 200,
      { timeout: 15000 }
    );
    
    await approveBtn.click();
    await approveConsentSamplesPromise;
    await adminPage.waitForTimeout(1000);
    console.log("Approve workflow completed.");
  } else {
    throw new Error("Could not find the submitted consent for SUBJ-HK08PI in the admin queue.");
  }

  await browser.close();
  console.log("\nE2E validation finished successfully! All checks passed.");
}

runTest().catch(async err => {
  console.error("Test failed with error:", err);
  if (globalPage) {
    try {
      await globalPage.screenshot({ path: 'test_failure.png' });
      console.log("Saved failure screenshot to test_failure.png");
      const html = await globalPage.content();
      fs.writeFileSync('test_failure_html.txt', html);
      console.log("Saved failure HTML to test_failure_html.txt");
    } catch (e) {
      console.error("Failed to dump failure details:", e);
    }
  }
  process.exit(1);
});
