import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { securityHeaders } from './security.mjs';
import { handleOfficeApi, sendJson } from './supabase-api.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml' };

export function createServer({ config = loadConfig(), fetchImpl = fetch } = {}) {
  if (config.isProduction && config.allowDevelopmentAuth) throw new Error('development-auth mag nooit actief zijn in productie.');
  let developmentServer;
  return http.createServer(async (req, res) => {
    Object.entries(securityHeaders(config.isProduction)).forEach(([key,value]) => res.setHeader(key,value));
    try {
      if (config.allowDevelopmentAuth) {
        const host = new URL('http://' + req.headers.host).hostname;
        if (!['127.0.0.1','localhost','[::1]'].includes(host) || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return sendJson(res,403,'Development-auth is uitsluitend lokaal beschikbaar.');
        developmentServer ??= import('./development-server.mjs').then(module => module.createDevelopmentServer(config));
        (await developmentServer).emit('request',req,res);
        return;
      }
      const path = decodeURIComponent(new URL(req.url, config.origin).pathname);
      if (path === '/api' || path.startsWith('/api/')) return await handleOfficeApi(req,res,config,fetchImpl);
      // No local customer portal or private-file fallback in Supabase mode.
      if (/^\/(mijn(?:[/.]|$)|downloads(?:\/|$)|private-storage(?:\/|$))/.test(path)) return sendJson(res,404,'Niet beschikbaar in Office.');
      if (['/app.js','/portal.js','/mijn.js'].includes(path)) return sendJson(res,404,'Lokale democode is uitgeschakeld.');
      const requested = path === '/' || !extname(path) ? '/index.html' : path;
      const target = resolve(publicDir, '.' + requested);
      if (!target.startsWith(resolve(publicDir) + sep)) return sendJson(res,403,'Geen toegang.');
      let data = await readFile(target);
      if (extname(target) === '.html' && requested === '/index.html') {
        data = Buffer.from(data.toString().replace('<script src="/portal.js" defer></script><script src="/app.js" defer></script>', '<script src="/supabase-app.js" defer></script>').replace('</head>', '<link rel="stylesheet" href="/supabase.css"></head>'));
      }
      res.writeHead(200, { 'Content-Type':types[extname(target)] || 'application/octet-stream', 'Cache-Control':extname(target) === '.html' || path === '/sw.js' ? 'no-store, private' : 'public, max-age=300' });
      res.end(data);
    } catch {
      if (!res.headersSent) sendJson(res,404,'Dit onderdeel is niet beschikbaar.');
      else res.end();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // .env.local is opt-in process configuration, never exposed via publicDir.
  try { process.loadEnvFile(fileURLToPath(new URL('../.env.local', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Lokale configuratie kon niet worden geladen.'); }
  const config = loadConfig();
  createServer({ config }).listen(config.port,'127.0.0.1', () => console.log(`Destination Known Office gestart op loopback-poort ${config.port} (${config.allowDevelopmentAuth ? 'lokale demo' : 'Supabase'}).`));
}
