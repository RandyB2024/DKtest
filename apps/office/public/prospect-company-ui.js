// BESTEMD 4.0: business-specific sections in the existing public prospect wizard.
// No client-side storage, no cross-relationship requests. Data comes only from
// the currently authorized one-time prospect link.
const FIELDSETS={
 financial:[
  ['previousYearTurnover','Jaaromzet afgelopen jaar'],['expectedYearTurnover','Verwachte jaaromzet'],
  ['profitability','Winstgevendheid'],['outstandingDebtors','Openstaande vorderingen'],
  ['outstandingCreditors','Openstaande leveranciersschulden'],['financing','Leningen en financieringen'],
  ['lease','Leaseverplichtingen'],['taxDebt','Belastingschulden'],
  ['cashBookkeeping','Kasadministratie aanwezig?','choice'],['cashTransactions','Contante transacties?','choice'],
  ['financialNotes','Financiële bijzonderheden','textarea'],['currentBookkeeper','Huidige boekhouder'],
  ['transferNotes','Overdrachtsgegevens','textarea']
 ],
 administration:[
  ['vatRequired','Btw-plichtig?','choice'],['vatFrequency','Btw-aangiftefrequentie','frequency'],
  ['kor','Kleineondernemersregeling (KOR)?','choice'],['vatIdNumber','Btw-identificatienummer'],
  ['turnoverTaxNumber','Omzetbelastingnummer'],['vatNumber','Btw-nummer'],
  ['rsin','RSIN / fiscaal nummer'],['fiscalUnit','Fiscale eenheid'],
  ['iban','Zakelijke IBAN'],['extraBankAccounts','Aanvullende bankrekeningen','textarea'],
  ['hasCreditCard','Zakelijke creditcard?','choice'],['creditCardDetails','Creditcardgegevens (geen kaartnummers)','textarea'],
  ['hasEmployees','Personeel in dienst?','choice'],['payrollNumber','Loonheffingennummer'],
  ['website','Website'],['logoNotes','Bedrijfslogo / opmerkingen'],['administrationNotes','Overige administratiegegevens','textarea']
 ]
};
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
const posOf=(e,i)=>Number(e?.position??(i+2));
const pick=(section,source)=>Object.fromEntries(FIELDSETS[section].filter(([key])=>source?.[key]!==undefined).map(([key])=>[key,String(source[key])]));
export function mountCompanySections({form,initial,getExtras}){
 const sections=[...form.querySelectorAll(':scope > section.card')];
 if(sections.length<6)throw Error('De bestaande vragenlijst heeft een andere indeling.');
 const state=new Map();
 const initialCompany=initial.company||{};
 const oldFinancial=initial.personal||{};
 const companyKey=(data,position)=>{
  if(position===1)return 'primary';
  const kvk=String(data?.kvk||'').replace(/\s+/g,'').trim();
  if(/^\d{8}$/.test(kvk))return 'kvk:'+kvk;
  const name=String(data?.companyName||data?.name||'').trim().toLocaleLowerCase('nl');
  return name?'name:'+name:'draft:'+position;
 };
 for(const [i,row] of (initial.companies||[]).entries()){
  const pos=posOf(row,i-1);
  const data=row.company_data||row.companyData||{};
  state.set(companyKey(data,pos),{
   financial:{...pick('financial',pos===1?oldFinancial:{}),...pick('financial',data.financialOnboarding)},
   administration:{...pick('administration',pos===1?initialCompany:{}),...pick('administration',data.administrativeOnboarding)}
  });
 }
 if(!state.has('primary'))state.set('primary',{financial:pick('financial',oldFinancial),administration:pick('administration',initialCompany)});
 let active=1;
 function list(){
  const extra=getExtras?.()?.additionalCompanies||[];
  const positions=[{position:1,companyData:{...initialCompany,companyName:
   form.elements.namedItem('companyName')?.value||initialCompany.companyName||'Onderneming 1'}},...extra];
  return positions.slice(0,5).map((row,i)=>({position:i+1,
   key:companyKey(row.companyData||{},i+1),
   name:String(row.companyData?.companyName||row.companyData?.name||'Onderneming '+(i+1)).trim()||'Onderneming '+(i+1)}));
 }
 function ensure(position){
  const key=list().find(row=>row.position===position)?.key;
  if(!key)throw Error('De geselecteerde onderneming bestaat niet meer.');
  if(!state.has(key))state.set(key,{financial:{},administration:{}});
  return state.get(key);
 }
 function makeField(section,position,[key,label,type]){
  const outer=node('label');outer.className='bestemd-company-field';outer.append(node('span',label));
  let control;
  if(type==='textarea'){control=node('textarea');control.rows=2;}
  else if(type==='choice'||type==='frequency'){
   control=node('select');
   const opts=type==='choice'?[['','Kies'],['yes','Ja'],['no','Nee']]:
    [['','Kies'],['year','Jaar'],['quarter','Kwartaal'],['month','Maand'],['kor','KOR']];
   for(const [value,description] of opts){const option=node('option',description);option.value=value;control.append(option);}
  }else{control=node('input');control.type='text';control.maxLength=200;}
  control.autocomplete='off';
  control.dataset.companyPosition=String(position);
  control.dataset.companySection=section;
  control.dataset.companyKey=key;
  control.value=ensure(position)[section][key]??'';
  control.addEventListener('input',()=>{ensure(position)[section][key]=control.value;refreshMarks();});
  control.addEventListener('change',()=>{
   ensure(position)[section][key]=control.value;
   if(section==='administration'&&key==='vatRequired'){
    if(control.value==='no'){
     for(const vatKey of ['vatFrequency','kor','vatIdNumber','turnoverTaxNumber','vatNumber']){
      ensure(position).administration[vatKey]='';
     }
    }
    render();
   }else refreshMarks();
  });
  outer.append(control);return outer;
 }
 const widgets={};
 for(const [section,index,heading] of [['financial',3,'Financieel beeld'],['administration',4,'Administratieve onboarding']]){
  const origin=sections[index],container=node('div');
  container.className='bestemd-company-sections';
  const title=node('h3',heading+' per onderneming');
  const nav=node('nav');nav.className='bestemd-company-nav';nav.setAttribute('aria-label','Selecteer onderneming');
  const select=node('select');select.className='bestemd-company-mobile';select.setAttribute('aria-label','Onderneming kiezen');
  const fields=node('div');fields.className='bestemd-company-fields';
  container.append(title,nav,select,fields);
  origin.prepend(container);
  widgets[section]={nav,select,fields};
 }
 function refreshMarks(){
  const entries=list();
  for(const [section,w] of Object.entries(widgets)){
   [...w.nav.children].forEach((button,i)=>{
    const v=ensure(entries[i]?.position||1)[section];
    const complete=section==='financial'?['cashBookkeeping','cashTransactions'].every(k=>v[k]):
      !!v.vatRequired&&!!v.iban&&(v.vatRequired!=='yes'||!!v.vatFrequency);
    button.dataset.complete=String(complete);
    button.title=complete?'Basisgegevens compleet':'Nog niet compleet';
   });
  }
 }
 function render(){
  const entries=list();
  if(!entries.some(x=>x.position===active))active=1;
  // Do not copy one company's answers into another; removing a tab only
  // removes the UI selection. The server reconciles saved companies on submit.
  for(const [section,w] of Object.entries(widgets)){
   w.nav.replaceChildren();w.select.replaceChildren();w.fields.replaceChildren();
   entries.forEach(x=>{
    const tab=node('button',x.name);tab.type='button';tab.className=x.position===active?'is-active':'';
    tab.setAttribute('aria-pressed',String(x.position===active));
    tab.onclick=()=>{active=x.position;render();};
    w.nav.append(tab);
    const op=node('option',x.name);op.value=String(x.position);w.select.append(op);
   });
   w.select.value=String(active);w.select.onchange=()=>{active=Number(w.select.value);render();};
   const wrap=node('div');wrap.className='bestemd-company-field-grid';
   for(const field of FIELDSETS[section]){
    // Bij btw-vrijstelling zijn aangiftefrequentie en btw-nummers niet van toepassing.
    if(section==='administration' && ensure(active).administration.vatRequired==='no' &&
       ['vatFrequency','kor','vatIdNumber','turnoverTaxNumber','vatNumber'].includes(field[0]))continue;
    wrap.append(makeField(section,active,field));
   }
   w.fields.append(wrap);
  }
  for(const button of [...form.querySelectorAll('button')]){
   if(/onderneming toevoegen/i.test(button.textContent||'')){
    button.disabled=entries.length>=5;
    button.title=entries.length>=5?'Maximaal vijf ondernemingen per aanvraag':'Onderneming toevoegen';
   }
  }
  refreshMarks();
 }
 function syncPrimary(){
  const data=ensure(1).administration;
  for(const key of ['vatRequired','vatFrequency','vatIdNumber','turnoverTaxNumber',
   'vatNumber','rsin','iban','extraBankAccounts','hasCreditCard',
   'hasEmployees','payrollNumber','website']){
   const field=form.elements.namedItem(key);
   if(!field||data[key]===undefined)continue;
   if(field instanceof RadioNodeList){for(const radio of field)radio.checked=radio.value===String(data[key]);}
   else field.value=String(data[key]);
  }
 }
 function collect(){
  const keys=list().map(x=>x.key);
  if(new Set(keys).size!==keys.length)throw Error('Gebruik unieke KvK-nummers of ondernemingsnamen om gegevens gescheiden te houden.');
  syncPrimary();
  return {companySections:list().map(x=>({position:x.position,financial:{...ensure(x.position).financial},
   administration:{...ensure(x.position).administration}}))};
 }
 // Hide old duplicate fields only within steps 4/5. Their values remain
 // available for the old server contract, populated from the first company.
 for(const index of [3,4]){
  const section=sections[index];
  for(const child of [...section.children]){
   if(child.classList.contains('bestemd-company-sections'))continue;
   if(/^H[1-6]$/.test(child.tagName))continue;
   child.hidden=true;child.querySelectorAll?.('input,select,textarea').forEach(field=>field.disabled=true);
  }
 }
 // Existing extra-company editor remains responsible for adding/removing
 // business identities; tabs reflect its current draft state.
 const observer=new MutationObserver(()=>{const count=list().length;if(count!==widgets.financial.nav.children.length)render();});
 observer.observe(form,{childList:true,subtree:true});
 document.addEventListener('bestemd:extras-saved',render);
 render();
 return {collect,refresh:render,destroy:()=>{observer.disconnect();document.removeEventListener('bestemd:extras-saved',render);}};
}
