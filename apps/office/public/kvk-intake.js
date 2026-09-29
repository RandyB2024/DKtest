import {profileSections,validateProfile} from './profile-fields.js';
import {intakeExtensions,intakeGroups,korMessage} from './intake-fields.js';
import {enhanceIntakeForm,intakeLabels} from './intake-form.js';
// Only normalized public company data in memory. No credentials or local storage.
export function openKvkIntake(api,onCreated){
  if(document.querySelector('[data-kvk-intake]'))return ()=>{};
  const dialog=document.createElement('dialog');dialog.className='customer-dialog';
  dialog.dataset.kvkIntake='true';
  const heading=document.createElement('h2'),content=document.createElement('div'),status=document.createElement('p'),close=document.createElement('button');
  status.setAttribute('role','status');close.textContent='Annuleren';close.type='button';
  dialog.append(heading,content,status,close);(document.querySelector('#view')??document.body).append(dialog);
  let busy=false,company,environment,manual={},intake={};
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const button=(label,action,parent=content)=>{const b=node('button',label);b.type='button';b.onclick=action;parent.append(b);return b;};
  const field=(parent,label,name,value='',max=200)=>{const l=node('label',label),input=node(max>200?'textarea':'input');input.name=name;input.value=value;input.maxLength=max;l.append(input);parent.append(l);return input;};
  const lock=value=>{busy=value;dialog.querySelectorAll('button,input,textarea,select').forEach(n=>{n.disabled=value;});};
  async function run(action){if(busy)return;lock(true);status.textContent='Bezig…';try{await action();}catch(e){status.textContent=e.message||'Geen bevestiging ontvangen. Controleer het klantoverzicht voordat u opnieuw aanmaakt.';}finally{lock(false);}}
  close.onclick=()=>{if(!busy)dialog.close();};dialog.oncancel=e=>{if(busy)e.preventDefault();};dialog.onclose=()=>dialog.remove();
  function screen(n,title){heading.textContent=`${n}/6 · ${title}`;content.replaceChildren();status.textContent='';heading.tabIndex=-1;heading.focus();}
  const addr=a=>a?.shielded?'Afgeschermd':a?Object.values(a).filter(Boolean).join(' · '):'Niet beschikbaar';
  function overview(){
    const dl=node('dl');content.append(dl);
    const rows=[['Naam',company.name],['Statutaire naam',company.legalName],['KvK-nummer',company.kvkNumber],['Rechtsvorm',company.legalForm],['Status',company.status==='active'?'Actief':company.status==='inactive'?'Uitgeschreven':'Onbekend'],['Bezoekadres',addr(company.visitAddress)],['Correspondentieadres',addr(company.postalAddress)],['Hoofdvestiging',company.mainBranchNumber],['Handelsnamen',company.tradeNames.join(', ')],['Registratiedatum',company.registeredAt],['Aanvang',company.startedAt],['Aantal vestigingen',company.branchCount],['Activiteiten',company.activities.map(a=>`${a.code??''} · ${a.description??''}${a.primary?' (hoofdactiviteit)':''}`).join('; ')]];
    for(const [key,value] of rows)dl.append(node('dt',key),node('dd',value===null||value===''?'Niet beschikbaar':String(value)));
    content.append(node('p',environment==='test'?'KvK-testomgeving: fictieve bedrijfsgegevens.':'Officiële KvK-gegevens · productieomgeving.'));
  }
  function searchScreen(){
    screen(1,'Onderneming zoeken');const form=node('form');content.append(form);
    const number=field(form,'Exact KvK-nummer (acht cijfers)','number','',8);number.inputMode='numeric';number.pattern='[0-9]{8}';
    const name=field(form,'Of bedrijfsnaam','name','',120),city=field(form,'Plaats (optioneel bij bedrijfsnaam)','city','',80);
    const submit=node('button','Zoeken');submit.type='submit';form.append(submit);const results=node('div');content.append(results);
    async function search(page){
      const q=new URLSearchParams({page:String(page)});
      if(number.value.trim()){q.set('kvkNumber',number.value.trim());if(name.value.trim()||city.value.trim())throw new Error('Zoek op KvK-nummer óf op naam met eventueel plaats.');}
      else {q.set('name',name.value.trim());if(city.value.trim())q.set('city',city.value.trim());}
      const data=await api('/api/kvk/search?'+q);results.replaceChildren();status.textContent=data.results.length?'Kies één onderneming.':'Geen resultaten gevonden. Pas uw zoekopdracht aan.';
      for(const r of data.results)button(`${r.name??'Naam ontbreekt'} · ${r.kvkNumber} · ${r.city??''} · ${r.status==='active'?'actief':r.status==='inactive'?'uitgeschreven':'status onbekend'}`,()=>run(async()=>{
        const detail=await api('/api/kvk/organizations/'+r.kvkNumber);company=detail.company;environment=detail.environment;manual={};intake={};preview();
      }),results);
      if(page>1)button('Vorige pagina',()=>run(()=>search(page-1)),results);
      if(data.hasMore)button('Volgende pagina',()=>run(()=>search(page+1)),results);
    }
    form.onsubmit=e=>{e.preventDefault();run(()=>search(1));};
  }
  function preview(){
    screen(2,'Onderneming controleren');overview();button('Andere onderneming zoeken',searchScreen);
    if(company.status!=='active'){content.append(node('p','Waarschuwing: uitgeschreven of onbekende status. Aanmaken is geblokkeerd.'));return;}
    button('Gegevens gecontroleerd · verder',manualScreen);
  }
  function manualScreen(){intakeScreen('company',3,'Adres en klantgegevens');}
  function intakeScreen(section,step,title){
    screen(step,title);const form=node('form');content.append(form);const controls={};
    if(section==='company'){for(const [label,key]of [['Klantnaam','relationshipName'],['E-mailadres','email'],['Telefoonnummer','phone'],['Contactpersoon','contactPerson'],['IBAN','iban'],['Dienstverlening','services']]){const c=field(form,label,key,manual[key]??'');if(key==='relationshipName')c.required=true;c.oninput=()=>{manual[key]=c.value;};}}
    const fields=section==='company'?intakeExtensions.company:section==='administration'?intakeExtensions.administration:Object.fromEntries(Object.entries(profileSections.fiscal.fields).filter(([k])=>!['kor','vat_liable','fiscal_unity','fiscal_form','external_adviser'].includes(k)));
    const containers={};for(const [title,keys]of intakeGroups[section]){const group=node('section'),grid=node('div');group.className='profile-form-group';grid.className='profile-form-grid';group.append(node('h3',title),grid);form.append(group);for(const key of keys)containers[key]=grid;}
    const names={income_tax:'Inkomstenbelasting',corporate_tax:'Vennootschapsbelasting',not_applicable:'Niet van toepassing',month:'Maand',quarter:'Kwartaal',year:'Jaar',four_weeks:'Vier weken',...intakeLabels};
    for(const [key,f]of Object.entries(fields)){if(f.type==='staff'){form.append(node('p','Verantwoordelijke fiscale intake: uw ingelogde Office-account. Na aanmaak te wijzigen in het dossier.'));continue;}const label=node('label',f.label);let c;
      if(['enum','boolean'].includes(f.type)){c=node('select');for(const v of ['',...(f.type==='boolean'?['true','false']:f.values)]){const o=node('option',v===''?'Onbekend / nog te beoordelen':v==='true'?'Ja':v==='false'?'Nee':names[v]??v);o.value=v;c.append(o);}}
      else{c=node(f.type==='text'&&f.max>500?'textarea':'input');if(c.tagName==='INPUT')c.type=f.type==='date'?'date':f.type==='integer'?'number':'text';if(f.max)c.maxLength=f.max;if(f.type==='integer'){c.min='0';c.max=String(f.max);}}
      c.name=key;c.value=intake[section]?.[key]??'';label.append(c);containers[key].append(label);controls[key]=c;
    }
    if(section==='fiscal'){const legal=(company.legalForm??'').toLowerCase();const proposal=legal.includes('besloten')||legal==='bv'?'vennootschapsbelasting':legal.includes('eenmanszaak')?'inkomstenbelasting':null;if(proposal)form.append(node('p','Voorstel op basis van rechtsvorm: '+proposal+'. Kies en bevestig dit zelf na beoordeling; het voorstel wordt niet opgeslagen.'));}
    enhanceIntakeForm(section,controls,intake[section]??{},api,form,{preserveConfirmation:true});
    const collect=()=>Object.fromEntries(Object.entries(controls).map(([k,c])=>[k,c.value===''?null:fields[k].type==='boolean'?c.value==='true':fields[k].type==='integer'?Number(c.value):c.value]));
    const saveDraft=()=>{intake[section]=collect();};form.oninput=saveDraft;
    const next=node('button',step===5?'Naar bevestiging':'Verder');next.type='submit';next.className='primary';form.append(next);
    form.onsubmit=e=>{e.preventDefault();try{saveDraft();intake[section]=validateProfile(section,intake[section]);if(section==='fiscal'&&intake.fiscal.income_tax&&intake.fiscal.income_tax!=='unknown'&&intake.fiscal.income_tax_confirm!==true)throw Error('Bevestig uw beoordeling van de winstbelasting expliciet.');if(step===3)intakeScreen('administration',4,'Onderneming en bedrijfsmiddelen');else if(step===4)intakeScreen('fiscal',5,'Fiscale intake');else confirmScreen();}catch(e){status.textContent=e.message;}};
    button('Terug',()=>{saveDraft();if(step===3)preview();else if(step===4)manualScreen();else intakeScreen('administration',4,'Onderneming en bedrijfsmiddelen');});
  }
  function confirmScreen(){
    screen(6,'Bevestigen en aanmaken');overview();if(intake.fiscal?.vat_status==='kor')content.append(node('p',korMessage));const details=node('dl');content.append(details);
    const labels={relationshipName:'Klantnaam',vatId:'Btw-identificatienummer',taxNumber:'Omzetbelastingnummer',iban:'IBAN',email:'E-mailadres',phone:'Telefoonnummer',contactPerson:'Contactpersoon',fiscalChoices:'Fiscale keuzes',services:'Dienstverlening'};
    for(const [key,value] of Object.entries(manual))details.append(node('dt',labels[key]),node('dd',value.trim()||'Niet ingevuld'));
    content.append(node('p','Bij aanmaken wordt KvK opnieuw gecontroleerd. De actuele officiële bedrijfsgegevens worden opgeslagen. Klant en onderneming worden samen aangemaakt.'));
    for(const [section,fields]of Object.entries(intake)){content.append(node('h3',profileSections[section].label));const dl=node('dl');for(const [key,value]of Object.entries(fields))if(value!==null)dl.append(node('dt',profileSections[section].fields[key].label),node('dd',typeof value==='boolean'?value?'Ja':'Nee':intakeLabels[value]??String(value)));content.append(dl);}
    button('Terug naar fiscale intake',()=>intakeScreen('fiscal',5,'Fiscale intake'));
    button('Bevestigen en klant aanmaken',()=>run(async()=>{
      const result=await api('/api/relationships/from-kvk',{kvkNumber:company.kvkNumber,manual,intake});
      dialog.close();await onCreated(result);
    })).className='primary';
  }
  searchScreen();dialog.showModal();return ()=>{if(!busy)dialog.close();};
}
