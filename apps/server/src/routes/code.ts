import { Hono } from 'hono';
import { codeServerService } from '../services/CodeServerService';

const code = new Hono();

// Get code-server status
code.get('/status', (c) => {
  const status = codeServerService.getStatus();
  return c.json({ success: true, data: status });
});

// Get code-server URL for embedding
code.get('/url', (c) => {
  const folder = c.req.query('folder');
  const status = codeServerService.getStatus();

  if (!status.running) {
    return c.json({ success: false, error: 'code-server not running' }, 503);
  }

  // Build the code-server URL with optional folder
  let url = '/code/';
  if (folder) {
    url += `?folder=${encodeURIComponent(folder)}`;
  }

  return c.json({ success: true, data: { url } });
});

// Restart code-server
code.post('/restart', async (c) => {
  codeServerService.stop();
  await new Promise(resolve => setTimeout(resolve, 1000));
  const started = await codeServerService.start();

  if (started) {
    return c.json({ success: true, message: 'code-server restarted' });
  }
  return c.json({ success: false, error: 'Failed to restart code-server' }, 500);
});

export default code;

// Separate router for code-server proxy (mounted at /code, not /api/code)
export const codeProxy = new Hono();

// Proxy all requests to code-server
codeProxy.all('/*', async (c) => {
  const port = codeServerService.getPort();
  const status = codeServerService.getStatus();

  if (!status.running) {
    return c.json({ success: false, error: 'code-server not running' }, 503);
  }

  // Get the path after /code
  const path = c.req.path.replace(/^\/code/, '') || '/';

  // Build target URL
  const targetUrl = `http://127.0.0.1:${port}${path}`;

  // Get query string
  const queryString = new URL(c.req.url).search;
  const fullUrl = queryString ? `${targetUrl}${queryString}` : targetUrl;

  try {
    // Clone headers but remove host
    const headers = new Headers();
    c.req.raw.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'host') {
        headers.set(key, value);
      }
    });

    // Make the proxied request
    const response = await fetch(fullUrl, {
      method: c.req.method,
      headers,
      body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
        ? await c.req.blob()
        : undefined,
    });

    // Build response headers
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Skip hop-by-hop headers
      if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Code-server proxy error:', error);
    return c.json({
      success: false,
      error: 'code-server unavailable'
    }, 502);
  }
});
