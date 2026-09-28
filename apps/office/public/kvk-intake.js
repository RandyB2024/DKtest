// Only normalized public company data in memory. No credentials or local storage.
export function openKvkIntake(api,onCreated){
  if(document.querySelector('[data-kvk-intake]'))return ()=>{};
  const dialog=document.createElement('dialog');dialog.className='customer-dialog';
  dialog.dataset.kvkIntake='true';
  const heading=document.createElement('h2'),content=document.createElement('div'),status=document.createElement('p'),close=document.createElement('button');
  status.setAttribute('role','status');close.textContent='Annuleren';close.type='button';
  dialog.append(heading,content,status,close);(document.querySelector('#view')??document.body).append(dialog);
  let busy=false,company,environment,manual={};
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const button=(label,action,parent=content)=>{const b=node('button',label);b.type='button';b.onclick=action;parent.append(b);return b;};
  const field=(parent,label,name,value='',max=200)=>{const l=node('label',label),input=node(max>200?'textarea':'input');input.name=name;input.value=value;input.maxLength=max;l.append(input);parent.append(l);return input;};
  const lock=value=>{busy=value;dialog.querySelectorAll('button,input,textarea').forEach(n=>{n.disabled=value;});};
  async function run(action){if(busy)return;lock(true);status.textContent='Bezig…';try{await action();}catch(e){status.textContent=e.message||'Geen bevestiging ontvangen. Controleer het klantoverzicht voordat u opnieuw aanmaakt.';}finally{lock(false);}}
  close.onclick=()=>{if(!busy)dialog.close();};dialog.oncancel=e=>{if(busy)e.preventDefault();};dialog.onclose=()=>dialog.remove();
  function screen(n,title){heading.textContent=`${n}/4 · ${title}`;content.replaceChildren();status.textContent='';heading.tabIndex=-1;heading.focus();}
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
        const detail=await api('/api/kvk/organizations/'+r.kvkNumber);company=detail.company;environment=detail.environment;manual={};preview();
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
  function manualScreen(){
    screen(3,'Klantgegevens aanvullen');const form=node('form');content.append(form);
    const fields=[['Klantnaam','relationshipName'],['Btw-identificatienummer','vatId'],['Omzetbelastingnummer','taxNumber'],['IBAN','iban'],['E-mailadres','email'],['Telefoonnummer','phone'],['Contactpersoon','contactPerson'],['Fiscale keuzes (nog niet vastgelegd indien leeg)','fiscalChoices'],['Dienstverlening (nog niet vastgelegd indien leeg)','services']];
    for(const [label,key] of fields){const f=field(form,label,key,manual[key]??'', ['fiscalChoices','services'].includes(key)?1000:200);if(key==='relationshipName')f.required=true;if(key==='email')f.type='email';}
    content.append(node('p','Deze gegevens worden uitsluitend door u ingevuld. Er worden geen accounts uitgenodigd of fiscale acties uitgevoerd.'));
    const next=node('button','Naar bevestiging');next.type='submit';form.append(next);
    form.onsubmit=e=>{e.preventDefault();manual=Object.fromEntries(new FormData(form));confirmScreen();};button('Terug naar controle',preview);
  }
  function confirmScreen(){
    screen(4,'Bevestigen en aanmaken');overview();const details=node('dl');content.append(details);
    const labels={relationshipName:'Klantnaam',vatId:'Btw-identificatienummer',taxNumber:'Omzetbelastingnummer',iban:'IBAN',email:'E-mailadres',phone:'Telefoonnummer',contactPerson:'Contactpersoon',fiscalChoices:'Fiscale keuzes',services:'Dienstverlening'};
    for(const [key,value] of Object.entries(manual))details.append(node('dt',labels[key]),node('dd',value.trim()||'Niet ingevuld'));
    content.append(node('p','Bij aanmaken wordt KvK opnieuw gecontroleerd. De actuele officiële bedrijfsgegevens worden opgeslagen. Klant en onderneming worden samen aangemaakt.'));
    button('Terug naar klantgegevens',manualScreen);
    button('Bevestigen en klant aanmaken',()=>run(async()=>{
      const result=await api('/api/relationships/from-kvk',{kvkNumber:company.kvkNumber,manual});
      dialog.close();await onCreated(result);
    })).className='primary';
  }
  searchScreen();dialog.showModal();return ()=>{if(!busy)dialog.close();};
}
