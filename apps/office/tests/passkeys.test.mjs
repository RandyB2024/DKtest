import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {passkeyAction,passkeyConfig} from '../../shared/passkeys.mjs';
import {runPasskey} from '../public/passkeys.js';
import {readFileSync} from 'node:fs';

function setup(){
  const id=randomUUID(),key=randomUUID(),challenge=randomUUID(),now=Math.floor(Date.now()/1000);let cookie;
  const state={claims:{sub:id,aal:'aal2',amr:[{method:'totp',timestamp:now},{method:'password',timestamp:now}]},factors:{totp:[{status:'verified'}],all:[{factor_type:'totp',status:'verified'}]},deleted:0,registered:0,verified:0};
  const ok=data=>({data,error:null});
  const client={auth:{getClaims:async()=>ok({claims:state.claims}),signOut:async()=>{},mfa:{listFactors:async()=>ok(state.factors)},passkey:{
    list:async()=>ok([{id:key,friendly_name:'Personal',created_at:'2026-01-01',private_field:'never return'}]),
    delete:async()=>{state.deleted++;return ok(null);},
    startRegistration:async()=>ok({challenge_id:challenge,expires_at:now+300,options:{rp:{id:'testadmin.nl'}}}),
    startAuthentication:async()=>ok({challenge_id:challenge,expires_at:now+300,options:{rpId:'testadmin.nl'}}),
    verifyRegistration:async()=>{state.registered++;return ok({id:key});},verifyAuthentication:async()=>{state.verified++;return ok({session:'never return'});},
  }}};
  const action=input=>passkeyAction({client,config:passkeyConfig({PASSKEYS_ENABLED:'true',PASSKEY_ORIGIN:'https://testadmin.nl'}),origin:'https://testadmin.nl',input,identity:async()=>({id,aal2:true}),getChallenge:()=>cookie,setChallenge:v=>{cookie=v;}});
  return {state,action,client,id,key};
}
test('passkey configuration is opt-in, exact HTTPS testadmin.nl origin, invalid values fail closed',()=>{
  assert.equal(passkeyConfig({}).enabled,false);
  for(const env of [{PASSKEYS_ENABLED:'yes'},{PASSKEYS_ENABLED:'true'},{PASSKEY_RP_ID:'evil.invalid'},{PASSKEYS_ENABLED:'true',PASSKEY_ORIGIN:'http://testadmin.nl'},{PASSKEYS_ENABLED:'true',PASSKEY_ORIGIN:'https://testadmin.nl.evil.invalid'},{PASSKEYS_ENABLED:'true',PASSKEY_ORIGIN:'https://testadmin.nl/path'}])assert.throws(()=>passkeyConfig(env));
});
test('management rejects AAL1, missing/malformed/old/future TOTP, wrong subject, even valid WebAuthn AAL2',async()=>{
  for(const change of [c=>c.aal='aal1',c=>delete c.amr,c=>c.amr={},c=>c.amr=[{method:'webauthn',timestamp:Math.floor(Date.now()/1000)}],c=>c.amr[0].timestamp-=300,c=>c.amr[0].timestamp+=100,c=>c.amr[0].timestamp='123',c=>c.sub=randomUUID()]){
    const {state,action}=setup();change(state.claims);
    for(const name of ['list','registration-options','delete'])await assert.rejects(action({action:name}),e=>e.code==='RECENT_MFA_REQUIRED');
    assert.equal(state.deleted,0);
  }
});
test('management remains valid at 4:59; projection hides provider private metadata',async()=>{
  const {state,action}=setup();state.claims.amr[0].timestamp-=299;
  const result=await action({action:'list'});assert.equal(result.passkeys.length,1);assert.equal(result.passkeys[0].private_field,undefined);
});
test('last optional passkey only removed with proven recent password and verified TOTP, never an MFA credential',async()=>{
  for(const mutate of [s=>s.claims.amr=s.claims.amr.filter(e=>e.method!=='password'),s=>s.claims.amr[1].timestamp-=300,s=>s.factors.totp=[],s=>s.factors.all.push({factor_type:'webauthn',status:'verified'})]){
    const {state,action,key}=setup();mutate(state);await assert.rejects(action({action:'delete',passkeyId:key}),e=>['KEEP_RECOVERY','PASSWORD_FALLBACK_REQUIRED'].includes(e.code));assert.equal(state.deleted,0);
  }
  const {state,action,key}=setup();await action({action:'delete',passkeyId:key});assert.equal(state.deleted,1);assert.equal(state.factors.totp.length,1);
});
test('a different personal account cannot select or delete another user credential',async()=>{
  const randy=setup(),ed=setup();
  await assert.rejects(ed.action({action:'delete',passkeyId:randy.key}),e=>e.code==='PASSKEY_NOT_FOUND');
  await assert.rejects(ed.action({action:'list',userId:randy.id}),e=>e.code==='INVALID_REQUEST');assert.equal(randy.state.deleted+ed.state.deleted,0);
});
test('registration challenge is consumed, replay/wrong action and missing cookie rejected',async()=>{
  const {action,state}=setup();const started=await action({action:'registration-options'});
  const input={action:'registration-verify',challengeId:started.challengeId,credential:{id:'AQID',rawId:'AQID',type:'public-key',response:{clientDataJSON:'AQID'}}};
  await action(input);assert.equal(state.registered,1);await assert.rejects(action(input),e=>e.code==='CHALLENGE_EXPIRED');
  const a=await action({action:'authentication-options'});await assert.rejects(action({...input,challengeId:a.challengeId}),e=>e.code==='CHALLENGE_EXPIRED');
});
test('provider failures and wrong RP never result in a successful login',async()=>{
  const {client,action}=setup();client.auth.passkey.startAuthentication=async()=>({error:{message:'secret internal error'},data:null});
  await assert.rejects(action({action:'authentication-options'}),e=>e.code==='PASSKEY_FAILED'&&!e.message.includes('secret'));
  client.auth.passkey.startAuthentication=async()=>({data:{challenge_id:randomUUID(),expires_at:Math.floor(Date.now()/1000)+300,options:{rpId:'wrong.invalid'}},error:null});
  await assert.rejects(action({action:'authentication-options'}),e=>e.code==='PASSKEY_CONFIGURATION');
});
test('browser new/lost device, cancel, and unsupported browser keep password/TOTP fallback',async()=>{
  for(const credentials of [null,{get:async()=>null},{get:async()=>{throw new Error('NotAllowedError');}}]){
    let calls=0;const api=async()=>{calls++;return {challengeId:randomUUID(),options:{challenge:'AQID',rpId:'testadmin.nl'}};};
    await assert.rejects(runPasskey('authentication',api,credentials),/wachtwoord en authenticator/);assert.ok(calls<=1,'No successful verification without a credential');
  }
});
test('browser uses native credential serialization, sends no tokens and helper copies stay identical',async()=>{
  const sent=[];const api=async(path,body)=>{sent.push(body);return body.action.endsWith('-options')?{challengeId:randomUUID(),options:{challenge:'AQID',rpId:'testadmin.nl'}}:{mfaRequired:true};};
  const result=await runPasskey('authentication',api,{get:async({publicKey})=>{assert.deepEqual([...publicKey.challenge],[1,2,3]);return {id:'AQID',rawId:new Uint8Array([1,2,3]).buffer,type:'public-key',getClientExtensionResults:()=>({}),response:{clientDataJSON:new Uint8Array([1]),authenticatorData:new Uint8Array([2]),signature:new Uint8Array([3]),userHandle:null}};}});
  assert.equal(result.mfaRequired,true);assert.equal(sent[1].credential.rawId,'AQID');assert.equal(sent[1].access_token,undefined);
  assert.equal(readFileSync(new URL('../public/passkeys.js',import.meta.url),'utf8'),readFileSync(new URL('../../portal/public/passkeys.js',import.meta.url),'utf8'));
});
