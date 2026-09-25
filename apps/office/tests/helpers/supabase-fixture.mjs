import { randomUUID } from 'node:crypto';

export function supabaseFixture() {
  const state = {
    password:randomUUID(), amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}], aal:'aal2', sessions:new Map(), calls:[], ttl:3600,
    user:{ id:randomUUID(), email:'office-fixture@example.invalid', aud:'authenticated', app_metadata:{}, user_metadata:{}, created_at:new Date().toISOString(), factors:[] },
  };
  const role = { id:randomUUID(), scope:'office', code:'viewer', display_name:'Office-lezer' };
  const relationship = { id:randomUUID(), name:'Testrelatie', status:'active', archived_at:null };
  state.db = {
    profiles:[{ id:state.user.id, display_name:'Testmedewerker', account_status:'active' }],
    office_memberships:[{ id:randomUUID(), user_id:state.user.id, role_id:role.id, status:'active' }], roles:[role],
    customer_relationships:[relationship], organizations:[{ id:randomUUID(), customer_relationship_id:relationship.id, name:'Fictieve testonderneming', legal_name:null, registration_number:null, archived_at:null }],
  };
  function session(aal = state.aal, amr = state.amr) {
    const now = Math.floor(Date.now()/1000), encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encode({ alg:'HS256',typ:'JWT' })}.${encode({ sub:state.user.id,aal,amr,exp:now+state.ttl,iat:now,session_id:randomUUID(),role:'authenticated' })}.${Buffer.from(randomUUID()).toString('base64url')}`;
    const refresh = randomUUID(); state.sessions.set(token,{ refresh,aal,amr });
    return { access_token:token,refresh_token:refresh,expires_in:state.ttl,expires_at:now+state.ttl,token_type:'bearer',user:structuredClone(state.user) };
  }
  const json = (data,status=200) => Response.json(data,{status});
  const isOffice = () => state.db.profiles[0]?.account_status === 'active' && state.db.office_memberships[0]?.status === 'active' && state.db.roles[0]?.scope === 'office';
  state.fetch = async (input,init={}) => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
    if (url.origin !== 'https://office-fixture.supabase.co') throw new Error('Fixture must never contact a real project');
    const method = init.method ?? 'GET', headers = new Headers(init.headers), body = init.body ? JSON.parse(init.body) : {};
    state.calls.push({path:url.pathname,method,query:url.searchParams});
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const previous = [...state.sessions.values()].find(s => s.refresh === body.refresh_token);
        if (!previous) return json({message:'invalid',code:'refresh_token_not_found'},400);
        state.ttl=3600; return json(session(previous.aal,previous.amr));
      }
      if (body.email !== state.user.email || body.password !== state.password) return json({message:'invalid',code:'invalid_credentials'},400);
      return json(session());
    }
    const token = headers.get('authorization')?.replace(/^Bearer /,'');
    if (!state.sessions.has(token)) return json({message:'invalid',code:'bad_jwt'},401);
    if (url.pathname === '/auth/v1/user') return json(state.user);
    if (url.pathname === '/auth/v1/logout') { state.sessions.clear(); return new Response(null,{status:204}); }
    if (url.pathname === '/auth/v1/factors' && method === 'POST') {
      const id = randomUUID(); state.user.factors.push({id,status:'unverified',factor_type:'totp',friendly_name:'Fixture'});
      return json({id,type:'totp',totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg"></svg>',secret:'SYNTHETIC-TEST-ONLY',uri:''}});
    }
    if (url.pathname.endsWith('/challenge')) return json({id:randomUUID(),expires_at:Math.floor(Date.now()/1000)+60,type:'totp'});
    if (url.pathname.endsWith('/verify')) {
      if (body.code !== '123456') return json({message:'invalid',code:'mfa_verification_failed'},422);
      state.user.factors.forEach(f => {f.status='verified';}); state.amr=[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]; return json(session('aal2'));
    }
    if (url.pathname.startsWith('/auth/v1/factors/') && method === 'DELETE') {
      state.user.factors = state.user.factors.filter(f => f.id !== url.pathname.split('/').pop()); return json({id:url.pathname.split('/').pop()});
    }
    if (url.pathname === '/rest/v1/rpc/is_office_user') return json(isOffice());
    if (url.pathname.startsWith('/rest/v1/rpc/office_') && state.rpc) return state.rpc(url.pathname.split('/').pop(),body);
    if (url.pathname.startsWith('/rest/v1/')) {
      if (method !== 'GET') throw new Error('No writes permitted in phase 1');
      const table = url.pathname.split('/').pop();
      if (state.failTable === table) return json({message:'permission denied'},403);
      let rows = structuredClone(state.db[table] ?? []);
      for (const [field,value] of url.searchParams) {
        if (value.startsWith('eq.')) rows = rows.filter(r => String(r[field]) === value.slice(3));
        if (value === 'is.null') rows = rows.filter(r => r[field] === null);
      }
      if (['profiles','office_memberships','roles'].includes(table) || url.searchParams.has('id')) return json(rows[0] ?? null);
      return json(rows);
    }
    throw new Error('Unexpected fixture endpoint');
  };
  return state;
}
