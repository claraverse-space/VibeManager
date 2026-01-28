import { Hono } from 'hono';
import type { Context } from 'hono';

const preview = new Hono();

// Allowed port range for preview proxy
const MIN_PORT = 3000;
const MAX_PORT = 9000;
const BLOCKED_PORTS = [3131]; // Block the VibeManager API port

function isPortAllowed(port: number): boolean {
  return port >= MIN_PORT && port <= MAX_PORT && !BLOCKED_PORTS.includes(port);
}

/**
 * Get the target host from the request.
 * Uses the Host header to proxy to the same IP that VibeManager is running on.
 */
function getTargetHost(c: Context): string {
  const requestHost = c.req.header('host') || '127.0.0.1';
  // Strip port if present (e.g., "192.168.1.10:3131" -> "192.168.1.10")
  return requestHost.split(':')[0];
}

/**
 * Proxy a request to the target port
 */
async function proxyRequest(c: Context, port: number, path: string): Promise<Response> {
  const targetHost = getTargetHost(c);
  const targetUrl = `http://${targetHost}:${port}${path}`;
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
    console.error(`Preview proxy error for ${fullUrl}:`, error);
    return c.json({
      success: false,
      error: 'Preview unavailable - is the dev server running?'
    }, 502);
  }
}

// Proxy requests to preview ports
// GET/POST/etc /preview/:port/* -> http://{host}:port/*
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

  return proxyRequest(c, port, path);
});

// Handle root path for a port (with trailing slash)
preview.all('/:port{[0-9]+}/', async (c) => {
  const portStr = c.req.param('port');
  const port = parseInt(portStr, 10);

  if (!isPortAllowed(port)) {
    return c.json({ success: false, error: 'Invalid port' }, 400);
  }

  return proxyRequest(c, port, '/');
});

// Handle root path for a port (without trailing slash) - redirect
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
