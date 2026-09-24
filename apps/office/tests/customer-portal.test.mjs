import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './helpers/development-server.mjs';
import { documents, conversations, salesInvoices } from '../src/domain/demo-data.mjs';

async function setup(t){const server=createServer().listen(0,'127.0.0.1');t.after(()=>server.close());await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`,login=await fetch(`${base}/api/portal/auth/development-login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'user-jan'})});assert.equal(login.status,200);return {base,cookie:login.headers.get('set-cookie').split(';')[0]}}
const json=(url,cookie,method='GET',body)=>fetch(url,{method,headers:{cookie,'content-type':'application/json'},body:body&&JSON.stringify(body)});

test('Mijn Destination Known opent rechtstreeks de ene testonderneming',async t=>{const {base,cookie}=await setup(t),response=await json(`${base}/api/portal/organizations/de-boer-advies/workspace`,cookie);assert.equal(response.status,200);const workspace=(await response.json()).data.workspace;assert.equal(workspace.organization.name,'De Boer Advies');assert.equal(workspace.organization.contact,'Jan de Boer');assert.equal(workspace.organization.administration,'Destination Known Administraties');assert.equal(workspace.organization.vatLiable,true)});

test('klantupload gebruikt dezelfde documentenverzameling als Office',async t=>{const {base,cookie}=await setup(t),before=documents.length,response=await json(`${base}/api/portal/organizations/de-boer-advies/documents`,cookie,'POST',{fileName:'testbon.pdf',size:1200,type:'Bonnetje',supplier:'Testleverancier',amount:18.15});assert.equal(response.status,201);assert.equal(documents.length,before+1);assert.equal(documents.at(-1).clientId,'de-boer-advies');assert.equal(documents.at(-1).source,'Mijn Destination Known');documents.pop()});

test('klantfactuur komt direct in dezelfde verkoopfacturenadministratie',async t=>{const {base,cookie}=await setup(t),before=salesInvoices.length,response=await json(`${base}/api/portal/organizations/de-boer-advies/invoices`,cookie,'POST',{debtor:'Fictieve Opdrachtgever',description:'Advieswerk',net:1000,vatRate:21,date:'2026-09-21'});assert.equal(response.status,201);assert.equal(salesInvoices.length,before+1);assert.equal(salesInvoices.at(-1).clientId,'de-boer-advies');assert.equal(salesInvoices.at(-1).total,1210);salesInvoices.pop()});

test('klantvraag verschijnt direct in de gedeelde Office-inbox',async t=>{const {base,cookie}=await setup(t),before=conversations.length,response=await json(`${base}/api/portal/organizations/de-boer-advies/messages`,cookie,'POST',{subject:'Vraag over reservering',body:'Is mijn belastingreservering voldoende?'});assert.equal(response.status,201);assert.equal(conversations.length,before+1);assert.equal(conversations[0].clientId,'de-boer-advies');conversations.shift()});

test('andere onderneming blijft ontoegankelijk met De Boer-sessie',async t=>{const {base,cookie}=await setup(t),response=await json(`${base}/api/portal/organizations/jansen-bouw/workspace`,cookie);assert.equal(response.status,403)});

test('portaalpagina en beveiligingsmelding zijn aanwezig',async t=>{const {base}=await setup(t),response=await fetch(`${base}/mijn`),html=await response.text();assert.equal(response.status,200);assert.match(html,/Mijn Destination Known/);assert.match(html,/passkey of wachtwoord met verplichte authenticator-2FA/i)});
