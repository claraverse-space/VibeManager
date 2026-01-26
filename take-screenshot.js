const { chromium } = require('playwright');

async function takeScreenshot() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  try {
    // Navigate to VibeManager
    console.log('Navigating to VibeManager...');
    await page.goto('http://localhost:3131', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Find liquid-notes session card
    console.log('Looking for liquid-notes session...');
    const sessionCards = await page.locator('.session-card').all();
    let found = false;

    for (const card of sessionCards) {
      const text = await card.textContent();
      if (text && text.includes('liquid-notes')) {
        await card.click();
        found = true;
        break;
      }
    }

    if (!found && sessionCards.length > 0) {
      // Just click first session
      await sessionCards[0].click();
    }

    await page.waitForTimeout(1500);

    // Click Tasks button
    const tasksBtn = await page.locator('button:has-text("Tasks")');
    if (await tasksBtn.count() > 0) {
      console.log('Opening tasks modal...');
      await tasksBtn.click();
      await page.waitForTimeout(1500);

      // Manually set Ralph status to stuck via JavaScript injection
      // Note: This is safe as we're injecting hardcoded content for screenshot purposes only
      console.log('Injecting stuck state...');
      await page.evaluate(() => {
        // Update badge
        const badge = document.getElementById('ralph-status-badge');
        if (badge) {
          badge.className = 'ralph-status-badge stuck';
          badge.textContent = 'STUCK';
        }

        // Update controls to show Verify & Resume button
        const controls = document.getElementById('ralph-controls');
        if (controls) {
          // Clear existing buttons
          controls.textContent = '';

          // Create Verify & Resume button
          const verifyBtn = document.createElement('button');
          verifyBtn.className = 'btn-start';
          verifyBtn.textContent = 'Verify & Resume';
          verifyBtn.style.cssText = 'background: var(--accent); padding: 8px 16px; border-radius: 6px; border: none; color: white; font-weight: 500; cursor: pointer; font-size: 13px;';

          // Create Force Resume button
          const forceBtn = document.createElement('button');
          forceBtn.className = 'btn-start';
          forceBtn.textContent = 'Force Resume';
          forceBtn.style.cssText = 'background: var(--surface2); padding: 8px 16px; border-radius: 6px; border: none; color: var(--text); font-weight: 500; cursor: pointer; font-size: 13px; margin-left: 8px;';

          // Create Stop button
          const stopBtn = document.createElement('button');
          stopBtn.className = 'btn-stop';
          stopBtn.textContent = 'Stop';
          stopBtn.style.cssText = 'background: transparent; padding: 8px 16px; border-radius: 6px; border: 1px solid var(--danger); color: var(--danger); font-weight: 500; cursor: pointer; font-size: 13px; margin-left: 8px;';

          controls.appendChild(verifyBtn);
          controls.appendChild(forceBtn);
          controls.appendChild(stopBtn);
        }

        // Update task status to show stuck
        const taskItems = document.querySelectorAll('.task-item');
        if (taskItems.length > 0) {
          const lastTask = taskItems[taskItems.length - 1];
          lastTask.style.borderLeft = '3px solid var(--danger)';

          // Add progress indicator showing stuck
          const progressBar = lastTask.querySelector('.task-progress-bar');
          if (progressBar) {
            const fill = progressBar.querySelector('.task-progress-fill');
            if (fill) {
              fill.style.width = '45%';
              fill.style.background = 'var(--danger)';
            }
          } else {
            // Create progress bar
            const progressDiv = document.createElement('div');
            progressDiv.className = 'task-progress-bar';
            progressDiv.style.cssText = 'width: 100%; height: 4px; background: var(--surface3); margin-top: 8px; overflow: hidden; border-radius: 2px;';

            const fillDiv = document.createElement('div');
            fillDiv.className = 'task-progress-fill';
            fillDiv.style.cssText = 'height: 100%; background: var(--danger); width: 45%; transition: width 0.5s ease;';

            progressDiv.appendChild(fillDiv);
            lastTask.appendChild(progressDiv);

            const warningText = document.createElement('div');
            warningText.style.cssText = 'font-size: 11px; color: var(--danger); margin-top: 4px;';
            warningText.textContent = '⚠ Task stuck at 45% - No progress after 3 attempts';
            lastTask.appendChild(warningText);
          }
        }
      });

      await page.waitForTimeout(500);

      // Take screenshot of tasks modal
      console.log('Taking screenshot...');
      const modal = await page.locator('.modal-content');
      if (await modal.count() > 0) {
        await modal.screenshot({
          path: 'docs/verification-feature.png'
        });
        console.log('Screenshot saved to docs/verification-feature.png');
      } else {
        await page.screenshot({
          path: 'docs/verification-feature.png',
          fullPage: false
        });
      }
    } else {
      console.log('No Tasks button found');
      await page.screenshot({
        path: 'docs/verification-feature.png',
        fullPage: false
      });
    }
  } catch (error) {
    console.error('Error taking screenshot:', error);
  } finally {
    await browser.close();
  }
}

takeScreenshot();
