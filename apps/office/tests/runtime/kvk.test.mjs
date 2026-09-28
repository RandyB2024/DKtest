import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {supabaseFixture} from '../helpers/supabase-fixture.mjs';
import {kvkTransport} from '../helpers/kvk-fixture.mjs';

test('actual workerd runtime: Supabase cookies, KvK fetch and intake RPC with no live network',async()=>{
  const origin='https://office.testadmin.nl',fixture=supabaseFixture(),state={key:randomBytes(24).toString('hex')},kvk=kvkTransport(state);
  fixture.db.roles[0].code='owner';let writes=0;
  fixture.rpc=async()=>{writes++;return Response.json({relationship_id:randomUUID(),organization_id:randomUUID()});};
  const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../../worker-build/worker.js',import.meta.url)),
    compatibilityDate:'2026-09-27',compatibilityFlags:['nodejs_compat'],
    bindings:{OFFICE_ORIGIN:origin,SUPABASE_URL:'https://office-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',KVK_API_MODE:'test',KVK_API_KEY:state.key,KVK_INTAKE_RPC_KEY:randomBytes(32).toString('hex')},
    outboundService:async request=>{
      const init={method:request.method,headers:Object.fromEntries(request.headers),...(request.method==='POST'?{body:await request.text()}:{})};
      return new URL(request.url).hostname==='api.kvk.nl'?kvk(request.url,init):fixture.fetch(request.url,init);
    },
  }));
  try {
    assert.equal((await runtime.dispatchFetch(origin+'/api/kvk/search?name=Fixture')).status,401);
    const login=await runtime.dispatchFetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:fixture.user.email,password:fixture.password})});
    assert.equal(login.status,200);const cookies=login.headers.getSetCookie();assert.ok(cookies.every(c=>c.includes('HttpOnly')&&c.includes('Secure')&&c.includes('SameSite=Strict')));
    const cookie=cookies.map(c=>c.split(';')[0]).join('; ');
    const preview=await runtime.dispatchFetch(origin+'/api/kvk/organizations/68750110',{headers:{Cookie:cookie}});const previewData=await preview.json();assert.equal(preview.status,200,`${previewData.error?.code}; KvK calls=${state.calls?.length??0}`);assert.equal(previewData.data.company.kvkNumber,'68750110');
    const saved=await runtime.dispatchFetch(origin+'/api/relationships/from-kvk',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({kvkNumber:'68750110',manual:{relationshipName:'Runtime fixture'}})});
    assert.equal(saved.status,201);assert.equal(writes,1);
  } finally {await runtime.dispose();}
});
