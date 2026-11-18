import test from 'node:test';
import assert from 'node:assert/strict';
import {isOfficeAgreementName,publicProspectDocuments,publicProspectApplicant} from '../src/prospect-document-policy.mjs';
test('publieke uitnodiging verbergt de interne overeenkomst maar niet klantdocumenten',()=>{
 const docs=[{id:'1',filename:'Jaarrekening - 2025.pdf'},
  {id:'2',filename:'Overeenkomst van opdracht - ondertekend.pdf'},
  {id:'3',filename:'Identiteitsbewijs ondernemer - afgeschermd.pdf'}];
 assert.deepEqual(publicProspectDocuments(docs).map(d=>d.id),['1','3']);
 assert.equal(isOfficeAgreementName('Overeenkomst van opdracht - vals.pdf'),true);
});
test('publieke uitnodiging laat geen interne workflowinformatie uitlekken',()=>{
 const personal=publicProspectApplicant({firstName:'Test',email:'test@example.com',
  assignedTo:'employee-id',leadSource:'internal',additionalContacts:[{email:'x@y.z'}],
  workflowV4:{version:4,stage:'agreement',quote:[{monthlyPriceExVat:100}],
   evidence:{agreementDocumentId:'secret'},history:[{actorId:'admin',notes:'intern'}]}});
 assert.equal(personal.firstName,'Test');
 assert.deepEqual(personal.workflowV4,{version:4});
 assert.equal('assignedTo' in personal,false);
 assert.equal('leadSource' in personal,false);
 assert.equal('additionalContacts' in personal,false);
 assert.doesNotMatch(JSON.stringify(personal),/secret|intern|monthlyPriceExVat|employee-id/);
});
