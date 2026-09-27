import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {supabaseFixture} from '../../office/tests/helpers/supabase-fixture.mjs';
import {addPasskeys,credential} from '../../office/tests/helpers/passkey-fixture.mjs';
import {POST as login} from '../app/api/auth/login/route.ts';
import {POST as logout} from '../app/api/auth/logout/route.ts';
import {POST as passkey,GET as list} from '../app/api/auth/passkeys/route.ts';
import {POST as mfa} from '../app/api/auth/mfa/route.ts';
import {GET as context} from '../app/api/context/route.ts';

function setup(t){
  const previousFetch=globalThis.fetch,previous={};
  for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:'https://office-fixture.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',PASSKEYS_ENABLED:'true',PASSKEY_ORIGIN:'https://portal.testadmin.nl'})){previous[key]=process.env[key];process.env[key]=value;}
  t.after(()=>{globalThis.fetch=previousFetch;for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const fixture=addPasskeys(supabaseFixture());fixture.portal=true;fixture.db.roles[0].scope='customer';
  fixture.db.organization_memberships=[{user_id:fixture.user.id,organization_id:fixture.db.organizations[0].id,role_id:fixture.db.roles[0].id,status:'active',valid_from:'2020-01-01',valid_until:null}];
  globalThis.fetch=fixture.fetch;const jar=new Map();
  async function call(handler,input,headers={}){
    const response=await handler(new Request('https://portal.testadmin.nl/api/auth/passkeys',{method:input===undefined?'GET':'POST',headers:{origin:'https://portal.testadmin.nl','content-type':'application/json',cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...headers},...(input===undefined?{}:{body:JSON.stringify(input)})}));
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],split=pair.indexOf('=');if(/max-age=0/i.test(cookie))jar.delete(pair.slice(0,split));else jar.set(pair.slice(0,split),pair.slice(split+1));}
    return response;
  }
  const signIn=()=>call(login,{email:fixture.user.email,password:fixture.password});
  return {fixture,jar,call,signIn};
}
test('portal SDK: register/list, optional passkey login needs TOTP, revoke while preserving fallback',async t=>{
  const {fixture,jar,call,signIn}=setup(t);assert.equal((await signIn()).status,200);
  const start=await call(passkey,{action:'registration-options'});assert.equal(start.status,200);
  assert.ok(start.headers.getSetCookie().some(c=>c.startsWith('mdk-passkey-challenge=')&&c.includes('HttpOnly')&&c.includes('SameSite=Strict')&&!c.includes('86400')));
  const {challengeId}=await start.json();
  assert.equal((await call(passkey,{action:'registration-verify',challengeId,credential:credential(randomUUID())})).status,200);
  const keys=(await (await call(list)).json()).passkeys;assert.equal(keys.length,1);
  await call(logout,{});jar.clear();assert.equal((await call(context)).status,401);
  const auth=await (await call(passkey,{action:'authentication-options'})).json();
  const verified=await call(passkey,{action:'authentication-verify',challengeId:auth.challengeId,credential:credential(keys[0].id)});
  assert.equal(verified.status,200);assert.deepEqual(await verified.json(),{authenticated:true,mfaRequired:true});
  assert.ok(verified.headers.getSetCookie().some(c=>c.startsWith('mdk-passkey-challenge=')&&c.includes('Max-Age=0')));
  assert.deepEqual(await (await call(context)).json(),{mfaRequired:true,code:'MFA_REQUIRED'});
  assert.equal((await call(list)).status,403);
  assert.equal((await call(mfa,{action:'verify',factorId:fixture.user.factors[0].id,code:'123456'})).status,200);
  assert.equal((await (await call(context)).json()).organizations.length,1);
  assert.equal((await call(passkey,{action:'delete',passkeyId:keys[0].id})).status,403);
  fixture.amr=[{method:'password',timestamp:Math.floor(Date.now()/1000)},{method:'totp',timestamp:Math.floor(Date.now()/1000)}];
  await signIn();assert.equal((await call(passkey,{action:'delete',passkeyId:keys[0].id})).status,200);assert.equal(fixture.user.factors.length,1);
  const retry=await (await call(passkey,{action:'authentication-options'})).json();assert.equal((await call(passkey,{action:'authentication-verify',challengeId:retry.challengeId,credential:credential(keys[0].id)})).status,400);
  assert.equal((await signIn()).status,200);
});
test('portal SDK: origin, session, scope, cookie binding, ownership and recent MFA fail closed',async t=>{
  const {fixture,jar,call,signIn}=setup(t);
  assert.equal((await call(list)).status,401);
  assert.equal((await call(passkey,{action:'authentication-options'},{origin:'https://evil.invalid'})).status,403);
  await signIn();assert.equal((await call(passkey,{action:'list',userId:randomUUID()})).status,400);
  assert.equal((await call(passkey,{action:'delete',passkeyId:randomUUID()})).status,404);
  const auth=await (await call(passkey,{action:'registration-options'})).json();jar.delete('mdk-passkey-challenge');
  assert.equal((await call(passkey,{action:'registration-verify',challengeId:auth.challengeId,credential:credential(randomUUID())})).status,400);
  fixture.amr=[{method:'totp',timestamp:Math.floor(Date.now()/1000)-300}];await signIn();assert.equal((await call(list)).status,403);
  fixture.db.roles[0].scope='office';assert.equal((await call(list)).status,403);
});
test('portal SDK: passkey login cannot admit a revoked customer membership',async t=>{
  const {fixture,call}=setup(t);const id=randomUUID();fixture.passkeys.push({id});fixture.db.organization_memberships[0].status='revoked';
  const auth=await (await call(passkey,{action:'authentication-options'})).json();
  const denied=await call(passkey,{action:'authentication-verify',challengeId:auth.challengeId,credential:credential(id)});
  assert.equal(denied.status,401);assert.equal(fixture.sessions.size,0);assert.equal((await call(context)).status,401);
});
