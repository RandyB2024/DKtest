import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { addPasskeys, credential } from './helpers/passkey-fixture.mjs';
import { createServer } from '../src/server.mjs';
import { loadConfig } from '../src/config.mjs';
import { supabaseFixture } from './helpers/supabase-fixture.mjs';

async function setup(t, overrides={}) {
  const fixture = addPasskeys(supabaseFixture());
  const config = loadConfig({ SUPABASE_URL:'https://office-fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture', OFFICE_ORIGIN:'https://office.testadmin.nl', PASSKEYS_ENABLED:'true', PASSKEY_ORIGIN:'https://office.testadmin.nl', ...overrides });
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
test('Office: register, list, passkey AAL1 denied data, TOTP required, revoke and lost device recovery',async t=>{
  const {fixture,call,login,jar}=await setup(t);await login();
  const options=await call('/api/auth/passkeys',{action:'registration-options'});
  assert.equal(options.status,200);assert.match(options.headers.getSetCookie().join(';'),/dko-passkey-challenge=.*HttpOnly.*SameSite=Strict/);
  assert.match(options.headers.getSetCookie().join(';'),/Max-Age=30[0]?|Max-Age=299/);
  const start=(await options.json()).data;
  assert.equal((await call('/api/auth/passkeys',{action:'registration-verify',challengeId:start.challengeId,credential:credential(randomUUID())})).status,200);
  const listed=(await (await call('/api/auth/passkeys')).json()).data;assert.equal(listed.passkeys.length,1);
  const id=listed.passkeys[0].id;
  await call('/api/auth/logout',{});jar.clear();
  assert.equal((await call('/api/clients')).status,401);
  const auth=(await (await call('/api/auth/passkeys',{action:'authentication-options'})).json()).data;
  const verified=await call('/api/auth/passkeys',{action:'authentication-verify',challengeId:auth.challengeId,credential:credential(id)});
  assert.equal(verified.status,200);assert.deepEqual((await verified.json()).data,{authenticated:true,mfaRequired:true});
  assert.ok(verified.headers.getSetCookie().some(c=>c.startsWith('dko-passkey-challenge=')&&c.includes('Max-Age=0')));
  assert.ok(verified.headers.getSetCookie().some(c=>c.startsWith('dko-supabase-auth')&&c.includes('HttpOnly')));
  assert.equal((await call('/api/clients')).status,403);assert.equal((await call('/api/auth/passkeys')).status,403);
  assert.equal((await call('/api/auth/mfa',{action:'verify',factorId:fixture.user.factors[0].id,code:'123456'})).status,200);
  assert.equal((await call('/api/clients')).status,200);
  assert.equal((await call('/api/auth/passkeys',{action:'delete',passkeyId:id})).status,403);
  // Password fallback succeeds, then the last optional passkey can safely be revoked.
  fixture.amr=[{method:'password',timestamp:Math.floor(Date.now()/1000)},{method:'totp',timestamp:Math.floor(Date.now()/1000)}];
  await login();assert.equal((await call('/api/auth/passkeys',{action:'delete',passkeyId:id})).status,200);assert.equal(fixture.user.factors.length,1);
  const next=(await (await call('/api/auth/passkeys',{action:'authentication-options'})).json()).data;
  assert.equal((await call('/api/auth/passkeys',{action:'authentication-verify',challengeId:next.challengeId,credential:credential(id)})).status,400);
  await login();assert.equal((await call('/api/clients')).status,200);
});
test('Office: cookie binding, origin, unknown fields, stale MFA and user ownership fail closed',async t=>{
  const {fixture,call,login,jar}=await setup(t);await login();
  for(const data of [{action:'list',userId:randomUUID()},{action:3}])assert.equal((await call('/api/auth/passkeys',data)).status,400);
  assert.equal((await call('/api/auth/passkeys',{action:'registration-options'},{headers:{Origin:'https://evil.invalid'}})).status,403);
  const start=(await (await call('/api/auth/passkeys',{action:'registration-options'})).json()).data;
  jar.delete('dko-passkey-challenge');assert.equal((await call('/api/auth/passkeys',{action:'registration-verify',challengeId:start.challengeId,credential:credential(randomUUID())})).status,400);
  assert.equal((await call('/api/auth/passkeys',{action:'delete',passkeyId:randomUUID()})).status,404);
  fixture.amr=[{method:'totp',timestamp:Math.floor(Date.now()/1000)-300}];await login();assert.equal((await call('/api/auth/passkeys')).status,403);
  fixture.db.office_memberships[0].status='revoked';assert.equal((await call('/api/auth/passkeys')).status,403);
});
test('Office: production challenge and session cookies are HttpOnly Secure Strict',async t=>{
  const {call,login}=await setup(t,{NODE_ENV:'production'});const signed=await login();
  const options=await call('/api/auth/passkeys',{action:'registration-options'});
  for(const response of [signed,options])assert.ok(response.headers.getSetCookie().every(c=>c.includes('HttpOnly')&&c.includes('Secure')&&c.includes('SameSite=Strict')&&c.includes('Path=/')));
});
test('Office: passkey cannot log into a blocked profile or revoked Office membership',async t=>{
  for(const kind of ['profile','membership']){
    const {fixture,call}=await setup(t);const id=randomUUID();fixture.passkeys.push({id});
    if(kind==='profile')fixture.db.profiles[0].account_status='blocked';else fixture.db.office_memberships[0].status='revoked';
    const auth=(await (await call('/api/auth/passkeys',{action:'authentication-options'})).json()).data;
    const denied=await call('/api/auth/passkeys',{action:'authentication-verify',challengeId:auth.challengeId,credential:credential(id)});
    assert.equal(denied.status,401);assert.equal(fixture.sessions.size,0);
    assert.equal((await call('/api/clients')).status,401);
  }
});
test('Office: disabled feature fails safely without calling passkey provider',async t=>{
  const {fixture,call}=await setup(t,{PASSKEYS_ENABLED:'false'});
  const response=await call('/api/auth/passkeys',{action:'authentication-options'});
  assert.equal(response.status,503);assert.equal((await response.json()).error.code,'PASSKEY_DISABLED');assert.equal(fixture.challenges.size,0);
});
