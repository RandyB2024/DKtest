// DOM-unit harness: exercises interaction/state without a browser or live network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCustomerProfile} from '../public/customer-profile.js';
class Element extends EventTarget{
 constructor(tag){super();this.tagName=tag.toUpperCase();this.children=[];this.value='';this._text='';this.parent=null;this.disabled=false;}
 set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent).join(' ');}
 append(...children){for(const c of children){c.parent=this;this.children.push(c);}}
 replaceChildren(...children){for(const c of this.children)c.parent=null;this._text='';this.children=[];this.append(...children);}
 setAttribute(k,v){this[k]=v;}get isConnected(){return this===globalThis.document.body||!!this.parent?.isConnected;}
 all(){return this.children.flatMap(c=>[c,...c.all()]);}querySelector(tag){return this.all().find(c=>c.tagName===tag.toUpperCase())??null;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
 showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}
}
const tick=()=>new Promise(r=>setImmediate(r));
test('profile UI loading, empty, errors, save/reload, cancel confirmation, conflict and text-only rendering',async()=>{
 const originals={document:globalThis.document,window:globalThis.window,MutationObserver:globalThis.MutationObserver,confirm:globalThis.confirm};
 globalThis.document={createElement:tag=>new Element(tag),body:new Element('body')};globalThis.window=new EventTarget();globalThis.MutationObserver=class{observe(){}disconnect(){}};let confirmAnswer=false;globalThis.confirm=()=>confirmAnswer;
 try{
  const root=new Element('div');document.body.append(root);const relationship={id:'rel',name:'<img onerror=bad>',status:'active',profile_version:0},org={id:'org',name:'Company',profile_version:0};let fail=false,pause,resolve,posts=0;
  const api=async(path,body)=>{
   if(pause)await new Promise(r=>{resolve=r;});if(fail)throw Object.assign(new Error('Veilige fout'),{code:'VERSION_CONFLICT'});
   if(body){posts++;return {version:1};}
   if(path.endsWith('/profile'))return {relationship,organization:org,staff:[],sections:{company:{}},canWrite:true,role:'owner',source:null};
   return {items:[],version:0,page:1,hasMore:false};
  };
  pause=true;const initial=mountCustomerProfile(root,api,relationship,[org]);assert.match(root.textContent,/laden/);pause=false;resolve();await initial;
  assert.match(root.textContent,/<img onerror=bad>/);assert.equal(root.querySelector('img'),null);
  const click=async(label)=>{const b=root.all().find(e=>e.tagName==='BUTTON'&&e.textContent===label);assert.ok(b,label);await b.onclick();await tick();};
  await click('Contactpersonen');assert.match(root.textContent,/Geen records gevonden/);
  await click('Toevoegen');let dialog=root.querySelector('dialog'),form=dialog.querySelector('form'),last=form.all().find(e=>e.name==='last_name');last.value='Test';form.oninput();
  await click('Annuleren');assert.equal(root.querySelector('dialog'),dialog);confirmAnswer=true;await click('Annuleren');assert.equal(root.querySelector('dialog'),null);assert.equal(posts,0);
  await click('Toevoegen');dialog=root.querySelector('dialog');form=dialog.querySelector('form');form.all().find(e=>e.name==='last_name').value='Test';form.oninput();
  pause=true;const saving=form.onsubmit({preventDefault(){}});assert.match(dialog.textContent,/Opslaan…/);assert.equal(dialog.querySelector('fieldset').disabled,true);pause=false;resolve();await saving;assert.equal(posts,1);assert.match(root.textContent,/Wijziging opgeslagen/);
  await click('Toevoegen');dialog=root.querySelector('dialog');form=dialog.querySelector('form');form.all().find(e=>e.name==='last_name').value='New';fail=true;await form.onsubmit({preventDefault(){}});assert.match(dialog.textContent,/Veilige fout/);assert.match(dialog.textContent,/Annuleren en herladen/);assert.equal(form.all().find(e=>e.name==='last_name').value,'New');
  fail=false;await click('Annuleren');
  pause=true;await click('Diensten en afspraken');const oldResolve=resolve;pause=false;await click('Contactpersonen');oldResolve();await tick();assert.doesNotMatch(root.textContent,/Contactfrequentie|Aanleverdeadline/);
  fail=true;await click('Historie');assert.match(root.textContent,/Veilige fout/);assert.match(root.textContent,/Opnieuw proberen/);
 }finally{for(const [key,value] of Object.entries(originals))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
