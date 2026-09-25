import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from '../src/server.mjs';
import { loadConfig } from '../src/config.mjs';
import { supabaseFixture } from './helpers/supabase-fixture.mjs';

async function setup(t, overrides={}) {
  const fixture = supabaseFixture();
  const config = loadConfig({ SUPABASE_URL:'https://office-fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture', OFFICE_ORIGIN:'https://office.example.invalid', ...overrides });
  const server = createServer({config,fetchImpl:fixture.fetch}).listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`, jar = new Map();
  async function call(path, data, options={}) {
    const response = await fetch(base+path,{ method:options.method ?? (data === undefined ? 'GET':'POST'), headers:{ Origin:config.origin, 'Content-Type':'application/json', Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '), ...options.headers }, ...(data === undefined ? {} : {body:JSON.stringify(data)}) });
    for (const cookie of response.headers.getSetCookie()) {
      const pair=cookie.split(';')[0],at=pair.indexOf('=');
      if (/max-age=0/i.test(cookie)) jar.delete(pair.slice(0,at)); else jar.set(pair.slice(0,at),pair.slice(at+1));
    }
    return response;
  }
  async function login() { const response=await call('/api/auth/login',{email:fixture.user.email,password:fixture.password}); assert.equal(response.status,200); return response; }
  return {fixture,call,login,jar,base};
}
test('active Office AAL2 gets real relationships and organizations; session survives reload',async t=>{
  const {fixture,call,login}=await setup(t); const response=await login();
  assert.ok(response.headers.getSetCookie().some(c=>c.startsWith('dko-supabase-auth')&&c.includes('HttpOnly')&&c.includes('SameSite=Strict')));
  for(let i=0;i<2;i++){
    const status=await call('/api/auth/status');assert.equal(status.status,200);assert.equal((await status.json()).data.user.displayName,'Testmedewerker');
    const data=await (await call('/api/clients')).json();assert.equal(data.data.source,'supabase');assert.deepEqual(data.data.organizations.map(o=>o.id),[fixture.db.organizations[0].id]);
  }
  assert.ok(fixture.calls.filter(c=>c.path==='/auth/v1/user').length>=3);
  assert.ok(fixture.calls.filter(c=>c.path==='/rest/v1/office_memberships').every(c=>c.query.get('user_id')===`eq.${fixture.user.id}`));
});
test('customer, missing membership, blocked profile, inactive membership and customer-scope role cannot login',async t=>{
  const {fixture,call}=await setup(t); const baseline=structuredClone(fixture.db);
  for(const mutate of [()=>{fixture.db.office_memberships=[];},()=>{fixture.db.profiles=[];},()=>{fixture.db.profiles[0].account_status='blocked';},()=>{fixture.db.office_memberships[0].status='revoked';},()=>{fixture.db.roles[0].scope='customer';}]){
    fixture.db=structuredClone(baseline);mutate();
    const response=await call('/api/auth/login',{email:fixture.user.email,password:fixture.password});assert.equal(response.status,401);assert.equal(fixture.sessions.size,0);
  }
});
test('membership revocation, Auth ban and profile blocking are enforced on the next protected request',async t=>{
  const {fixture,call,login}=await setup(t);await login();
  fixture.db.office_memberships[0].status='revoked';assert.equal((await call('/api/clients')).status,403);
  fixture.db.office_memberships[0].status='active';fixture.db.profiles[0].account_status='blocked';assert.equal((await call('/api/organizations')).status,403);
  fixture.db.profiles[0].account_status='active';fixture.user.banned_until=new Date(Date.now()+60000).toISOString();assert.equal((await call('/api/clients')).status,403);
});
test('all API and legacy file paths fail closed without a session',async t=>{
  const {call}=await setup(t);
  for(const path of ['/api/clients','/api/secure/summary','/api/documents','/api/health','/api/audit','/api/portal/me','/api/unknown'])assert.equal((await call(path)).status,401,path);
  for(const path of ['/api/auth/development-login','/api/auth/development-unlock','/api/portal/auth/development-login'])assert.equal((await call(path,{userId:'randy'})).status,401,path);
  for(const path of ['/mijn','/mijn.html','/downloads/anything.pdf','/app.js','/%61pp.js'])assert.equal((await call(path)).status,404,path);
});
test('AAL1 is routed to MFA and cannot read Office data; existing factor challenge returns AAL2',async t=>{
  const {fixture,call,login}=await setup(t);fixture.aal='aal1';await login();
  const status=await (await call('/api/auth/status')).json();assert.equal(status.data.mfaRequired,true);assert.equal(status.data.user,null);
  const denied=await call('/api/clients');assert.equal(denied.status,403);assert.equal((await denied.json()).error.code,'MFA_REQUIRED');
  const enrollment=await call('/api/auth/mfa',{action:'enroll'});assert.equal(enrollment.status,200);assert.match(enrollment.headers.get('cache-control'),/no-store/);
  const {factorId}= (await enrollment.json()).data;
  assert.equal((await call('/api/auth/mfa',{action:'verify',factorId:randomUUID(),code:'123456'})).status,403);
  assert.equal((await call('/api/auth/mfa',{action:'verify',factorId,code:'000000'})).status,401);
  assert.equal((await call('/api/auth/mfa',{action:'verify',factorId,code:'123456'})).status,200);
  assert.equal((await call('/api/clients')).status,200);
  assert.equal((await call('/api/auth/mfa',{action:'enroll'})).status,409);
  await login();assert.equal((await (await call('/api/auth/status')).json()).data.mfaRequired,true);
  assert.equal((await (await call('/api/auth/mfa')).json()).data.factors.length,1);
});
test('logout invalidates SDK session, only Office cookies are removed',async t=>{
  const {fixture,call,login,jar}=await setup(t);await login();jar.set('sb-portal-cookie','untouched');
  const response=await call('/api/auth/logout',{});assert.equal(response.status,200);assert.equal(fixture.sessions.size,0);
  assert.equal(jar.get('sb-portal-cookie'),'untouched');assert.equal(response.headers.has('clear-site-data'),false);
  assert.equal((await call('/api/clients')).status,401);
});
test('forged legacy cookies and customer session cannot grant Office authority',async t=>{
  const {fixture,call,login,jar}=await setup(t);jar.set('dko_session','forged');jar.set('mdk_session','forged');
  assert.equal((await call('/api/clients')).status,401);await login();fixture.db.office_memberships=[];
  assert.equal((await call('/api/clients')).status,403);
});
test('organization ID manipulation is denied in paths, queries and write bodies',async t=>{
  const {fixture,call,login}=await setup(t);await login();const foreign=randomUUID();
  assert.equal((await call('/api/organizations/'+foreign)).status,403);
  assert.equal((await call('/api/clients?organization_id='+foreign)).status,403);
  assert.equal((await call('/api/clients',{organization_id:foreign})).status,403);
  const id=fixture.db.organizations[0].id;
  assert.equal((await call('/api/organizations/'+id)).status,200);
  const filtered=await (await call('/api/clients?organization_id='+id)).json();assert.equal(filtered.data.organizations.length,1);
  fixture.db.organizations[0].archived_at=new Date().toISOString();assert.equal((await call('/api/organizations/'+id)).status,403);
});
test('all unmigrated writes and downloads remain disabled at AAL2',async t=>{
  const {call,login}=await setup(t);await login();
  for(const [path,method] of [['/api/clients','POST'],['/api/documents','POST'],['/api/memberships/fixture','DELETE'],['/api/organizations/fixture/features/x','PUT'],['/api/communication/import','POST'],['/api/portal/organizations/fixture/documents','POST']])assert.equal((await call(path,{}, {method})).status,503,path);
  assert.equal((await call('/api/organizations/fixture/customer-report/ytd.pdf')).status,503);
});
test('invalid credentials stay generic and supplied redirects are ignored',async t=>{
  const {fixture,call}=await setup(t);const errors=[];
  for(const email of [fixture.user.email,'unknown@example.invalid']){const response=await call('/api/auth/login',{email,password:'wrong'});assert.equal(response.status,401);errors.push(await response.text());}
  assert.equal(errors[0],errors[1]);
  const response=await call('/api/auth/login',{email:fixture.user.email,password:fixture.password,redirectTo:'//untrusted.invalid'});assert.equal((await response.json()).data.redirectTo,'/dashboard');
});
test('missing config, wrong key type and missing SQL policy fail safely',async t=>{
  for(const SUPABASE_PUBLISHABLE_KEY of ['', 'sb_secret_synthetic']){const {call,fixture}=await setup(t,{SUPABASE_PUBLISHABLE_KEY});assert.equal((await call('/api/auth/status')).status,503);assert.equal(fixture.calls.length,0);}
  const {call,fixture}=await setup(t);fixture.failTable='roles';assert.equal((await call('/api/auth/login',{email:fixture.user.email,password:fixture.password})).status,503);
});
test('cross-site mutations are rejected and production cookies are Secure',async t=>{
  const {call,fixture,login}=await setup(t,{NODE_ENV:'production'});
  assert.equal((await call('/api/auth/login',{}, {headers:{Origin:'https://untrusted.invalid'}})).status,403);assert.equal(fixture.calls.length,0);
  const response=await login();assert.ok(response.headers.getSetCookie().some(c=>c.includes('Secure')&&c.includes('HttpOnly')));
});
test('SDK refresh returns renewed cookies and session continues',async t=>{
  const {call,login,jar,fixture}=await setup(t);await login();
  const name=[...jar.keys()].find(k=>k.startsWith('dko-supabase-auth'));
  const stored=JSON.parse(Buffer.from(decodeURIComponent(jar.get(name)).slice(7),'base64url').toString());stored.expires_at=Math.floor(Date.now()/1000)-1;
  jar.set(name,'base64-'+Buffer.from(JSON.stringify(stored)).toString('base64url'));
  const response=await call('/api/clients');assert.equal(response.status,200);assert.ok(response.headers.getSetCookie().length);assert.ok(fixture.calls.some(c=>c.query.get('grant_type')==='refresh_token'));
  assert.equal((await call('/api/clients')).status,200);
});
test('served Supabase UI contains no demo script or secret configuration; PWA never caches API/auth material',async t=>{
  const {call}=await setup(t);const html=await (await call('/dashboard')).text();assert.match(html,/supabase-app.js/);assert.doesNotMatch(html,/<script src="\/(app|portal).js"/);
  const frontend=await (await call('/supabase-app.js')).text();assert.doesNotMatch(frontend,/sb_secret_|service_role|SUPABASE_PUBLISHABLE_KEY|access_token|refresh_token|localStorage|De Boer/);
  const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');assert.match(sw,/startsWith\('\/api\/'\)/);assert.doesNotMatch(sw,/const SHELL[^;]+(?:supabase-app|mijn\.js|app\.js)/);
});

test('24h Office trust survives refresh without sliding; expiry allows only MFA bootstrap',async t=>{
  const anchor=Math.floor(Date.now()/1000)*1000;
  t.mock.timers.enable({apis:['Date'],now:anchor});
  const {fixture,call,login,jar}=await setup(t);await login();
  assert.equal((await call('/api/clients')).status,200);
  t.mock.timers.setTime(anchor+86340000);
  assert.equal((await call('/api/clients')).status,200);
  assert.ok(fixture.calls.some(c=>c.query.get('grant_type')==='refresh_token'));
  t.mock.timers.setTime(anchor+86400000);
  const denied=await call('/api/clients');assert.equal(denied.status,403);assert.equal((await denied.json()).error.code,'MFA_REQUIRED');
  assert.equal((await (await call('/api/auth/status')).json()).data.mfaRequired,true);
  const setupFactor=await (await call('/api/auth/mfa',{action:'enroll'})).json();
  assert.equal((await call('/api/auth/mfa',{action:'verify',factorId:setupFactor.data.factorId,code:'123456'})).status,200);
  assert.equal((await call('/api/clients')).status,200);
  jar.clear();assert.equal((await call('/api/clients')).status,401);
  fixture.aal='aal1';await login();assert.equal((await (await call('/api/auth/status')).json()).data.mfaRequired,true);
});
test('Office malformed or absent AMR always returns MFA_REQUIRED and cannot mutate',async t=>{
  const {fixture,call,login}=await setup(t);fixture.db.roles[0].code='owner';
  for(const amr of [null,[],{},[{method:'totp',timestamp:'bad'}],[{method:'totp',timestamp:Math.floor(Date.now()/1000)-86400}]]){
    fixture.amr=amr;await login();
    for(const path of ['/api/clients','/api/relationships']){
      const response=await call(path,path==='/api/relationships'?{name:'Denied'}:undefined);
      assert.equal(response.status,403);assert.equal((await response.json()).error.code,'MFA_REQUIRED');
    }
  }
});
