import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';
import { createServer } from '../src/server.mjs';

test('productie weigert te starten met development authentication', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', ALLOW_DEVELOPMENT_AUTH: 'true', SESSION_SECRET: 'sterk-geheim' }), /development-auth/);
});

test('productie weigert een zwak sessiegeheim', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', ALLOW_DEVELOPMENT_AUTH: 'false', SESSION_SECRET: 'local-development-only' }), /SESSION_SECRET/);
});

test('beveiligde API weigert een request zonder sessie en voorkomt caching', async t => {
  const server = createServer().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/secure/summary`);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('service worker bevat expliciete API en document uitsluitingen', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(source, /startsWith\('\/api\/'\)/);
  assert.match(source, /startsWith\('\/documents\/'\)/);
  assert.doesNotMatch(source, /caches\.put/);
});
