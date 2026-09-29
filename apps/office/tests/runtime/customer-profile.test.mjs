import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {supabaseFixture} from '../helpers/supabase-fixture.mjs';

test('actual workerd: profile auth, read, mutation, concurrency response and origin protection',async()=>{
 const fixture=supabaseFixture(),origin='https://office.testadmin.nl';fixture.db.roles[0].code='admin';let last;
 fixture.rpc=async(name,args)=>{last={name,args};return Response.json(name==='office_address_lookup_allow'?true:{version:1});};
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../../worker-build/worker.js',import.meta.url)),compatibilityDate:'2026-09-27',compatibilityFlags:['nodejs_compat'],bindings:{OFFICE_ORIGIN:origin,SUPABASE_URL:'https://office-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},outboundService:async request=>new URL(request.url).host==='api.pdok.nl'?Response.json({response:{numFound:1,docs:[{postcode:'3526KP',huisnummer:93,straatnaam:'Europalaan',woonplaatsnaam:'Utrecht',nummeraanduiding_id:'0344200000128086'}]}}):fixture.fetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),...(request.method==='POST'?{body:await request.text()}:{})})}));
 try{
  const base=origin+'/api/relationships/'+fixture.db.customer_relationships[0].id+'/organizations/'+fixture.db.organizations[0].id+'/profile';
  assert.equal((await runtime.dispatchFetch(base)).status,401);
  const login=await runtime.dispatchFetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:fixture.user.email,password:fixture.password})});assert.equal(login.status,200);
  const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),headers={Origin:origin,Cookie:cookie,'Content-Type':'application/json'};
  const read=await runtime.dispatchFetch(base,{headers});assert.equal(read.status,200);assert.match(read.headers.get('Cache-Control'),/no-store/);assert.equal(last.name,'office_customer_profile_read');
  const input={version:0,fields:{vat_id:'001234567B01'}};
  assert.equal((await runtime.dispatchFetch(base+'/fiscal',{method:'PATCH',headers,body:JSON.stringify(input)})).status,200);assert.equal(last.name,'office_customer_profile_write');assert.equal(last.args.p_input.vat_id,input.fields.vat_id);
  const address=await runtime.dispatchFetch(origin+'/api/addresses/lookup?postcode=3526kp&houseNumber=93',{headers});assert.equal(address.status,200);assert.equal((await address.json()).data.results[0].city,'Utrecht');
  fixture.rpc=async()=>Response.json({code:'40001',message:'PRIVATE DETAIL'},{status:400});
  const conflict=await runtime.dispatchFetch(base+'/fiscal',{method:'PATCH',headers,body:JSON.stringify(input)});assert.equal(conflict.status,409);assert.doesNotMatch(await conflict.text(),/PRIVATE DETAIL/);
  assert.equal((await runtime.dispatchFetch(base+'/fiscal',{method:'PATCH',headers:{...headers,Origin:'https://evil.invalid'},body:JSON.stringify(input)})).status,403);
 }finally{await runtime.dispose();}
});
