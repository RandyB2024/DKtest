// Browser ceremony only: session tokens never enter this module.
const decode = text => Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
const encode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function credentialJSON(credential) {
  const r=credential.response;
  return {id:credential.id,rawId:encode(credential.rawId),type:credential.type,
    authenticatorAttachment:credential.authenticatorAttachment,
    clientExtensionResults:credential.getClientExtensionResults(),
    response:{clientDataJSON:encode(r.clientDataJSON),
      ...(r.attestationObject ? {attestationObject:encode(r.attestationObject),transports:r.getTransports?.() ?? []} :
        {authenticatorData:encode(r.authenticatorData),signature:encode(r.signature),userHandle:r.userHandle ? encode(r.userHandle) : null})}};
}
export async function runPasskey(kind,api,credentials=globalThis.navigator?.credentials) {
  if(!credentials)throw new Error('Deze browser ondersteunt geen passkeys. Gebruik uw wachtwoord en authenticator.');
  const {challengeId,options}=await api('/api/auth/passkeys',{action:kind+'-options'});
  const publicKey={...options,challenge:decode(options.challenge)};
  for(const field of ['allowCredentials','excludeCredentials'])if(options[field])publicKey[field]=options[field].map(c=>({...c,id:decode(c.id)}));
  if(options.user)publicKey.user={...options.user,id:decode(options.user.id)};
  let credential;
  try {credential=await credentials[kind==='registration'?'create':'get']({publicKey});}
  catch {throw new Error('Passkey geannuleerd of niet beschikbaar. Gebruik uw wachtwoord en authenticator, ook op een nieuw of verloren apparaat.');}
  if(!credential)throw new Error('Geen passkey gevonden. Gebruik uw wachtwoord en authenticator.');
  return api('/api/auth/passkeys',{action:kind+'-verify',challengeId,credential:credentialJSON(credential)});
}
export function mountPasskeySettings(root,api) {
  let disposed=false,pending=false;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const title=el('h2','Persoonlijke passkeys'),notice=el('p','Inloggen met Face ID, Touch ID, Windows Hello of apparaat-PIN. Daarna blijft de authenticator nodig. Passkeys horen bij testadmin.nl; op een later domein kan opnieuw registreren nodig zijn.');
  const recovery=el('p','Apparaat kwijt? Log in met uw wachtwoord en authenticator en verwijder de verloren passkey. Zonder authenticator: neem contact op met uw beheerder; verificatie wordt niet overgeslagen.');
  const status=el('p');status.setAttribute('role','status');
  const list=el('div'),form=el('form'),label=el('label','Authenticatorcode (opnieuw bevestigen voor beheer)'),code=el('input'),select=el('select');
  select.setAttribute('aria-label','Authenticator');code.inputMode='numeric';code.autocomplete='one-time-code';code.pattern='[0-9]{6}';code.maxLength=6;code.required=true;label.append(code);
  const verify=el('button','Beheer ontgrendelen'),register=el('button','Passkey registreren'),reload=el('button','Passkeys laden');
  verify.type='submit';register.type=reload.type='button';register.className=verify.className='btn primary';reload.className='btn';
  form.append(select,label,verify);root.replaceChildren(title,notice,form,register,reload,list,status,recovery,el('p','Verwijderen vereist daarnaast een wachtwoordlogin van minder dan vijf minuten oud. Uw wachtwoord en TOTP blijven behouden.'));
  const busy=value=>{pending=value;root.querySelectorAll('button,input,select').forEach(n=>{n.disabled=value;});};
  async function execute(action){if(pending||disposed)return;busy(true);status.textContent='Bezig…';try{await action();}catch(e){if(!disposed)status.textContent=e.message;}finally{if(!disposed)busy(false);}}
  async function load(){const data=await api('/api/auth/passkeys');if(disposed)return;list.replaceChildren();
    for(const key of data.passkeys){const row=el('p'),remove=el('button','Verwijderen');remove.type='button';
      row.append(el('span',`${key.name} · geregistreerd ${new Date(key.createdAt).toLocaleDateString('nl-NL')} `),remove);list.append(row);
      remove.onclick=()=>{if(!confirm('Deze passkey intrekken? U kunt hiermee daarna niet meer inloggen. Uw wachtwoord en authenticator blijven beschikbaar.'))return;execute(async()=>{await api('/api/auth/passkeys',{action:'delete',passkeyId:key.id});await load();status.textContent='Passkey ingetrokken. Verwijder deze eventueel ook in uw apparaatinstellingen.';});};}
    status.textContent=data.passkeys.length ? 'Persoonlijke passkeys geladen.' : 'Nog geen passkeys geregistreerd.';
  }
  form.onsubmit=e=>{e.preventDefault();execute(async()=>{try{await api('/api/auth/mfa',{action:'verify',factorId:select.value,code:code.value});}finally{code.value='';}await load();});};
  register.onclick=()=>execute(async()=>{await runPasskey('registration',api);await load();status.textContent='Passkey geregistreerd. Bewaar ook uw wachtwoord en authenticator.';});
  reload.onclick=()=>execute(load);
  execute(async()=>{const data=await api('/api/auth/mfa');if(disposed)return;for(const f of data.factors){const option=el('option',f.name);option.value=f.id;select.append(option);}await load();});
  return ()=>{disposed=true;};
}
