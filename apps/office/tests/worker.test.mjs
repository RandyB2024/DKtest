import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorker } from '../src/worker.mjs';
import { supabaseFixture } from './helpers/supabase-fixture.mjs';

const origin = 'https://office.testadmin.nl';
const settings = {
  OFFICE_ORIGIN: origin,
  SUPABASE_URL: 'https://office-fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  MFA_TRUST_MAX_AGE_SECONDS: '86400',
};
const assets = { async fetch(url) {
  const pathname = new URL(url).pathname;
  try { return new Response(await readFile(new URL('../worker-public' + pathname, import.meta.url))); }
  catch { return new Response('missing', { status: 404 }); }
} };

test('Worker publishes only the Supabase shell and protects blocked routes', async () => {
  const worker = createWorker();
  const env = { ...settings, ASSETS: assets };
  const shell = await worker.fetch(new Request(origin + '/dashboard'), env);
  assert.equal(shell.status, 200);
  const html = await shell.text();
  assert.match(html, /supabase-app\.js/);
  assert.doesNotMatch(html, /portal\.js|Lokale ontwikkelomgeving|Passkey \/ biometrische beveiliging/);
  const frontend = await (await worker.fetch(new Request(origin + '/supabase-app.js'), env)).text();
  assert.doesNotMatch(frontend, /Inloggen met passkey/);
  for (const path of ['/app.js','/portal.js','/mijn.html','/private-storage/x','/downloads/x','/missing.js'])
    assert.equal((await worker.fetch(new Request(origin + path), env)).status, 404, path);
  assert.equal((await worker.fetch(new Request('https://wrong.example/dashboard'), env)).status, 421);
  assert.equal((await worker.fetch(new Request(origin + '/api/auth/status'), { OFFICE_ORIGIN: origin })).status, 503);
});

test('Worker keeps Supabase session cookies, origin gate and hard TOTP gate', async () => {
  const fixture = supabaseFixture(), worker = createWorker(fixture.fetch);
  const env = { ...settings, ASSETS: assets };
  const login = await worker.fetch(new Request(origin + '/api/auth/login', {
    method:'POST', headers:{ Origin:origin, 'Content-Type':'application/json' },
    body:JSON.stringify({email:fixture.user.email,password:fixture.password}),
  }), env);
  assert.equal(login.status, 200);
  const cookies = login.headers.getSetCookie();
  assert.ok(cookies.some(cookie => cookie.includes('HttpOnly') && cookie.includes('Secure') && cookie.includes('SameSite=Strict')));
  const jar = cookies.map(cookie => cookie.split(';')[0]).join('; ');
  const clients = await worker.fetch(new Request(origin + '/api/clients', { headers:{Cookie:jar} }), env);
  assert.equal(clients.status, 200);
  assert.equal((await clients.json()).data.relationships.length, 1);
  const crossSite = await worker.fetch(new Request(origin + '/api/auth/login', { method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}' }), env);
  assert.equal(crossSite.status, 403);
  fixture.amr = [{method:'totp',timestamp:Math.floor(Date.now()/1000)-86400}];
  const staleLogin = await worker.fetch(new Request(origin + '/api/auth/login', {
    method:'POST', headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({email:fixture.user.email,password:fixture.password}),
  }),env);
  assert.equal(staleLogin.status,200);
  const staleJar = staleLogin.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
  const expired = await worker.fetch(new Request(origin + '/api/clients', {headers:{Cookie:staleJar}}),env);
  assert.equal(expired.status,403);
  assert.equal((await expired.json()).error.code,'MFA_REQUIRED');
});
