import test from 'node:test';import assert from 'node:assert/strict';
import {openKvkIntake} from '../public/kvk-intake.js';
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};Object.defineProperty(this,'value',{get:()=>this._value??'',set:v=>{this._value=String(v);}});this.value='';this.textContent='';this.listeners={};this.hidden=false;if(tag==='textarea')Object.defineProperty(this,'type',{get:()=> 'textarea'});}
 append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(k,v){this[k]=v;}
 focus(){} showModal(){this.open=true;}close(){this.open=false;this.onclose?.();}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 dispatchEvent(e){this['on'+e.type]?.(e);for(const f of this.listeners[e.type]??[])f(e);if(e.bubbles)this.parentElement?.dispatchEvent(e);return true;}
 all(){return [this,...this.children.flatMap(c=>c.all())];}
 querySelectorAll(selector){const tags=selector.split(',').map(x=>x.toUpperCase());return this.all().filter(e=>tags.includes(e.tagName));}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('six-step wizard retains input, requires fiscal confirmation, clears only after confirmation and submits one intake',async()=>{
 const original=globalThis.document,root=new Element('div');globalThis.document={body:root,createElement:t=>new Element(t),querySelector:s=>s==='#view'?root:s==='[data-kvk-intake]'?root.all().find(n=>n.dataset.kvkIntake):null};
 try{
 let saved,created=0;const company={name:'Fixture BV',legalName:'Fixture BV',kvkNumber:'68750110',legalForm:'Besloten Vennootschap',status:'active',tradeNames:[],activities:[]};
 const api=async(path,body)=>{if(body){saved=body;return {relationship_id:'fixture'};}if(path.startsWith('/api/kvk/search'))return{results:[{name:'Fixture',kvkNumber:'68750110',status:'active'}]};return{company,environment:'test'};};
 openKvkIntake(api,async()=>{created++;});const button=label=>{const b=root.all().find(n=>n.tagName==='BUTTON'&&n.textContent===label);assert.ok(b,label);return b;};const field=key=>{const f=root.all().find(n=>n.name===key);assert.ok(f,key);return f;};
 const enter=(key,value)=>{field(key).value=value;field(key).dispatchEvent(new Event('input',{bubbles:true}));};const submit=async()=>{root.all().find(n=>n.tagName==='FORM').onsubmit({preventDefault(){}});await tick();await tick();};const click=async label=>{await button(label).onclick();await tick();};
 enter('number','68750110');await submit();await click('Fixture · 68750110 ·  · actief');await click('Gegevens gecontroleerd · verder');enter('relationshipName','Keep this name');await submit();
 assert.equal(field('vehicle_count').tagName,'INPUT');assert.equal(field('vehicle_notes').tagName,'TEXTAREA');assert.equal(field('vehicle_count').parentElement.hidden,true);
 field('vehicles').value='true';await field('vehicles').onchange();enter('vehicle_count','2');field('vehicles').value='false';let pending=field('vehicles').onchange();await click('Behouden');await pending;assert.equal(field('vehicles').value,'true');assert.equal(field('vehicle_count').value,'2');
 field('vehicles').value='false';pending=field('vehicles').onchange();await click('Bevestigen');await pending;assert.equal(field('vehicle_count').value,'');assert.equal(field('vehicle_count').parentElement.hidden,true);
 await click('Terug');assert.equal(field('relationshipName').value,'Keep this name');await submit();await submit();
 assert.equal(field('income_tax').value,'');field('income_tax').value='corporate_tax';field('income_tax').dispatchEvent(new Event('change'));field('vat_status').value='kor';await submit();assert.equal(saved,undefined);assert.ok(field('income_tax_confirm'));
 field('income_tax_confirm').value='true';await submit();await click('Terug naar fiscale intake');assert.equal(field('income_tax_confirm').value,'true');await submit();await click('Bevestigen en klant aanmaken');assert.equal(created,1);assert.equal(saved.manual.relationshipName,'Keep this name');assert.equal(saved.intake.fiscal.vat_status,'kor');assert.equal(saved.intake.fiscal.income_tax,'corporate_tax');assert.equal(saved.intake.administration.vehicle_count,null);
 }finally{globalThis.document=original;}
});
