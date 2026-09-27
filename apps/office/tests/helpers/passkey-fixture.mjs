import {randomUUID} from 'node:crypto';
// Synthetic Auth transport only. No WebAuthn cryptography is simulated as real verification.
export function addPasskeys(state) {
  state.passkeys=[];state.challenges=new Map();
  state.passkeyRequest=async({url,method,body,headers,session})=>{
    const json=(data,status=200)=>Response.json(data,{status});
    const authentication=url.pathname.includes('/authentication/');
    const token=headers.get('authorization')?.replace(/^Bearer /,'');
    if(!authentication&&!state.sessions.has(token))return json({message:'denied'},401);
    if(url.pathname.endsWith('/options')){
      const id=randomUUID();state.challenges.set(id,authentication?'authentication':'registration');
      return json({challenge_id:id,expires_at:Math.floor(Date.now()/1000)+300,options:{challenge:'AQID',...(authentication?{rpId:'testadmin.nl'}:{rp:{id:'testadmin.nl',name:'Test'},user:{id:'AQID',name:state.user.email,displayName:'Test'},pubKeyCredParams:[{type:'public-key',alg:-7}]})}});
    }
    if(url.pathname.endsWith('/verify')){
      const purpose=state.challenges.get(body.challenge_id);state.challenges.delete(body.challenge_id);
      if(purpose!==(authentication?'authentication':'registration')||body.credential?.response?.clientDataJSON!=='AQID')return json({message:'invalid'},400);
      if(authentication){if(!state.passkeys.some(k=>k.id===body.credential.id))return json({message:'revoked'},400);return json(session('aal1',[{method:'passkey',timestamp:Math.floor(Date.now()/1000)}]));}
      const key={id:randomUUID(),friendly_name:'Fixture',created_at:new Date().toISOString()};state.passkeys.push(key);return json(key);
    }
    if(method==='GET')return json(state.passkeys);
    if(method==='DELETE'){
      const id=url.pathname.split('/').pop();if(!state.passkeys.some(k=>k.id===id))return json({message:'missing'},404);
      state.passkeys=state.passkeys.filter(k=>k.id!==id);return new Response(null,{status:204});
    }
    throw new Error('Unexpected synthetic passkey request');
  };
  state.user.factors=[{id:randomUUID(),factor_type:'totp',status:'verified',friendly_name:'Authenticator'}];
  state.amr=[{method:'password',timestamp:Math.floor(Date.now()/1000)},{method:'totp',timestamp:Math.floor(Date.now()/1000)}];
  return state;
}
export const credential=id=>({id,rawId:'AQID',type:'public-key',response:{clientDataJSON:'AQID',attestationObject:'AQID',authenticatorData:'AQID',signature:'AQID',userHandle:null},clientExtensionResults:{}});
