import {createClient} from '@supabase/supabase-js';
import {randomBytes,createHash} from 'node:crypto';
import {OfficeError} from './auth/supabase.mjs';
import {WORKFLOW_VERSION,advanceWorkflow,canSendOnboarding,startWorkflow,validateCompanyCount} from './prospect-workflow-v4.mjs';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const validEmail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const stagesWithNoPublicInvite=new Set(['new_request','introduction','financial_documents','financial_review','quote','quote_discussion','agreement']);
function fail(status,code,message){throw new OfficeError(status,code,message);}
function admin(config,fetchImpl){
 if(!config.supabaseUrl||!config.supabaseServiceRoleKey)fail(503,'WORKFLOW_CONFIG','Klanttraject is niet ingericht.');
 return createClient(config.supabaseUrl,config.supabaseServiceRoleKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetchImpl}});
}
function text(value,max=1500){return typeof value==='string'?value.trim().slice(0,max):'';}
function ensure(condition,code,message){if(!condition)fail(409,code,message);}
const digest=s=>createHash('sha256').update(s).digest('hex');
function encode(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));}
function publicWorkflow(w){return {version:w.version,stage:w.stage,history:w.history,evidence:w.evidence,quote:w.quote||[],activities:w.activities||[],notes:w.notes||'',responsibleEmployeeId:w.responsibleEmployeeId||null};}
function nextWorkflow(w,to,{actorId,notes='',evidence={}}){
 try{return advanceWorkflow(w,to,{actorId,notes,evidence});}
 catch(error){fail(409,'INVALID_WORKFLOW_TRANSITION',error.message);}
}
function quoteLine(item,company){
 const price=Number(item.monthlyPriceExVat);
 const oneOff=Number(item.oneTimePriceExVat??0);
 if(!Number.isFinite(price)||price<0||price>100000||!Number.isFinite(oneOff)||oneOff<0||oneOff>100000)
  fail(400,'INVALID_QUOTE','Controleer de prijsafspraken.');
 const service=text(item.service,1500);
 if(!service)fail(400,'INVALID_QUOTE','Beschrijf de dienstverlening.');
 return {position:company.position,companyName:text(company.company_data?.companyName||company.company_data?.name,200),service,
  monthlyPriceExVat:Math.round(price*100)/100,oneTimePriceExVat:Math.round(oneOff*100)/100,
  notes:text(item.notes,1000)};
}
export async function officeProspectWorkflowRoute(req,url,client,user,config,fetchImpl,readBody){
 if(url.pathname!=='/api/office/prospect-workflow')return null;
 if(!['GET','POST'].includes(req.method))fail(405,'METHOD_NOT_ALLOWED','Methode niet toegestaan.');
 if(!user?.canManageCustomers||!user?.aal2)fail(403,'WORKFLOW_DENIED','Geen toegang tot klanttrajecten.');
 const input=req.method==='POST'?await readBody(req):{};
 const id=req.method==='GET'?url.searchParams.get('applicationId'):input?.applicationId;
 if(typeof id!=='string'||!uuid.test(id))fail(400,'INVALID_APPLICATION','Ongeldig aanvraagnummer.');
 const supa=admin(config,fetchImpl);
 const lookup=await supa.from('office_onboarding_applications').select('id,status,applicant_data,customer_relationship_id,updated_at,submitted_at').eq('id',id).maybeSingle();
 if(lookup.error)fail(503,'WORKFLOW_UNAVAILABLE','Aanvraag kon niet worden geladen.');
 if(!lookup.data)fail(404,'APPLICATION_NOT_FOUND','Aanvraag niet gevonden.');
 const app=lookup.data;
 const data=app.applicant_data||{};
 let workflow=data.workflowV4;
 const companiesResult=await supa.from('office_onboarding_companies').select('position,company_data').eq('application_id',id).order('position').limit(6);
 if(companiesResult.error)fail(503,'COMPANIES_UNAVAILABLE','Ondernemingen konden niet worden geladen.');
 const companies=companiesResult.data||[];
 if(req.method==='GET'){
  const documentsResult=await supa.from('office_prospect_documents')
    .select('id,filename,company_position,created_at')
    .eq('application_id',id).order('created_at',{ascending:false}).limit(100);
  if(documentsResult.error)fail(503,'DOCUMENTS_UNAVAILABLE','Documentenoverzicht kon niet worden geladen.');
  const documents=documentsResult.data||[];
  const categoryOf=d=>String(d.filename||'').split(' - ')[0].trim();
  const personalCategories=new Set(['Aangifte inkomstenbelasting','Identiteitsbewijs ondernemer']);
  const personalDocs=documents.filter(d=>personalCategories.has(categoryOf(d)));
  const companyRows=companies.map(c=>{
   const received=documents.filter(d=>Number(d.company_position)===c.position&&!personalCategories.has(categoryOf(d)));
   const entity=String(c.company_data?.entityType||c.company_data?.legalForm||'').toLowerCase();
   const needsVat=c.company_data?.vatRequired==='yes';
   const required=['KvK-uittreksel','Jaarrekening','Kolommenbalans',...(needsVat?['Btw-aangifte']:[])];
   const present=new Set(received.map(categoryOf));
   const financial=c.company_data?.financialOnboarding||{};
   const administrative=c.company_data?.administrativeOnboarding||{};
   return {position:c.position,name:c.company_data?.companyName||c.company_data?.name||'Onderneming',
     entityType:entity,documents:received,
     missingDocuments:required.filter(category=>!present.has(category)),
     financialAnswered:['cashBookkeeping','cashTransactions'].every(key=>['yes','no'].includes(financial[key])),
     administrationAnswered:['vatRequired','iban'].every(key=>!!administrative[key])&&
       (administrative.vatRequired!=='yes'||!!administrative.vatFrequency)};
  });
  return {status:200,data:{applicationId:id,applicationStatus:app.status,relationshipId:app.customer_relationship_id,
   legacy:workflow?.version!==WORKFLOW_VERSION,workflow:workflow?.version===WORKFLOW_VERSION?publicWorkflow(workflow):null,
   companies:companyRows,personalDocuments:personalDocs,
   // ID evidence is assessed separately; storing a full copy is not assumed lawful.
   personalDocumentsPendingReview:true}};
 }
 ensure(workflow?.version===WORKFLOW_VERSION,'LEGACY_READ_ONLY','Bestaande oude aanvraag wordt niet automatisch gewijzigd.');
 ensure(['draft','invited','in_progress','submitted','under_review'].includes(app.status),'WORKFLOW_CLOSED','Gesloten aanvragen kunnen niet worden gewijzigd.');
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'INVALID_INPUT','Ongeldige aanvraag.');
 const action=input.action;
 const at=new Date().toISOString();
 let responseExtra={};
 if(action==='record_meeting'){
  const kind=text(input.kind,30);
  const allowed={introduction:['introduction'],quote:['quote_discussion'],intake:['intake'],instruction:['instruction']};
  ensure(!!allowed[kind]&&allowed[kind].includes(workflow.stage),
    'WRONG_MEETING_STAGE','Dit gesprek hoort niet bij de huidige trajectfase.');
  const when=text(input.scheduledAt,50);
  const parsed=Date.parse(when);
  if(!when||!Number.isFinite(parsed)||!/^\d{4}-\d{2}-\d{2}T/.test(when))
    fail(400,'INVALID_MEETING_TIME','Gebruik een volledige datum en tijd voor de afspraak.');
  const status=text(input.meetingStatus,20);
  if(!['scheduled','completed','cancelled'].includes(status))
    fail(400,'INVALID_MEETING_STATUS','Ongeldige afspraakstatus.');
  const note=text(input.notes,1500);
  const activities=Array.isArray(workflow.activities)?workflow.activities:[];
  if(activities.length>=150)fail(409,'TOO_MANY_ACTIVITIES','Maximaal aantal activiteiten bereikt.');
  workflow={...workflow,activities:[...activities,{kind,scheduledAt:new Date(parsed).toISOString(),
   status,notes:note,recordedBy:user.id,recordedAt:at}],
   history:[...workflow.history,{from:workflow.stage,to:workflow.stage,actorId:user.id,at,notes:'Gesprek geregistreerd: '+kind+' ('+status+')'}]};
 }else if(action==='save_quote'){
  ensure(workflow.stage==='quote','WRONG_STAGE','Prijsafspraken horen bij de offertefase.');
  validateCompanyCount(companies);
  if(!Array.isArray(input.lines)||input.lines.length!==companies.length)fail(400,'INVALID_QUOTE','Vul per onderneming een prijsafspraak in.');
  workflow={...workflow,quote:companies.map(c=>{
   const line=input.lines.find(x=>Number(x.position)===c.position);
   if(!line)fail(400,'INVALID_QUOTE','Prijsafspraak ontbreekt voor een onderneming.');
   return quoteLine(line,c);
  }),history:[...workflow.history,{from:workflow.stage,to:workflow.stage,actorId:user.id,at,notes:'Offerteprijzen opgeslagen'}]};
 }else if(action==='advance'){
  const target=text(input.to,40);
  const notes=text(input.notes,1500);
  let evidence={};
  if(target==='quote_discussion'){
   ensure(Array.isArray(workflow.quote)&&workflow.quote.length===companies.length&&companies.length>0,
     'QUOTE_REQUIRED','Leg de prijsafspraken per onderneming vast.');
  }
  if(target==='agreement'){
   ensure(input.quoteAccepted===true,'QUOTE_ACCEPTANCE_REQUIRED','Bevestig het offerteakkoord.');
   ensure(Array.isArray(workflow.quote)&&workflow.quote.length===companies.length&&companies.length>0,
      'QUOTE_REQUIRED','Een volledige offerte ontbreekt.');
   evidence.quoteAccepted=true;
  }
  if(target==='onboarding'){
   ensure(input.signedAgreementVerified===true,'AGREEMENT_REQUIRED','Verifieer de getekende overeenkomst.');
   const docId=text(input.agreementDocumentId,50);
   if(!uuid.test(docId))fail(400,'AGREEMENT_DOCUMENT_REQUIRED','Koppel de getekende overeenkomst uit dit dossier.');
   const document=await supa.from('office_prospect_documents').select('id,storage_path').eq('application_id',id).eq('id',docId).maybeSingle();
   if(document.error||!document.data?.storage_path)fail(409,'AGREEMENT_DOCUMENT_REQUIRED','Ondertekende overeenkomst ontbreekt in dit dossier.');
   evidence={agreementFullySigned:true,agreementDocumentId:docId,agreementVerifiedBy:user.id,agreementVerifiedAt:at};
  }
  if(target==='administration_setup'){
   ensure(!!app.submitted_at&&['submitted','under_review'].includes(app.status),
    'ONBOARDING_NOT_SUBMITTED','Wacht op de ingediende onboardingvragenlijst.');
   evidence.onboardingSubmitted=true;
  }
  if(target==='ready_for_activation'||target==='active_client'){
   fail(409,'ACTIVATION_NOT_CONNECTED','Activatie blijft geblokkeerd tot de bestaande documentcontrole en klantactivatie veilig gekoppeld zijn.');
  }
  workflow=nextWorkflow(workflow,target,{actorId:user.id,notes,evidence});
 }else if(action==='send_onboarding'){
  ensure(canSendOnboarding(workflow),'ONBOARDING_LOCKED','Eerst offerteakkoord en een getekende overeenkomst.');
  ensure(app.status==='draft','INVITE_ALREADY_STARTED','De onboardinguitnodiging is al gestart.');
  const email=text(data.email,254).toLowerCase();
  if(!validEmail.test(email)||!config.resendApiKey)fail(503,'INVITATION_NOT_CONFIGURED','Onboardinguitnodiging kan niet worden verzonden.');
  const previous=await supa.from('office_onboarding_invites').select('id').eq('application_id',id).is('revoked_at',null).limit(1);
  if(previous.error)fail(503,'INVITATION_UNAVAILABLE','Uitnodigingen konden niet worden gecontroleerd.');
  ensure(!previous.data?.length,'INVITE_ALREADY_EXISTS','Er bestaat al een uitnodiging voor dit dossier.');
  const token=randomBytes(32).toString('hex');
  const invitation=await supa.from('office_onboarding_invites').insert({application_id:id,email,token_hash:digest(token),expires_at:new Date(Date.now()+7*86400000).toISOString(),created_by:user.id}).select('id').single();
  if(invitation.error)fail(503,'INVITATION_UNAVAILABLE','De beveiligde uitnodiging kon niet worden opgeslagen.');
  const inviteUrl=config.origin+'/prospect?token='+encodeURIComponent(token);
  let sent=null;
  try{sent=await fetchImpl('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:'Bearer '+config.resendApiKey,'Content-Type':'application/json','Idempotency-Key':'bestemd-onboarding-v4-'+id},
    body:JSON.stringify({from:'BESTEMD <info@mijnbestemd.nl>',to:[email],subject:'BESTEMD — jouw onboardingvragenlijst staat klaar',
      html:'<p>Beste '+encode(data.firstName||data.name||'ondernemer')+',</p><p>Na onze getekende overeenkomst kun je de beveiligde onboardingvragenlijst invullen.</p><p><a href="'+inviteUrl+'">Open jouw onboardingvragenlijst</a></p><p>Deze link is 7 dagen geldig. Deel hem niet.</p><p>Hartelijke groet,<br>BESTEMD B.V.</p>'})
   });}catch{}
  if(!sent?.ok){
   await supa.from('office_onboarding_invites').update({revoked_at:at}).eq('id',invitation.data.id);
   fail(503,'EMAIL_FAILED','Uitnodiging kon niet worden verzonden.');
  }
  const statusUpdate=await supa.from('office_onboarding_applications').update({status:'invited',updated_at:at}).eq('id',id).eq('status','draft').select('id').maybeSingle();
  if(statusUpdate.error||!statusUpdate.data)fail(409,'INVITATION_CONFLICT','E-mail verzonden maar status is gewijzigd; controleer dit dossier.');
  responseExtra={emailSent:true};
  // No workflow JSON mutation during invitation: avoid races with email delivery.
  return {status:200,data:{applicationId:id,workflow:publicWorkflow(workflow),...responseExtra}};
 }else fail(400,'INVALID_ACTION','Onbekende klanttrajectactie.');

 // Optimistic concurrency prevents two Office employees overwriting each other's decisions.
 const q=supa.from('office_onboarding_applications').update({applicant_data:{...data,workflowV4:workflow},updated_at:at})
   .eq('id',id).eq('status',app.status);
 const upd=app.updated_at?await q.eq('updated_at',app.updated_at).select('id').maybeSingle():await q.is('updated_at',null).select('id').maybeSingle();
 if(upd.error)fail(503,'WORKFLOW_SAVE_FAILED','Klanttraject kon niet worden opgeslagen.');
 if(!upd.data)fail(409,'WORKFLOW_CONFLICT','Het dossier is intussen gewijzigd. Vernieuw het dossier.');
 return {status:200,data:{applicationId:id,workflow:publicWorkflow(workflow),...responseExtra}};
}
