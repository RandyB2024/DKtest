// DOM-unit harness: exercises interaction/state without a browser or live network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountTasks} from '../public/tasks.js';
class Element extends EventTarget{
 constructor(tag){super();this.tagName=tag.toUpperCase();this.children=[];this.value='';this._text='';this.parent=null;this.disabled=false;}
 set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent).join(' ');}
 append(...children){for(const c of children){c.parent=this;this.children.push(c);}}
 replaceChildren(...children){for(const c of this.children)c.parent=null;this._text='';this.children=[];this.append(...children);}
 setAttribute(k,v){this[k]=v;}get isConnected(){return this===globalThis.document.body||!!this.parent?.isConnected;}
 all(){return this.children.flatMap(c=>[c,...c.all()]);}querySelector(tag){return this.all().find(c=>c.tagName===tag.toUpperCase())??null;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
 focus(){}
 showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}
}
const tick=()=>new Promise(r=>setImmediate(r));
test('task UI create, reload, complete, readonly and dashboard links',async()=>{
 const original=globalThis.document;globalThis.document={createElement:tag=>new Element(tag),body:new Element('body')};
 try{
 const root=new Element('section');document.body.append(root);let items=[],calls=[];
 const api=async(path,body)=>{calls.push({path,body});if(body){if(path.endsWith('/complete'))items=[];else items=[{id:'task',title:body.title,deadline:body.deadline,assignee:'Staff',relationship_id:'rel',relationship_name:'Client',organization_name:'Company'}];return 'task';}return {items,hasMore:false};};
 await mountTasks(root,api,{relationship:'rel',organization:'org',staff:[{id:'staff',name:'Staff'}],canWrite:true});assert.match(root.textContent,/Geen open taken/);
 const click=async name=>{const b=root.all().find(x=>x.tagName==='BUTTON'&&x.textContent===name);assert.ok(b,name);await b.onclick();};
 await click('Nieuwe taak');let form=root.querySelector('form');for(const [key,value]of Object.entries({title:'<img onerror=bad>',assignedTo:'staff',deadline:'2026-09-29'}))form.all().find(x=>x.name===key).value=value;await form.onsubmit({preventDefault(){}});assert.match(root.textContent,/Taak aangemaakt/);assert.equal(root.querySelector('img'),null);await click('Afronden');assert.match(root.textContent,/Taak afgerond/);assert.match(root.textContent,/Geen open taken/);
 await mountTasks(root,api,{relationship:'rel',organization:'org',canWrite:false});assert.doesNotMatch(root.textContent,/Nieuwe taak|Afronden/);
 items=[{id:'task',title:'Task',deadline:'2026-09-29',relationship_id:'rel',relationship_name:'Client',organization_name:'Company'}];await mountTasks(root,api,{bucket:'today'});assert.equal(root.querySelector('a').href,'/clients/rel');assert.match(calls.at(-1).path,/bucket=today/);
 }finally{globalThis.document=original;}
});
