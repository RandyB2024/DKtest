import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'node:crypto';
import { OfficeError } from './auth/supabase.mjs';

const VALID_EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS=['firstName','lastName','email','mobile','companyName','kvk','vat','legalForm','website','street','postalCode','city','country'];
const clean=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const safeInput=(input)=>{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!FIELDS.includes(k)))throw new OfficeError(400,'INVALID_PROSPECT','Controleer de aanvraaggegevens.');
 const data=Object.fromEntries(FIELDS.map(k=>[k,clean(input[k],k==='email'?254:200)]));
 data.email=data.email.toLowerCase();
 if(!VALID_EMAIL.test(data.email)||!data.companyName||!data.firstName||!data.lastName||(data.kvk&&!/^\d{8}$/.test(data.kvk))||(data.mobile&&!/^[+\d\s()-]{8,24}$/.test(data.mobile)))throw new OfficeError(400,'INVALID_PROSPECT','Vul naam, e-mail en onderneming correct in.');
 return data;
};
const digest=token=>createHash('sha256').update(token).digest('hex');
const DOCUMENT_TYPES={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'};
function decodeDocument(raw,type){
 if(typeof raw!=='string'||raw.length>4_200_000||!Object.hasOwn(DOCUMENT_TYPES,type)||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw new OfficeError(400,'INVALID_DOCUMENT','Gebruik een PDF, JPG of PNG van maximaal 3 MB.');
 const bytes=Buffer.from(raw,'base64');
 if(!bytes.length||bytes.length>3_000_000)throw new OfficeError(413,'DOCUMENT_TOO_LARGE','Bestand groter dan 3 MB.');
 const ok=type==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':type==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 if(!ok)throw new OfficeError(400,'INVALID_DOCUMENT','Bestandstype komt niet overeen met het bestand.');
 return bytes;
}

function admin(config,fetchImpl){
 if(!config.supabaseServiceRoleKey||!config.supabaseUrl)throw new OfficeError(503,'PROSPECT_CONFIG_REQUIRED','Prospectservice is nog niet geconfigureerd.');
 return createClient(config.supabaseUrl,config.supabaseServiceRoleKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetchImpl}});
}
function fail(){throw new OfficeError(404,'PROSPECT_LINK_INVALID','Deze aanvraaglink is ongeldig of verlopen.');}
async function resolveInvite(db, token){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail();
 const {data:invite,error}=await db.from('office_onboarding_invites').select('id,application_id,email,expires_at,revoked_at,used_at').eq('token_hash',digest(token)).maybeSingle();
 if(error)throw new OfficeError(503,'PROSPECT_UNAVAILABLE','Aanvraag tijdelijk niet beschikbaar.');
 if(!invite||invite.revoked_at||invite.used_at||Date.parse(invite.expires_at)<=Date.now())fail();
 const {data:application,error:ae}=await db.from('office_onboarding_applications').select('id,status,applicant_data,customer_relationship_id').eq('id',invite.application_id).single();
 if(ae||!application||!['invited','in_progress'].includes(application.status))fail();
 const {data:companies,error:ce}=await db.from('office_onboarding_companies').select('position,company_data').eq('application_id',application.id).order('position').limit(10);
 if(ce||!companies?.length)fail();
 return {invite,application,company:companies[0].company_data,companies};
}
export async function publicProspectRoute(req,url,config,fetchImpl,readBody){
 if(url.pathname!=='/api/prospect')return null;
 if(!['GET','POST'].includes(req.method))throw new OfficeError(405,'METHOD_NOT_ALLOWED','Methode niet toegestaan.');
 if(req.method==='POST')return prospectPublicSubmit(req,url,config,fetchImpl,await readBody(req));
 const db=admin(config,fetchImpl);
 const receiptToken=url.searchParams.get('token');
 if(url.searchParams.get('receipt')==='1'){
  if(typeof receiptToken!=='string'||!/^[a-f0-9]{64}$/.test(receiptToken))fail();
  const {data:receiptInvite,error:ri}=await db.from('office_onboarding_invites').select('application_id,revoked_at').eq('token_hash',digest(receiptToken)).maybeSingle();
  if(ri)throw new OfficeError(503,'PROSPECT_UNAVAILABLE','Aanvraag tijdelijk niet beschikbaar.');
  if(!receiptInvite||receiptInvite.revoked_at)fail();
  const {data:receiptApp,error:ra}=await db.from('office_onboarding_applications').select('status,submitted_at').eq('id',receiptInvite.application_id).maybeSingle();
  if(ra)throw new OfficeError(503,'PROSPECT_UNAVAILABLE','Aanvraag tijdelijk niet beschikbaar.');
  if(!receiptApp||!['submitted','under_review','accepted','rejected','activated'].includes(receiptApp.status))fail();
  return {status:200,data:{submitted:true,submittedAt:receiptApp.submitted_at||null,status:receiptApp.status}};
 }
 const {application,company,companies}=await resolveInvite(db,receiptToken);
 const {data:documents,error:de}=await db.from('office_prospect_documents').select('id,filename,created_at,company_position').eq('application_id',application.id).order('created_at',{ascending:false});
 if(de)throw new OfficeError(503,'DOCUMENTS_UNAVAILABLE','Documenten niet beschikbaar; controleer de database-migratie.');
 return {status:200,data:{status:application.status,personal:application.applicant_data,company,companies,documents:documents||[]}};
}

function asBool(v){return v===true||v==='true';}
function oneOf(v,list,fallback=''){return list.includes(v)?v:fallback;}
function required(value,message){if(!value)throw new OfficeError(400,'INVALID_PROSPECT',message);}

export async function prospectPublicSubmit(req,url,config,fetchImpl,input){
 const db=admin(config,fetchImpl); const {invite,application,companies}=await resolveInvite(db,input?.token);
 if(input?.action==='signature'){
  if(application.applicant_data?.signatureDocumentId)throw new OfficeError(409,'SIGNATURE_EXISTS','Handtekening is al opgeslagen. Vernieuw de aanvraag om verder te gaan.');
  const bytes=decodeDocument(input.base64,'image/png');
  if(bytes.length>350000)throw new OfficeError(413,'SIGNATURE_TOO_LARGE','De handtekening is te groot.');
  const key=application.id+'/signature-'+randomBytes(12).toString('hex')+'.png';
  const uploaded=await db.storage.from('bestemd-prospect-private').upload(key,bytes,{contentType:'image/png',upsert:false});
  if(uploaded.error)throw new OfficeError(503,'SIGNATURE_FAILED','Handtekening kon niet worden opgeslagen.');
  const stored=await db.from('office_prospect_documents').insert({application_id:application.id,storage_path:key,filename:'Handtekening aanvraag.png',mime_type:'image/png',size_bytes:bytes.length,company_position:1}).select('id').single();
  if(stored.error){await db.storage.from('bestemd-prospect-private').remove([key]);throw new OfficeError(503,'SIGNATURE_FAILED','Handtekeningregistratie mislukt.');}
  const updated=await db.from('office_onboarding_applications').update({applicant_data:{...application.applicant_data,signatureDocumentId:stored.data.id}}).eq('id',application.id).in('status',['invited','in_progress']).select('id').maybeSingle();
  if(updated.error||!updated.data)throw new OfficeError(503,'SIGNATURE_FAILED','Handtekening kon niet aan de aanvraag worden gekoppeld.');
  return {status:201,data:{signatureSaved:true}};
 }
 if(input?.action==='delete-document'){
  const id=clean(input.documentId,80);
  if(!/^[a-f0-9-]{36}$/i.test(id))throw new OfficeError(400,'INVALID_DOCUMENT','Ongeldig document.');
  const {data:doc,error:lookupError}=await db.from('office_prospect_documents')
   .select('id,storage_path').eq('application_id',application.id).eq('id',id).maybeSingle();
  if(lookupError)throw new OfficeError(503,'DOCUMENTS_UNAVAILABLE','Document kon niet worden opgezocht.');
  if(!doc)throw new OfficeError(404,'DOCUMENT_NOT_FOUND','Document niet gevonden.');
  if(id===application.applicant_data?.signatureDocumentId)
   throw new OfficeError(409,'SIGNATURE_PROTECTED','Gebruik Opnieuw tekenen om de handtekening te wijzigen.');
  const removed=await db.storage.from('bestemd-prospect-private').remove([doc.storage_path]);
  if(removed.error)throw new OfficeError(503,'DOCUMENT_DELETE_FAILED','Bestand kon niet worden verwijderd.');
  const deleted=await db.from('office_prospect_documents').delete().eq('application_id',application.id).eq('id',id);
  if(deleted.error)throw new OfficeError(503,'DOCUMENT_DELETE_FAILED','Documentregistratie kon niet worden verwijderd.');
  return {status:200,data:{deleted:true}};
 }
 if(input?.action==='upload'){
  const count=await db.from('office_prospect_documents').select('id',{count:'exact',head:true}).eq('application_id',application.id);
  if(count.error)throw new OfficeError(503,'DOCUMENTS_UNAVAILABLE','Documentenopslag niet ingericht.');
  if((count.count||0)>=20)throw new OfficeError(400,'TOO_MANY_DOCUMENTS','Maximaal 20 documenten per aanvraag.');
  const mime=clean(input.mime,80),filename=clean(input.filename,120).replace(/[\/\\\x00-\x1f]/g,'_');
  if(!filename)throw new OfficeError(400,'INVALID_DOCUMENT','Een bestandsnaam is verplicht.');
  const bytes=decodeDocument(input.base64,mime);
  const fileId=randomBytes(16).toString('hex'),path=application.id+'/'+fileId+'.'+DOCUMENT_TYPES[mime];
  const position=Number(input.companyPosition??1);if(!Number.isInteger(position)||!companies.some(c=>c.position===position))throw new OfficeError(400,'INVALID_COMPANY','Kies een geldige onderneming voor het document.');
  const upload=await db.storage.from('bestemd-prospect-private').upload(path,bytes,{contentType:mime,upsert:false});
  if(upload.error)throw new OfficeError(503,'DOCUMENT_UPLOAD_FAILED','Document opslaan mislukt.');
  const saved=await db.from('office_prospect_documents').insert({application_id:application.id,storage_path:path,filename,mime_type:mime,size_bytes:bytes.length,company_position:position}).select('id,filename,created_at').single();
  if(saved.error){await db.storage.from('bestemd-prospect-private').remove([path]);throw new OfficeError(503,'DOCUMENT_UPLOAD_FAILED','Documentregistratie mislukt.');}
  return {status:201,data:{uploaded:true,document:saved.data}};
 }

 if(!input||!['save','submit'].includes(input.action)||typeof input.personal!=='object'||typeof input.company!=='object')throw new OfficeError(400,'INVALID_PROSPECT','Ongeldige invoer.');
 const personal=input.personal,company=input.company;
 const extras=Array.isArray(input.additionalCompanies)?input.additionalCompanies:[];
 const people=Array.isArray(input.additionalContacts)?input.additionalContacts:[];
 if(extras.length>9||people.length>30)throw new OfficeError(400,'EXTRAS_TOO_MANY','Te veel ondernemingen of contactpersonen.');
 for(const [i,entry] of extras.entries()){const c=entry?.companyData||{};if(Number(entry.position)!==i+2||!clean(c.companyName)||c.kvk&&!/^\d{8}$/.test(clean(c.kvk)))throw new OfficeError(400,'INVALID_COMPANY','Controleer de extra ondernemingen.');}
 const kvks=[clean(company.kvk),...extras.map(e=>clean(e.companyData?.kvk))].filter(Boolean);if(new Set(kvks).size!==kvks.length)throw new OfficeError(409,'DUPLICATE_KVK','Een KvK-nummer is meermaals ingevuld.');
 const contactRoles=['contactpersoon','ondernemer','bestuurder','administratie','facturatie','gemachtigde'];
 const allowedPositions=new Set(['all','1',...extras.map((_,i)=>String(i+2))]);
 const contacts=people.map(c=>({salutation:clean(c.salutation,30),initials:clean(c.initials,40),firstName:clean(c.firstName,100),lastName:clean(c.lastName,100),email:clean(c.email,254).toLowerCase(),mobile:clean(c.mobile,24),role:clean(c.role,60),companyPosition:clean(c.companyPosition,5),invoiceRecipient:c.invoiceRecipient===true}));
 for(const c of contacts){if(!c.firstName||!c.lastName||!VALID_EMAIL.test(c.email)||!contactRoles.includes(c.role)||!allowedPositions.has(c.companyPosition))throw new OfficeError(400,'INVALID_CONTACT','Controleer de extra contactpersonen.');}
 const permittedPersonal=['salutation','initials','firstName','lastName','email','mobile','whatsappConsent','serviceRequest','lookingFor','currentChallenges','expectations','businessGoals','howCanWeHelp','cashBookkeeping','cashTransactions','previousYearTurnover','expectedYearTurnover','turnoverTrend','profitability','liquidity','outstandingDebtors','outstandingCreditors','hasFinancing','hasTaxDebt','administrationBacklog','currentBookkeeper'];
 const permittedCompany=['companyName','companyEmail','kvk','transferDate','entityType','vatRequired','vatFrequency','vatIdNumber','turnoverTaxNumber','vatNumber','hasFiscalUnit','rsin','iban','extraBankAccounts','hasCreditCard','creditCardDetails','hasEmployees','payrollNumber','website','legalForm','street','postalCode','city','country'];
 if(Object.keys(personal).some(k=>!permittedPersonal.includes(k))||Object.keys(company).some(k=>!permittedCompany.includes(k)))throw new OfficeError(400,'INVALID_PROSPECT','Ongeldige velden.');
 const email=clean(personal.email,254).toLowerCase();
 if(!VALID_EMAIL.test(email)||!clean(personal.firstName)||!clean(personal.lastName)||!clean(personal.mobile,24)||!clean(company.companyName)||!clean(company.companyEmail,254)||!VALID_EMAIL.test(clean(company.companyEmail,254))||(company.kvk&&!/^\d{8}$/.test(clean(company.kvk)))||!clean(company.transferDate,20))throw new OfficeError(400,'INVALID_PROSPECT','Controleer de verplichte velden.');
 if(email!==invite.email)throw new OfficeError(403,'EMAIL_LOCKED','Wijziging van het e-mailadres kan alleen via BESTEMD Office.');
 const entityType=oneOf(clean(company.entityType,20),['eenmanszaak','bv']); required(entityType,'Kies de rechtsvorm van de onderneming.');
 const vatRequired=oneOf(clean(company.vatRequired,10),['yes','no']); required(vatRequired,'Geef aan of de onderneming btw-plichtig is.');
 const vatFrequency=oneOf(clean(company.vatFrequency,20),['year','quarter','month','kor'],'');
 const hasEmployees=oneOf(clean(company.hasEmployees,10),['yes','no'],'');
 const hasCreditCard=oneOf(clean(company.hasCreditCard,10),['yes','no'],'');
 const hasFiscalUnit=oneOf(clean(company.hasFiscalUnit,10),['yes','no'],'');
 if(vatRequired==='yes'&&!vatFrequency)throw new OfficeError(400,'INVALID_PROSPECT','Kies hoe de btw-aangifte wordt gedaan.');
 if(entityType==='eenmanszaak'&&vatRequired==='yes'&&!clean(company.vatIdNumber))throw new OfficeError(400,'INVALID_PROSPECT','Vul het btw-identificatienummer in.');
 if(entityType==='eenmanszaak'&&vatRequired==='yes'&&!clean(company.turnoverTaxNumber))throw new OfficeError(400,'INVALID_PROSPECT','Vul het omzetbelastingnummer in.');
 if(entityType==='bv'&&vatRequired==='yes'&&!clean(company.vatNumber))throw new OfficeError(400,'INVALID_PROSPECT','Vul het btw-nummer in.');
 if(entityType==='bv'&&!clean(company.rsin))throw new OfficeError(400,'INVALID_PROSPECT','Vul het RSIN in.');
 if(!clean(company.iban))throw new OfficeError(400,'INVALID_PROSPECT','Vul het zakelijke IBAN-nummer in.');
 if(hasEmployees==='yes'&&!clean(company.payrollNumber))throw new OfficeError(400,'INVALID_PROSPECT','Vul het loonheffingennummer in.');
 if(input.action==='submit'){
  if(!application.applicant_data?.signatureDocumentId)throw new OfficeError(400,'SIGNATURE_DRAW_REQUIRED','Teken eerst jouw handtekening in het vak.');
  const sign=input.signature;
  const requiredIntro=['lookingFor','currentChallenges','expectations','businessGoals','howCanWeHelp'];
  if(requiredIntro.some(k=>!clean(personal[k],1500)))throw new OfficeError(400,'SIGNATURE_REQUIRED','Beantwoord eerst alle kennismakingsvragen.');
  if(!oneOf(clean(personal.cashBookkeeping,10),['yes','no'])||!oneOf(clean(personal.cashTransactions,10),['yes','no']))throw new OfficeError(400,'SIGNATURE_REQUIRED','Vul eerst het financiële beeld aan.');
  if(!sign||sign.accepted!==true||typeof sign.name!=='string'||clean(sign.name,200).length<3)throw new OfficeError(400,'SIGNATURE_REQUIRED','Vul je naam in en bevestig de verklaring.');
  const signer=clean(sign.name,200).replace(/\s+/g,' ').toLowerCase();
  const applicant=(clean(personal.firstName)+' '+clean(personal.lastName)).replace(/\s+/g,' ').toLowerCase();
  if(signer!==applicant)throw new OfficeError(400,'SIGNATURE_NAME_MISMATCH','Gebruik je eigen volledige naam bij de verklaring.');
 }
 // Leg versie en tijdstip van akkoord vast zodra definitieve voorwaarden actief zijn.
 const terms=input.termsAcceptance;
 if(terms!==undefined&&(!terms||terms.accepted!==true||!/^[-a-zA-Z0-9._]{1,80}$/.test(String(terms.version||''))||input.action!=='submit'))throw new OfficeError(400,'INVALID_TERMS','Ongeldig akkoord op de voorwaarden.');
 const extraIbans=String(company.extraBankAccounts||'').split(/[\n,;]+/).map(x=>x.replace(/\s+/g,'').toUpperCase()).filter(Boolean);
 if(extraIbans.length>15||extraIbans.some(x=>!(/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(x)))||new Set([clean(company.iban).replace(/\s+/g,'').toUpperCase(),...extraIbans]).size!==extraIbans.length+1)throw new OfficeError(400,'INVALID_IBAN','Controleer de extra zakelijke IBAN-nummers.');
 const updatedPersonal={...application.applicant_data,additionalContacts:contacts,
  salutation:oneOf(clean(personal.salutation,30),['Dhr.','Mevr.','Anders','Geen aanhef']), initials:clean(personal.initials,40), firstName:clean(personal.firstName), lastName:clean(personal.lastName), name:(clean(personal.firstName)+' '+clean(personal.lastName)).trim(), email, mobile:clean(personal.mobile,24),
  serviceRequest:clean(personal.serviceRequest,1500), whatsappConsent:asBool(personal.whatsappConsent),
  lookingFor:clean(personal.lookingFor,1500), currentChallenges:clean(personal.currentChallenges,1500), expectations:clean(personal.expectations,1500), businessGoals:clean(personal.businessGoals,1500), howCanWeHelp:clean(personal.howCanWeHelp,1500),
  cashBookkeeping:oneOf(clean(personal.cashBookkeeping,10),['yes','no']), cashTransactions:oneOf(clean(personal.cashTransactions,10),['yes','no']),
  previousYearTurnover:clean(personal.previousYearTurnover,32), expectedYearTurnover:clean(personal.expectedYearTurnover,32), turnoverTrend:clean(personal.turnoverTrend,30), profitability:clean(personal.profitability,30), liquidity:clean(personal.liquidity,30), outstandingDebtors:clean(personal.outstandingDebtors,32), outstandingCreditors:clean(personal.outstandingCreditors,32), hasFinancing:clean(personal.hasFinancing,30), hasTaxDebt:clean(personal.hasTaxDebt,30), administrationBacklog:clean(personal.administrationBacklog,30), currentBookkeeper:clean(personal.currentBookkeeper,200),
  ...(input.action==='submit'&&terms?{termsAcceptance:{accepted:true,version:String(terms.version),acceptedAt:new Date().toISOString()}}:{}),
  ...(input.action==='submit'?{signedDeclaration:{name:clean(input.signature.name,200),accepted:true,signedAt:new Date().toISOString(),method:application.applicant_data?.signatureDocumentId?'drawn-signature-png':'typed-name-confirmation',textVersion:'bestemd-intake-v2'}}:{})
 };
 const updatedCompany={
  companyName:clean(company.companyName), name:clean(company.companyName), companyEmail:clean(company.companyEmail,254).toLowerCase(), kvk:clean(company.kvk,8), transferDate:clean(company.transferDate,20), entityType,
  vatRequired, vatFrequency:vatRequired==='yes'?vatFrequency:'', vatIdNumber:entityType==='eenmanszaak'?clean(company.vatIdNumber,100):'', turnoverTaxNumber:entityType==='eenmanszaak'?clean(company.turnoverTaxNumber,100):'',
  vatNumber:entityType==='bv'?clean(company.vatNumber,100):'', hasFiscalUnit:entityType==='bv'?hasFiscalUnit:'', rsin:entityType==='bv'?clean(company.rsin,100):'',
  iban:clean(company.iban,100), extraBankAccounts:extraIbans.join('\n'), hasCreditCard, creditCardDetails:hasCreditCard==='yes'?clean(company.creditCardDetails,1500):'',
  hasEmployees, payrollNumber:hasEmployees==='yes'?clean(company.payrollNumber,100):'', website:clean(company.website,200), legalForm:clean(company.legalForm,200), street:clean(company.street,200), postalCode:clean(company.postalCode,32), city:clean(company.city,120), country:clean(company.country,120)||'Nederland'
 };
 const {error:e2}=await db.from('office_onboarding_companies').update({company_data:updatedCompany}).eq('application_id',application.id).eq('position',1);
 if(e2)throw new OfficeError(503,'PROSPECT_SAVE_FAILED','Bedrijfsgegevens konden niet worden opgeslagen.');
 const extraSave=await db.rpc('office_prospect_replace_extra_companies',{p_application_id:application.id,p_companies:extras});
 if(extraSave.error)throw new OfficeError(503,'EXTRA_COMPANIES_SAVE_FAILED','Extra ondernemingen konden niet worden opgeslagen. Controleer de nieuwe Supabase-migratie.');
 const {data:updatedApplication,error:e1}=await db.from('office_onboarding_applications').update({applicant_data:updatedPersonal,status:input.action==='submit'?'submitted':'in_progress',submitted_at:input.action==='submit'?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',application.id).in('status',['invited','in_progress']).select('id').maybeSingle();
 if(e1||!updatedApplication)throw new OfficeError(503,'PROSPECT_SAVE_FAILED','Opslaan is niet gelukt.');
 if(input.action==='submit')await db.from('office_onboarding_invites').update({used_at:new Date().toISOString()}).eq('id',invite.id);
 return {status:200,data:{saved:true,submitted:input.action==='submit'}};
}

function escapeText(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function inviteEmailHtml(firstName,inviteUrl,origin){
 const logo=origin+'/assets/logo.png';
 return `<!doctype html><html lang="nl"><body style="margin:0;background:#f4f7fb;padding:24px;font-family:Arial,sans-serif;color:#15324a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2eaf2;border-radius:18px;overflow:hidden"><tr><td style="padding:28px 32px;background:linear-gradient(135deg,#f7fbff 0%,#eef5fb 100%);border-bottom:1px solid #e2eaf2"><img src="${logo}" alt="BESTEMD" style="height:40px;width:auto;display:block;margin-bottom:18px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5a7690;font-weight:700">Welkom bij BESTEMD</div><h1 style="margin:8px 0 10px;font-size:28px;line-height:1.15;color:#103453">Jouw aanvraag staat klaar</h1><p style="margin:0;color:#5f748b;font-size:15px;line-height:1.6">Beste ${escapeText(firstName)}, bedankt voor je interesse in BESTEMD. Via jouw persoonlijke link kun je jouw aanvraag controleren, aanvullen en veilig versturen.</p></td></tr><tr><td style="padding:28px 32px"><p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#17344b">We hebben de eerste gegevens alvast voor je klaargezet. Je hoeft dus alleen nog de ontbrekende informatie aan te vullen.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 24px"><tr><td><a href="${inviteUrl}" style="display:inline-block;background:#0b6ea8;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">Aanvraag openen</a></td></tr></table><div style="background:#f7fbff;border:1px solid #e3edf5;border-radius:14px;padding:16px 18px;margin:0 0 22px"><strong style="display:block;margin-bottom:8px;color:#103453">Wat kun je verwachten?</strong><ul style="padding-left:18px;margin:0;color:#496177;line-height:1.7"><li>Je controleert eerst de basisgegevens.</li><li>Daarna vul je alleen de vragen in die voor jouw onderneming relevant zijn.</li><li>Na het versturen beoordelen wij of BESTEMD en jouw onderneming goed bij elkaar passen.</li></ul></div><p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#5f748b">Deze beveiligde link is 7 dagen geldig. Deel de link niet met anderen.</p><p style="margin:0;font-size:14px;line-height:1.7;color:#5f748b">Vragen? Reageer gerust op deze e-mail of neem contact met ons op via <a href="mailto:info@mijnbestemd.nl" style="color:#0b6ea8">info@mijnbestemd.nl</a>.</p></td></tr><tr><td style="padding:0 32px 28px"><p style="margin:0;color:#17344b">Hartelijke groet,<br><strong>BESTEMD B.V.</strong></p></td></tr></table></body></html>`;
}

export async function officeProspectRoute(req,url,client,user,config,fetchImpl,readBody){
 if(url.pathname!=='/api/office/prospects')return null;
 if(!user.canManageCustomers||!user.aal2)throw new OfficeError(403,'PROSPECT_DENIED','Geen toestemming voor prospectbeheer.');
 if(req.method==='GET'){
  const db=admin(config,fetchImpl);
  const {data,error}=await db.from('office_onboarding_applications').select('id,status,applicant_data,created_at,customer_relationship_id').order('created_at',{ascending:false}).limit(100);
  if(error)throw new OfficeError(503,'PROSPECT_UNAVAILABLE','Prospects konden niet worden opgehaald.');
  const ids=(data||[]).map(item=>item.id);
  let companies=[];
  if(ids.length){const companyResult=await db.from('office_onboarding_companies').select('application_id,company_data').in('application_id',ids);if(companyResult.error)throw new OfficeError(503,'PROSPECT_COMPANIES_UNAVAILABLE','Prospectondernemingen niet beschikbaar.');companies=companyResult.data||[];}
  return {status:200,data:{items:(data||[]).map(item=>({...item,companies:companies.filter(c=>c.application_id===item.id).map(c=>c.company_data)}))}};
 }
 if(req.method!=='POST')throw new OfficeError(405,'METHOD_NOT_ALLOWED','Methode niet toegestaan.');
 const input=await readBody(req); if(input?.action!=='create')throw new OfficeError(400,'INVALID_ACTION','Ongeldige actie.');
 const details=safeInput(input.data);
 const db=admin(config,fetchImpl);
 const {data,error}=await client.rpc('office_create_onboarding_new_customer',{p_customer_name:details.firstName+' '+details.lastName,p_company_name:details.companyName,p_email:details.email});
 if(error){if(error.code==='23505')throw new OfficeError(409,'PROSPECT_EXISTS','Er is al een lopende aanvraag voor dit e-mailadres.');throw new OfficeError(503,'PROSPECT_CREATE_FAILED','Prospect kon niet worden aangemaakt.');}
 const applicationId=data?.application_id;
 if(!applicationId)throw new OfficeError(503,'PROSPECT_CREATE_FAILED','Geen aanvraagnummer ontvangen.');
 const {data:updatedApplication,error:e1}=await db.from('office_onboarding_applications').update({applicant_data:{name:details.firstName+' '+details.lastName,firstName:details.firstName,lastName:details.lastName,email:details.email,mobile:details.mobile}}).eq('id',applicationId).eq('status','draft');
 const {error:e2}=await db.from('office_onboarding_companies').update({company_data:{name:details.companyName,companyName:details.companyName,kvk:details.kvk,website:details.website,legalForm:details.legalForm,street:details.street,postalCode:details.postalCode,city:details.city,country:details.country||'Nederland'}}).eq('application_id',applicationId).eq('position',1);
 if(e1||e2)throw new OfficeError(503,'PROSPECT_CREATE_FAILED','Aanvraag is aangemaakt, maar aanvullende gegevens konden niet worden opgeslagen.');
 if(!config.resendApiKey) return {status:201,data:{applicationId,relationshipId:data.relationship_id,status:'draft',emailSent:false,reason:'RESEND_NOT_CONFIGURED'}};
 const token=randomBytes(32).toString('hex');
 const expires=new Date(Date.now()+7*86400000).toISOString();
 const {data:invite,error:ei}=await db.from('office_onboarding_invites').insert({application_id:applicationId,email:details.email,token_hash:digest(token),expires_at:expires,created_by:user.id}).select('id').single();
 if(ei)throw new OfficeError(503,'PROSPECT_INVITE_FAILED','Prospect is opgeslagen, maar de uitnodiging kon niet worden klaargezet.');
 const inviteUrl=config.origin+'/prospect?token='+encodeURIComponent(token);
 let response;
 try{
  response=await fetchImpl('https://api.resend.com/emails',{
   method:'POST',
   headers:{Authorization:'Bearer '+config.resendApiKey,'Content-Type':'application/json','Idempotency-Key':'bestemd-prospect-'+applicationId},
   body:JSON.stringify({from:'BESTEMD <info@mijnbestemd.nl>',to:[details.email],subject:'Welkom bij BESTEMD — vul jouw aanvraag aan',html:inviteEmailHtml(details.firstName,inviteUrl,config.origin)})
  });
 }catch{response=null;}
 if(!response?.ok){await db.from('office_onboarding_invites').update({revoked_at:new Date().toISOString()}).eq('id',invite.id);return {status:201,data:{applicationId,relationshipId:data.relationship_id,status:'draft',emailSent:false,reason:'EMAIL_FAILED'}};}
 const {error:statusError}=await db.from('office_onboarding_applications').update({status:'invited'}).eq('id',applicationId).eq('status','draft');
 if(statusError)throw new OfficeError(503,'PROSPECT_STATUS_FAILED','De uitnodiging is verstuurd, maar de prospectstatus kon niet worden bijgewerkt. Neem contact op met de beheerder.');
 return {status:201,data:{applicationId,relationshipId:data.relationship_id,status:'invited',emailSent:true}};
}


// BESTEMD CRM: one relationship, multiple contacts and company-specific access.
export async function officeRelationshipContactsRoute(req,url,client,user,config,fetchImpl,readBody){
 if(url.pathname!=='/api/office/relationship-contacts')return null;
 if(!user.canManageCustomers||!user.aal2)throw new OfficeError(403,'CONTACTS_DENIED','Geen toestemming voor relatiecontacten.');
 const db=admin(config,fetchImpl);
 if(req.method==='GET'){
  const relationshipId=url.searchParams.get('relationshipId')||'';
  if(!/^[a-f0-9-]{36}$/i.test(relationshipId))throw new OfficeError(400,'INVALID_RELATIONSHIP','Ongeldig relatienummer.');
  const check=await db.from('customer_relationships').select('id').eq('id',relationshipId).is('archived_at',null).maybeSingle();
  if(check.error||!check.data)throw new OfficeError(404,'RELATIONSHIP_NOT_FOUND','Relatie bestaat niet.');
  const {data,error}=await db.from('bestemd_relation_contacts').select('id,relationship_id,organization_id,first_name,last_name,email,mobile,role,is_primary,invoice_recipient,created_at').eq('relationship_id',relationshipId).order('created_at');
  if(error)throw new OfficeError(503,'CONTACTS_UNAVAILABLE','Contactpersonen niet beschikbaar. Controleer of de migratie is uitgevoerd.');
  return {status:200,data:{items:data||[]}};
 }
 if(req.method!=='POST')throw new OfficeError(405,'METHOD_NOT_ALLOWED','Methode niet toegestaan.');
 const input=await readBody(req);
 if(!input||input.action!=='add'||typeof input.relationshipId!=='string'||!/^[a-f0-9-]{36}$/i.test(input.relationshipId))throw new OfficeError(400,'INVALID_CONTACT','Ongeldige contactpersoon.');
 const relationshipId=input.relationshipId,organizationId=input.organizationId||null;
 const firstName=clean(input.firstName,100),lastName=clean(input.lastName,100),email=clean(input.email,254).toLowerCase(),mobile=clean(input.mobile,24),role=clean(input.role,60)||'contactpersoon';
 if(!firstName||!lastName||!VALID_EMAIL.test(email)||!['contactpersoon','ondernemer','bestuurder','administratie','facturatie','gemachtigde'].includes(role))throw new OfficeError(400,'INVALID_CONTACT','Vul naam, e-mail en rol in.');
 const rel=await db.from('customer_relationships').select('id').eq('id',relationshipId).is('archived_at',null).maybeSingle();
 if(rel.error||!rel.data)throw new OfficeError(404,'RELATIONSHIP_NOT_FOUND','Relatie bestaat niet.');
 if(organizationId){
  if(typeof organizationId!=='string'||!/^[a-f0-9-]{36}$/i.test(organizationId))throw new OfficeError(400,'INVALID_ORGANIZATION','Ongeldige onderneming.');
  const org=await db.from('organizations').select('id').eq('id',organizationId).eq('customer_relationship_id',relationshipId).is('archived_at',null).maybeSingle();
  if(org.error||!org.data)throw new OfficeError(400,'INVALID_ORGANIZATION','Onderneming hoort niet bij deze relatie.');
 }
 const {data,error}=await db.from('bestemd_relation_contacts').insert({relationship_id:relationshipId,organization_id:organizationId,first_name:firstName,last_name:lastName,email,mobile,role,is_primary:input.isPrimary===true,invoice_recipient:input.invoiceRecipient===true}).select('id').single();
 if(error){if(error.code==='23505')throw new OfficeError(409,'CONTACT_EXISTS','Deze contactpersoon bestaat al binnen de relatie/onderneming.');throw new OfficeError(503,'CONTACT_SAVE_FAILED','Contactpersoon niet opgeslagen.');}
 return {status:201,data:{id:data.id,saved:true}};
}
