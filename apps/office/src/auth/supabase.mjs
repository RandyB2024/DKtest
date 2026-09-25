import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';

export class OfficeError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function officeSession(req, res, config, fetchImpl = fetch) {
  const { supabaseUrl: url, supabaseKey: key } = config;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? '')) throw new Error();
  } catch { throw new OfficeError(503, 'CONFIGURATION_REQUIRED', 'Office is nog niet veilig geconfigureerd. Neem contact op met de beheerder.'); }
  const jar = new Map(parseCookieHeader(req.headers.cookie ?? '').map(c => [c.name, c.value]));
  const outgoing = new Map();
  const options = { httpOnly: true, secure: config.isProduction, sameSite: 'strict', path: '/', maxAge: 28800 };
  // Separate namespace: Office and portal may run on the same local hostname.
  const client = createServerClient(url, key, {
    cookieOptions: { ...options, name: 'dko-supabase-auth' },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll(values) {
        for (const { name, value, options: sdkOptions } of values) {
          jar.set(name, value);
          outgoing.set(name, serializeCookieHeader(name, value, { ...sdkOptions, ...options, maxAge: sdkOptions.maxAge === 0 ? 0 : options.maxAge }));
        }
        res.setHeader('Set-Cookie', [...outgoing.values()]);
      },
    },
    global: { fetch: (input, init) => fetchImpl(input, { ...init, cache: 'no-store' }) },
  });
  return client;
}

export async function officeIdentity(client, { requireMfa = true } = {}) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new OfficeError(401, 'AUTH_REQUIRED', 'Log in met uw persoonlijke Office-account.');
  const user = data.user;
  if (user.deleted_at || user.is_anonymous || (user.banned_until && Date.parse(user.banned_until) > Date.now())) throw denied();
  const profileResult = await client.from('profiles').select('id,display_name,account_status').eq('id', user.id).maybeSingle();
  checkQuery(profileResult);
  if (profileResult.data?.account_status !== 'active') throw denied();
  const membershipResult = await client.from('office_memberships').select('id,user_id,role_id,status').eq('user_id', user.id).eq('status', 'active').maybeSingle();
  checkQuery(membershipResult);
  if (!membershipResult.data) throw denied();
  const roleResult = await client.from('roles').select('id,scope,code,display_name').eq('id', membershipResult.data.role_id).eq('scope', 'office').maybeSingle();
  checkQuery(roleResult);
  if (!roleResult.data) throw denied();
  // Independent database predicate; never infer Office access from customer roles.
  const officeResult = await client.rpc('is_office_user');
  checkQuery(officeResult);
  if (officeResult.data !== true) throw denied();
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || !assurance.data) throw new OfficeError(401, 'AUTH_REQUIRED', 'Log opnieuw in.');
  const aal2 = assurance.data.currentLevel === 'aal2';
  if (requireMfa && !aal2) throw new OfficeError(403, 'MFA_REQUIRED', 'Bevestig uw identiteit met tweestapsverificatie.');
  return { id: user.id, displayName: profileResult.data.display_name, role: roleResult.data.display_name, roleCode: roleResult.data.code, canManageCustomers: aal2 && ['owner','admin'].includes(roleResult.data.code), aal2 };
}
export function checkQuery(result) {
  if (result.error) throw new OfficeError(503, 'DATABASE_UNAVAILABLE', 'De gegevens of toegangsrechten kunnen niet worden geladen. Controleer de configuratie en migraties.');
  return result.data;
}
function denied() { return new OfficeError(403, 'OFFICE_ACCESS_DENIED', 'Geen toegang tot Destination Known Office.'); }
