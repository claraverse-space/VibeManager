const { chromium } = require('playwright');

async function captureModals() {
  const browser = await chromium.launch({ headless: false }); // Use headed mode to debug
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 }
  });
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3131', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 1. Create session modal
    console.log('Opening create session modal...');
    await page.evaluate(() => {
      // Trigger modal open directly
      const modal = document.getElementById('modal-create-session');
      if (modal) {
        modal.style.display = 'flex';

        // Fill in example data
        const nameInput = document.querySelector('input[name="name"]');
        const pathInput = document.querySelector('input[name="projectPath"]');
        const shellSelect = document.querySelector('select[name="shell"]');

        if (nameInput) nameInput.value = 'my-awesome-project';
        if (pathInput) pathInput.value = '/home/user/projects/my-awesome-project';
        if (shellSelect) shellSelect.value = 'claude';
      }
    });

    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'docs/create-session.png', fullPage: false });
    console.log('✓ Create session modal screenshot saved');

    await browser.close();

  } catch (error) {
    console.error('Error:', error);
    await browser.close();
  }
}

captureModals();
