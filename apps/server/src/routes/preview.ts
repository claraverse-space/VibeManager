import { Hono } from 'hono';

const preview = new Hono();

// Allowed port range for preview proxy
const MIN_PORT = 3000;
const MAX_PORT = 9000;
const BLOCKED_PORTS = [3131]; // Block the VibeManager API port

function isPortAllowed(port: number): boolean {
  return port >= MIN_PORT && port <= MAX_PORT && !BLOCKED_PORTS.includes(port);
}

// Proxy requests to preview ports
// GET/POST/etc /preview/:port/* -> http://127.0.0.1:port/*
preview.all('/:port{[0-9]+}/*', async (c) => {
  const portStr = c.req.param('port');
  const port = parseInt(portStr, 10);

  if (!isPortAllowed(port)) {
    return c.json({ success: false, error: 'Invalid port' }, 400);
  }

  // Get the path after /preview/:port
  const originalPath = c.req.path;
  const pathMatch = originalPath.match(/^\/preview\/\d+(.*)$/);
  const path = pathMatch ? pathMatch[1] || '/' : '/';

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
    console.error(`Preview proxy error for port ${port}:`, error);
    return c.json({
      success: false,
      error: 'Preview unavailable - is the dev server running?'
    }, 502);
  }
});

// Handle root path for a port
preview.all('/:port{[0-9]+}', async (c) => {
  const portStr = c.req.param('port');
  const port = parseInt(portStr, 10);

  if (!isPortAllowed(port)) {
    return c.json({ success: false, error: 'Invalid port' }, 400);
  }

  // Redirect to path with trailing slash for consistency
  return c.redirect(`/preview/${port}/`);
});

export default preview;
