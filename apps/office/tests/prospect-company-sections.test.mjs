import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCompanySections} from '../src/prospect-company-sections.mjs';
const valid=position=>({position,financial:{cashBookkeeping:'no',cashTransactions:'no',previousYearTurnover:'150000'},
 administration:{vatRequired:'yes',vatFrequency:'quarter',iban:'NL00BANK0123456789'}});
test('één, twee en vijf ondernemingen hebben eigen afzonderlijke antwoorden',()=>{
 for(const count of [1,2,5]){
  const rows=Array.from({length:count},(_,i)=>valid(i+1));
  rows[0].financial.previousYearTurnover='777';
  const parsed=normalizeCompanySections(rows,rows.map(r=>r.position),{submit:true});
  assert.equal(parsed.size,count);
  assert.equal(parsed.get(1).financial.previousYearTurnover,'777');
  if(count>1) assert.equal(parsed.get(2).financial.previousYearTurnover,'150000');
 }
});
test('zes ondernemingen, dubbele posities en onbekende onderneming zijn verboden',()=>{
 assert.throws(()=>normalizeCompanySections(Array.from({length:6},(_,i)=>valid(i+1)),[1,2,3,4,5,6]));
 assert.throws(()=>normalizeCompanySections([valid(1),valid(1)],[1,2]));
 assert.throws(()=>normalizeCompanySections([valid(3)],[1,2]));
});
test('volledigheid bij indienen geldt voor iedere onderneming',()=>{
 assert.throws(()=>normalizeCompanySections([valid(1)],[1,2],{submit:true}));
 const invalid=valid(2);invalid.administration.iban='';
 assert.throws(()=>normalizeCompanySections([valid(1),invalid],[1,2],{submit:true}));
 assert.equal(normalizeCompanySections([valid(1),invalid],[1,2],{submit:false}).size,2);
});
test('onbekende velden en interne organisatie-ID worden geweigerd',()=>{
 assert.throws(()=>normalizeCompanySections([{...valid(1),administration:{iban:'x',organization_id:'other'}}],[1]));
});

test('zonder btw-plicht worden btw-vragen per onderneming overgeslagen en oude antwoorden verwijderd',()=>{
 const first=valid(1);
 first.administration={...first.administration,vatRequired:'no',vatFrequency:'quarter',kor:'yes',
  vatIdNumber:'NL123456789B01',turnoverTaxNumber:'123456789B01',vatNumber:'NL999999999B01'};
 const second=valid(2);
 const rows=normalizeCompanySections([first,second],[1,2],{submit:true});
 const withoutVat=rows.get(1).administration;
 assert.equal(withoutVat.vatRequired,'no');
 for(const field of ['vatFrequency','kor','vatIdNumber','turnoverTaxNumber','vatNumber']){
  assert.equal(withoutVat[field],'');
 }
 assert.equal(rows.get(2).administration.vatFrequency,'quarter');
});
test('een btw-plichtige onderneming moet haar eigen aangiftefrequentie kiezen',()=>{
 const first=valid(1);
 first.administration.vatFrequency='';
 assert.throws(()=>normalizeCompanySections([first],[1],{submit:true}),/btw-aangiftefrequentie/);
});
