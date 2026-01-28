import { Hono } from 'hono';
import { systemMonitor, getListeningPorts } from '../services/SystemMonitor';
import { networkService } from '../services/NetworkService';
import { updateService } from '../services/UpdateService';
import { DEFAULT_PORT } from '@vibemanager/shared';

const system = new Hono();

// Get system stats
system.get('/', (c) => {
  try {
    const stats = systemMonitor.getStats();
    return c.json({ success: true, data: stats });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get listening ports
system.get('/ports', (c) => {
  try {
    const ports = getListeningPorts();
    return c.json({ success: true, data: ports });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get access URLs for remote access
system.get('/access-urls', (c) => {
  try {
    const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
    const networkInfo = networkService.getAccessURLs(port);
    return c.json({ success: true, data: networkInfo });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get version info and check for updates
system.get('/version', async (c) => {
  try {
    const versionInfo = await updateService.checkForUpdates();
    return c.json({ success: true, data: versionInfo });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Apply update
system.post('/update', async (c) => {
  try {
    const result = await updateService.applyUpdate();

    if (result.success && result.needsRestart) {
      // Schedule restart after response is sent
      updateService.scheduleRestart(2000);
    }

    return c.json({ success: result.success, data: result });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

export default system;
