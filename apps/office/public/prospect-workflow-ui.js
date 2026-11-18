// BESTEMD Office — Workflow 4.0 in the existing client dossier.
// Data is always fetched from the authorized Office API; no local storage or demo dossiers.
const STAGES = [
  ['new_request','Nieuwe aanvraag'],['introduction','Kennismaking'],['financial_documents','Financiële stukken'],
  ['financial_review','Financiële analyse'],['quote','Offerte'],['quote_discussion','Offertegesprek'],
  ['agreement','Overeenkomst'],['onboarding','Onboardingvragenlijst'],
  ['administration_setup','Administratie inrichten'],['ready_for_activation','Activatie voorbereiden'],
  ['active_client','Actieve klant'],['intake','Intakegesprek'],['instruction','Klantinstructie'],
  ['started','Samenwerking gestart']
];
const SHORT = Object.fromEntries(STAGES);
const ADVANCE = {
  new_request:['introduction'], introduction:['financial_documents','rejected'],
  financial_documents:['financial_review'], financial_review:['quote','rejected'],
  quote:['quote_discussion'], quote_discussion:['agreement','coaching','rejected'],
  agreement:['onboarding'], onboarding:['administration_setup'],
  active_client:['intake'], intake:['instruction'], instruction:['started']
};
const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;};
const fmt=number=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(Number(number)||0);
const formField=(label,value='',type='text',required=true)=>{
 const l=el('label',label),i=el('input');i.type=type;i.value=String(value??'');i.required=required;
 if(type==='number'){i.min='0';i.max='100000';i.step='0.01';}l.append(i);return {l,i};
};
function info(message){return el('p',message,'muted');}
export async function mountProspectWorkflow(target, api, {relationshipId=null}={}){
 if(!target)return;
 const epoch=Symbol('render');target._workflowMount=epoch;
 target.replaceChildren();
 const panel=el('section',undefined,'panel bestemd-workflow');
 panel.append(el('h2','Klanttraject'),info('Kennismaking → Offerte → Onboarding → Start samenwerking'));
 const status=el('p','Gegevens ophalen…','muted');status.setAttribute('role','status');panel.append(status);
 const content=el('div');panel.append(content);target.append(panel);
 const alive=()=>target._workflowMount===epoch&&target.isConnected;
 const fail=error=>{if(alive())status.textContent=error?.message||'Gegevens konden niet worden opgehaald.';};
 let items=[];
 try {
  const result=await api('/api/office/prospects');
  if(!alive())return;
  items=(result.items||[]).filter(x=>!relationshipId||x.customer_relationship_id===relationshipId);
 } catch(err){fail(err);return;}
 if(!items.length){status.textContent='Geen prospecttrajecten bij dit dossier.';return;}
 status.textContent='';
 const select=el('select');select.setAttribute('aria-label','Selecteer prospecttraject');
 for(const x of items){const opt=el('option',x.applicant_data?.name||x.applicant_data?.email||'Aanvraag');opt.value=x.id;select.append(opt);}
 const pick=el('label','Prospectdossier');pick.append(select);content.append(pick);
 const detail=el('div');content.append(detail);
 async function load(){
  detail.replaceChildren(info('Klanttraject ophalen…'));
  const id=select.value;
  try{
   const result=await api('/api/office/prospect-workflow?applicationId='+encodeURIComponent(id));
   if(!alive()||select.value!==id)return;
   render(result);
  }catch(err){if(alive())detail.replaceChildren(el('p',err.message,'mutation-error'));}
 }
 function actionButton(label,payload,confirmText=''){
  const b=el('button',label);b.type='button';
  b.onclick=async()=>{
   if(confirmText&&!confirm(confirmText))return;
   b.disabled=true;status.textContent='Wijziging veilig opslaan…';
   try{await api('/api/office/prospect-workflow',{applicationId:select.value,...payload});
    if(alive()){status.textContent='Opgeslagen.';await load();}}
   catch(err){fail(err);}
   finally{b.disabled=false;}
  };
  return b;
 }
 function render(result){
  detail.replaceChildren();
  if(result.legacy){detail.append(info('Bestaande aanvraag. Alleen-lezen: deze wordt niet automatisch omgezet naar workflow 4.0.'));return;}
  const w=result.workflow;
  if(!w){detail.append(info('Voor dit dossier is geen workflow beschikbaar.'));return;}
  const current=STAGES.findIndex(x=>x[0]===w.stage);
  const steps=el('ol',undefined,'bestemd-workflow-steps');
  STAGES.forEach(([key,name],idx)=>{
   const li=el('li',name,idx<current?'done':idx===current?'current':'pending');
   if(idx===current)li.setAttribute('aria-current','step');steps.append(li);
  });
  detail.append(steps,el('h3','Huidige fase: '+(SHORT[w.stage]||w.stage)));
  const dossier=el('div',undefined,'bestemd-workflow-document-status');
  dossier.append(el('h4','Dossiercontrole per onderneming'));
  for(const company of result.companies||[]){
   const item=el('article',undefined,'bestemd-workflow-company-card');
   item.append(el('strong',company.name));
   item.append(info('Financieel beeld: '+(company.financialAnswered?'Basis compleet':'Aanvullen')));
   item.append(info('Administratieve onboarding: '+(company.administrationAnswered?'Basis compleet':'Aanvullen')));
   item.append(info('Documenten: '+((company.documents||[]).length)+' ontvangen'));
   if((company.missingDocuments||[]).length)item.append(info('Nog op te vragen: '+company.missingDocuments.join(', ')));
   dossier.append(item);
  }
  const personal=el('article',undefined,'bestemd-workflow-company-card');
  personal.append(el('strong','Documenten ondernemer'));
  personal.append(info((result.personalDocuments||[]).length+' persoonsdocument(en) ontvangen; controle op rechtmatige noodzaak en autorisatie vereist.'));
  dossier.append(personal);detail.append(dossier);
  if(w.stage==='rejected'||w.stage==='coaching'){
   detail.append(info(w.stage==='rejected'?'Traject afgesloten na afwijzing.':'Afzonderlijk coachingtraject; geen reguliere klantactivatie.'));
   return;
  }
  const quotes=w.quote||[];
  if(quotes.length){
   const table=el('div',undefined,'bestemd-workflow-quote');
   table.append(el('h4','Prijsafspraken (exclusief btw)'));
   for(const q of quotes)table.append(info((q.companyName||'Onderneming')+': '+fmt(q.monthlyPriceExVat)+'/maand; eenmalig '+fmt(q.oneTimePriceExVat)));
   detail.append(table);
  }
  if((w.activities||[]).length){
   const meetings=el('div');meetings.append(el('h4','Afspraken'));
   for(const a of w.activities.slice(-5).reverse())meetings.append(info((a.kind||'Gesprek')+' · '+new Date(a.scheduledAt).toLocaleString('nl-NL')+' · '+a.status));
   detail.append(meetings);
  }
  if(w.stage==='quote'){
   const form=el('form');form.append(el('h4','Offerte per onderneming'));
   const entries=(result.companies||[]).map(c=>{
    const section=el('fieldset');section.append(el('legend',c.name));
    const existing=quotes.find(q=>q.position===c.position)||{};
    const service=formField('Dienstverlening',existing.service||''),price=formField('Maandprijs excl. btw',existing.monthlyPriceExVat??'', 'number'),once=formField('Eenmalige kosten excl. btw',existing.oneTimePriceExVat??0,'number');
    section.append(service.l,price.l,once.l);form.append(section);
    return {position:c.position,service:service.i,price:price.i,once:once.i};
   });
   const button=el('button','Prijsafspraken opslaan');button.type='submit';form.append(button);
   form.onsubmit=async ev=>{
    ev.preventDefault();button.disabled=true;status.textContent='Offerte opslaan…';
    try{await api('/api/office/prospect-workflow',{applicationId:select.value,action:'save_quote',
      lines:entries.map(x=>({position:x.position,service:x.service.value,monthlyPriceExVat:Number(x.price.value),oneTimePriceExVat:Number(x.once.value)}))});
      if(alive()){status.textContent='Offerte opgeslagen.';await load();}}
    catch(err){fail(err);}finally{button.disabled=false;}
   };
   detail.append(form);
  }
  const meetingKind={introduction:'introduction',quote_discussion:'quote',intake:'intake',instruction:'instruction'}[w.stage];
  if(meetingKind){
   const form=el('form');form.append(el('h4','Afspraak vastleggen'));
   const date=formField('Datum en tijd','','datetime-local');
   const state=el('select');for(const [value,name] of [['scheduled','Gepland'],['completed','Afgerond'],['cancelled','Geannuleerd']]){const op=el('option',name);op.value=value;state.append(op);}
   const sl=el('label','Status');sl.append(state);
   const note=el('textarea');note.maxLength=1500;const nl=el('label','Notities');nl.append(note);
   const b=el('button','Afspraak opslaan');b.type='submit';form.append(date.l,sl,nl,b);
   form.onsubmit=async ev=>{
    ev.preventDefault();b.disabled=true;
    try{await api('/api/office/prospect-workflow',{applicationId:select.value,action:'record_meeting',
      kind:meetingKind,scheduledAt:new Date(date.i.value).toISOString(),meetingStatus:state.value,notes:note.value});
      if(alive()){status.textContent='Afspraak opgeslagen.';await load();}}
    catch(err){fail(err);}finally{b.disabled=false;}
   };
   detail.append(form);
  }
  const actions=el('div',undefined,'customer-buttons');
  for(const to of ADVANCE[w.stage]||[]){
   if(to==='onboarding'){
    const uploadWrap=el('div');
    const uploadLabel=el('label','Ondertekende overeenkomst (PDF, maximaal 3 MB)');
    const file=el('input');file.type='file';file.accept='application/pdf,.pdf';uploadLabel.append(file);
    const upload=el('button','Overeenkomst beveiligd uploaden');upload.type='button';
    upload.onclick=async()=>{
     const pdf=file.files?.[0];
     if(!pdf||pdf.size>3_000_000||pdf.size===0||
       (pdf.type&&pdf.type!=='application/pdf')){
       status.textContent='Selecteer een PDF-overeenkomst van maximaal 3 MB.';return;
     }
     upload.disabled=true;status.textContent='Overeenkomst beveiligd opslaan…';
     try{
      const base64=await new Promise((resolve,reject)=>{
       const reader=new FileReader();
       reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
       reader.onerror=reject;reader.readAsDataURL(pdf);
      });
      await api('/api/office/prospect-workflow',{applicationId:select.value,
       action:'upload_agreement',base64});
      if(alive()){status.textContent='Overeenkomst opgeslagen; controleer nu alle handtekeningen.';await load();}
     }catch(err){fail(err);}finally{upload.disabled=false;}
    };
    uploadWrap.append(uploadLabel,upload);actions.append(uploadWrap);
    const agreementSelect=el('select');
    agreementSelect.setAttribute('aria-label','Kies de opgeslagen ondertekende overeenkomst');
    const docs=(result.companies||[]).flatMap(c=>c.documents||[])
     .filter(d=>/^Overeenkomst van opdracht - /i.test(d.filename||''));
    const placeholder=el('option',docs.length?'Kies een getekende overeenkomst':'Nog geen PDF-overeenkomst opgeslagen');
    placeholder.value='';agreementSelect.append(placeholder);
    for(const doc of docs){
     const option=el('option',doc.filename+' ('+new Date(doc.created_at).toLocaleDateString('nl-NL')+')');
     option.value=doc.id;agreementSelect.append(option);
    }
    const agreementLabel=el('label','Opgeslagen overeenkomst');agreementLabel.append(agreementSelect);
    const verified=el('input');verified.type='checkbox';
    const vl=el('label','Ik heb gecontroleerd dat alle vereiste partijen hebben ondertekend');vl.prepend(verified);
    actions.append(agreementLabel,vl);
    const b=el('button','Ondertekende overeenkomst controleren en doorgaan');b.type='button';
    b.disabled=!docs.length;
    b.onclick=async()=>{
     if(!agreementSelect.value||!verified.checked){
      status.textContent='Selecteer de getekende overeenkomst en bevestig de controle.';return;
     }
     b.disabled=true;
     try{await api('/api/office/prospect-workflow',{applicationId:select.value,action:'advance',
       to:'onboarding',signedAgreementVerified:true,agreementDocumentId:agreementSelect.value});
       if(alive()){status.textContent='Overeenkomst geregistreerd.';await load();}}
     catch(err){fail(err);}finally{b.disabled=false;}
    };actions.append(b);
   }else{
    const payload={action:'advance',to,...(to==='agreement'?{quoteAccepted:true}:{})};
    const label=to==='agreement'?'Offerteakkoord registreren':to==='rejected'?'Traject afwijzen':to==='coaching'?'Coachingtraject registreren':'Doorgaan naar '+(SHORT[to]||to);
    actions.append(actionButton(label,payload,to==='agreement'?'Bevestig dat de ondernemer met de offerte akkoord is.':to==='rejected'?'Traject daadwerkelijk afwijzen?':''));
   }
  }
  if(w.stage==='onboarding'&&result.applicationStatus==='draft'){
    actions.append(actionButton('Onboardingvragenlijst verzenden',{action:'send_onboarding'},'Verstuur de beveiligde onboardingvragenlijst via Resend?'));
  }
  if(w.stage==='administration_setup'){
   const checks=[
    ['environmentPrepared','Omgeving aangemaakt'],
    ['accountingConfigured','Boekhouding ingericht'],
    ['taxConfigured','Btw- en fiscale instellingen gecontroleerd'],
    ['bankAccountsRecorded','Bankrekeningen geregistreerd'],
    ['documentsLinked','Documenten aan dossier gekoppeld'],
    ['permissionsPrepared','Gebruikersrechten voorbereid'],
    ['pricingLinked','Prijsafspraken gekoppeld']
   ];
   const box=el('form');
   box.append(el('h4','Administratie voorbereiden — per onderneming'));
   const rows=(result.companies||[]).map(company=>{
    const previous=(w.administrationPreparation||[]).find(x=>x.position===company.position)||{};
    const group=el('fieldset');group.append(el('legend',company.name));
    const controls=checks.map(([key,label])=>{
     const input=el('input');input.type='checkbox';input.checked=previous[key]===true;
     const title=el('label',label);title.prepend(input);group.append(title);
     return {key,input};
    });
    box.append(group);return {position:company.position,controls};
   });
   const saveButton=el('button','Voorbereiding opslaan');saveButton.type='submit';
   box.append(saveButton);
   box.onsubmit=async event=>{
    event.preventDefault();saveButton.disabled=true;status.textContent='Voorbereiding opslaan…';
    try{
     await api('/api/office/prospect-workflow',{applicationId:select.value,
       action:'save_administration_preparation',companies:rows.map(({position,controls})=>
        ({position,...Object.fromEntries(controls.map(({key,input})=>[key,input.checked]))}))});
     if(alive()){status.textContent='Controlelijst opgeslagen.';await load();}
    }catch(err){fail(err);}finally{saveButton.disabled=false;}
   };
   detail.append(box);
   actions.append(actionButton('Controle en inrichting afronden',{action:'advance',to:'ready_for_activation'},
     'Bevestig dat alle ondernemingen ingericht zijn en de dossiercontrole is goedgekeurd.'));
  }
  if(w.stage==='ready_for_activation')actions.append(info(
   'Dossier gereed voor de definitieve activeringscontrole. Volledige klantactivatie is nog niet aangesloten; er wordt geen account geactiveerd.'));

  if(actions.childNodes.length)detail.append(el('h4','Volgende actie'),actions);
 }
 select.addEventListener('change',load);
 await load();
}