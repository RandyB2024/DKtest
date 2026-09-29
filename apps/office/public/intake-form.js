import {dependentFields,addressKeys,korMessage} from './intake-fields.js';
const el=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;return e;};
export const intakeLabels={income_tax:'Inkomstenbelasting',corporate_tax:'Vennootschapsbelasting',not_applicable:'Niet van toepassing',month:'Maand',quarter:'Kwartaal',year:'Jaar',unknown:'Nog te beoordelen',yes:'Ja',no:'Nee',to_check:'Nog te controleren',regular:'Reguliere btw-plicht',kor:'KOR',exempt:'Vrijgestelde prestaties',mixed:'Gemengd',not_liable:'Niet btw-plichtig',owned:'Eigendom',rented:'Gehuurd',borrowed:'Bruikleen',financial_lease:'Financial lease',operational_lease:'Operational lease',other:'Anders',manual:'Handmatig opgegeven',pdok_suggestion:'PDOK/BAG-voorstel (door Office opgegeven)'};
function confirmRemoval(message,parent){return new Promise(resolve=>{const dialog=el('dialog'),title=el('h2','Gegevens vervangen?'),text=el('p',message),cancel=el('button','Behouden'),ok=el('button','Bevestigen');dialog.className='customer-dialog';dialog.setAttribute('aria-label','Afhankelijke gegevens wijzigen');for(const b of [cancel,ok])b.type='button';const done=value=>{dialog.close();dialog.remove();resolve(value);};cancel.onclick=()=>done(false);ok.onclick=()=>done(true);dialog.oncancel=e=>{e.preventDefault();done(false);};dialog.append(title,text,cancel,ok);parent.append(dialog);dialog.showModal();});}
export function enhanceIntakeForm(section,controls,record,api,parent,{preserveConfirmation=false}={}){
 const notify=()=>parent.dispatchEvent(new Event('input',{bubbles:true}));
 for(const [main,keys]of Object.entries(dependentFields[section]??{})){
  if(!controls[main])continue;let previous=controls[main].value;
  const show=()=>{for(const key of keys)if(controls[key])controls[key].parentElement.hidden=controls[main].value!=='true';};
  // Preserve historical visible values until the user deliberately changes the governing answer.
  if(previous!==''||!keys.some(k=>controls[k]?.value))show();
  controls[main].onchange=async()=>{if(controls[main].value!=='true'&&keys.some(k=>controls[k]?.value)&&!await confirmRemoval('De afhankelijke gegevens worden gewist. Deze wijziging bevestigen?',parent)){controls[main].value=previous;return;}if(controls[main].value!=='true')for(const k of keys)if(controls[k])controls[k].value='';previous=controls[main].value;show();notify();};
 }
 if(section==='fiscal'){
  const message=el('p',korMessage);message.className='profile-warning';parent.append(message);
  const update=()=>{message.hidden=controls.vat_status?.value!=='kor'&&!(record.kor===true&&!controls.vat_status?.value);};controls.vat_status?.addEventListener('change',update);update();
  const conflict=el('p','KOR en een periodieke btw-aangifte zijn beide ingesteld. Controleer deze combinatie; een uitzondering blijft mogelijk.');conflict.className='profile-warning';parent.append(conflict);const check=()=>{conflict.hidden=controls.vat_status?.value!=='kor'||!['month','quarter','year'].includes(controls.vat_period?.value);};controls.vat_status?.addEventListener('change',check);controls.vat_period?.addEventListener('change',check);check();
  const warning=el('p','Leg de beoordeling vast; dit formulier geeft geen belastingadvies. Afwijkende combinaties kunnen inhoudelijke beoordeling vereisen.');warning.className='profile-help';parent.append(warning);
  if(controls.income_tax_confirm){if(!preserveConfirmation)controls.income_tax_confirm.value='';for(const key of ['income_tax','income_tax_start'])controls[key]?.addEventListener('change',()=>{controls.income_tax_confirm.value='';});}
 }
 if(section==='administration'){const note=el('p','Klaas Vis: uitsluitend opgegeven informatie van klant of Office. Geen controle van dekking en geen gegevensuitwisseling.');note.className='profile-help';parent.append(note);}
 if(section==='company'){
  for(const prefix of ['visit','postal']){
   if(!controls[prefix+'_postcode'])continue;
   if(!controls[prefix+'_country'].value)controls[prefix+'_country'].value='NL';
   const box=el('div'),status=el('p'),find=el('button','Adres zoeken ('+(prefix==='visit'?'bezoekadres':'postadres')+')');find.type='button';find.className='profile-button';status.setAttribute('role','status');box.append(find,status);controls[prefix+'_postcode'].parentElement.parentElement.append(box);let generation=0;
   for(const k of addressKeys)controls[prefix+'_'+k].addEventListener('input',()=>{controls[prefix+'_manual'].value='true';controls[prefix+'_source'].value='manual';if(k!=='bag_id')controls[prefix+'_bag_id'].value='';});
   const fingerprint=()=>['country','postcode','house_number','addition'].map(k=>controls[prefix+'_'+k].value).join('|');
   find.onclick=async()=>{const g=++generation,original=fingerprint();status.replaceChildren();if(controls[prefix+'_country'].value!=='NL'){status.textContent='Buitenlandse adressen vult u handmatig in.';return;}find.disabled=true;
    try{const q=new URLSearchParams({postcode:controls[prefix+'_postcode'].value,houseNumber:controls[prefix+'_house_number'].value,addition:controls[prefix+'_addition'].value});const result=await api('/api/addresses/lookup?'+q);if(g!==generation||original!==fingerprint())return;
     status.textContent=result.results.length?'Controleer en kies het juiste adres.':'Geen adres gevonden. U kunt de velden handmatig invullen.';
     for(const address of result.results){const choose=el('button',[address.street,address.house_number,address.addition,address.postcode,address.city].filter(Boolean).join(' '));choose.type='button';choose.onclick=()=>{if(original!==fingerprint()){status.textContent='Invoer gewijzigd. Zoek opnieuw.';return;}for(const k of addressKeys)controls[prefix+'_'+k].value=address[k]??'';controls[prefix+'_source'].value='pdok_suggestion';controls[prefix+'_manual'].value='false';status.textContent='PDOK/BAG-voorstel overgenomen. Controleer het adres vóór opslaan. Latere wijzigingen zijn handmatige invoer.';notify();};status.append(choose);}
    }catch(e){status.textContent=e.message;}finally{find.disabled=false;}
   };
  }
  if(controls.postal_same){let last=controls.postal_same.value;for(const k of addressKeys)controls['postal_'+k].parentElement.hidden=last==='true';controls.postal_same.onchange=async()=>{if(controls.postal_same.value==='true'&&addressKeys.some(k=>controls['postal_'+k].value)&&!await confirmRemoval('Het gestructureerde postadres vervangen door het bezoekadres? De bestaande vrije tekst blijft behouden.',parent)){controls.postal_same.value=last;return;}last=controls.postal_same.value;for(const k of addressKeys){controls['postal_'+k].parentElement.hidden=last==='true';if(last==='true')controls['postal_'+k].value=controls['visit_'+k].value;}notify();};}
 }
}
