import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clientIndex,clientPage,mountClientWorkspace} from '../public/client-workspace.js';
function fixture(count){return {relationships:Array.from({length:count},(_,i)=>({id:'client-'+i,name:'Klant '+String(i).padStart(3,'0'),status:i%5===0?'inactive':'active',archived_at:null})),organizations:Array.from({length:count},(_,i)=>({id:'org-'+i,customer_relationship_id:'client-'+i,name:'Handelsnaam '+i,legal_name:i%4===0?'':'Officieel '+i,registration_number:String(10000000+i),archived_at:null}))};}
test('0, 1, 10, 50, 100 and 1000 customers: bounded pages and complete coverage',()=>{
 for(const count of [0,1,10,50,100,1000]){
  const index=clientIndex(fixture(count));assert.equal(index.length,count);
  for(const pageSize of [10,25,50]){const ids=[];const first=clientPage(index,{pageSize});for(let page=1;page<=first.pages;page++){const result=clientPage(index,{pageSize,page});assert.ok(result.rows.length<=pageSize);ids.push(...result.rows.map(r=>r.id));}assert.equal(new Set(ids).size,count);assert.equal(ids.length,count);}
 }
});
test('search existing names and KvK, combine filters, deterministic sort and clamp pages',()=>{
 const data=fixture(100);data.relationships[31].name='Café Één';const index=clientIndex(data);
 for(const [query,id] of [['cafe een','client-31'],['handelsnaam 67','client-67'],['Officieel 99','client-99'],['10000068','client-68']])assert.equal(clientPage(index,{query}).rows[0].id,id);
 assert.equal(clientPage(index,{status:'inactive'}).total,20);assert.equal(clientPage(index,{completeness:'missing'}).total,25);assert.equal(clientPage(index,{status:'inactive',completeness:'missing'}).total,5);
 assert.equal(clientPage(index,{sort:'name-desc'}).rows[0].name,'Klant 099');assert.equal(clientPage(index,{sort:'kvk-asc'}).rows[0].id,'client-0');
 assert.equal(clientPage(index,{query:'not present'}).total,0);assert.equal(clientPage(index,{page:999}).page,4);assert.equal(clientPage(index,{page:-10}).page,1);assert.equal(clientPage(index,{pageSize:999}).pageSize,25);
});
test('one row per relationship, all organizations searchable, archived records excluded, sensitive extras ignored',()=>{
 const data=fixture(2);data.organizations.push({id:'extra',customer_relationship_id:'client-1',name:'Extra onderneming',legal_name:'Extra BV',registration_number:'99999999'});
 data.relationships[0].archived_at='2026-09-28';data.organizations[0].archived_at='2026-09-28';data.organizations[1].iban='SECRET IBAN';data.organizations[1].rsin='SECRET RSIN';data.relationships[1].notes='SECRET NOTE';
 const index=clientIndex(data);assert.equal(index.length,1);assert.equal(index[0].organizations.length,2);assert.equal(clientPage(index,{query:'99999999'}).rows[0].id,'client-1');assert.doesNotMatch(JSON.stringify(index),/SECRET/);
 const source=readFileSync(new URL('../public/client-workspace.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\bfetch\(|innerHTML|localStorage|sessionStorage/);
});
class Element extends EventTarget{
 constructor(tag){super();this.tagName=tag.toUpperCase();this.children=[];this.value='';this._text='';this.parentElement=null;this.disabled=false;}
 set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(n=>n.textContent).join(' ');}
 append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
 setAttribute(name,value){this[name]=value;}all(){return this.children.flatMap(c=>[c,...c.all()]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}querySelectorAll(selector){return this.all().filter(n=>selector.startsWith('.')?(n.className??'').split(' ').includes(selector.slice(1)):n.tagName===selector.toUpperCase());}focus(){document.activeElement=this;}
}
test('workspace UI: 0–100 customers, search/filter/reset, page size, navigation, long text and role-gated create',()=>{
 const original=globalThis.document;globalThis.document={createElement:t=>new Element(t)};
 try{
  for(const count of [0,1,10,50,100]){const root=new Element('div');mountClientWorkspace(root,fixture(count));assert.equal(root.querySelector('tbody')?.children.length??0,Math.min(count,25));assert.equal(root.all().some(n=>n.tagName==='BUTTON'&&n.textContent==='Nieuwe klant'),false);}
  const data=fixture(100);data.relationships[0].name='<img onerror=bad>'+('Lange bedrijfsnaam '.repeat(15));const root=new Element('div');let creations=0;mountClientWorkspace(root,data,{canCreate:true,onCreate:()=>creations++});
  const b=name=>root.all().find(n=>n.tagName==='BUTTON'&&n.textContent===name),control=name=>root.all().find(n=>n.tagName==='LABEL'&&n._text===name)?.children.find(n=>['INPUT','SELECT'].includes(n.tagName));
  b('Nieuwe klant').onclick();assert.equal(creations,1);assert.equal(root.querySelector('img'),null);assert.match(root.textContent,/<img onerror=bad>/);
  control('Zoeken').value='Handelsnaam 67';control('Zoeken').oninput();assert.equal(root.querySelector('tbody').children.length,1);assert.match(root.textContent,/Klant 067/);
  b('Filters wissen').onclick();control('Status').value='inactive';control('Status').onchange();assert.equal(root.querySelector('tbody').children.length,20);
  control('Basisgegevens').value='missing';control('Basisgegevens').onchange();assert.equal(root.querySelector('tbody').children.length,5);
  b('Filters wissen').onclick();control('Per pagina').value='10';control('Per pagina').onchange();assert.equal(root.querySelector('tbody').children.length,10);b('Volgende').onclick();assert.match(root.textContent,/Pagina 2 van 10/);b('Vorige').onclick();assert.match(root.textContent,/Pagina 1 van 10/);
  control('Per pagina').value='50';control('Per pagina').onchange();assert.equal(root.querySelector('tbody').children.length,50);
  control('Sorteren').value='name-desc';control('Sorteren').onchange();assert.match(root.querySelector('tbody').children[0].textContent,/Klant 099/);
  control('Zoeken').value='No result';control('Zoeken').oninput();assert.match(root.textContent,/Geen klanten passen/);assert.equal(root.querySelector('table'),null);
 }finally{globalThis.document=original;}
});
