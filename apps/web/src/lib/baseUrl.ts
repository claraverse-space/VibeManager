/**
 * Dynamic URL utilities for remote access support
 */

/**
 * Get the base URL (protocol + host) from current location
 */
export function getBaseUrl(): string {
  return window.location.origin;
}

/**
 * Get the WebSocket URL prefix (ws:// or wss://)
 */
export function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

/**
 * Get preview URL for a given port
 * Uses direct URL to the port on the same hostname
 */
export function getPreviewUrl(port: number): string {
  return `http://${window.location.hostname}:${port}`;
}

/**
 * Get code-server URL with optional folder path
 * Uses the /code proxy route for remote access
 */
export function getCodeServerUrl(folder?: string): string {
  const base = `${getBaseUrl()}/code`;
  return folder ? `${base}/?folder=${encodeURIComponent(folder)}` : base;
}

/**
 * Check if we're running locally (localhost or 127.0.0.1)
 */
export function isLocalhost(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/**
 * Get the current host's display name
 */
export function getHostDisplay(): string {
  return window.location.host;
}
