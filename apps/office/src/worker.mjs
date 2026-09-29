import { loadConfig } from './config.mjs';
import { securityHeaders } from './security.mjs';
import { handleOfficeApi } from './supabase-api.mjs';

const assets = new Set([
  '/index.html', '/offline.html', '/styles.css', '/intake.css', '/supabase.css',
  '/supabase-app.js', '/passkeys.js', '/kvk-intake.js', '/customer-profile.js', '/profile-fields.js', '/client-workspace.js', '/intake-fields.js', '/intake-form.js', '/sw.js', '/manifest.webmanifest',
  '/assets/logo.png', '/assets/icon-192.png', '/assets/icon-512.png',
]);

function nodeRequest(request) {
  const url = new URL(request.url);
  return {
    url: url.pathname + url.search,
    method: request.method,
    headers: Object.fromEntries([...request.headers].map(([name, value]) => [name.toLowerCase(), value])),
    async *[Symbol.asyncIterator]() {
      if (!request.body) return;
      const reader = request.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          yield Buffer.from(value);
        }
      } finally { reader.releaseLock(); }
    },
  };
}

function nodeResponse() {
  const headers = new Map();
  let status = 500, content = '';
  return {
    getHeader(name) { return headers.get(name.toLowerCase()); },
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    writeHead(code, values = {}) {
      status = code;
      for (const [name, value] of Object.entries(values)) this.setHeader(name, value);
    },
    end(value = '') { content = value; },
    toResponse(method) {
      const result = new Headers();
      for (const [name, value] of headers) {
        if (name === 'set-cookie') for (const cookie of [].concat(value)) result.append(name, cookie);
        else result.set(name, value);
      }
      return new Response(method === 'HEAD' ? null : content, { status, headers: result });
    },
  };
}

function secured(response, isProduction = true) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders(isProduction))) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function unavailable(status = 404) {
  return secured(new Response('Niet beschikbaar in Office.', { status, headers: { 'Cache-Control': 'no-store, private' } }));
}

export function createWorker(fetchImpl = fetch) { return {
  async fetch(request, env) {
    // Explicit production config: Worker bindings are per request and never mixed
    // with the local demo server or build-time process environment.
    let config;
    try { config = loadConfig({ ...env, NODE_ENV: 'production', ALLOW_DEVELOPMENT_AUTH: 'false' }); }
    catch { return secured(new Response('Office is nog niet veilig geconfigureerd.', { status: 503, headers: { 'Cache-Control': 'no-store, private' } })); }
    const url = new URL(request.url);
    if (url.origin !== config.origin) return unavailable(421);
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return unavailable(400); }
    if (path === '/api' || path.startsWith('/api/')) {
      const res = nodeResponse();
      try { await handleOfficeApi(nodeRequest(request), res, config, fetchImpl); }
      catch { return secured(new Response('Office is tijdelijk niet beschikbaar.', { status: 503, headers: { 'Cache-Control': 'no-store, private' } })); }
      return secured(res.toResponse(request.method));
    }
    if (!['GET', 'HEAD'].includes(request.method)) return unavailable(405);
    if (/^\/(mijn(?:[/.]|$)|downloads(?:\/|$)|private-storage(?:\/|$))/.test(path)) return unavailable();
    const requested = path === '/' || !/\.[^/]+$/.test(path) ? '/index.html' : path;
    if (!assets.has(requested) || !env.ASSETS) return unavailable();
    let asset;
    try { asset = await env.ASSETS.fetch(new URL(requested, config.origin)); }
    catch { return secured(new Response('Office is tijdelijk niet beschikbaar.', { status: 503, headers: { 'Cache-Control': 'no-store, private' } })); }
    if (!asset.ok) return unavailable();
    const headers = new Headers(asset.headers);
    headers.set('Cache-Control', requested === '/index.html' || requested === '/sw.js' ? 'no-store, private' : 'public, max-age=300');
    return secured(new Response(request.method === 'HEAD' ? null : asset.body, { status: asset.status, headers }));
  },
}; }

export default createWorker();
