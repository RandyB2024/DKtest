import { bankTransactions, clients, conversations, documents, tasks } from '../domain/demo-data.mjs';
export const openTasks=()=>tasks.filter(t=>t.status!=='Afgerond');
export const getOpenTaskCount=()=>openTasks().length;
export const getMissingDocumentCount=()=>bankTransactions.filter(t=>t.status==='Document ontbreekt').length;
export const getUnreadMessageCount=()=>conversations.filter(c=>c.unread).length;
export const getClientsNeedingAttention=()=>clients.filter(c=>!c.archivedAt&&(c.status==='Aandacht nodig'||c.status==='Achterstand'||openTasks().some(t=>t.clientId===c.id)));
export const clientName=id=>clients.find(c=>c.id===id)?.name||'Onbekende klant';
export const getDocuments=clientId=>documents.filter(d=>!clientId||d.clientId===clientId);
