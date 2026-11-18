import {createClient} from '@supabase/supabase-js';
import {OfficeError} from './auth/supabase.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day=86400000;
function db(config,fetchImpl){
 if(!config.supabaseUrl||!config.supabaseServiceRoleKey)throw new OfficeError(503,'REVIEW_CONFIG','Beoordelingen niet geconfigureerd.');
 return createClient(config.supabaseUrl,config.supabaseServiceRoleKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetchImpl}});
}
function error(e,txt){if(e)throw new OfficeError(503,'REVIEW_UNAVAILABLE',txt);}
function isoDate(base,days){return new Date(Date.parse(base)+days*day).toISOString();}
function businessDeadline(base,workingDays=10){
 const date=new Date(base);
 if(Number.isNaN(date.getTime()))throw new OfficeError(500,'INVALID_SUBMISSION_DATE','Ongeldige ontvangstdatum.');
 let added=0;
 while(added<workingDays){date.setUTCDate(date.getUTCDate()+1);const weekday=date.getUTCDay();if(weekday!==0&&weekday!==6)added++;}
 return date.toISOString();
}
export async function officeProspectReviewRoute(req,url,client,user,config,fetchImpl,readBody){
 if(url.pathname!=='/api/office/prospect-review')return null;
 if(!['GET','POST'].includes(req.method))throw new OfficeError(405,'METHOD_NOT_ALLOWED','Methode niet toegestaan.');
 if(!user?.canManageCustomers||!user?.aal2)throw new OfficeError(403,'REVIEW_DENIED','Geen bevoegdheid om prospectaanvragen te beoordelen.');
 const id=req.method==='GET'?url.searchParams.get('id'):null;
 const input=req.method==='POST'?await readBody(req):{};
 const applicationId=id||input?.applicationId;
 if(!uuid.test(applicationId||''))throw new OfficeError(400,'INVALID_APPLICATION','Ongeldig aanvraagnummer.');
 const supa=db(config,fetchImpl);
 const a=await supa.from('office_onboarding_applications').select('id,status,submitted_at,customer_relationship_id,applicant_data').eq('id',applicationId).maybeSingle();
 error(a.error,'Aanvraag niet beschikbaar.');
 if(!a.data)throw new OfficeError(404,'NOT_FOUND','Aanvraag niet gevonden.');
 if(!a.data.submitted_at||!['submitted','under_review'].includes(a.data.status))throw new OfficeError(409,'NOT_SUBMITTED','De aanvraag moet eerst definitief zijn ingediend.');
 const initial=businessDeadline(a.data.submitted_at,10);
 const existing=await supa.from('office_prospect_reviews').select('*').eq('application_id',applicationId).maybeSingle();
 error(existing.error,'Voer eerst de Supabase-beoordelingsmigratie uit.');
 let review=existing.data;
 const result=()=>({applicationId,submittedAt:a.data.submitted_at,deadlineAt:review?.deadline_at||initial,decision:review?.decision||'pending',extensionReason:review?.extension_reason||null,docsVerified:!!review?.docs_verified,identityVerified:!!review?.identity_verified,agreementSigned:!!review?.agreement_signed,decisionReason:review?.decision_reason||null,overdue:Date.now()>Date.parse(review?.deadline_at||initial),accountActivationAvailable:false});
 if(req.method==='GET'){
  const [companiesResult,documentsResult]=await Promise.all([
    supa.from('office_onboarding_companies').select('position,company_data').eq('application_id',applicationId).order('position').limit(5),
    supa.from('office_prospect_documents').select('id,filename,company_position').eq('application_id',applicationId)
  ]);
  error(companiesResult.error,'Ondernemingen niet beschikbaar.');
  error(documentsResult.error,'Documenten niet beschikbaar.');
  const documents=documentsResult.data||[];
  const financialKeys=['previousYearTurnover','expectedYearTurnover','profitability','outstandingDebtors','outstandingCreditors','hasFinancing','hasTaxDebt','cashBookkeeping','currentBookkeeper'];
  const adminKeys=['vatRequired','iban','hasEmployees'];
  const companies=(companiesResult.data||[]).map(item=>{
    const company=item.company_data||{};
    const finance=Object.fromEntries(financialKeys.map(key=>[key,company[key]??(item.position===1?a.data.applicant_data?.[key]:null)]));
    const admin=Object.fromEntries(adminKeys.map(key=>[key,company[key]??null]));
    const missingFinancial=financialKeys.filter(key=>finance[key]===null||finance[key]===undefined||String(finance[key]).trim()==='');
    const missingAdministration=adminKeys.filter(key=>admin[key]===null||admin[key]===undefined||String(admin[key]).trim()==='');
    const companyDocuments=documents.filter(d=>Number(d.company_position)===Number(item.position));
    const hasDocument=label=>companyDocuments.some(d=>String(d.filename||'').toLowerCase().startsWith(label.toLowerCase()+' - '));
    const missingDocuments=['KvK-uittreksel','Jaarrekening'].filter(label=>!hasDocument(label));
    if(company.vatRequired==='yes'&&!hasDocument('Btw-aangifte'))missingDocuments.push('Btw-aangifte');
    return {position:item.position,name:company.companyName||company.name||'Onderneming '+item.position,financialComplete:missingFinancial.length===0,administrationComplete:missingAdministration.length===0,missingFinancial,missingAdministration,missingDocuments,documentCount:companyDocuments.length};
  });
  const personalDocuments=documents.filter(d=>String(d.filename||'').startsWith('Documenten ondernemer - '));
  return {status:200,data:{...result(),companies,personalDocumentCount:personalDocuments.length,missingPersonalDocuments:personalDocuments.some(d=>String(d.filename).includes('Aangifte inkomstenbelasting'))?[]:['Aangifte inkomstenbelasting'],dossierComplete:companies.length>0&&companies.every(c=>c.financialComplete&&c.administrationComplete&&c.missingDocuments.length===0)}};
 }
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['applicationId','action','reason','days','docsVerified','identityVerified','agreementSigned'].includes(k)))throw new OfficeError(400,'INVALID_REVIEW','Ongeldige beoordeling.');
 const action=input.action;
 if(!['extend','checklist','decline','mark_ready'].includes(action))throw new OfficeError(400,'INVALID_REVIEW','Ongeldige actie.');
 if(review?.decision!=='pending'&&review)throw new OfficeError(409,'REVIEW_LOCKED','Deze beoordeling is al afgesloten.');
 const changes={updated_at:new Date().toISOString()};
 if(action==='extend'){
  const reason=String(input.reason||'').trim();
  if(reason.length<5||reason.length>1000||!Number.isInteger(input.days)||input.days<1||input.days>30)throw new OfficeError(400,'INVALID_EXTENSION','Geef een geldige reden en 1–30 extra dagen op.');
  changes.deadline_at=isoDate(review?.deadline_at||initial,input.days);
  changes.extension_reason=reason;changes.extension_granted_at=changes.updated_at;changes.extended_by=user.id;
 }
 if(action==='checklist'){
  for(const name of ['docsVerified','identityVerified','agreementSigned'])if(typeof input[name]!=='boolean')throw new OfficeError(400,'INVALID_REVIEW','Controleer alle drie beoordelingsvelden.');
  changes.docs_verified=input.docsVerified;changes.identity_verified=input.identityVerified;changes.agreement_signed=input.agreementSigned;changes.checklist_verified_at=changes.updated_at;
 }
 if(action==='decline'){
  const reason=String(input.reason||'').trim();
  if(reason.length<5||reason.length>1000)throw new OfficeError(400,'INVALID_DECISION','Vul de reden in.');
  changes.decision='declined';changes.decision_reason=reason;changes.decided_at=changes.updated_at;changes.decided_by=user.id;
 }
 if(action==='mark_ready'){
  if(Date.now()>Date.parse(review?.deadline_at||initial))throw new OfficeError(409,'DEADLINE_PASSED','De termijn is verlopen. Verleng gemotiveerd of wijs de aanvraag af.');
  if(!review?.docs_verified||!review?.identity_verified||!review?.agreement_signed)throw new OfficeError(409,'CHECKLIST_INCOMPLETE','Controleer eerst documenten, identiteit en de getekende samenwerkingsovereenkomst.');
  changes.decision='ready_for_acceptance';changes.decided_at=changes.updated_at;changes.decided_by=user.id;
 }
 if(!review){
  const insert=await supa.from('office_prospect_reviews').insert({application_id:applicationId,deadline_at:initial,...changes}).select('*').single();
  error(insert.error,'Beoordeling kon niet worden opgeslagen.');review=insert.data;
 }else{
  const upd=await supa.from('office_prospect_reviews').update(changes).eq('application_id',applicationId).eq('decision','pending').select('*').maybeSingle();
  error(upd.error,'Beoordeling kon niet worden bijgewerkt.');
  if(!upd.data)throw new OfficeError(409,'REVIEW_CONFLICT','Beoordeling is inmiddels gewijzigd.');review=upd.data;
 }
 return {status:200,data:result()};
}
