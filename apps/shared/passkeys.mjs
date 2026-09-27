// Server-only orchestration. Supabase validates WebAuthn signatures and one-use challenges.
export class PasskeyError extends Error {
  constructor(status,code,message){super(message);this.status=status;this.code=code;}
}
export function passkeyConfig(env) {
  const enabled=env.PASSKEYS_ENABLED ?? 'false';
  if(!['true','false'].includes(enabled)) throw new Error('Ongeldige passkeyconfiguratie.');
  const rpId=env.PASSKEY_RP_ID ?? 'testadmin.nl';
  if(rpId!=='testadmin.nl') throw new Error('Passkeys vereisen RP ID testadmin.nl.');
  const origin=env.PASSKEY_ORIGIN;
  if(enabled==='true'){
    let url;try{url=new URL(origin);}catch{throw new Error('Configureer een exacte HTTPS PASSKEY_ORIGIN.');}
    if(url.origin!==origin||url.protocol!=='https:'||url.port||!(url.hostname===rpId||url.hostname.endsWith('.'+rpId)))throw new Error('Ongeldige PASSKEY_ORIGIN.');
  }
  return {enabled:enabled==='true',rpId,origin};
}
const fail=(status,code,message)=>{throw new PasskeyError(status,code,message);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validInput(input,fields){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k)))fail(400,'INVALID_REQUEST','Ongeldig passkeyverzoek.');
}
async function checked(result){
  const {data,error}=await result;
  if(error)fail(400,'PASSKEY_FAILED','Passkeycontrole niet gelukt. Probeer opnieuw of gebruik uw wachtwoord en authenticator.');
  return data;
}
async function recentClaims(client,userId){
  const {data,error}=await client.auth.getClaims();const c=data?.claims,now=Date.now()/1000;
  if(error||!c||c.sub!==userId||c.aal!=='aal2'||!Array.isArray(c.amr)||!c.amr.length)fail(403,'RECENT_MFA_REQUIRED','Bevestig eerst opnieuw uw authenticatorcode.');
  for(const e of c.amr)if(!e||Array.isArray(e)||typeof e.method!=='string'||!e.method||!Number.isSafeInteger(e.timestamp)||e.timestamp<=0||e.timestamp>now)fail(403,'RECENT_MFA_REQUIRED','Bevestig eerst opnieuw uw authenticatorcode.');
  if(!c.amr.some(e=>e.method==='totp'&&now-e.timestamp<300))fail(403,'RECENT_MFA_REQUIRED','Bevestig eerst opnieuw uw authenticatorcode.');
  return c;
}
export async function passkeyAction({client,config,origin,input,identity,getChallenge,setChallenge}){
  if(!config.enabled)fail(503,'PASSKEY_DISABLED','Passkeys zijn nog niet ingeschakeld. Gebruik uw wachtwoord en authenticator.');
  if(origin!==config.origin)fail(403,'PASSKEY_ORIGIN_DENIED','Passkeys zijn alleen beschikbaar op het ingestelde testadmin.nl-domein.');
  const action=input?.action;
  if(typeof action!=='string')fail(400,'INVALID_REQUEST','Ongeldig passkeyverzoek.');
  validInput(input,['action',...(action?.endsWith('-verify')?['challengeId','credential']:action==='delete'?['passkeyId']:[])]);
  if(!['authentication-options','authentication-verify','registration-options','registration-verify','list','delete'].includes(action))fail(400,'INVALID_REQUEST','Ongeldig passkeyverzoek.');
  const authentication=action.startsWith('authentication-');
  let user,claims;
  if(!authentication){user=await identity();if(!user.aal2)fail(403,'RECENT_MFA_REQUIRED','Bevestig eerst opnieuw uw authenticatorcode.');claims=await recentClaims(client,user.id);}
  if(action.endsWith('-options')){
    const data=await checked(authentication?client.auth.passkey.startAuthentication():client.auth.passkey.startRegistration());
    const rp=authentication?data?.options?.rpId:data?.options?.rp?.id;
    if(rp!==config.rpId||!uuid.test(data?.challenge_id)||!Number.isSafeInteger(data?.expires_at)||data.expires_at<=Date.now()/1000)fail(503,'PASSKEY_CONFIGURATION','Passkeyconfiguratie klopt niet. Gebruik uw wachtwoord en authenticator.');
    const binding=(authentication?'authentication':'registration:'+user.id)+':'+data.challenge_id;
    setChallenge(binding,Math.min(300,Math.floor(data.expires_at-Date.now()/1000)));
    // Require local user verification (biometric OR device PIN), never claim a specific biometric.
    const options=structuredClone(data.options);
    if(authentication)options.userVerification='required';
    else {options.attestation='none';options.authenticatorSelection={...options.authenticatorSelection,userVerification:'required',residentKey:'required'};}
    return {challengeId:data.challenge_id,options};
  }
  if(action.endsWith('-verify')){
    const binding=(authentication?'authentication':'registration:'+user.id)+':'+input.challengeId;
    const expected=getChallenge();setChallenge('',0);
    if(!uuid.test(input.challengeId??'')||!expected||binding!==expected)fail(400,'CHALLENGE_EXPIRED','Deze passkeyaanvraag is verlopen. Begin opnieuw.');
    const credential=input.credential;
    if(!credential||credential.type!=='public-key'||typeof credential.id!=='string'||typeof credential.rawId!=='string'||!credential.response||typeof credential.response.clientDataJSON!=='string')fail(400,'INVALID_REQUEST','Ongeldig passkeyantwoord.');
    // Forward no client-selected user IDs or session tokens. Auth owns verification.
    if(authentication){
      const verified=await checked(client.auth.passkey.verifyAuthentication({challengeId:input.challengeId,credential}));
      if(!verified?.session?.access_token||!uuid.test(verified?.user?.id??''))fail(401,'LOGIN_FAILED','Inloggen met passkey is niet gelukt.');
      try {const identified=await identity();if(identified.id!==verified.user.id)throw new Error();return {authenticated:true,mfaRequired:!identified.aal2};}
      catch {await client.auth.signOut({scope:'local'});fail(401,'LOGIN_FAILED','Dit account heeft geen toegang. Gebruik uw persoonlijke account.');}
    }
    const registered=await checked(client.auth.passkey.verifyRegistration({challengeId:input.challengeId,credential}));
    if(!uuid.test(registered?.id??''))fail(503,'PASSKEY_UNAVAILABLE','Registratie kon niet worden bevestigd. Laad uw passkeys opnieuw.');
    return {registered:true};
  }
  const keys=await checked(client.auth.passkey.list());
  if(!Array.isArray(keys))fail(503,'PASSKEY_UNAVAILABLE','Passkeys kunnen tijdelijk niet worden geladen.');
  if(action==='list')return {passkeys:keys.map(k=>({id:k.id,name:k.friendly_name||'Persoonlijke passkey',createdAt:k.created_at,lastUsedAt:k.last_used_at??null}))};
  if(!uuid.test(input.passkeyId??'')||!keys.some(k=>k.id===input.passkeyId))fail(404,'PASSKEY_NOT_FOUND','Passkey niet beschikbaar.');
  // Never infer a password exists from an email identity or user metadata.
  // A recent signed password AMR entry proves the retained fallback actually worked.
  if(!claims.amr.some(e=>e.method==='password'&&Date.now()/1000-e.timestamp<300))fail(403,'PASSWORD_FALLBACK_REQUIRED','Log opnieuw in met uw wachtwoord en authenticator voordat u een passkey verwijdert.');
  const factors=await checked(client.auth.mfa.listFactors());
  if(!factors?.totp?.some(f=>f.status==='verified')||!Array.isArray(factors.all)||factors.all.some(f=>f.factor_type==='webauthn'))fail(409,'KEEP_RECOVERY','Verwijderen is geblokkeerd om uw werkende inlog- en MFA-methoden te behouden.');
  await checked(client.auth.passkey.delete({passkeyId:input.passkeyId}));
  return {deleted:true};
}
