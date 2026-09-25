import { customerMutation } from './customer-management.mjs';
import { officeSession, officeIdentity, checkQuery, OfficeError } from './auth/supabase.mjs';

export function sendJson(res, status, data, code) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Vary: 'Cookie' });
  res.end(JSON.stringify(status >= 400 ? { ok: false, error: { code: code ?? 'UNAVAILABLE', message: data } } : { ok: true, data }));
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new OfficeError(400, 'INVALID_REQUEST', 'Ongeldig verzoek.');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new OfficeError(413, 'REQUEST_TOO_LARGE', 'Verzoek te groot.'); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; }
  catch { throw new OfficeError(400, 'INVALID_REQUEST', 'Ongeldig verzoek.'); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function entity(client, table, id, fields) {
  if (!uuid.test(id ?? '')) throw new OfficeError(403, 'ENTITY_DENIED', 'Geen toegang tot deze onderneming of klantrelatie.');
  const data = checkQuery(await client.from(table).select(fields).eq('id', id).is('archived_at', null).maybeSingle());
  if (!data) throw new OfficeError(403, 'ENTITY_DENIED', 'Geen toegang tot deze onderneming of klantrelatie.');
  return data;
}
const orgFields = 'id,customer_relationship_id,name,legal_name,registration_number,archived_at';
const relationshipFields = 'id,name,status,archived_at';

export async function handleOfficeApi(req, res, config, fetchImpl) {
  try {
    const url = new URL(req.url, config.origin), path = url.pathname;
    if (!['GET','HEAD'].includes(req.method) && (req.headers.origin !== config.origin || req.headers['sec-fetch-site'] === 'cross-site')) throw new OfficeError(403, 'ORIGIN_DENIED', 'Ongeldige herkomst van het verzoek.');
    const client = officeSession(req, res, config, fetchImpl);
    if (path === '/api/auth/login' && req.method === 'POST') {
      const input = await body(req);
      const invalid = () => new OfficeError(401, 'LOGIN_FAILED', 'Inloggen is niet gelukt. Controleer uw gegevens of neem contact op met uw beheerder.');
      if (typeof input.email !== 'string' || typeof input.password !== 'string' || !input.email.trim() || !input.password || input.email.length > 254 || input.password.length > 1024) throw invalid();
      const result = await client.auth.signInWithPassword({ email: input.email.trim(), password: input.password });
      if (result.error) throw invalid();
      try { await officeIdentity(client, { requireMfa: false }); }
      catch (error) { await client.auth.signOut({ scope: 'local' }); if (error.status === 503) throw error; throw invalid(); }
      return sendJson(res, 200, { redirectTo: '/dashboard' });
    }
    if (path === '/api/auth/logout' && req.method === 'POST') {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new OfficeError(503, 'LOGOUT_FAILED', 'Afmelden is niet gelukt. Probeer het opnieuw.');
      // Do not Clear-Site-Data cookies: portal and Office may share localhost.
      return sendJson(res, 200, { signedOut: true });
    }
    if (path === '/api/auth/status' && req.method === 'GET') {
      try {
        const user = await officeIdentity(client, { requireMfa: false });
        return sendJson(res, 200, { authenticated: true, mfaRequired: !user.aal2, user: user.aal2 ? user : null, mode: 'supabase', developmentAuth: false });
      } catch (error) {
        if (error.status === 401) return sendJson(res, 200, { authenticated: false, user: null, mode: 'supabase', developmentAuth: false });
        throw error;
      }
    }
    if (path === '/api/auth/mfa') {
      await officeIdentity(client, { requireMfa: false });
      const { data: factors, error } = await client.auth.mfa.listFactors();
      if (error) throw new OfficeError(503, 'MFA_UNAVAILABLE', 'Tweestapsverificatie is tijdelijk niet beschikbaar.');
      if (req.method === 'GET') return sendJson(res, 200, { factors: factors.totp.map(f => ({ id: f.id, name: f.friendly_name ?? 'Authenticator' })) });
      if (req.method === 'POST') {
        const input = await body(req);
        if (input.action === 'enroll') {
          if (factors.totp.length) throw new OfficeError(409, 'FACTOR_EXISTS', 'Gebruik uw bestaande authenticator.');
          for (const f of factors.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
            const removed = await client.auth.mfa.unenroll({ factorId: f.id });
            if (removed.error) throw new OfficeError(503, 'MFA_UNAVAILABLE', 'Opnieuw instellen is niet gelukt.');
          }
          const enrolled = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Destination Known Office' });
          if (enrolled.error) throw new OfficeError(503, 'MFA_UNAVAILABLE', 'Instellen is niet gelukt.');
          return sendJson(res, 200, { factorId: enrolled.data.id, qrCode: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret });
        }
        if (input.action !== 'verify' || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw new OfficeError(400, 'INVALID_CODE', 'Vul de zescijferige code in.');
        if (!factors.all.some(f => f.id === input.factorId && f.factor_type === 'totp')) throw new OfficeError(403, 'FACTOR_DENIED', 'Verificatie is niet gelukt.');
        const verified = await client.auth.mfa.challengeAndVerify({ factorId: input.factorId, code: input.code });
        if (verified.error) throw new OfficeError(401, 'INVALID_CODE', 'De code is onjuist of verlopen. Probeer de nieuwste code.');
        return sendJson(res, 200, { verified: true });
      }
    }
    // Everything else, including legacy and unknown API routes, passes this gate.
    const user = await officeIdentity(client);
    const mutation = await customerMutation(req, url, client, user, body);
    if (mutation) return sendJson(res, mutation.status, mutation.data);
    if (!['GET','HEAD'].includes(req.method) && req.headers['content-type']?.startsWith('application/json')) {
      const input = await body(req);
      for (const name of ['organization_id','organizationId']) {
        if (input[name] !== undefined) await entity(client, 'organizations', input[name], orgFields);
      }
    }
    if (req.method === 'GET') {
      for (const name of ['organization_id', 'organizationId']) {
        for (const id of url.searchParams.getAll(name)) await entity(client, 'organizations', id, orgFields);
      }
      if (['/api/clients','/api/relationships','/api/organizations','/api/secure/summary'].includes(path)) {
        let relationships = [], organizations = [];
        // Page explicitly; never silently drop records at the PostgREST row cap.
        for (const [table, fields, result] of [['customer_relationships',relationshipFields,relationships], ['organizations',orgFields,organizations]]) {
          for (let start = 0; ; start += 500) {
            const batch = checkQuery(await client.from(table).select(fields).is('archived_at', null).order('id').range(start, start + 499));
            result.push(...batch); if (batch.length < 500) break;
          }
        }
        const filters = [...url.searchParams.getAll('organization_id'), ...url.searchParams.getAll('organizationId')];
        if (filters.length) { organizations = organizations.filter(o => filters.every(id => id === o.id)); relationships = relationships.filter(r => organizations.some(o => o.customer_relationship_id === r.id)); }
        return sendJson(res, 200, { source: 'supabase', readOnly: !user.canManageCustomers, relationships, organizations, user });
      }
      const org = path.match(/^\/api\/organizations\/([^/]+)$/);
      if (org) return sendJson(res, 200, { source: 'supabase', organization: await entity(client, 'organizations', decodeURIComponent(org[1]), orgFields) });
      const rel = path.match(/^\/api\/(?:clients|relationships)\/([^/]+)$/);
      if (rel) {
        const relationship = await entity(client, 'customer_relationships', decodeURIComponent(rel[1]), relationshipFields);
        const organizations = checkQuery(await client.from('organizations').select(orgFields).eq('customer_relationship_id', relationship.id).is('archived_at', null));
        return sendJson(res, 200, { source: 'supabase', relationship, organizations });
      }
    }
    throw new OfficeError(503, 'NOT_MIGRATED', 'Dit onderdeel is nog niet gemigreerd. Lezen, wijzigen, uploads en downloads zijn hier tijdelijk uitgeschakeld.');
  } catch (error) {
    // Never log raw SDK errors, request bodies, cookies or enrollment material.
    sendJson(res, error instanceof OfficeError ? error.status : 503, error instanceof OfficeError ? error.message : 'Office is tijdelijk niet beschikbaar. Probeer het opnieuw.', error instanceof OfficeError ? error.code : 'UNAVAILABLE');
  }
}
