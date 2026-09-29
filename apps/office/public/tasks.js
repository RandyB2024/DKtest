const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action,primary=false)=>{const b=el('button',text,'profile-button profile-button--'+(primary?'primary':'secondary'));b.type='button';b.onclick=action;return b;};
export async function mountTasks(root,api,{relationship,organization,staff=[],canWrite=false,bucket}={}){
 const dashboard=!!bucket;let page=1,pending=false;
 const base=dashboard?'/api/tasks':'/api/relationships/'+encodeURIComponent(relationship)+'/organizations/'+encodeURIComponent(organization)+'/tasks';
 root.className='panel profile-section';
 async function load(message=''){
  if(!root.isConnected)return;root.replaceChildren();
  const heading=el('div',undefined,'profile-section-heading');heading.append(el('h3',dashboard?(bucket==='today'?'Vandaag':'Achterstallig'):'Open taken'));root.append(heading);
  if(canWrite&&!dashboard)heading.append(button('Nieuwe taak',create,true));
  const notice=el('p',message||'Taken laden…','profile-message');notice.setAttribute('role','status');root.append(notice);
  try{
   const data=await api(base+'?'+(dashboard?'bucket='+bucket+'&':'')+'page='+page);if(!root.isConnected)return;
   notice.textContent=message;
   if(!data.items.length)root.append(el('p','Geen open taken.','profile-empty'));
   for(const task of data.items){
    const row=el('article',undefined,'profile-record');row.append(el('h4',task.title),el('p',task.deadline+' · '+(task.assignee||'Medewerker niet beschikbaar'),'profile-caption'));
    if(dashboard){const link=el('a',task.relationship_name+' · '+task.organization_name);link.href='/clients/'+encodeURIComponent(task.relationship_id);link.setAttribute('data-route','');row.append(link);}
    if(canWrite&&!dashboard){const done=button('Afronden',async()=>{if(pending)return;pending=true;done.disabled=true;notice.textContent='Taak afronden…';try{await api(base+'/'+encodeURIComponent(task.id)+'/complete',{});await load('Taak afgerond.');}catch(e){notice.textContent=e.message;notice.setAttribute('role','alert');done.disabled=false;}finally{pending=false;}});row.append(done);}
    root.append(row);
   }
   if(page>1||data.hasMore){const nav=el('nav',undefined,'profile-pagination');nav.setAttribute('aria-label','Taakpagina’s');if(page>1)nav.append(button('Vorige taken',()=>{page--;void load();}));nav.append(el('span','Pagina '+page));if(data.hasMore)nav.append(button('Volgende taken',()=>{page++;void load();}));root.append(nav);}
  }catch(e){notice.textContent=e.message;notice.setAttribute('role','alert');root.append(button('Opnieuw laden',()=>load()));}
 }
 function create(){
  if(pending||root.querySelector('dialog'))return;
  const dialog=el('dialog',undefined,'customer-dialog profile-dialog'),form=el('form'),title=el('h2','Nieuwe taak');title.id='task-dialog-title';dialog.setAttribute('aria-labelledby',title.id);form.append(title);
  const controls={};for(const [name,label,type]of [['title','Titel','text'],['assignedTo','Verantwoordelijke medewerker','select'],['deadline','Deadline','date']]){
   const wrap=el('label',label),input=el(type==='select'?'select':'input');input.name=name;input.required=true;
   if(type==='select'){const empty=el('option','Kies een medewerker');empty.value='';input.append(empty);for(const person of staff){const option=el('option',person.name);option.value=person.id;input.append(option);}}else input.type=type;
   if(name==='title')input.maxLength=200;if(name==='deadline'){input.min='1900-01-01';input.max='9999-12-31';}controls[name]=input;wrap.append(input);form.append(wrap);
  }
  const error=el('p','','mutation-error');error.setAttribute('role','alert');const actions=el('div',undefined,'profile-form-actions'),cancel=button('Annuleren',()=>{if(!pending)dialog.close();}),save=el('button','Taak aanmaken','profile-button profile-button--primary');save.type='submit';actions.append(cancel,save);form.append(error,actions);dialog.append(form);root.append(dialog);
  dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});dialog.addEventListener('close',()=>dialog.remove());
  form.onsubmit=async event=>{event.preventDefault();if(pending)return;pending=true;save.disabled=true;cancel.disabled=true;error.textContent='';try{await api(base,Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,input.value])));dialog.close();page=1;await load('Taak aangemaakt.');}catch(e){error.textContent=e.message;}finally{pending=false;save.disabled=false;cancel.disabled=false;}};
  dialog.showModal();controls.title.focus();
 }
 await load();
}
