import test from 'node:test';
import assert from 'node:assert/strict';
import {validateQuoteLines} from '../src/prospect-quote-policy.mjs';
const companies=[{position:1,company_data:{companyName:'Holding BV'}},{position:2,company_data:{companyName:'Werkmaatschappij BV'}}];
const line=(position,monthlyPriceExVat='200.00')=>({position,monthlyPriceExVat,oneTimePriceExVat:'25.50',service:'Administratie'});
test('offerte koppelt maandprijs per juiste onderneming ongeacht invoervolgorde',()=>{
 const quotes=validateQuoteLines([line(2,'450,75'),line(1,'200.00')],companies);
 assert.deepEqual(quotes.map(x=>[x.position,x.monthlyPriceExVat,x.companyName]),[[1,200,'Holding BV'],[2,450.75,'Werkmaatschappij BV']]);
 assert.equal(quotes[0].oneTimePriceExVat,25.5);
});
test('geen dubbele of onbekende ondernemingen en geen ontbrekende prijzen',()=>{
 assert.throws(()=>validateQuoteLines([line(1),line(1)],companies),/Dubbele/);
 assert.throws(()=>validateQuoteLines([line(1),line(3)],companies),/onbekende/);
 assert.throws(()=>validateQuoteLines([line(1)],companies),/één prijsafspraak/);
 assert.throws(()=>validateQuoteLines([{...line(1),monthlyPriceExVat:''},line(2)],companies),/Maandtarief/);
});
test('geen verborgen afrondingen, negatieve bedragen of ongeldige notaties',()=>{
 for(const bad of ['1.999','-10','1e2','NaN','100000.01','']) {
   assert.throws(()=>validateQuoteLines([line(1,bad),line(2)],companies));
 }
 assert.equal(validateQuoteLines([line(1,0),line(2)],companies)[0].monthlyPriceExVat,0);
});
test('offerte voor maximaal vijf ondernemingen met afzonderlijke prijzen',()=>{
 const five=Array.from({length:5},(_,i)=>({position:i+1,company_data:{companyName:'Onderneming '+(i+1)}}));
 const q=validateQuoteLines(five.map(c=>line(c.position,String(c.position*100))),five);
 assert.deepEqual(q.map(x=>x.monthlyPriceExVat),[100,200,300,400,500]);
 assert.throws(()=>validateQuoteLines([...five,{position:6}],Array.from({length:6},(_,i)=>({position:i+1}))));
});
