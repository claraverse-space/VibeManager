import { Hono } from 'hono';

const preview = new Hono();

// Redirect /preview/:port to the actual port
// No proxy - just redirect to the direct URL
preview.all('/:port{[0-9]+}/*', (c) => {
  const port = c.req.param('port');
  const path = c.req.path.replace(/^\/preview\/\d+/, '') || '/';
  const query = new URL(c.req.url).search;
  const host = (c.req.header('host') || 'localhost').split(':')[0];
  return c.redirect(`http://${host}:${port}${path}${query}`);
});

preview.all('/:port{[0-9]+}', (c) => {
  const port = c.req.param('port');
  const query = new URL(c.req.url).search;
  const host = (c.req.header('host') || 'localhost').split(':')[0];
  return c.redirect(`http://${host}:${port}/${query}`);
});

export default preview;
