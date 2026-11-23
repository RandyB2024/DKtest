// BESTEMD boekhouding: protected Office proxy to read-only Supabase Edge Function.
// No external API credentials, accounting writes or browser-side tokens.
import {OfficeError} from './auth/supabase.mjs';

export async function accountingOverviewRoute(req,url,client,config,fetchImpl=fetch) {
  if(url.pathname!=='/api/accounting/eboekhouden')return null;
  if(req.method!=='GET')throw new OfficeError(405,'METHOD_NOT_ALLOWED','Alleen inzage is toegestaan.');
  const orgId='d892a106-aea7-4de6-bf33-a300abece380';
  const check=url.searchParams.get('check')==='1';
  const {data,error}=await client.auth.getSession();
  if(error||!data.session?.access_token)throw new OfficeError(401,'AUTH_REQUIRED','Log opnieuw in bij BESTEMD Office.');
  let upstream;
  try {
    upstream=await fetchImpl(config.supabaseUrl+'/functions/v1/bestemd-accounting-office-overview',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+data.session.access_token,
        'apikey':config.supabaseKey
      },
      body:JSON.stringify({action:check?'check':'overview',organization_id:orgId}),
      signal:AbortSignal.timeout(check?45000:15000),
      cache:'no-store'
    });
  }catch {
    throw new OfficeError(503,'ACCOUNTING_UNAVAILABLE','e-Boekhouden is tijdelijk niet bereikbaar.');
  }
  if(upstream.status===401||upstream.status===403)
    throw new OfficeError(403,'MFA_REQUIRED','Bevestig je Office-toegang opnieuw met Authenticator.');
  if(!upstream.ok)throw new OfficeError(503,'ACCOUNTING_UNAVAILABLE','De grootboekgegevens zijn tijdelijk niet beschikbaar.');
  const payload=await upstream.json().catch(()=>null);
  if(!payload||!Array.isArray(payload.accounts)||payload.organization_id!==orgId)
    throw new OfficeError(503,'ACCOUNTING_INVALID_RESPONSE','De grootboekgegevens hebben een ongeldig formaat.');
  return {status:200,data:payload};
}
