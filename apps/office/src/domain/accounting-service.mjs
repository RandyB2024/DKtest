import { auditLogs, bankTransactions, clients, journalEntries, tasks } from './demo-data.mjs';
import { dateTime } from '../services/date-time-service.mjs';
import { getMissingDocumentCount, getOpenTaskCount, getUnreadMessageCount } from '../services/workspace-query-service.mjs';

const cents = value => Math.round(Number(value || 0) * 100);
export function validateJournalEntry(entry) {
  if (!entry?.clientId || !clients.some(c=>c.id===entry.clientId)) return {ok:false,error:'Een geldige client_id is verplicht.'};
  if (!Array.isArray(entry.lines) || entry.lines.length < 2) return {ok:false,error:'Een journaalpost vereist minimaal twee regels.'};
  const debit=entry.lines.reduce((s,l)=>s+cents(l.debit),0), credit=entry.lines.reduce((s,l)=>s+cents(l.credit),0);
  if (debit <= 0 || debit !== credit) return {ok:false,error:'Journaalpost is niet in balans.',debit:debit/100,credit:credit/100};
  return {ok:true,debit:debit/100,credit:credit/100};
}
export function addJournalEntry(entry,user) {
  const result=validateJournalEntry(entry); if(!result.ok) return result;
  const stored={...entry,id:`J-${Date.now()}`,status:entry.status||'Concept',createdBy:user,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  journalEntries.push(stored); auditLogs.unshift({id:`a-${Date.now()}`,clientId:entry.clientId,user,at:new Date().toISOString(),module:'Boekhouding',action:'Boeking aangemaakt',object:stored.id,oldValue:null,newValue:stored.status});
  return {ok:true,entry:stored};
}
export function resolveDocumentProblem(clientId,transactionId,user) {
  const transaction=bankTransactions.find(t=>t.id===transactionId&&t.clientId===clientId); if(!transaction) return {ok:false,error:'Transactie niet gevonden.'};
  transaction.documentId=`doc-${Date.now()}`; transaction.status='Document ontvangen';
  const task=tasks.find(t=>t.sourceId===transactionId&&t.clientId===clientId); if(task) task.status='Afgerond';
  auditLogs.unshift({id:`a-${Date.now()}`,clientId,user,at:new Date().toISOString(),module:'Documenten',action:'Document gekoppeld',object:transactionId,oldValue:'Document ontbreekt',newValue:'Document ontvangen'});
  return {ok:true,transaction,task};
}
export function periodCheck(clientId) {
  const openTransactions=bankTransactions.filter(t=>t.clientId===clientId&&t.status!=='Verwerkt').length;
  const missingDocuments=bankTransactions.filter(t=>t.clientId===clientId&&t.status==='Document ontbreekt').length;
  const draftEntries=journalEntries.filter(e=>e.clientId===clientId&&['Concept','Controle nodig'].includes(e.status)).length;
  const unbalanced=journalEntries.filter(e=>e.clientId===clientId&&!validateJournalEntry(e).ok).length;
  const issues=openTransactions+missingDocuments+draftEntries+unbalanced;
  return {ready:issues===0,issues,checks:{openTransactions,missingDocuments,draftEntries,unbalanced,vatChecked:issues===0}};
}
export function report(clientId) {
  const client=clients.find(c=>c.id===clientId); if(!client) return null;
  const entries=journalEntries.filter(e=>e.clientId===clientId);
  const accountTotal=(codes,side)=>entries.flatMap(e=>e.lines).filter(l=>codes.includes(l.account)).reduce((s,l)=>s+Number(l[side]||0),0);
  const revenue=accountTotal(['8000','8100'],'credit'); const costs=accountTotal(['4000','4200','4300','4400','4500','4550','4600','4700','4800','4900'],'debit');
  return {revenue:revenue||client.finance.revenue,costs:costs||client.finance.costs,result:(revenue||client.finance.revenue)-(costs||client.finance.costs),vat:client.finance.vat,receivables:client.finance.receivables,payables:client.finance.payables,bank:client.finance.bank};
}
export function reportForPeriod(clientId,startDate,endDate){
  const client=clients.find(c=>c.id===clientId);if(!client)return null;const entries=journalEntries.filter(entry=>entry.clientId===clientId&&entry.date>=startDate&&entry.date<=endDate),lines=entries.flatMap(entry=>entry.lines),total=(codes,side)=>lines.filter(line=>codes.includes(line.account)).reduce((sum,line)=>sum+Number(line[side]||0),0);const revenue=total(['8000','8100'],'credit'),costs=total(['4000','4200','4300','4400','4500','4550','4600','4700','4800','4900'],'debit');return {revenue,costs,result:revenue-costs,vat:client.finance.vat,receivables:client.finance.receivables,payables:client.finance.payables,bank:client.finance.bank};
}
export function dashboardSummary(){
  const activeClients=clients.filter(c=>c.status!=='Inactief'&&!c.archivedAt).length;
  return {clients:activeClients,actions:getOpenTaskCount(),documents:getMissingDocumentCount(),messages:getUnreadMessageCount(),actualClients:clients.length,updatedAt:dateTime.iso()};
}
