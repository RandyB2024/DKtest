import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from './helpers/development-server.mjs';

async function withServer(t) {
  const server = createServer().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test('health endpoint rapporteert alle lokale subsystemen in een vaste envelope', async t => {
  const base = await withServer(t);
  const response = await fetch(`${base}/api/health`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.data.status, 'ok');
  for (const key of ['database', 'migrations', 'demoData', 'sessionStore']) assert.equal(payload.data[key], 'ok');
});

test('sessie blijft geldig bij herladen en API-antwoorden zijn uniform', async t => {
  const base = await withServer(t);
  const login = await fetch(`${base}/api/auth/development-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'randy' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const first = await fetch(`${base}/api/auth/status`, { headers: { Cookie: cookie } });
  const second = await fetch(`${base}/api/auth/status`, { headers: { Cookie: cookie } });
  const firstPayload = await first.json(), secondPayload = await second.json();
  assert.equal(firstPayload.ok, true);
  assert.equal(firstPayload.data.authenticated, true);
  assert.equal(secondPayload.data.user.id, 'randy');
});

test('alle primaire SPA-routes werken ook als directe URL', async t => {
  const base = await withServer(t);
  for (const route of ['/dashboard', '/work-queue', '/clients', '/administration', '/documents', '/tax-returns', '/communication', '/audit', '/settings', '/clients/de-boer-advies']) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /text\/html/);
  }
});

test('mobiele navigatie en defensieve API-client zijn aangesloten', async () => {
  const [html, app, css, sw] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /id="nav-overlay"/);
  assert.match(app, /\$\('#menu'\)\.onclick=toggleMenu/);
  assert.match(app, /closeMenu\(\);history\.pushState/);
  assert.match(app, /credentials:'same-origin'/);
  assert.match(app, /AbortController/);
  assert.match(css, /sidebar\.mobile-open/);
  assert.match(sw, /v12-supabase/);
  assert.match(sw, /startsWith\('\/api\/'\)/);
});
