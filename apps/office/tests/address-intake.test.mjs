import test from 'node:test';import assert from 'node:assert/strict';
import {addressConfig,addressInput,lookupAddress,clearAddressCache,PDOK_BASE} from '../src/addresses.mjs';
import {validateProfile} from '../public/profile-fields.js';
const input=addressInput(new URLSearchParams({postcode:'3526 kp',houseNumber:'93'}));
const doc={postcode:'3526KP',huisnummer:93,straatnaam:'Europalaan',woonplaatsnaam:'Utrecht',gemeentenaam:'Utrecht',nummeraanduiding_id:'0344200000128086'};
const response=(docs=[doc])=>Response.json({response:{numFound:docs.length,docs}});
test('address normalization and closed provider/query configuration',()=>{
 for(const postcode of ['3526KP','3526 kp','3526 KP'])assert.deepEqual(addressInput(new URLSearchParams({postcode,houseNumber:'93'})),input);
 for(const q of ['postcode=3526KP&houseNumber=0','postcode=0000AA&houseNumber=1','postcode=3526KP&houseNumber=1.2','postcode=3526KP&houseNumber=1&addition=A%22%20OR%20*','postcode=3526KP&houseNumber=1&url=http://localhost','postcode=3526KP&postcode=3526KP&houseNumber=1'])assert.throws(()=>addressInput(new URLSearchParams(q)));
 for(const base of ['http://api.pdok.nl/bzk/locatieserver/search/v3_1',PDOK_BASE+'/',PDOK_BASE+'?x=1','https://api.pdok.nl.evil.invalid','http://169.254.169.254','https://user:pass@api.pdok.nl'])assert.throws(()=>addressConfig({PDOK_API_BASE_URL:base}));
});
test('address results, additions, ambiguity, no result and bounded public cache',async()=>{
 clearAddressCache();let calls=0;const fetch=async(url,init)=>{calls++;assert.equal(new URL(url).host,'api.pdok.nl');assert.equal(new URL(url).pathname,'/bzk/locatieserver/search/v3_1/free');assert.equal(init.redirect,'manual');return response();};
 const result=await lookupAddress(input,{base:PDOK_BASE},fetch);assert.equal(result.results[0].street,'Europalaan');assert.equal(Object.hasOwn(result.results[0],'raw'),false);await lookupAddress(input,{base:PDOK_BASE},fetch);assert.equal(calls,1);
 clearAddressCache();const plus=await lookupAddress({...input,addition:'A BS'},{base:PDOK_BASE},async()=>response([{...doc,huisletter:'A',huisnummertoevoeging:'BS'}]));assert.equal(plus.results[0].addition,'A-BS');
 clearAddressCache();assert.equal((await lookupAddress(input,{base:PDOK_BASE},async()=>response([doc,{...doc,huisletter:'A'}]))).results.length,2);
 clearAddressCache();assert.equal((await lookupAddress(input,{base:PDOK_BASE},async()=>response([]))).results.length,0);
});
test('address fail-closed: timeout, malformed, oversized, redirects, unexpected address',async()=>{
 for(const make of [()=>new Response('secret-provider-body'),()=>new Response('x'.repeat(65537)),()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1'}}),()=>response([{...doc,postcode:'9999ZZ'}]),()=>Response.json({response:{numFound:51,docs:[]}})]){clearAddressCache();await assert.rejects(lookupAddress(input,{base:PDOK_BASE},async()=>make()),e=>e.code==='ADDRESS_UNAVAILABLE'&&!e.message.includes('secret-provider'));}
 clearAddressCache();await assert.rejects(lookupAddress(input,{base:PDOK_BASE},()=>new Promise(()=>{}),{timeoutMs:5}),e=>e.code==='ADDRESS_TIMEOUT');
});
test('shared intake validator: foreign address, conditionals, KOR separate from profit tax',()=>{
 assert.equal(validateProfile('company',{visit_country:'NL',visit_postcode:'3526 kp',visit_house_number:'93'}).visit_postcode,'3526KP');
 assert.equal(validateProfile('company',{visit_country:'GB',visit_postcode:'SW1A 1AA',visit_house_number:'10A'}).visit_house_number,'10A');
 assert.throws(()=>validateProfile('company',{visit_country:'NL',visit_house_number:'-1'}));assert.throws(()=>validateProfile('company',{visit_bag_id:'invalid'}));
 assert.deepEqual(validateProfile('administration',{vehicles:false}),{vehicles:false,vehicle_count:null,vehicle_use:null,vehicle_notes:null});
 assert.throws(()=>validateProfile('administration',{vehicles:false,vehicle_count:2}));assert.throws(()=>validateProfile('administration',{klaas_vis:'policy-123'}));
 const fiscal=validateProfile('fiscal',{vat_status:'kor',income_tax:'corporate_tax',income_tax_confirm:true});assert.equal(fiscal.income_tax,'corporate_tax');assert.equal(fiscal.vat_status,'kor');
});
import {createWorker} from '../src/worker.mjs';
import {supabaseFixture} from './helpers/supabase-fixture.mjs';
test('address HTTP gate: fresh MFA, role, throttle, safe response and no provider calls before authorization',async()=>{
 clearAddressCache();const fixture=supabaseFixture();fixture.db.roles[0].code='owner';let allowed=true,calls=0;fixture.rpc=async name=>{assert.equal(name,'office_address_lookup_allow');return Response.json(allowed);};
 const worker=createWorker((url,init)=>new URL(url).host==='api.pdok.nl'?(calls++,Promise.resolve(response())):fixture.fetch(url,init));const origin='https://office.testadmin.nl',env={OFFICE_ORIGIN:origin,SUPABASE_URL:'https://office-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};let cookie='';
 const call=async(path,body)=>{const r=await worker.fetch(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');return r;};
 const login=async()=>{cookie='';await call('/api/auth/login',{email:fixture.user.email,password:fixture.password});};const path='/api/addresses/lookup?postcode=3526KP&houseNumber=93';assert.equal((await call(path)).status,401);assert.equal(calls,0);await login();let r=await call(path);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal((await r.json()).data.results[0].city,'Utrecht');
 for(const code of ['accountant','handler','viewer']){fixture.db.roles[0].code=code;assert.equal((await call(path)).status,403);}assert.equal(calls,1);
 fixture.db.roles[0].code='admin';allowed=false;assert.equal((await call(path)).status,429);allowed=true;
 for(const claims of [{aal:'aal1',amr:fixture.amr},{aal:'aal2',amr:[]},{aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-86400}]},{aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)+1000}]}]){Object.assign(fixture,claims);await login();assert.equal((await call(path)).status,403);}assert.equal(calls,1);
});
