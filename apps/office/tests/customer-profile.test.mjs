import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {profileSections,validateProfile,validIban,maskIban} from '../public/profile-fields.js';
import {createWorker} from '../src/worker.mjs';
import {supabaseFixture} from './helpers/supabase-fixture.mjs';

test('profile field contract, cautious identifiers, emails, dates, website, IBAN and unknown input',()=>{
 assert.equal(validateProfile('fiscal',{vat_id:'  NL exception 001  '}).vat_id,'NL exception 001');
 assert.equal(validateProfile('contacts',{email:' PERSON@EXAMPLE.INVALID '}).email,'person@example.invalid');
 for(const [section,fields] of [['fiscal',{vat_id:123}],['company',{registration_number:'12345678'}],['contacts',{last_name:''}],['fiscal',{}],['fiscal',{year_start:'2026-02-30'}],['company',{website:'javascript:alert(1)'}],['company',{website:'https://user:password@example.invalid'}],['notes',{body:'x'.repeat(6001)}],['administration',{employees:-1}],['fiscal',{kor:'true'}],['fiscal',{vat_period:'weekly'}]])assert.throws(()=>validateProfile(section,fields));
 for(const good of ['NL91ABNA0417164300','GB82 WEST 1234 5698 7654 32','DE89370400440532013000'])assert.equal(validIban(good),true);
 for(const bad of ['NL90ABNA0417164300','123','GB82!WEST12345698765432'])assert.equal(validIban(bad),false);
 assert.equal(maskIban('NL91ABNA0417164300'),'NL •••• 4300');
 assert.throws(()=>validateProfile('constructor',{name:'x'}));assert.throws(()=>validateProfile('fiscal',{constructor:'x'}));assert.throws(()=>validateProfile('fiscal',JSON.parse('{"__proto__":"x"}')));
 const sql=readFileSync(new URL('../../portal/supabase/migrations/202609280002_address_business_tax_intake.sql',import.meta.url),'utf8');
 const schema=JSON.parse(sql.match(/select '(\{"overview".*)'::jsonb/)[1].replaceAll("''","'"));assert.deepEqual(schema,profileSections);
});

async function setup(){
 const fixture=supabaseFixture();fixture.db.roles[0].code='owner';let last;
 fixture.rpc=async(name,args)=>{last={name,args};return Response.json(name.endsWith('_read')?{sections:{},canWrite:true}:{id:fixture.db.organizations[0].id,version:1});};
 const origin='https://office.testadmin.nl',env={OFFICE_ORIGIN:origin,SUPABASE_URL:'https://office-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},worker=createWorker(fixture.fetch);let cookie='';
 const call=async(path,body,method=body===undefined?'GET':'PATCH',headers={})=>{
  const r=await worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');return r;
 };
 const login=async()=>{cookie='';assert.equal((await call('/api/auth/login',{email:fixture.user.email,password:fixture.password},'POST')).status,200);};await login();
 const base='/api/relationships/'+fixture.db.customer_relationships[0].id+'/organizations/'+fixture.db.organizations[0].id+'/profile';
 return {fixture,call,login,base,last:()=>last};
}
test('Worker API validates UUID, method, page, fields/version, normalizes and uses existing no-store envelope',async()=>{
 const {call,base,last}=await setup();const r=await call(base);assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/no-store/);
 assert.equal((await call(base+'/contacts',{version:0,fields:{last_name:'Test',email:'UPPER@EXAMPLE.INVALID'}},'POST')).status,201);assert.equal(last().args.p_input.email,'upper@example.invalid');
 for(const [path,body,method] of [[base+'/company',{version:0,fields:{registration_number:'12345678'}},'PATCH'],[base+'/fiscal',{fields:{vat_id:'x'}},'PATCH'],[base+'/fiscal',{version:0,fields:{}},'PATCH'],[base+'/notes/no-uuid/archive',{version:0,fields:{}},'POST'],[base+'?page=0',undefined,'GET'],[base+'?page=1&page=2',undefined,'GET'],[base+'?unknown=1',undefined,'GET'],[base+'/company',{version:0,fields:{name:'Test'}},'POST']])assert.equal((await call(path,body,method)).status,400);
 assert.equal((await call(base+'/fiscal',{version:0,fields:{vat_id:'x'}},'PATCH',{Origin:'https://evil.invalid'})).status,403);
});
test('Worker role/MFA gates and safe error mapping never expose provider details',async()=>{
 const {call,base,fixture,login}=await setup();
 for(const code of ['accountant','handler','viewer']){fixture.db.roles[0].code=code;assert.equal((await call(base+'/fiscal',{version:0,fields:{vat_id:'x'}})).status,403);}
 fixture.db.roles[0].code='owner';
 for(const [code,status,expected] of [['40001',409,'VERSION_CONFLICT'],['23505',409,'PROFILE_CONFLICT'],['P0002',404,'RECORD_UNAVAILABLE'],['42501',403,'PROFILE_DENIED'],['22023',400,'INVALID_INPUT'],['XX000',503,'PROFILE_UNAVAILABLE']]){
  fixture.rpc=async()=>Response.json({code,message:'INTERNAL-SECRET',details:'sensitive'},{status:400});const r=await call(base);assert.equal(r.status,status);const text=await r.text();assert.doesNotMatch(text,/INTERNAL-SECRET|sensitive/);assert.equal(JSON.parse(text).error.code,expected);
 }
 for(const claims of [{aal:'aal1',amr:fixture.amr},{aal:'aal2',amr:[]},{aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-86400}]}]){Object.assign(fixture,claims);await login();const r=await call(base);assert.equal(r.status,403);assert.equal((await r.json()).error.code,'MFA_REQUIRED');}
 fixture.aal='aal2';fixture.amr=[{method:'totp',timestamp:Math.floor(Date.now()/1000)}];await login();fixture.db.office_memberships[0].status='revoked';assert.equal((await call(base)).status,403);
});
