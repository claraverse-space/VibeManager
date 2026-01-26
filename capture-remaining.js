const { chromium } = require('playwright');

async function captureRemaining() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 }
  });
  const page = await context.newPage();

  try {
    // 1. Sessions overview with ports
    console.log('Capturing sessions overview...');
    await page.goto('http://localhost:3131', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'docs/sessions-overview.png', fullPage: true });
    console.log('✓ Sessions overview screenshot saved');

    // 2. Create session modal
    console.log('Capturing create session modal...');
    const newSessionBtn = await page.locator('#btn-new-session');
    if (await newSessionBtn.count() > 0 && await newSessionBtn.isVisible()) {
      await newSessionBtn.click();
      await page.waitForTimeout(1000);

      // Fill in some example data
      await page.fill('input[name="name"]', 'my-awesome-project');
      await page.fill('input[name="projectPath"]', '/home/user/projects/my-awesome-project');
      await page.selectOption('select[name="shell"]', 'claude');
      await page.waitForTimeout(500);

      await page.screenshot({ path: 'docs/create-session.png', fullPage: false });
      console.log('✓ Create session screenshot saved');

      // Close modal
      const cancelBtn = await page.locator('button:has-text("Cancel")');
      if (await cancelBtn.count() > 0) {
        await cancelBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // 3. Tasks modal with progress bars
    console.log('Capturing tasks with progress...');
    const sessionCards = await page.locator('.session-card').all();
    if (sessionCards.length > 0) {
      // Find liquid-notes or any session with tasks
      let foundSession = false;
      for (const card of sessionCards) {
        const text = await card.textContent();
        if (text && (text.includes('liquid-notes') || text.includes('verification-test'))) {
          await card.click();
          await page.waitForTimeout(1000);
          foundSession = true;
          break;
        }
      }

      if (!foundSession && sessionCards.length > 0) {
        await sessionCards[0].click();
        await page.waitForTimeout(1000);
      }

      const tasksBtn = await page.locator('button:has-text("Tasks")');
      if (await tasksBtn.count() > 0) {
        await tasksBtn.click();
        await page.waitForTimeout(1500);

        const modal = await page.locator('.modal-content');
        if (await modal.count() > 0) {
          await modal.screenshot({ path: 'docs/tasks-progress.png' });
          console.log('✓ Tasks with progress screenshot saved');
        }
      }
    }

    console.log('\n✅ All remaining screenshots captured!');

  } catch (error) {
    console.error('Error capturing screenshots:', error);
  } finally {
    await browser.close();
  }
}

captureRemaining();
