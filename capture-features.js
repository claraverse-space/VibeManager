const { chromium } = require('playwright');

async function captureFeatures() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 }
  });
  const page = await context.newPage();

  try {
    // 1. Main Dashboard
    console.log('Capturing main dashboard...');
    await page.goto('http://localhost:3131', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'docs/dashboard.png', fullPage: false });
    console.log('✓ Dashboard screenshot saved');

    // 2. Session card with details
    console.log('Capturing session details...');
    const sessionCards = await page.locator('.session-card').all();
    if (sessionCards.length > 0) {
      await sessionCards[0].click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'docs/session-details.png', fullPage: false });
      console.log('✓ Session details screenshot saved');

      // 3. Tasks modal
      console.log('Capturing tasks modal...');
      const tasksBtn = await page.locator('button:has-text("Tasks")');
      if (await tasksBtn.count() > 0) {
        await tasksBtn.click();
        await page.waitForTimeout(1500);

        // Inject verification UI for demonstration
        await page.evaluate(() => {
          const badge = document.getElementById('ralph-status-badge');
          if (badge) {
            badge.className = 'ralph-status-badge stuck';
            badge.textContent = 'STUCK';
          }

          const controls = document.getElementById('ralph-controls');
          if (controls) {
            controls.textContent = '';

            const verifyBtn = document.createElement('button');
            verifyBtn.className = 'btn-start';
            verifyBtn.textContent = 'Verify & Resume';
            verifyBtn.style.cssText = 'background: var(--accent); padding: 8px 16px; border-radius: 6px; border: none; color: white; font-weight: 500; cursor: pointer; font-size: 13px;';

            const forceBtn = document.createElement('button');
            forceBtn.className = 'btn-start';
            forceBtn.textContent = 'Force Resume';
            forceBtn.style.cssText = 'background: var(--surface2); padding: 8px 16px; border-radius: 6px; border: none; color: var(--text); font-weight: 500; cursor: pointer; font-size: 13px; margin-left: 8px;';

            const stopBtn = document.createElement('button');
            stopBtn.className = 'btn-stop';
            stopBtn.textContent = 'Stop';
            stopBtn.style.cssText = 'background: transparent; padding: 8px 16px; border-radius: 6px; border: 1px solid var(--danger); color: var(--danger); font-weight: 500; cursor: pointer; font-size: 13px; margin-left: 8px;';

            controls.appendChild(verifyBtn);
            controls.appendChild(forceBtn);
            controls.appendChild(stopBtn);
          }

          const taskItems = document.querySelectorAll('.task-item');
          if (taskItems.length > 0) {
            const lastTask = taskItems[taskItems.length - 1];
            lastTask.style.borderLeft = '3px solid var(--danger)';

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
        });

        await page.waitForTimeout(500);
        const modal = await page.locator('.modal-content');
        if (await modal.count() > 0) {
          await modal.screenshot({ path: 'docs/tasks-verification.png' });
          console.log('✓ Tasks with verification screenshot saved');
        }

        // Close modal
        const closeBtn = await page.locator('.modal-close');
        if (await closeBtn.count() > 0) {
          await closeBtn.click();
          await page.waitForTimeout(500);
        }
      }

      // 4. VS Code Editor - open code server in new tab
      console.log('Capturing VS Code editor...');
      const codeBtn = await page.locator('button:has-text("Code")');
      if (await codeBtn.count() > 0) {
        try {
          // Get the onclick attribute to find the port
          const codeUrl = 'http://localhost:8083';
          const codePage = await context.newPage();
          await codePage.goto(codeUrl, { waitUntil: 'networkidle', timeout: 10000 });
          await codePage.waitForTimeout(3000);
          await codePage.screenshot({ path: 'docs/vscode-editor.png', fullPage: false });
          console.log('✓ VS Code editor screenshot saved');
          await codePage.close();
        } catch (err) {
          console.log('⚠ Code server not available, skipping VS Code screenshot');
        }
      }

      // 5. Attach terminal
      console.log('Capturing attach terminal...');
      const attachBtn = await page.locator('button:has-text("Attach")').first();
      if (await attachBtn.count() > 0) {
        await attachBtn.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: 'docs/attach-terminal.png', fullPage: false });
        console.log('✓ Attach terminal screenshot saved');

        // Go back
        await page.goBack();
        await page.waitForTimeout(1000);
      }
    }

    // 6. Create session modal
    console.log('Capturing create session modal...');
    await page.goto('http://localhost:3131', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const newSessionBtn = await page.locator('button:has-text("New Session")');
    if (await newSessionBtn.count() > 0) {
      await newSessionBtn.click();
      await page.waitForTimeout(1000);

      // Fill in some example data
      await page.fill('input[name="name"]', 'my-project');
      await page.fill('input[name="projectPath"]', '/home/user/projects/my-project');
      await page.waitForTimeout(500);

      await page.screenshot({ path: 'docs/create-session.png', fullPage: false });
      console.log('✓ Create session screenshot saved');
    }

    // 7. Port selection view
    console.log('Capturing port selection...');
    const sessionCards2 = await page.locator('.session-card').all();
    if (sessionCards2.length > 0) {
      // Click session to see port info
      await page.goto('http://localhost:3131', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      // Take screenshot showing multiple sessions with ports
      await page.screenshot({ path: 'docs/sessions-overview.png', fullPage: true });
      console.log('✓ Sessions overview with ports screenshot saved');
    }

    console.log('\n✅ All screenshots captured successfully!');

  } catch (error) {
    console.error('Error capturing screenshots:', error);
  } finally {
    await browser.close();
  }
}

captureFeatures();
