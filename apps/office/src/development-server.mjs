import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LocalDevelopmentAuthenticationProvider } from './auth/authentication-service.mjs';
import { SessionStore } from './auth/session-store.mjs';
import { parseCookies, securityHeaders, signedSessionCookie, verifySessionCookie } from './security.mjs';
import { clients, ledgerAccounts, journalEntries, bankTransactions, purchaseInvoices, salesInvoices, tasks, auditLogs, documents, conversations, messages } from './domain/demo-data.mjs';
import { addJournalEntry, dashboardSummary, periodCheck, report, resolveDocumentProblem } from './domain/accounting-service.mjs';
import { dateTime } from './services/date-time-service.mjs';
import { ClientOnboardingService } from './services/client-onboarding-service.mjs';
import { clientName, getDocuments, openTasks } from './services/workspace-query-service.mjs';
import { SignatureService } from './services/signature-service.mjs';
import { DocumentProcessingService } from './services/document-processing-service.mjs';
import { MockMicrosoftGraphService } from './services/integrations/mock-microsoft-graph-service.mjs';
import { PortalManagementService, organizations, customerRelationships, organizationChangeRequests, portalUsers } from './domain/portal-management-service.mjs';
import { CustomerReportingService } from './services/customer-reporting-service.mjs';
import { CustomerPortalService } from './services/customer-portal-service.mjs';
import { FinancialLedgerService } from './domain/financial-ledger-service.mjs';

export function createDevelopmentServer(config) {
const sessions = new SessionStore(config);
const portalSessions = new SessionStore(config);
const localAuth = config.allowDevelopmentAuth ? new LocalDevelopmentAuthenticationProvider({ enabled: true }) : null;
const onboarding = new ClientOnboardingService();
const signatures=new SignatureService(),documentProcessing=new DocumentProcessingService(),graph=new MockMicrosoftGraphService(),portalManagement=new PortalManagementService(),customerReporting=new CustomerReportingService(),customerPortal=new CustomerPortalService(),financialLedger=new FinancialLedgerService();
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const privateReportDir = fileURLToPath(new URL('../private-storage/reports/', import.meta.url));
const privateUploadDir = fileURLToPath(new URL('../private-storage/uploads/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const noStore = { 'Cache-Control': 'no-store, private', 'Pragma': 'no-cache' };

function json(res, status, payload, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...noStore, ...extra });
  const envelope = status >= 400
    ? { ok: false, error: { code: payload?.error?.code || `HTTP_${status}`, message: typeof payload?.error === 'string' ? payload.error : payload?.error?.message || 'Er is iets misgegaan.' } }
    : { ok: true, data: payload };
  res.end(JSON.stringify(envelope));
}

function healthReport() {
  const clientIds = new Set(clients.map(client => client.id));
  const conversationIds = new Set(conversations.map(conversation => conversation.id));
  const references = [bankTransactions, purchaseInvoices, salesInvoices, tasks, auditLogs, documents, conversations, messages, journalEntries]
    .flat().every(item => !item.clientId || clientIds.has(item.clientId));
  const messageReferences = messages.every(message => conversationIds.has(message.conversationId));
  const balancedEntries = journalEntries.every(entry => Math.abs(entry.lines.reduce((total, line) => total + Number(line.debit || 0) - Number(line.credit || 0), 0)) < 0.001);
  const portalReferences=organizations.every(org=>customerRelationships.some(rel=>rel.id===org.customerRelationshipId))&&organizationChangeRequests.every(change=>organizations.some(org=>org.id===change.organizationId));
  return { status: references && messageReferences && balancedEntries && portalReferences ? 'ok' : 'degraded', database: references&&portalReferences ? 'ok' : 'error', migrations: 'ok', demoData: references && messageReferences && balancedEntries && portalReferences ? 'ok' : 'error', sessionStore: 'ok', checkedAt: dateTime.iso() };
}
function sessionFrom(req) {
  const raw = parseCookies(req.headers.cookie).dko_session;
  const id = verifySessionCookie(raw, config.sessionSecret);
  return { id, session: sessions.get(id) };
}
function requireSession(req, res) {
  const auth = sessionFrom(req);
  if (!auth.session) { json(res, 401, { error: 'Authenticatie vereist.' }); return null; }
  if (auth.session.locked) { json(res, 423, { error: 'Sessie vergrendeld.' }); return null; }
  return auth;
}
function portalSessionFrom(req){const raw=parseCookies(req.headers.cookie).dkp_session,id=verifySessionCookie(raw,config.sessionSecret);return {id,session:portalSessions.get(id)}}
function requirePortalAccess(req,res,organizationId){const auth=portalSessionFrom(req);if(!auth.session){json(res,401,{error:{code:'PORTAL_AUTH_REQUIRED',message:'Klantauthenticatie vereist.'}});return null}const access=portalManagement.portalAccess(auth.session.userId,organizationId);if(!access.allowed){json(res,403,{error:{code:access.reason,message:'Geen toegang tot deze onderneming.'}});return null}return {...auth,access}}
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 14_500_000) throw Object.assign(new Error('Bestand of verzoek is te groot.'),{status:413,code:'REQUEST_TOO_LARGE'}); }
  return JSON.parse(raw || '{}');
}
function cookie(id, maxAge = 86400) {
  return `dko_session=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.isProduction ? '; Secure' : ''}`;
}


  return http.createServer(async (req, res) => {
    Object.entries(securityHeaders(config.isProduction)).forEach(([k, v]) => res.setHeader(k, v));
    try {
      if (req.url === '/api/health' && req.method === 'GET') return json(res, 200, healthReport());
      if (req.url === '/api/auth/status' && req.method === 'GET') {
        const { session } = sessionFrom(req);
        return json(res, 200, { authenticated: Boolean(session), locked: session?.locked ?? false, user: session ? { id: session.userId, displayName: session.displayName } : null, authMethod: session?.method ?? null, passkeysAvailable: false, developmentAuth: config.allowDevelopmentAuth, idleMinutes: config.idleMs / 60_000, clock:{iso:dateTime.iso(),date:dateTime.formatDate(),dateTime:dateTime.formatDateTime(),greeting:dateTime.greeting(),year:dateTime.year(),month:dateTime.month(),quarter:dateTime.quarter(),startOfYear:dateTime.startOfYear()} });
      }
      if (req.url === '/api/auth/development-login' && req.method === 'POST') {
        if (!localAuth) return json(res, 404, { error: 'Niet beschikbaar.' });
        const identity = await localAuth.completeAuthentication(await body(req));
        const id = sessions.create(identity);
        return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(signedSessionCookie(id, config.sessionSecret)) });
      }
      if(req.url==='/api/portal/auth/development-login'&&req.method==='POST'){
        if(!config.allowDevelopmentAuth)return json(res,404,{error:'Niet beschikbaar.'});const input=await body(req),user=portalUsers.find(item=>item.id===input.userId&&item.status==='Actief');if(!user)return json(res,403,{error:{code:'PORTAL_USER_INVALID',message:'Onbekende of geblokkeerde portaalgebruiker.'}});const id=portalSessions.create({userId:user.id,displayName:user.name,method:'portal-development-bypass',audience:'customer'});return json(res,200,{user:{id:user.id,name:user.name}}, {'Set-Cookie':`dkp_session=${signedSessionCookie(id,config.sessionSecret)}; Path=/api/portal; HttpOnly; SameSite=Strict; Max-Age=86400${config.isProduction?'; Secure':''}`});
      }
      if(req.url==='/api/portal/me'&&req.method==='GET'){
        const auth=portalSessionFrom(req);if(!auth.session)return json(res,200,{authenticated:false,developmentAuth:config.allowDevelopmentAuth});return json(res,200,{authenticated:true,user:{id:auth.session.userId,name:auth.session.displayName},developmentAuth:config.allowDevelopmentAuth,organizationId:'de-boer-advies',security:{productionLogin:'Passkey of wachtwoord met verplichte authenticator-2FA',developmentBypass:config.allowDevelopmentAuth}});
      }
      if (req.url === '/api/auth/lock' && req.method === 'POST') {
        const { id, session } = sessionFrom(req); if (!session) return json(res, 401, { error: 'Niet aangemeld.' });
        sessions.lock(id); return json(res, 200, { ok: true });
      }
      if (req.url === '/api/auth/development-unlock' && req.method === 'POST') {
        if (!config.allowDevelopmentAuth) return json(res, 404, { error: 'Niet beschikbaar.' });
        const { id, session } = sessionFrom(req); if (!session) return json(res, 401, { error: 'Niet aangemeld.' });
        sessions.unlockForDevelopment(id); return json(res, 200, { ok: true });
      }
      if (req.url === '/api/auth/logout' && req.method === 'POST') {
        const { id } = sessionFrom(req); if (id) sessions.revoke(id);
        return json(res, 200, { ok: true }, { 'Clear-Site-Data': '"cache", "cookies", "storage"', 'Set-Cookie': cookie('', 0) });
      }
      if (req.url === '/api/secure/summary') {
        const { session } = sessionFrom(req);
        if (!session) return json(res, 401, { error: 'Authenticatie vereist.' });
        if (session.locked) return json(res, 423, { error: 'Sessie vergrendeld.' });
        return json(res, 200, { counters: dashboardSummary(), updatedAt: dateTime.iso() });
      }
      if (req.url === '/api/clients' && req.method === 'GET') {
        if (!requireSession(req,res)) return;
        return json(res,200,{clients:clients.filter(c=>!c.archivedAt).map(({profile,finance,...client})=>client),summary:dashboardSummary()});
      }
      if (req.url === '/api/clients' && req.method === 'POST') {
        const auth=requireSession(req,res); if(!auth) return;
        const result=onboarding.create(await body(req),auth.session.displayName,'manual');return json(res,result.ok?201:422,result);
      }
      const clientMatch=req.url?.match(/^\/api\/clients\/([^/?]+)$/);
      if (clientMatch && req.method==='GET') {
        if(!requireSession(req,res)) return; const client=clients.find(c=>c.id===decodeURIComponent(clientMatch[1]));
        if(!client) return json(res,404,{error:'Klant niet gevonden.'});
        return json(res,200,{client,report:report(client.id),tasks:tasks.filter(t=>t.clientId===client.id),activity:auditLogs.filter(a=>a.clientId===client.id).slice(0,8)});
      }
      if(clientMatch&&req.method==='PUT'){
        const auth=requireSession(req,res);if(!auth)return;const client=clients.find(c=>c.id===decodeURIComponent(clientMatch[1])&&!c.archivedAt);if(!client)return json(res,404,{error:'Klant niet gevonden.'});const input=await body(req);const before={name:client.name,contact:client.contact,email:client.email,phone:client.phone,manager:client.manager,status:client.status};
        for(const key of ['name','contact','email','phone','legalForm','kvk','manager','status','bankAccount','taxType','contactFrequency','vatPeriod','invoicePrefix'])if(input[key]!=null)client[key]=String(input[key]).slice(0,150);for(const key of ['paymentTerm','hourlyRate','fiscalYear'])if(input[key]!=null&&Number.isFinite(Number(input[key])))client[key]=Number(input[key]);if(input.profile)client.profile={...client.profile,...input.profile};
        auditLogs.unshift({id:`a-${Date.now()}`,clientId:client.id,user:auth.session.displayName,at:dateTime.iso(),module:'Klanten',action:'Klant gewijzigd',object:client.id,oldValue:before,newValue:{name:client.name,contact:client.contact,email:client.email,phone:client.phone,manager:client.manager,status:client.status}});return json(res,200,{client});
      }
      if(clientMatch&&req.method==='DELETE'){
        const auth=requireSession(req,res);if(!auth)return;const client=clients.find(c=>c.id===decodeURIComponent(clientMatch[1])&&!c.archivedAt);if(!client)return json(res,404,{error:'Klant niet gevonden.'});const input=await body(req);if(input.confirmation!==client.name)return json(res,422,{error:'Bevestiging komt niet overeen met de bedrijfsnaam.'});client.archivedAt=dateTime.iso();client.status='Inactief';auditLogs.unshift({id:`a-${Date.now()}`,clientId:client.id,user:auth.session.displayName,at:dateTime.iso(),module:'Klanten',action:'Klant gearchiveerd',object:client.id,oldValue:'Actief',newValue:'Inactief'});return json(res,200,{ok:true,archivedAt:client.archivedAt});
      }
      const actionMatch=req.url?.match(/^\/api\/clients\/([^/?]+)\/actions$/);
      if(actionMatch&&req.method==='POST'){
        const auth=requireSession(req,res);if(!auth)return;const client=clients.find(c=>c.id===decodeURIComponent(actionMatch[1])&&!c.archivedAt);if(!client)return json(res,404,{error:'Klant niet gevonden.'});const input=await body(req);const action=String(input.action||'').slice(0,80),description=String(input.description||'').trim().slice(0,500);if(!action||!description)return json(res,422,{error:'Omschrijving is verplicht.'});
        if(action==='Nieuwe taak'){tasks.push({id:`task-${Date.now()}`,clientId:client.id,type:'Overige',description,status:'Nieuw',owner:auth.session.displayName,sourceId:null});client.actions=(client.actions||0)+1}
        if(action==='Afspraak plannen')client.appointment=description;
        auditLogs.unshift({id:`a-${Date.now()}`,clientId:client.id,user:auth.session.displayName,at:dateTime.iso(),module:action,action:`${action} vastgelegd`,object:client.id,oldValue:null,newValue:description});return json(res,201,{ok:true,action,description});
      }
      const accountingMatch=req.url?.match(/^\/api\/clients\/([^/?]+)\/accounting$/);
      if(accountingMatch&&req.method==='GET') {
        if(!requireSession(req,res)) return; const clientId=decodeURIComponent(accountingMatch[1]); if(!clients.some(c=>c.id===clientId)) return json(res,404,{error:'Klant niet gevonden.'});
        return json(res,200,{...financialLedger.snapshot(clientId),period:periodCheck(clientId),report:report(clientId)});
      }
      const accountCardMatch=req.url?.match(/^\/api\/clients\/([^/?]+)\/ledger-accounts\/([^/?]+)(?:\?.*)?$/);
      if(accountCardMatch&&req.method==='GET'){if(!requireSession(req,res))return;const url=new URL(req.url,'http://local');return json(res,200,{account:financialLedger.accountCard(decodeURIComponent(accountCardMatch[1]),decodeURIComponent(accountCardMatch[2]),{from:url.searchParams.get('from')||undefined,to:url.searchParams.get('to')||undefined,bookNumber:url.searchParams.get('bookNumber')||''})});}
      const accountsMatch=req.url?.match(/^\/api\/clients\/([^/?]+)\/ledger-accounts$/);
      if(accountsMatch&&req.method==='POST'){const auth=requireSession(req,res);if(!auth)return;return json(res,201,{account:financialLedger.createAccount(decodeURIComponent(accountsMatch[1]),await body(req),auth.session.displayName)});}
      if(accountCardMatch&&req.method==='PUT'){const auth=requireSession(req,res);if(!auth)return;return json(res,200,{account:financialLedger.updateAccount(decodeURIComponent(accountCardMatch[1]),decodeURIComponent(accountCardMatch[2]),await body(req),auth.session.displayName)});}
      const draftEntryMatch=req.url?.match(/^\/api\/clients\/([^/?]+)\/ledger-entries$/);
      if(draftEntryMatch&&req.method==='POST'){const auth=requireSession(req,res);if(!auth)return;return json(res,201,{entry:financialLedger.createDraft(decodeURIComponent(draftEntryMatch[1]),await body(req),auth.session.displayName)});}
      const finalizeMatch=req.url?.match(/^\/api\/clients\/([^/?]+)\/ledger-entries\/([^/?]+)\/finalize$/);
      if(finalizeMatch&&req.method==='POST'){const auth=requireSession(req,res);if(!auth)return;return json(res,200,{entry:financialLedger.finalize(decodeURIComponent(finalizeMatch[1]),decodeURIComponent(finalizeMatch[2]),auth.session.displayName)});}
      const reverseMatch=req.url?.match(/^\/api\/clients\/([^/?]+)\/ledger-entries\/([^/?]+)\/reverse$/);
      if(reverseMatch&&req.method==='POST'){const auth=requireSession(req,res);if(!auth)return;const input=await body(req);return json(res,201,{entry:financialLedger.reverse(decodeURIComponent(reverseMatch[1]),decodeURIComponent(reverseMatch[2]),auth.session.displayName,input.reason)});}
      const paymentMatch=req.url?.match(/^\/api\/clients\/([^/?]+)\/(sales|purchase)-invoices\/([^/?]+)\/payments$/);
      if(paymentMatch&&req.method==='POST'){const auth=requireSession(req,res);if(!auth)return;return json(res,201,financialLedger.registerPayment(decodeURIComponent(paymentMatch[1]),paymentMatch[2],decodeURIComponent(paymentMatch[3]),await body(req),auth.session.displayName));}
      const bankImportMatch=req.url?.match(/^\/api\/clients\/([^/?]+)\/bank-imports$/);
      if(bankImportMatch&&req.method==='POST'){const auth=requireSession(req,res);if(!auth)return;return json(res,201,financialLedger.importBank(decodeURIComponent(bankImportMatch[1]),await body(req),auth.session.displayName));}
      const entryMatch=req.url?.match(/^\/api\/clients\/([^/?]+)\/journal-entries$/);
      if(entryMatch&&req.method==='POST') {
        const auth=requireSession(req,res); if(!auth) return; const clientId=decodeURIComponent(entryMatch[1]); const input=await body(req); const result=addJournalEntry({...input,clientId},auth.session.displayName); return json(res,result.ok?201:422,result);
      }
      const documentMatch=req.url?.match(/^\/api\/clients\/([^/?]+)\/bank-transactions\/([^/?]+)\/document$/);
      if(documentMatch&&req.method==='POST') {
        const auth=requireSession(req,res); if(!auth) return; const result=resolveDocumentProblem(decodeURIComponent(documentMatch[1]),decodeURIComponent(documentMatch[2]),auth.session.displayName); return json(res,result.ok?200:404,result);
      }
      if(req.url?.startsWith('/api/work-queue')&&req.method==='GET'){if(!requireSession(req,res))return;const includeDone=new URL(req.url,'http://local').searchParams.get('includeDone')==='true';const list=(includeDone?tasks:openTasks()).map(t=>({...t,clientName:clientName(t.clientId)}));return json(res,200,{tasks:list});}
      if(req.url==='/api/audit'&&req.method==='GET'){if(!requireSession(req,res))return;return json(res,200,{auditLogs});}
      if(req.url?.startsWith('/api/documents')&&req.method==='GET'){if(!requireSession(req,res))return;const clientId=new URL(req.url,'http://local').searchParams.get('clientId');if(clientId&&!clients.some(c=>c.id===clientId))return json(res,404,{error:'Klant niet gevonden.'});return json(res,200,{documents:getDocuments(clientId).map(d=>({...d,clientName:clientName(d.clientId)})),missing:bankTransactions.filter(t=>(!clientId||t.clientId===clientId)&&t.status==='Document ontbreekt').map(t=>({...t,clientName:clientName(t.clientId)}))});}
      if(req.url==='/api/documents'&&req.method==='POST'){const auth=requireSession(req,res);if(!auth)return;const input=await body(req);if(!clients.some(c=>c.id===input.clientId))return json(res,404,{error:'Klant niet gevonden.'});const result=documentProcessing.createMetadata(input,signatures.get(auth.session.userId).name);if(result.ok)auditLogs.unshift({id:`a-${Date.now()}`,clientId:input.clientId,user:signatures.get(auth.session.userId).name,at:dateTime.iso(),module:'Documenten',action:'Document geüpload',object:result.document.id,oldValue:null,newValue:result.document.fileName});return json(res,result.ok?201:422,result);}
      if(req.url==='/api/communication'&&req.method==='GET'){if(!requireSession(req,res))return;return json(res,200,{conversations:conversations.map(c=>({...c,clientName:clientName(c.clientId),messages:messages.filter(m=>m.conversationId===c.id)}))});}
      const replyMatch=req.url?.match(/^\/api\/communication\/([^/?]+)\/reply$/);if(replyMatch&&req.method==='POST'){const auth=requireSession(req,res);if(!auth)return;const conv=conversations.find(c=>c.id===decodeURIComponent(replyMatch[1]));if(!conv)return json(res,404,{error:'Gesprek niet gevonden.'});const input=await body(req),bodyText=String(input.body||'').trim();if(!bodyText)return json(res,422,{error:'Bericht mag niet leeg zijn.'});const signature=signatures.get(auth.session.userId),message={id:`msg-${Date.now()}`,conversationId:conv.id,clientId:conv.clientId,sender:signature.name,direction:'outbound',body:bodyText,channel:conv.channel,createdAt:dateTime.iso(),signature};messages.push(message);conv.status='Wacht op klant';conv.unread=false;conv.updatedAt=message.createdAt;auditLogs.unshift({id:`a-${Date.now()}`,clientId:conv.clientId,user:signature.name,at:dateTime.iso(),module:'Communicatie',action:'Bericht beantwoord',object:conv.id,oldValue:null,newValue:bodyText});return json(res,201,{message,conversation:conv});}
      if(req.url==='/api/communication/import'&&req.method==='POST'){const auth=requireSession(req,res);if(!auth)return;const imported=await graph.importMessage();return json(res,201,imported);}
      if(req.url==='/api/administration'&&req.method==='GET'){if(!requireSession(req,res))return;return json(res,200,{administrations:clients.filter(c=>!c.archivedAt).map(c=>({clientId:c.id,clientName:c.name,through:c.through,unprocessed:bankTransactions.filter(t=>t.clientId===c.id&&t.status!=='Verwerkt').length,missing:bankTransactions.filter(t=>t.clientId===c.id&&t.status==='Document ontbreekt').length,review:journalEntries.filter(e=>e.clientId===c.id&&e.status==='Controle nodig').length,vatStatus:periodCheck(c.id).ready?'Klaar voor controle':'Nog incompleet',lastImport:dateTime.formatDateTime()}))});}
      const relationshipMatch=req.url?.match(/^\/api\/relationships\/([^/?]+)$/);
      if(relationshipMatch&&req.method==='GET'){if(!requireSession(req,res))return;const relationship=portalManagement.relationship(decodeURIComponent(relationshipMatch[1]));if(!relationship)return json(res,404,{error:'Klantrelatie niet gevonden.'});return json(res,200,{relationship});}
      const organizationMatch=req.url?.match(/^\/api\/organizations\/([^/?]+)$/);
      if(organizationMatch&&req.method==='GET'){if(!requireSession(req,res))return;const organization=portalManagement.organization(decodeURIComponent(organizationMatch[1]));if(!organization)return json(res,404,{error:'Onderneming niet gevonden.'});return json(res,200,{organization});}
      const previewMatch=req.url?.match(/^\/api\/organizations\/([^/?]+)\/portal-preview$/);
      if(previewMatch&&req.method==='GET'){const auth=requireSession(req,res);if(!auth)return;return json(res,200,{preview:portalManagement.preview(auth.session.userId,decodeURIComponent(previewMatch[1]))});}
      const officeReportMatch=req.url?.match(/^\/api\/organizations\/([^/?]+)\/customer-report(?:\?.*)?$/);
      if(officeReportMatch&&req.method==='GET'){if(!requireSession(req,res))return;const period=new URL(req.url,'http://local').searchParams.get('period')||'ytd';return json(res,200,{report:customerReporting.create(decodeURIComponent(officeReportMatch[1]),period)});}
      const officePdfMatch=req.url?.match(/^\/api\/organizations\/([^/?]+)\/customer-report\/([^/?]+)\.pdf$/);
      if(officePdfMatch&&req.method==='GET'){if(!requireSession(req,res))return;const organizationId=decodeURIComponent(officePdfMatch[1]),period=decodeURIComponent(officePdfMatch[2]);if(!['month','quarter','ytd'].includes(period))return json(res,422,{error:'Ongeldige rapportageperiode.'});const pdf=await readFile(join(privateReportDir,`${organizationId}-${period}.pdf`));res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="financieel-overzicht-${organizationId}-${period}.pdf"`,...noStore});return res.end(pdf);}
      const portalReportMatch=req.url?.match(/^\/api\/portal\/organizations\/([^/?]+)\/reports(?:\?.*)?$/);
      if(portalReportMatch&&req.method==='GET'){const organizationId=decodeURIComponent(portalReportMatch[1]);if(!requirePortalAccess(req,res,organizationId))return;const period=new URL(req.url,'http://local').searchParams.get('period')||'ytd';return json(res,200,{report:customerReporting.publicView(customerReporting.create(organizationId,period))});}
      const portalPdfMatch=req.url?.match(/^\/api\/portal\/organizations\/([^/?]+)\/reports\/([^/?]+)\.pdf$/);
      if(portalPdfMatch&&req.method==='GET'){const organizationId=decodeURIComponent(portalPdfMatch[1]),period=decodeURIComponent(portalPdfMatch[2]);if(!requirePortalAccess(req,res,organizationId))return;if(!['month','quarter','ytd'].includes(period))return json(res,422,{error:'Ongeldige rapportageperiode.'});const pdf=await readFile(join(privateReportDir,`${organizationId}-${period}.pdf`));res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="financieel-overzicht-${organizationId}-${period}.pdf"`,...noStore});return res.end(pdf);}
      const portalWorkspaceMatch=req.url?.match(/^\/api\/portal\/organizations\/([^/?]+)\/workspace$/);
      if(portalWorkspaceMatch&&req.method==='GET'){const organizationId=decodeURIComponent(portalWorkspaceMatch[1]),auth=requirePortalAccess(req,res,organizationId);if(!auth)return;return json(res,200,{workspace:customerPortal.workspace(organizationId,auth.session)});}
      const portalDocumentMatch=req.url?.match(/^\/api\/portal\/organizations\/([^/?]+)\/documents$/);
      if(portalDocumentMatch&&req.method==='POST'){const organizationId=decodeURIComponent(portalDocumentMatch[1]),auth=requirePortalAccess(req,res,organizationId);if(!auth)return;const input=await body(req),document=customerPortal.upload(organizationId,input,auth.session);if(input.contentBase64){const bytes=Buffer.from(input.contentBase64,'base64');if(bytes.length!==Number(input.size))throw Object.assign(new Error('Bestandsinhoud is ongeldig.'),{status:422,code:'INVALID_FILE_CONTENT'});await mkdir(privateUploadDir,{recursive:true});const suffix=extname(document.fileName);document.storageKey=`${document.id}${suffix}`;await writeFile(join(privateUploadDir,document.storageKey),bytes)}return json(res,201,{document});}
      const portalInvoiceMatch=req.url?.match(/^\/api\/portal\/organizations\/([^/?]+)\/invoices$/);
      if(portalInvoiceMatch&&req.method==='POST'){const organizationId=decodeURIComponent(portalInvoiceMatch[1]),auth=requirePortalAccess(req,res,organizationId);if(!auth)return;return json(res,201,{invoice:customerPortal.createInvoice(organizationId,await body(req),auth.session)});}
      const portalMessageMatch=req.url?.match(/^\/api\/portal\/organizations\/([^/?]+)\/messages$/);
      if(portalMessageMatch&&req.method==='POST'){const organizationId=decodeURIComponent(portalMessageMatch[1]),auth=requirePortalAccess(req,res,organizationId);if(!auth)return;return json(res,201,customerPortal.sendMessage(organizationId,await body(req),auth.session));}
      const portalAppointmentMatch=req.url?.match(/^\/api\/portal\/organizations\/([^/?]+)\/appointments$/);
      if(portalAppointmentMatch&&req.method==='POST'){const organizationId=decodeURIComponent(portalAppointmentMatch[1]),auth=requirePortalAccess(req,res,organizationId);if(!auth)return;return json(res,201,{appointment:customerPortal.createAppointment(organizationId,await body(req),auth.session)});}
      const portalSettingsMatch=req.url?.match(/^\/api\/portal\/organizations\/([^/?]+)\/settings$/);
      if(portalSettingsMatch&&req.method==='PUT'){const organizationId=decodeURIComponent(portalSettingsMatch[1]),auth=requirePortalAccess(req,res,organizationId);if(!auth)return;return json(res,200,{workspace:customerPortal.updateSettings(organizationId,await body(req),auth.session)});}
      const featureMatch=req.url?.match(/^\/api\/organizations\/([^/?]+)\/features\/([^/?]+)$/);
      if(featureMatch&&req.method==='PUT'){const auth=requireSession(req,res);if(!auth)return;const feature=portalManagement.setFeature(auth.session.userId,decodeURIComponent(featureMatch[1]),decodeURIComponent(featureMatch[2]),await body(req));return json(res,200,{feature});}
      if(req.url==='/api/change-requests'&&req.method==='GET'){if(!requireSession(req,res))return;return json(res,200,{changeRequests:portalManagement.workQueue()});}
      const processChangeMatch=req.url?.match(/^\/api\/change-requests\/([^/?]+)\/process$/);
      if(processChangeMatch&&req.method==='POST'){const auth=requireSession(req,res);if(!auth)return;return json(res,200,portalManagement.processChange(auth.session.userId,decodeURIComponent(processChangeMatch[1]),await body(req)));}
      const membershipMatch=req.url?.match(/^\/api\/memberships\/([^/?]+)$/);
      if(membershipMatch&&req.method==='DELETE'){const auth=requireSession(req,res);if(!auth)return;return json(res,200,{membership:portalManagement.removeMembership(auth.session.userId,decodeURIComponent(membershipMatch[1]))});}
      if (req.url?.startsWith('/api/')) return json(res, 404, { error: 'Niet gevonden.' });

      const route = req.url === '/' ? '/index.html' : req.url==='/mijn'||req.url==='/mijn/'?'/mijn.html':req.url;
      const path = normalize(join(publicDir, route.split('?')[0]));
      if (!path.startsWith(publicDir)) return json(res, 403, { error: 'Geen toegang.' });
      const data = await readFile(path);
      const isImmutableAsset = /\/assets\//.test(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': isImmutableAsset ? 'public, max-age=31536000, immutable' : extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600' });
      res.end(data);
    } catch (error) {
      if (error?.code === 'ENOENT' && !req.url?.startsWith('/api/') && !extname(req.url?.split('?')[0] || '')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(await readFile(join(publicDir, 'index.html'))); }
      if (error?.code === 'ENOENT') { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(await readFile(join(publicDir, 'offline.html'))); }
      console.error(error); return json(res, error.status||400, { error: { code:error.code||'REQUEST_FAILED', message:error.status?error.message:'Er is iets misgegaan. Probeer het opnieuw.' } });
    }
  });
}

