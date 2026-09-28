import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createWorker} from '../src/worker.mjs';
import {supabaseFixture} from './helpers/supabase-fixture.mjs';
import {kvkTransport,basis,search} from './helpers/kvk-fixture.mjs';
const origin='https://office.testadmin.nl';
function setup(){
  const fixture=supabaseFixture(),state={key:randomBytes(24).toString('hex'),calls:[]},kvk=kvkTransport(state);
  fixture.db.roles[0].code='owner';let saved;
  fixture.rpc=async(name,input)=>{assert.equal(name,'office_create_relationship_from_kvk');saved=input;return Response.json({relationship_id:randomUUID(),organization_id:randomUUID()});};
  const env={OFFICE_ORIGIN:origin,SUPABASE_URL:'https://office-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',KVK_API_KEY:state.key,KVK_INTAKE_RPC_KEY:randomBytes(32).toString('hex'),KVK_API_MODE:'test'};
  const worker=createWorker((input,init)=>new URL(input).hostname==='api.kvk.nl'?kvk(input,init):fixture.fetch(input,init));
  let jar='';
  async function call(path,body,headers={}){
    const response=await worker.fetch(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:jar,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
    const cookies=response.headers.getSetCookie();if(cookies.length)jar=cookies.filter(c=>!c.includes('Max-Age=0')).map(c=>c.split(';')[0]).join('; ');
    return response;
  }
  async function login(){const r=await call('/api/auth/login',{email:fixture.user.email,password:fixture.password});assert.equal(r.status,200);}
  return {fixture,state,env,call,login,saved:()=>saved};
}
test('Worker searches number/name/city, previews and REFETCHES authoritative data before RPC',async()=>{
  const {state,env,call,login,saved}=setup();await login();
  for(const path of ['/api/kvk/search?kvkNumber=68750110','/api/kvk/search?name=Fixture&city=Testplaats']){
    const r=await call(path);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const text=await r.text();assert.ok(!text.includes(env.KVK_API_KEY));assert.ok(!text.includes(env.KVK_INTAKE_RPC_KEY));assert.equal(JSON.parse(text).data.results.length,1);
  }
  assert.equal(state.calls[1].searchParams.get('plaats'),'Testplaats');
  const preview=await call('/api/kvk/organizations/68750110');assert.equal(preview.status,200);assert.equal((await preview.json()).data.company.legalName,'Fixture BV');
  state.basis={...basis(),statutaireNaam:'Actuele officiële naam'};
  const created=await call('/api/relationships/from-kvk',{kvkNumber:'68750110',manual:{relationshipName:'Mijn klant',email:'contact@example.invalid'}});
  assert.equal(created.status,201);assert.equal(saved().p_profile.legalName,'Actuele officiële naam');assert.equal(saved().p_manual.email,'contact@example.invalid');assert.equal(saved().p_server_key,env.KVK_INTAKE_RPC_KEY);
  assert.equal(state.calls.filter(u=>u.pathname.includes('basisprofielen')).length,2);
  assert.doesNotMatch(await created.text(),new RegExp(env.KVK_API_KEY+'|'+env.KVK_INTAKE_RPC_KEY));
});
test('Worker invalid, inactive, upstream, missing config and duplicate scenarios are controlled',async()=>{
  const {state,fixture,env,call,login,saved}=setup();await login();
  for(const path of ['/api/kvk/search?kvkNumber=123','/api/kvk/organizations/123','/api/kvk/search?name=x','/api/kvk/search?name=Fixture&page=1000'])assert.equal((await call(path)).status,400);
  assert.equal((await call('/api/kvk/organizations/90004973')).status,503);
  assert.equal((await call('/api/relationships/from-kvk',{kvkNumber:'68750110',manual:{relationshipName:'x'},profile:basis()})).status,400);
  state.basis=basis('96354429');state.search=search('96354429',false);
  const inactive=await call('/api/relationships/from-kvk',{kvkNumber:'96354429',manual:{relationshipName:'x'}});assert.equal(inactive.status,409);assert.equal(saved(),undefined);
  state.basis=basis();state.search=search();fixture.rpc=async()=>Response.json({code:'23505',message:env.KVK_API_KEY},{status:409});
  const duplicate=await call('/api/relationships/from-kvk',{kvkNumber:'68750110',manual:{relationshipName:'x'}});assert.equal(duplicate.status,409);assert.equal((await duplicate.json()).error.code,'DUPLICATE_KVK');
  delete env.KVK_API_KEY;assert.equal((await call('/api/kvk/search?name=Fixture')).status,503);
});
test('Worker requires active Office + fresh TOTP; writing needs owner/admin; origin remains enforced',async()=>{
  const {fixture,state,call,login}=setup();assert.equal((await call('/api/kvk/search?name=Fixture')).status,401);assert.equal(state.calls.length,0);
  fixture.aal='aal1';await login();assert.equal((await call('/api/kvk/search?name=Fixture')).status,403);assert.equal(state.calls.length,0);
  fixture.aal='aal2';fixture.amr=[{method:'totp',timestamp:Math.floor(Date.now()/1000)-86400}];await login();assert.equal((await call('/api/kvk/organizations/68750110')).status,403);
  fixture.amr=[{method:'totp',timestamp:Math.floor(Date.now()/1000)}];await login();
  for(const code of ['viewer','handler','accountant']){fixture.db.roles[0].code=code;assert.equal((await call('/api/kvk/search?name=Fixture')).status,200);assert.equal((await call('/api/relationships/from-kvk',{kvkNumber:'68750110',manual:{relationshipName:'x'}})).status,403);}
  fixture.db.roles[0].code='admin';assert.equal((await call('/api/relationships/from-kvk',{kvkNumber:'68750110',manual:{relationshipName:'x'}},{Origin:'https://evil.invalid'})).status,403);
  fixture.db.office_memberships[0].status='revoked';assert.equal((await call('/api/kvk/search?name=Fixture')).status,403);
  fixture.db.office_memberships[0].status='active';fixture.db.roles[0].scope='customer';assert.equal((await call('/api/kvk/search?name=Fixture')).status,403);
  fixture.db.roles[0].scope='office';fixture.db.profiles[0].account_status='blocked';assert.equal((await call('/api/kvk/search?name=Fixture')).status,403);
});
test('wizard is shipped in Worker assets, uses textContent and sends only number/manual fields',async()=>{
  const js=await readFile(new URL('../public/kvk-intake.js',import.meta.url),'utf8');
  assert.doesNotMatch(js,/innerHTML|localStorage|sessionStorage|apikey|KVK_API_KEY/);
  assert.match(js,/kvkNumber:company.kvkNumber,manual/);assert.match(js,/if\(busy\)return/);
  const built=await readFile(new URL('../worker-public/kvk-intake.js',import.meta.url),'utf8');assert.equal(built,js);
});
