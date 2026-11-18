// BESTEMD workflow 4.0: receipt only, never an onboarding invitation.
const escapeHtml=value=>String(value||'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
export async function sendProspectReceipt({config,fetchImpl,applicationId,email,customerName}){
 if(!config?.resendApiKey||typeof fetchImpl!=='function')return false;
 if(typeof applicationId!=='string'||!/^[0-9a-f-]{36}$/i.test(applicationId))return false;
 if(typeof email!=='string'||!email.includes('@'))return false;
 const firstName=String(customerName||'ondernemer').trim().split(/\s+/)[0].slice(0,80);
 const html='<p>Beste '+escapeHtml(firstName)+',</p>'+
  '<p>Bedankt voor jouw aanmelding bij BESTEMD. We hebben je aanvraag ontvangen.</p>'+
  '<p>Randy of Ed neemt contact met je op om een kort kennismakingsgesprek te plannen.</p>'+
  '<p>Na het gesprek bekijken we samen de mogelijke vervolgstappen. Je hoeft nu nog geen uitgebreide vragenlijst in te vullen.</p>'+
  '<p>Hartelijke groet,<br>BESTEMD B.V.</p>';
 try{
  const response=await fetchImpl('https://api.resend.com/emails',{
   method:'POST',
   headers:{Authorization:'Bearer '+config.resendApiKey,'Content-Type':'application/json',
    'Idempotency-Key':'bestemd-lead-v4-'+applicationId},
   body:JSON.stringify({from:'BESTEMD <info@mijnbestemd.nl>',to:[email],
    subject:'BESTEMD — jouw aanmelding is ontvangen',html})
  });
  return response.ok;
 }catch{return false;}
}
