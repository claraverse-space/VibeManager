import { Hono } from 'hono';
import { systemMonitor, getListeningPorts } from '../services/SystemMonitor';
import { networkService } from '../services/NetworkService';
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

export default system;
