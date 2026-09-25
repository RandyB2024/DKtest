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
function routes(fixture) {
  const r=fixture.db.customer_relationships[0].id,o=fixture.db.organizations[0].id;
  return [
    ['/api/relationships','POST',{name:' New ',organization:{name:' First ',registration_number:'12345678'}},'office_create_relationship'],
    [`/api/relationships/${r}`,'PATCH',{name:'Changed',status:'inactive'},'office_update_relationship'],
    [`/api/relationships/${r}/organizations`,'POST',{name:'Second'},'office_create_organization'],
    [`/api/organizations/${o}`,'PATCH',{legal_name:null,registration_number:''},'office_update_organization'],
    [`/api/relationships/${r}/archive`,'POST',{},'office_archive_relationship'],
    [`/api/organizations/${o}/archive`,'POST',{},'office_archive_organization'],
  ];
}
test('owner/admin route all six writes exclusively through explicit RPCs with normalized fields',async t=>{
  const {fixture,call,login}=await setup(t);const calls=[];
  fixture.rpc=(name,body)=>{calls.push({name,body});return Response.json({relationship_id:fixture.db.customer_relationships[0].id});};
  for(const role of ['owner','admin']){
    fixture.db.roles[0].code=role;await login();
    assert.equal((await (await call('/api/auth/status')).json()).data.user.canManageCustomers,true);
    for(const [path,method,input,rpc] of routes(fixture)){
      const response=await call(path,input,{method});assert.equal(response.status,rpc.includes('create')?201:200);
      assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).ok,true);
      assert.equal(calls.at(-1).name,rpc);assert.deepEqual(Object.keys(calls.at(-1).body).sort(),rpc==='office_create_relationship'?['p_input']:['p_id','p_input']);
    }
  }
  assert.equal(calls[0].body.p_input.name,'New');assert.equal(calls[0].body.p_input.organization.name,'First');
  assert.ok(!fixture.calls.some(c=>c.method!=='GET'&&c.path.startsWith('/rest/v1/')&&!c.path.includes('/rpc/')));
});
test('all mutation routes deny reader roles, unauthenticated users, AAL1, customers and revoked identities',async t=>{
  const {fixture,call,login}=await setup(t);let rpcCount=0;fixture.rpc=()=>{rpcCount++;return Response.json({});};
  const matrix=routes(fixture);
  for(const [path,method,input] of matrix)assert.equal((await call(path,input,{method})).status,401);
  for(const code of ['accountant','handler','viewer']){
    fixture.db.roles[0].code=code;await login();
    assert.equal((await (await call('/api/auth/status')).json()).data.user.canManageCustomers,false);
    for(const [path,method,input] of matrix)assert.equal((await call(path,input,{method})).status,403);
  }
  fixture.db.roles[0].code='owner';fixture.aal='aal1';await login();
  for(const [path,method,input] of matrix)assert.equal((await call(path,input,{method})).status,403);
  fixture.aal='aal2';await login();const baseline=structuredClone(fixture.db);
  for(const change of [()=>fixture.db.office_memberships=[],()=>fixture.db.office_memberships[0].status='revoked',()=>fixture.db.profiles[0].account_status='blocked',()=>fixture.db.roles[0].scope='customer']){
    fixture.db=structuredClone(baseline);change();for(const [path,method,input] of matrix)assert.equal((await call(path,input,{method})).status,403);
  }
  assert.equal(rpcCount,0);
});
test('strict API input validation stops malformed IDs, unknown fields, empty patches and invalid business values before RPC',async t=>{
  const {fixture,call,login}=await setup(t);fixture.db.roles[0].code='owner';await login();let calls=0;fixture.rpc=()=>{calls++;return Response.json({});};
  for(const input of [{},{name:''},{name:'  '},{name:'x'.repeat(201)},{name:9},{name:'Good',status:'archived'},{name:'Good',actor_id:randomUUID()},{name:'Good',organization:{name:'Org',registration_number:'12ab5678'}},{name:'Good',organization:{name:'Org',legal_name:'x'.repeat(201)}},{name:'Good',organization:{name:'Org',unexpected:'x'}}])assert.equal((await call('/api/relationships',input)).status,400);
  for(const [path,method] of routes(fixture).slice(1)){
    assert.equal((await call(path.replace(/[0-9a-f-]{36}/,'bad'),{name:'x'},{method})).status,400);
    assert.equal((await call(path,{organization_id:randomUUID()},{method})).status,400);
    assert.equal((await call(path+'?organization_id='+randomUUID(),{},{method})).status,400);
  }
  for(const [path,method] of routes(fixture).filter(r=>r[1]==='PATCH'))assert.equal((await call(path,{},{method})).status,400);
  assert.equal((await call('/api/relationships',{name:'x'.repeat(17000)})).status,413);
  assert.equal(calls,0);
});
test('safe RPC errors never expose database details and no mutation bypasses origin checks',async t=>{
  const {fixture,call,login}=await setup(t);fixture.db.roles[0].code='owner';await login();
  for(const [code,status,expected] of [['42501',403,'WRITE_DENIED'],['22023',400,'INVALID_INPUT'],['22P02',400,'INVALID_INPUT'],['P0002',404,'RECORD_UNAVAILABLE'],['P0001',503,'WRITE_UNAVAILABLE']]){
    fixture.rpc=()=>Response.json({code,message:'INTERNAL PRIVATE DATABASE DETAIL',details:'secret detail'},{status:400});
    for(const [path,method,input] of routes(fixture)){
      const response=await call(path,input,{method});assert.equal(response.status,status);const text=await response.text();assert.doesNotMatch(text,/INTERNAL|PRIVATE|secret detail/);assert.equal(JSON.parse(text).error.code,expected);
    }
  }
  fixture.rpc=()=>{throw new Error('Must not execute');};
  for(const [path,method,input] of routes(fixture))assert.equal((await call(path,input,{method,headers:{Origin:'https://elsewhere.invalid'}})).status,403);
});
test('new UI uses escaped values, exposes no admin credentials and leaves invitations disabled',async()=>{
  const source=await readFile(new URL('../public/supabase-app.js',import.meta.url),'utf8');
  assert.match(source,/invite.disabled=true/);assert.match(source,/Accountuitnodigingen worden in een volgende beveiligde fase toegevoegd/);
  assert.match(source,/await renderRoute\(\)/);assert.match(source,/escapeHtml\(record.name\)/);
  assert.doesNotMatch(source,/service_role|sb_secret_|auth\.admin|localStorage/);
});
