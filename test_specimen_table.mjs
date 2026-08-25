import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function runTest() {
  console.log("Starting Specimen Details Table E2E validation script...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Track page console logs, errors, and network traffic
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('request', request => console.log('>>', request.method(), request.url()));
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      console.log('<<', response.status(), response.url());
    }
  });

  let verifiedOtp = '123456';
  const screenshotDir = '/Users/pujapramanik/.gemini/antigravity-ide/brain/eb0a2fae-c051-4476-846a-2791ded6dd97/scratch';
  if (!fs.existsSync(screenshotDir)){
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  try {
    console.log("Navigating to Lab Portal login page...");
    await page.goto('http://localhost:5173/lab/');
    
    page.on('dialog', async dialog => {
      const msg = dialog.message();
      console.log(`[Dialog Alert]: "${msg}"`);
      const match = msg.match(/\d{6}/);
      if (match) {
        verifiedOtp = match[0];
        console.log(`Extracted simulated OTP: ${verifiedOtp}`);
      }
      await dialog.accept();
    });

    console.log("Logging in as Collection Staff...");
    await page.fill('#login-identifier', 'puja@gmail.com');
    await page.click('button:has-text("Send Authorization OTP")');
    
    await page.waitForSelector('#login-otp');
    await page.waitForTimeout(1000); // Wait for state transition
    
    console.log(`Entering OTP: ${verifiedOtp}`);
    await page.fill('#login-otp', verifiedOtp);
    
    await page.click('button:has-text("Verify & Login")');
    
    try {
      await page.waitForSelector('text=TOTAL SAMPLES', { timeout: 10000 });
      console.log("Logged in successfully.");
    } catch (e) {
      console.log("Login failed or timed out. Capturing diagnostics...");
      await page.screenshot({ path: path.join(screenshotDir, 'login_failed.png') });
      const bodyText = await page.innerText('body');
      console.log("Body text on failure:", bodyText);
      throw e;
    }

    // Select active lab location
    const activeLabSelector = page.locator('select#active-lab-selector');
    if (await activeLabSelector.count() > 0) {
      await activeLabSelector.selectOption({ index: 1 });
      console.log("Selected active working lab.");
      await page.waitForTimeout(500);
    }

    // Switch to Sample Registration tab
    console.log("Navigating to Sample Registration tab...");
    await page.click('button:has-text("Sample Registration")');
    await page.waitForSelector('text=Section A: Subject Information');
    console.log("Sample Registration tab loaded.");
    
    // Wait for templates to load
    console.log("Waiting for consent templates to fetch...");
    await page.waitForTimeout(3000);

    // Fill Subject info
    await page.selectOption('select#subject-gender', 'Female');
    await page.fill('#subject-age', '35');
    
    // Select first consent type template
    console.log("Selecting Consent Type...");
    await page.click('.consent-dropdown-container input');
    await page.waitForSelector('.consent-option-item');
    
    const consentOptions = page.locator('.consent-option-item');
    const optCount = await consentOptions.count();
    console.log(`Found ${optCount} consent options.`);
    if (optCount > 0) {
      await consentOptions.first().click();
      console.log("Clicked first consent option.");
      // Click outside to close consent dropdown
      await page.click('legend:has-text("Section A: Subject Information")');
      await page.waitForTimeout(500);
    } else {
      console.log("No consent options found!");
    }
    await page.waitForTimeout(500);

    // Section B
    console.log("Verifying default specimen type is selected and row created...");
    // Blood is selected by default.
    // Let's select Plasma and Serum as well
    console.log("Selecting Plasma and Serum...");
    await page.click('#specimen-type-select');
    await page.waitForSelector('text=Plasma');
    await page.click('text=Plasma');
    await page.waitForSelector('text=Serum');
    await page.click('text=Serum');
    await page.waitForTimeout(500);

    // Click outside to close dropdown
    await page.click('legend:has-text("Section B: Specimen Information")');
    await page.waitForTimeout(500);

    // Verify rows exist in details table
    const rows = page.locator('.custom-table tbody tr');
    const rowCount = await rows.count();
    console.log(`Table row elements found: ${rowCount}`);

    // Let's fill the volumes and check container count calculations
    const volInputs = page.locator('.custom-table tbody tr input[type="number"][placeholder="e.g. 5.00"]');
    const typeSelects = page.locator('.custom-table tbody tr select:has-text("Tube")');
    const countInputs = page.locator('.custom-table tbody tr input[type="number"][min="1"]');

    console.log("Filling volumes and container details...");
    // Blood row (typically index 0)
    await volInputs.nth(0).fill('5.00');
    await typeSelects.nth(0).selectOption('2 mL Cryovial');
    await page.waitForTimeout(500);
    let countVal1 = await countInputs.nth(0).inputValue();
    console.log(`Blood Container Count auto-calculated (Capacity: 2 mL, Vol: 5 mL): ${countVal1} (Expected: 3)`);

    // Manually edit count
    await countInputs.nth(0).fill('5');
    await page.waitForTimeout(300);
    let countVal1Manual = await countInputs.nth(0).inputValue();
    console.log(`Blood Container Count manually updated to: ${countVal1Manual}`);

    // Change container type back to Tube (Capacity 4 mL) and count should auto-calculate to 2
    await typeSelects.nth(0).selectOption('Tube');
    await page.waitForTimeout(500);
    let countVal1Tube = await countInputs.nth(0).inputValue();
    console.log(`Blood Container Count recalculated on type change: ${countVal1Tube} (Expected: 2)`);

    // Plasma row (index 1)
    await volInputs.nth(1).fill('2.00');
    await typeSelects.nth(1).selectOption('2 mL Cryovial');
    await page.waitForTimeout(500);
    let countVal2 = await countInputs.nth(1).inputValue();
    console.log(`Plasma Container Count auto-calculated (Capacity: 2 mL, Vol: 2 mL): ${countVal2} (Expected: 1)`);

    // Serum row (index 2)
    await volInputs.nth(2).fill('1.00');
    await typeSelects.nth(2).selectOption('2 mL Cryovial');
    await page.waitForTimeout(500);
    let countVal3 = await countInputs.nth(2).inputValue();
    console.log(`Serum Container Count auto-calculated (Capacity: 2 mL, Vol: 1 mL): ${countVal3} (Expected: 1)`);

    // Screenshot of the table state
    await page.screenshot({ path: path.join(screenshotDir, 'specimen_table_test.png') });
    console.log("Screenshot saved.");

    // Submit form
    console.log("Saving Sample...");
    await page.click('button:has-text("Save Sample")');

    // Wait for redirect to Consent tab
    try {
      await page.waitForSelector('text=Consent Governance', { timeout: 15000 });
      console.log("Form submitted successfully! Redirected to Consent tab.");
    } catch (e) {
      console.log("Form submission failed or redirect timed out. Capturing diagnostics...");
      await page.screenshot({ path: path.join(screenshotDir, 'submit_failed.png') });
      const bodyText = await page.innerText('body');
      console.log("Body text on failure:", bodyText);
      throw e;
    }

    // Test collapsible reports menu
    console.log("Expanding Biobank Reports menu in sidebar...");
    await page.click('button:has-text("Biobank Reports")');
    await page.waitForSelector('button:has-text("Operations")');
    console.log("Sub-links became visible.");

    console.log("Navigating to Operations Reports...");
    await page.click('button:has-text("Operations")');
    await page.waitForSelector('text=Operations Modules');
    console.log("Operations Reports loaded successfully.");

    console.log("Navigating to Administration Reports...");
    await page.click('button:has-text("Administration")');
    await page.waitForSelector('text=Administration Modules');
    console.log("Administration Reports loaded successfully.");

    // Screenshot of success state
    await page.screenshot({ path: path.join(screenshotDir, 'specimen_success_test.png') });
    console.log("Success screenshot saved.");

  } catch (err) {
    console.error("Test failed:", err);
    await page.screenshot({ path: path.join(screenshotDir, 'test_failure.png') });
    console.log("Failure screenshot saved.");
  } finally {
    await browser.close();
  }
}

runTest();
