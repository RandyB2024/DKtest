import test from 'node:test';
import assert from 'node:assert/strict';
import {prospectDocumentChecklist} from '../src/prospect-document-checklist.mjs';
const companies=[
 {position:1,company_data:{administrativeOnboarding:{vatRequired:'no'}}},
 {position:2,company_data:{administrativeOnboarding:{vatRequired:'yes'}}}
];
const doc=(position,filename)=>({company_position:position,filename});
test('verplichte IB en ID worden voor ondernemer afzonderlijk gemeld',()=>{
 const r=prospectDocumentChecklist([doc(1,'KvK-uittreksel - 2026.pdf')],companies);
 assert.deepEqual(r.missingPersonalDocuments,['Aangifte inkomstenbelasting','Identiteitsbewijs ondernemer']);
 assert.equal(r.documentsSupplied,false);
});
test('btw-aangifte alleen vereist bij btw-plichtige onderneming',()=>{
 const docs=[doc(1,'Aangifte inkomstenbelasting - 2025.pdf'),doc(1,'Identiteitsbewijs ondernemer - veilig.pdf'),
  ...[1,2].flatMap(position=>['KvK-uittreksel','Jaarrekening','Kolommenbalans'].map(n=>doc(position,n+' - bewijs.pdf')))];
 const result=prospectDocumentChecklist(docs,companies);
 assert.equal(result.companyDocuments[0].missingDocuments.length,0);
 assert.deepEqual(result.companyDocuments[1].missingDocuments,['Btw-aangifte']);
 assert.equal(result.documentsSupplied,false);
 const complete=prospectDocumentChecklist([...docs,doc(2,'Btw-aangifte - Q3.pdf')],companies);
 assert.equal(complete.documentsSupplied,true);
 assert.equal(complete.documentsVerified,false);
 assert.equal(complete.companyDocuments[0].kvkIssueDateRequiresReview,true);
});
test('dezelfde bijlage van een andere onderneming vult dossier niet automatisch aan',()=>{
 const r=prospectDocumentChecklist([doc(1,'KvK-uittreksel - test.pdf')],companies);
 assert.ok(r.companyDocuments[1].missingDocuments.includes('KvK-uittreksel'));
});
