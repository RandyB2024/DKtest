import test from 'node:test';
import assert from 'node:assert/strict';
import { addJournalEntry, periodCheck, resolveDocumentProblem, validateJournalEntry } from '../src/domain/accounting-service.mjs';
import { auditLogs, bankTransactions, clients, tasks } from '../src/domain/demo-data.mjs';

test('bekende klant-id bestaat en onbekende klant wordt geweigerd',()=>{
  assert.ok(clients.some(c=>c.id==='jansen-bouw'));
  assert.equal(validateJournalEntry({clientId:'andere-klant',lines:[{debit:10},{credit:10}]}).ok,false);
});
test('gebalanceerde journaalpost wordt geaccepteerd',()=>{
  const r=validateJournalEntry({clientId:'jansen-bouw',lines:[{debit:121,credit:0},{debit:0,credit:100},{debit:0,credit:21}]});assert.equal(r.ok,true);assert.equal(r.debit,r.credit);
});
test('ongebalanceerde journaalpost wordt server-side geweigerd',()=>{
  const r=addJournalEntry({clientId:'jansen-bouw',description:'Fout',lines:[{debit:100,credit:0},{debit:0,credit:99}]},'Randy');assert.equal(r.ok,false);assert.match(r.error,/niet in balans/);
});
test('klantdata is expliciet via clientId geïsoleerd',()=>{
  const own=bankTransactions.filter(t=>t.clientId==='de-boer-advies');assert.ok(own.length);assert.ok(own.every(t=>t.clientId==='de-boer-advies'));assert.ok(!own.some(t=>t.id==='bt-3'));
});
test('zakelijke banktransactie zonder document krijgt documentstatus en taak',()=>{
  const t=bankTransactions.find(t=>t.id==='bt-1');assert.equal(t.status,'Document ontbreekt');assert.ok(tasks.some(x=>x.sourceId==='bt-1'&&x.status!=='Afgerond'));
});
test('document koppelen werkt transactie, taak en auditlog bij',()=>{
  const r=resolveDocumentProblem('de-boer-advies','bt-1','Ed');assert.equal(r.ok,true);assert.equal(r.transaction.status,'Document ontvangen');assert.equal(r.task.status,'Afgerond');assert.ok(auditLogs.some(a=>a.object==='bt-1'&&a.action==='Document gekoppeld'));
});
test('periode is niet gereed zolang open fouten bestaan',()=>{
  const p=periodCheck('jansen-bouw');assert.equal(p.ready,false);assert.ok(p.issues>0);
});
