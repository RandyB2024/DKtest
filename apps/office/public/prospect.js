(()=>{'use strict';
const q=s=>document.querySelector(s), qa=s=>Array.from(document.querySelectorAll(s));
const form=q('#form'), status=q('#status'), token=new URLSearchParams(location.search).get('token');
if(!token||!/^[a-f0-9]{64}$/.test(token)){status.textContent='Deze aanvraaglink is ongeldig.';return;}
let busy=false;
function showReceipt(data){
 form.hidden=true;
 const wizard=document.querySelector('.bestemd-stepper');
 if(wizard){wizard.querySelectorAll('.bestemd-step-tab').forEach(button=>{button.classList.add('is-done');button.classList.remove('is-active');button.disabled=true;button.removeAttribute('aria-current')});}
 const progress=document.querySelector('.bestemd-step-counter');if(progress)progress.textContent='✓ Voltooid';
 document.querySelector('.hero')?.style.setProperty('--bestemd-progress','100%');
 document.querySelector('.bestemd-reference-layout')?.remove();
 document.querySelector('.bestemd-wizard-footer')?.remove();
 let receipt=document.querySelector('#bestemdReceipt');
 if(!receipt){receipt=document.createElement('div');receipt.id='bestemdReceipt';receipt.className='bestemd-receipt-layout';
  receipt.innerHTML=`<section class="bestemd-receipt-main"><div class="bestemd-receipt-intro"><div class="bestemd-receipt-check" aria-hidden="true">✓</div><h2>Aanvraag goed verzonden!</h2><p>Je aanvraag is succesvol ontvangen en wordt beoordeeld door BESTEMD.</p><p>Zodra je dossier compleet is en je aanvraag is goedgekeurd, ontvang je een activatie-e-mail voor Mijn Bestemming.</p></div><div class="bestemd-receipt-next"><h3>Wat gebeurt er nu?</h3><div class="bestemd-receipt-steps"><p><b>1.</b> Wij beoordelen je aanvraag.</p><p><b>2.</b> We controleren of het dossier compleet is.</p><p><b>3.</b> Na goedkeuring ontvang je een activatie-e-mail.</p></div></div></section><aside class="bestemd-receipt-side"><h3>Status</h3><div class="bestemd-receipt-state">✓ &nbsp; In beoordeling bij BESTEMD</div><p>Verzonden op: <strong id="bestemdReceiptDate"></strong></p><p>Aanvraagnummer: <strong id="bestemdReceiptNumber"></strong></p><p>Dossierstatus: <strong>In beoordeling</strong></p></aside>`;
  const hero=document.querySelector('.hero');hero?.after(receipt);
 }
 const date=receipt.querySelector('#bestemdReceiptDate');
 if(date){const dt=data?.submittedAt?new Date(data.submittedAt):null;date.textContent=dt&&!Number.isNaN(dt.getTime())?dt.toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'}):'Ontvangen';}
 const number=receipt.querySelector('#bestemdReceiptNumber');if(number)number.textContent=data?.applicationId||'Wordt verwerkt';
 showStatus('');window.scrollTo({top:0,behavior:'instant'});
}
async function tryReceipt(){
 try{const receipt=await request('/api/prospect?receipt=1&token='+encodeURIComponent(token));if(receipt.submitted){showReceipt(receipt);return true;}}catch{}return false;
}

// Meerdere zakelijke IBAN's: opslag blijft compatibel met bestaand extraBankAccounts-veld.
const extraIbanList=q('#bestemdExtraIbanList'),extraIbanHidden=form.elements.namedItem('extraBankAccounts');
const ibanPattern=/^[A-Z]{2}[0-9A-Z]{13,32}$/;
function normalizeIban(value){return String(value||'').replace(/\s+/g,'').toUpperCase();}
function syncExtraIbans(){
 if(!extraIbanHidden||!extraIbanList)return;
 const values=Array.from(extraIbanList.querySelectorAll('input')).map(el=>normalizeIban(el.value)).filter(Boolean);
 extraIbanHidden.value=values.join('\n');
}
function addExtraIban(value=''){
 if(!extraIbanList||extraIbanList.children.length>=15)return;
 const row=document.createElement('div');row.className='bestemd-extra-iban-row';
 const label=document.createElement('label');label.className='field';label.textContent='Extra zakelijk IBAN-nummer';
 const input=document.createElement('input');input.type='text';input.inputMode='text';input.autocomplete='off';input.maxLength=42;input.placeholder='NL00 BANK 0000 0000 00';input.value=value;input.setAttribute('aria-label','Extra zakelijk IBAN-nummer');
 input.addEventListener('change',()=>{input.value=normalizeIban(input.value);syncExtraIbans()});
 input.addEventListener('input',syncExtraIbans);
 label.append(input);
 const remove=document.createElement('button');remove.type='button';remove.className='secondary bestemd-remove-iban';remove.textContent='Verwijderen';remove.addEventListener('click',()=>{row.remove();syncExtraIbans()});
 row.append(label,remove);extraIbanList.append(row);syncExtraIbans();
}
function restoreExtraIbans(value){
 if(!extraIbanList)return;
 extraIbanList.replaceChildren();
 String(value||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean).forEach(x=>addExtraIban(x));
 syncExtraIbans();
}
q('#bestemdAddIban')?.addEventListener('click',()=>addExtraIban());
// Voorwaarden worden pas verplicht zodra beide definitieve pagina's gepubliceerd zijn.
const termsBlock=q('#bestemdTerms'),termsCheckbox=q('#bestemdTermsAccepted');
function termsConfig(){
 const version=termsBlock?.dataset.termsVersion?.trim()||'';
 const termsUrl=termsBlock?.dataset.termsUrl?.trim()||'';
 const privacyUrl=termsBlock?.dataset.privacyUrl?.trim()||'';
 const ready=!!version&&/^https:\/\//.test(termsUrl)&&/^https:\/\//.test(privacyUrl);
 if(termsCheckbox){termsCheckbox.disabled=!ready;termsCheckbox.required=ready;}
 if(ready){
  for(const [selector,url] of [['.bestemd-terms-label',termsUrl],['.bestemd-privacy-label',privacyUrl]]){
   const el=q(selector);if(!el)continue;const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=el.textContent;el.replaceWith(link);
  }
  q('.bestemd-terms-pending')?.remove();
 }
 return {ready,version};
}
const termsState=termsConfig();
const names=[
 'salutation','initials','firstName','lastName','email','mobile','companyName','companyEmail','kvk','transferDate','entityType','website','legalForm','street','postalCode','city','country',
 'lookingFor','currentChallenges','expectations','businessGoals','howCanWeHelp','cashBookkeeping','cashTransactions',
 'vatRequired','vatFrequency','vatIdNumber','turnoverTaxNumber','vatNumber','hasFiscalUnit','rsin','iban','extraBankAccounts','hasCreditCard','creditCardDetails','hasEmployees','payrollNumber','serviceRequest'
];
const request=async(url,options={})=>{const r=await fetch(url,{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',...options});const json=await r.json();if(!r.ok||!json.ok)throw Error(json.error?.message||'Aanvraag niet beschikbaar.');return json.data};
function getValue(name){
 const sample=form.elements.namedItem(name);
 if(!sample)return '';
 if(sample instanceof RadioNodeList){return sample.value||'';}
 if(sample.type==='checkbox')return !!sample.checked;
 return (sample.value||'').trim();
}
function setValue(name,value){
 const sample=form.elements.namedItem(name);
 if(!sample||value==null)return;
 if(sample instanceof RadioNodeList){for(const option of sample){option.checked=String(option.value)===String(value);}return;}
 if(sample.type==='checkbox'){sample.checked=!!value;return;}
 sample.value=String(value);
}
function setRequired(name,required){const node=form.elements.namedItem(name);if(!node)return;if(node instanceof RadioNodeList){for(const option of node)option.required=required;}else node.required=required;}
function toggle(el,show){if(!el)return;el.classList.toggle('hidden',!show);}
function updateConditional(){
 const entity=getValue('entityType');
 const vatRequired=getValue('vatRequired');
 const hasEmployees=getValue('hasEmployees');
 const hasCreditCard=getValue('hasCreditCard');
 const hasFiscalUnit=getValue('hasFiscalUnit');
 toggle(q('#vatFields'),vatRequired==='yes');
 for(const node of qa('[data-entity]')) toggle(node,node.dataset.entity===entity);
 toggle(q('#creditCardDetailsWrap'),hasCreditCard==='yes');
 toggle(q('#payrollNumberWrap'),hasEmployees==='yes');
 toggle(q('#payrollNotice'),hasEmployees==='yes');
 toggle(q('#fiscalUnitDetailsWrap'),entity==='bv'&&hasFiscalUnit==='yes');
 toggle(q('#bvDocumentNotice'),entity==='bv');
 const category=q('#documentCategory');if(category){for(const option of category.querySelectorAll('[data-bv-only]'))option.hidden=entity!=='bv';if(entity!=='bv'&&category.selectedOptions[0]?.hasAttribute('data-bv-only'))category.value='Overig';}renderChecklist();
 setRequired('vatFrequency',vatRequired==='yes');
 setRequired('iban',true);
 setRequired('payrollNumber',hasEmployees==='yes');
 setRequired('rsin',entity==='bv');
 setRequired('vatIdNumber',entity==='eenmanszaak'&&vatRequired==='yes');
 setRequired('turnoverTaxNumber',entity==='eenmanszaak'&&vatRequired==='yes');
 setRequired('vatNumber',entity==='bv'&&vatRequired==='yes');
}
function showStatus(message){status.textContent=message||'';if(message&&/controleer|mislukt|niet|ongeldig|ontbreekt/i.test(message))status.setAttribute('role','alert');else status.setAttribute('role','status');}
let currentDocuments=[];
function renderChecklist(){const target=q('#documentChecklist');if(!target)return;const categories=['Jaarrekening','Kolommenbalans','Btw-aangifte','Aangifte inkomstenbelasting','Bedrijfslogo'];if(getValue('entityType')==='bv')categories.push('Aandeelhoudersregister','Oprichtingsakte','Aandeelhoudersovereenkomst','Managementovereenkomst','Rekening-courantovereenkomst','Arbeidsovereenkomst DGA','UBO-documentatie','Beschikking fiscale eenheid');target.replaceChildren();for(const category of categories){const found=currentDocuments.some(d=>String(d.filename||'').startsWith(category+' - '));const row=document.createElement('div');row.className='bestemd-doc-checklist-row';const name=document.createElement('span');name.textContent=category;const status=document.createElement('span');status.textContent=found?'Ontvangen':'Nog niet aangeleverd';status.className=found?'is-received':'is-missing';row.append(name,status);target.append(row);}}
function showDocuments(list){
 currentDocuments=Array.isArray(list)?list:[];const ul=q('#documents');ul.replaceChildren();
 for(const item of currentDocuments){
  const li=document.createElement('li');
  const name=document.createElement('span');name.textContent=item.filename||'Document';li.append(name);
  if(item.id && !String(item.filename||'').toLowerCase().includes('handtekening')){
   const remove=document.createElement('button');remove.type='button';remove.className='secondary bestemd-document-delete';
   remove.textContent='Verwijderen';remove.setAttribute('aria-label','Verwijder '+(item.filename||'document'));
   remove.addEventListener('click',async()=>{
    if(busy||!confirm('Dit document definitief verwijderen?'))return;
    busy=true;remove.disabled=true;
    try{
     await request('/api/prospect',{method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({token,action:'delete-document',documentId:item.id})});
     const current=await request('/api/prospect?token='+encodeURIComponent(token));
     showDocuments(current.documents||[]);showStatus('Document verwijderd.');
    }catch(error){showStatus(error.message);remove.disabled=false;}finally{busy=false;}
   });li.append(remove);
  }ul.append(li);
 }renderChecklist();
}

request('/api/prospect?token='+encodeURIComponent(token)).then(data=>{
 const all={...data.personal,...data.company};
 if(!all.firstName&&all.name){all.firstName=String(all.name).split(' ')[0];all.lastName=String(all.name).split(' ').slice(1).join(' ');}
 if(!all.entityType){
  const lf=String(all.legalForm||'').toLowerCase();
  if(lf.includes('eenmans')) all.entityType='eenmanszaak';
  else if(lf.includes('besloten')||lf.includes('bv')) all.entityType='bv';
 }
 if(!all.country) all.country='Nederland';
 for(const name of names) setValue(name,all[name]||'');
 restoreExtraIbans(data.company?.extraBankAccounts||'');
 setValue('whatsappConsent',data.personal?.whatsappConsent===true);
 if(data.personal?.signedDeclaration){setValue('signatureName',data.personal.signedDeclaration.name||'');setValue('signatureAccepted',!!data.personal.signedDeclaration.accepted);}
 form.hidden=false; showStatus(''); showDocuments(data.documents||[]); updateConditional(); document.dispatchEvent(new CustomEvent('bestemd:prospect-loaded',{detail:data}));
}).catch(async error=>{if(!(await tryReceipt()))showStatus(error.message);});

qa('input[name="entityType"], input[name="vatRequired"], input[name="hasEmployees"], input[name="hasCreditCard"], input[name="hasFiscalUnit"]').forEach(node=>node.addEventListener('change',updateConditional));

q('#upload').addEventListener('click',async()=>{
 if(busy)return;
 const file=q('#document').files?.[0];
 if(!file){showStatus('Selecteer eerst een document.');return;}
 if(file.size>3000000||!['application/pdf','image/jpeg','image/png'].includes(file.type)){showStatus('Alleen PDF, JPG of PNG tot 3 MB per bestand.');return;}
 busy=true; showStatus('Document wordt beveiligd opgeslagen…');
 try{
  const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file)});
  await request('/api/prospect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'upload',filename:(q('#documentCategory')?.value||'Overig')+' - '+file.name,mime:file.type,base64,companyPosition:window.BestemdExtras?.collect().uploadCompanyPosition||1})});
  const current=await request('/api/prospect?token='+encodeURIComponent(token));
  showDocuments(current.documents||[]); q('#document').value=''; showStatus('Document toegevoegd.');
 }catch(error){showStatus('Indienen is niet gelukt: '+(error.message||'Onbekende fout')+'. Je ingevulde gegevens blijven staan.');}finally{busy=false;}
});

function buildPayload(){
 syncExtraIbans();
 const personal={
  salutation:getValue('salutation'), initials:getValue('initials'), firstName:getValue('firstName'), lastName:getValue('lastName'), email:getValue('email'), mobile:getValue('mobile'),
  lookingFor:getValue('lookingFor'), currentChallenges:getValue('currentChallenges'), expectations:getValue('expectations'), businessGoals:getValue('businessGoals'), howCanWeHelp:getValue('howCanWeHelp'),
  cashBookkeeping:getValue('cashBookkeeping'), cashTransactions:getValue('cashTransactions'), serviceRequest:getValue('serviceRequest'), whatsappConsent:!!form.elements.whatsappConsent.checked
 };
 const company={
  companyName:getValue('companyName'), companyEmail:getValue('companyEmail'), kvk:getValue('kvk'), transferDate:getValue('transferDate'), entityType:getValue('entityType'), website:getValue('website'), legalForm:getValue('legalForm'), street:getValue('street'), postalCode:getValue('postalCode'), city:getValue('city'), country:getValue('country'),
  vatRequired:getValue('vatRequired'), vatFrequency:getValue('vatFrequency'), vatIdNumber:getValue('vatIdNumber'), turnoverTaxNumber:getValue('turnoverTaxNumber'), vatNumber:getValue('vatNumber'), hasFiscalUnit:getValue('hasFiscalUnit'), rsin:getValue('rsin'), iban:getValue('iban'), extraBankAccounts:getValue('extraBankAccounts'), hasCreditCard:getValue('hasCreditCard'), creditCardDetails:getValue('creditCardDetails'), hasEmployees:getValue('hasEmployees'), payrollNumber:getValue('payrollNumber')
 };
 return {personal,company,...(window.BestemdExtras?.collect()||{})};
}
async function save(action){
 if(busy)return;
 updateConditional();
 if(!form.reportValidity()){showStatus('Controleer de verplichte velden. Je wordt naar het ontbrekende veld geleid.');form.querySelector(':invalid')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
 const payload=buildPayload();
 if(action==='submit'){
  if(!termsState.ready){showStatus('Aanvraag indienen is nog niet mogelijk: de definitieve Algemene voorwaarden en Privacyverklaring zijn niet gekoppeld. Neem contact op met BESTEMD.');termsBlock?.scrollIntoView({behavior:'smooth',block:'center'});return;}
  if(!termsCheckbox?.checked){showStatus('Accepteer eerst de Algemene voorwaarden en Privacyverklaring.');termsBlock?.scrollIntoView({behavior:'smooth',block:'center'});return;}
  const mainIban=normalizeIban(getValue('iban'));
  const extras=Array.from(extraIbanList?.querySelectorAll('input')||[]).map(el=>normalizeIban(el.value));
  if(extras.some(v=>v&&!ibanPattern.test(v))||new Set([mainIban,...extras.filter(Boolean)]).size!==1+extras.filter(Boolean).length){showStatus('Controleer de extra IBAN-nummers op geldigheid en dubbele invoer.');return;}
  const signatureName=(q('#signatureName').value||'').trim();
  const accepted=q('#signatureAccepted').checked;
  if(!signatureName||!accepted){showStatus('Bevestig de verklaring met je volledige naam.');return;}
  payload.signature={name:signatureName,accepted};
  if(termsState.ready)payload.termsAcceptance={accepted:true,version:termsState.version};
 }
 busy=true; showStatus(action==='submit'?'Aanvraag wordt ingediend…':'Gegevens worden opgeslagen…');
 try{
   const result=await request('/api/prospect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action,...payload})});
   if(result.submitted){const confirmed=await tryReceipt();if(!confirmed)showStatus('Aanvraag verwerkt, maar de ontvangstbevestiging kon niet worden gecontroleerd. Vernieuw de pagina om de status te bekijken.');}
   else {showStatus('Je gegevens zijn opgeslagen. Je kunt later verdergaan met dezelfde link.');document.dispatchEvent(new CustomEvent('bestemd:extras-saved'));}
 }catch(error){showStatus('Indienen is niet gelukt: '+(error.message||'Onbekende fout')+'. Je ingevulde gegevens blijven staan.');}finally{busy=false;}
}
q('#save').addEventListener('click',()=>save('save'));
form.addEventListener('submit',event=>{event.preventDefault();save('submit')});
})();
