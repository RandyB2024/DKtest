// Presentation over the existing /api/clients response. No extra requests,
// profile reads, persistent storage or inferred fiscal/employee information.
const text=value=>typeof value==='string'?value:'';
const fold=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('nl');
const collator=new Intl.Collator('nl',{numeric:true,sensitivity:'base'});
export function clientIndex(data){
 const byRelationship=new Map();
 for(const o of data.organizations??[]){if(o.archived_at)continue;const list=byRelationship.get(o.customer_relationship_id)??[];list.push({id:text(o.id),name:text(o.name),legalName:text(o.legal_name),kvk:text(o.registration_number)});byRelationship.set(o.customer_relationship_id,list);}
 return (data.relationships??[]).filter(r=>!r.archived_at).map(r=>{
  const organizations=byRelationship.get(r.id)??[],missing=[];
  if(!text(r.name).trim())missing.push('klantnaam');if(!organizations.length)missing.push('onderneming');
  if(organizations.some(o=>!o.legalName.trim()))missing.push('officiële naam');if(organizations.some(o=>!o.kvk.trim()))missing.push('KvK-nummer');
  return {id:text(r.id),name:text(r.name),status:text(r.status),organizations,missing,search:fold([r.name,...organizations.flatMap(o=>[o.name,o.legalName,o.kvk])].join(' '))};
 });
}
export function clientPage(index,{query='',status='',completeness='',sort='name-asc',page=1,pageSize=25}={}){
 const tokens=fold(query).trim().split(/\s+/).filter(Boolean);let rows=index.filter(r=>tokens.every(t=>r.search.includes(t))&&(!status||r.status===status)&&(!completeness||(completeness==='missing'?r.missing.length>0:r.missing.length===0)));
 const [field,direction]=['name-asc','name-desc','status-asc','kvk-asc'].includes(sort)?sort.split('-'):['name','asc'];
 rows=rows.slice().sort((a,b)=>{const av=field==='kvk'?a.organizations.map(o=>o.kvk).join(','):a[field],bv=field==='kvk'?b.organizations.map(o=>o.kvk).join(','):b[field];return collator.compare(av,bv)*(direction==='desc'?-1:1)||collator.compare(a.id,b.id);});
 const size=[10,25,50].includes(Number(pageSize))?Number(pageSize):25,pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(pages,Math.max(1,Number.isInteger(page)?page:1));
 return {rows:rows.slice((current-1)*size,current*size),total:rows.length,page:current,pages,pageSize:size,start:rows.length?(current-1)*size+1:0,end:Math.min(current*size,rows.length)};
}
const el=(tag,value,className)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(className)n.className=className;return n;};
export function mountClientWorkspace(root,data,{canCreate=false,onCreate=()=>{}}={}){
 root.className='client-workspace';const index=clientIndex(data),state={query:'',status:'',completeness:'',sort:'name-asc',page:1,pageSize:25};
 const intro=el('section',undefined,'clients-intro'),copy=el('div');copy.append(el('h2','Klanten en ondernemingen'),el('p','Vind een klant en open het dossier om verder te werken.'));intro.append(copy);
 if(canCreate){const add=el('button','Nieuwe klant','clients-button clients-button--primary');add.type='button';add.onclick=onCreate;intro.append(add);}root.append(intro);
 const metrics=el('div',undefined,'clients-metrics');
 for(const [label,count] of [['Actieve klanten',index.filter(r=>r.status==='active').length],['Inactieve klanten',index.filter(r=>r.status==='inactive').length],['Basisgegevens aanvullen',index.filter(r=>r.missing.length).length]]){const card=el('div');card.append(el('span',label),el('strong',String(count)));metrics.append(card);}root.append(metrics);
 const workspace=el('section',undefined,'panel clients-results-panel'),filters=el('div',undefined,'clients-filters');
 const searchLabel=el('label','Zoeken','clients-search'),search=el('input');search.type='search';search.placeholder='Klant, onderneming of KvK-nummer';search.maxLength=200;searchLabel.append(search);filters.append(searchLabel);
 const select=(label,key,options)=>{const wrap=el('label',label),control=el('select');for(const [value,title] of options){const option=el('option',title);option.value=String(value);control.append(option);}control.value=String(state[key]);control.onchange=()=>{state[key]=key==='pageSize'?Number(control.value):control.value;state.page=1;render();};wrap.append(control);filters.append(wrap);return control;};
 const statusControl=select('Status','status',[['','Alle statussen'],['active','Actief'],['inactive','Inactief']]);
 const completenessControl=select('Basisgegevens','completeness',[['','Alle dossiers'],['missing','Aanvullen'],['complete','Aanwezig']]);
 const sortControl=select('Sorteren','sort',[['name-asc','Klantnaam A–Z'],['name-desc','Klantnaam Z–A'],['status-asc','Status'],['kvk-asc','KvK-nummer']]);
 const clear=el('button','Filters wissen','clients-button');clear.type='button';clear.onclick=()=>{state.query='';state.status='';state.completeness='';state.sort='name-asc';state.page=1;search.value='';statusControl.value='';completenessControl.value='';sortControl.value='name-asc';render();};filters.append(clear);
 search.oninput=()=>{state.query=search.value;state.page=1;render();};workspace.append(filters);
 const note=el('p','Relatienummer en verantwoordelijke vindt u in het dossier. Zoek hier op klantnaam, ondernemingsnaam of KvK-nummer.','clients-help');workspace.append(note);
 const results=el('div');workspace.append(results);root.append(workspace);
 function render(){
  const result=clientPage(index,state);state.page=result.page;results.replaceChildren();
  const summary=el('p',result.total?`${result.start}–${result.end} van ${result.total} klanten`:'Geen klanten gevonden.','clients-result-count');summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');results.append(summary);
  if(!result.total){results.append(el('div',index.length?'Geen klanten passen bij uw zoekopdracht. Pas de filters aan of wis ze.':'Er zijn nog geen klantrelaties beschikbaar.','clients-empty'));return;}
  const table=el('table',undefined,'clients-table'),caption=el('caption','Klantrelaties en bijbehorende ondernemingen');table.append(caption);
  const head=el('thead'),tr=el('tr');const columns=['Klant / onderneming','Relatienummer','KvK','Verantwoordelijke','Status','Basisgegevens','Actie'];for(const label of columns){const th=el('th',label);th.scope='col';tr.append(th);}head.append(tr);table.append(head);const body=el('tbody');
  for(const row of result.rows){
   const tr=el('tr');const cell=(label)=>{const td=el('td');td.setAttribute('data-label',label);tr.append(td);return td;};
   const name=cell(columns[0]);name.append(el('strong',row.name||'Klantnaam ontbreekt'));
   for(const o of row.organizations.slice(0,2)){const company=el('span',o.legalName||o.name||'Ondernemingsnaam ontbreekt','clients-company');name.append(company);if(o.legalName&&o.name&&o.name!==o.legalName)name.append(el('small',o.name));}
   if(row.organizations.length>2)name.append(el('small',`En ${row.organizations.length-2} andere ondernemingen in het dossier`));
   const nr=cell(columns[1]);nr.append(el('span','—','clients-unavailable'));nr.title='Bekijk deze gegevens in het dossier';
   const kvk=cell(columns[2]);for(const o of row.organizations.slice(0,2))kvk.append(el('span',o.kvk||'Niet ingevuld','clients-kvk'));if(!row.organizations.length)kvk.append(el('span','—'));if(row.organizations.length>2)kvk.append(el('small','Meer in dossier'));
   const manager=cell(columns[3]);manager.append(el('span','—','clients-unavailable'));manager.title='Bekijk deze gegevens in het dossier';
   const status=cell(columns[4]);status.append(el('span',row.status==='active'?'Actief':row.status==='inactive'?'Inactief':'Onbekend','clients-badge'+(row.status==='active'?' clients-badge--active':'')));
   const complete=cell(columns[5]),badge=el('span',row.missing.length?'Aanvullen':'Aanwezig','clients-badge'+(row.missing.length?' clients-badge--warning':''));badge.title=row.missing.length?'Ontbreekt: '+row.missing.join(', '):'Naam, onderneming, officiële naam en KvK aanwezig; geen volledige dossiercontrole.';complete.append(badge);
   const action=cell(columns[6]),link=el('a','Open dossier','clients-open');link.href='/clients/'+encodeURIComponent(row.id);link.setAttribute('data-route','');link.setAttribute('aria-label','Open dossier '+(row.name||'zonder naam'));action.append(link);body.append(tr);
  }table.append(body);results.append(table);
  const footer=el('div',undefined,'clients-pagination'),sizeLabel=el('label','Per pagina'),size=el('select');for(const n of [10,25,50]){const option=el('option',String(n));option.value=String(n);size.append(option);}size.value=String(state.pageSize);size.onchange=()=>{state.pageSize=Number(size.value);state.page=1;render();};sizeLabel.append(size);footer.append(sizeLabel);
  const navigation=el('nav');navigation.setAttribute('aria-label','Resultaatpagina’s');for(const [label,next,disabled] of [['Vorige',result.page-1,result.page===1],['Volgende',result.page+1,result.page===result.pages]]){const b=el('button',label,'clients-button');b.type='button';b.disabled=disabled;b.onclick=()=>{state.page=next;render();results.querySelector('.clients-result-count').tabIndex=-1;results.querySelector('.clients-result-count').focus();};navigation.append(b);if(label==='Vorige')navigation.append(el('span',`Pagina ${result.page} van ${result.pages}`));}footer.append(navigation);results.append(footer);
 }render();
}
