import test from 'node:test';
import assert from 'node:assert/strict';
import {hasTrustedTotp,validatedTotp,trustedMfaConfig} from '../lib/supabase/trusted-mfa.ts';

const anchor=1800000000;
const claims={aal:'aal2',sub:'user',amr:[{method:'password',timestamp:anchor-100},{method:'totp',timestamp:anchor}]};
test('trusted TOTP is valid now and at 23:59, expires at exactly 24h with no grace',()=>{
  for(const now of [anchor,anchor+86340,anchor+86399.999])assert.equal(hasTrustedTotp(claims,now),true);
  for(const now of [anchor+86400,anchor+86400.001,anchor+90000])assert.equal(hasTrustedTotp(claims,now),false);
});
test('refresh/iat and activity cannot move the anchor; only a new TOTP can',()=>{
  const refreshed={...claims,iat:anchor+86400,amr:[...claims.amr,{method:'token_refresh',timestamp:anchor+86400}]};
  assert.equal(hasTrustedTotp(refreshed,anchor+86400),false);
  assert.equal(hasTrustedTotp({...refreshed,amr:[...refreshed.amr,{method:'totp',timestamp:anchor+86400}]},anchor+86400),true);
});
test('missing, malformed, future, non-TOTP or AAL1 claims fail closed',()=>{
  for(const amr of [undefined,null,{},[],['totp'],[{method:'totp'}],[{method:'totp',timestamp:String(anchor)}],[{method:'totp',timestamp:anchor+.5}],[{method:'totp',timestamp:0}],[{method:'totp',timestamp:anchor+1}],[{method:'totp',timestamp:NaN}],[{method:'phone',timestamp:anchor}],[...claims.amr,null]])assert.equal(hasTrustedTotp({...claims,amr},anchor),false);
  assert.equal(hasTrustedTotp({...claims,aal:'aal1'},anchor),false);
  assert.equal(hasTrustedTotp(null,anchor),false);
});
test('only validated subject-bound claims grant trust',async()=>{
  const fresh={...claims,amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]};
  for(const result of [{data:{claims:fresh},error:new Error('invalid')},{data:{claims:{...fresh,sub:'other'}},error:null},{data:null,error:null}])assert.equal(await validatedTotp({auth:{getClaims:async()=>result}},'user'),false);
  assert.equal(await validatedTotp({auth:{getClaims:async()=>{throw new Error('bad token');}}},'user'),false);
  assert.equal(await validatedTotp({auth:{getClaims:async()=>({data:{claims:fresh},error:null})}},'user'),true);
});
test('configuration is fixed at 86400 and fails closed for every alternative',()=>{
  assert.equal(trustedMfaConfig(undefined),86400);assert.equal(trustedMfaConfig('86400'),86400);
  for(const value of ['', '28800','86401','0','-1','Infinity','NaN','86400.0',' 86400','086400'])assert.throws(()=>trustedMfaConfig(value));
});
