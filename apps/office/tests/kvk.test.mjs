import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createKvkClient,kvkConfig,searchInput} from '../src/kvk/client.mjs';
import {normalizeSearch,normalizeBasis} from '../src/kvk/normalize.mjs';
import {manualInput} from '../src/kvk/intake.mjs';
import {basis,search,kvkTransport} from './helpers/kvk-fixture.mjs';
test('bounded exact number / name and city searches; unknown/duplicate fields rejected',()=>{
  assert.equal(searchInput(new URLSearchParams({kvkNumber:'68750110'})).get('kvkNummer'),'68750110');
  const q=searchInput(new URLSearchParams({name:' Fixture ',city:' Testplaats ',page:'2'}));assert.equal(q.get('naam'),'Fixture');assert.equal(q.get('plaats'),'Testplaats');assert.equal(q.get('resultatenPerPagina'),'10');
  for(const q of ['kvkNumber=123','kvkNumber=68750110&name=test','name=a','name=1234567','name=test&page=11','name=test&url=https://evil.invalid','name=test&name=other','name='+('x'.repeat(121)),'name=test&city='+('x'.repeat(81))])assert.throws(()=>searchInput(new URLSearchParams(q)));
});
test('BV 68750110 and sole trader 69599084: limited normalization, no invented contacts',()=>{
  for(const number of ['68750110','69599084']){
    const p=normalizeBasis(basis(number),number,normalizeSearch(search(number)));
    assert.equal(p.kvkNumber,number);assert.equal(p.status,'active');assert.equal(p.mainBranchNumber,'000037178598');assert.equal(p.branchCount,2);assert.equal(p.activities[0].primary,true);
    assert.equal(p.legalName,number==='69599084'?null:'Fixture BV');assert.equal(p.tradeNames.length,2);assert.ok(p.visitAddress);assert.ok(p.postalAddress);
    for(const forbidden of ['rsin','iban','email','phone','contactPerson','owner'])assert.equal(p[forbidden],undefined);
  }
});
test('inactive 96354429 and missing status fail closed; shielded/missing addresses stay missing',()=>{
  const raw=basis('96354429');assert.equal(normalizeBasis(raw,'96354429',normalizeSearch(search('96354429'))).status,'inactive');
  const unknown=basis();unknown._embedded.hoofdvestiging.adressen=[{type:'bezoekadres',indAfgeschermd:'Ja',volledigAdres:'DO-NOT-COPY'}];
  const p=normalizeBasis(unknown,'68750110',{results:[]});assert.equal(p.status,'unknown');assert.deepEqual(p.visitAddress,{shielded:true});assert.equal(p.postalAddress,null);
  assert.throws(()=>normalizeBasis(raw,'68750110',normalizeSearch(search())));
});
test('configuration rejects non-official URLs; missing key, timeout and 90004973 stay generic',async()=>{
  for(const env of [{KVK_API_MODE:'other'},{KVK_API_BASE_URL:'https://evil.invalid'},{KVK_API_MODE:'production',KVK_API_BASE_URL:'https://api.kvk.nl/test/api'}])assert.throws(()=>kvkConfig(env));
  assert.throws(()=>createKvkClient(kvkConfig({})),e=>e.code==='KVK_CONFIGURATION');
  const key=randomBytes(16).toString('hex'),config=kvkConfig({KVK_API_KEY:key}),state={key};
  const client=createKvkClient(config,kvkTransport(state));await client.basis('68750110');assert.equal(state.calls[0].pathname,'/test/api/v1/basisprofielen/68750110');
  await assert.rejects(client.basis('90004973'),e=>e.code==='KVK_UNAVAILABLE'&&!e.message.includes('PRIVATE')&&!e.message.includes(key));
  await assert.rejects(createKvkClient(config,()=>new Promise(()=>{}),5).basis('68750110'),e=>e.code==='KVK_TIMEOUT');
  await assert.rejects(createKvkClient(config,async()=>{throw new Error(key);}).basis('68750110'),e=>!e.message.includes(key));
  let redirects=0;
  await assert.rejects(createKvkClient(config,async(_url,init)=>{redirects++;assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://evil.invalid'}});}).basis('68750110'),e=>e.code==='KVK_UNAVAILABLE');
  assert.equal(redirects,1);
});
test('manual data is bounded and explicit; source fields cannot be mass assigned',()=>{
  assert.deepEqual(manualInput({relationshipName:' Client ',email:''}),{relationshipName:'Client',email:''});
  for(const input of [{},{relationshipName:''},{relationshipName:'Client',kvkNumber:'68750110'},{relationshipName:'Client',iban:3},{relationshipName:'Client',email:'bad'},{relationshipName:'Client',services:'x'.repeat(1001)}])assert.throws(()=>manualInput(input));
});
