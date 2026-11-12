// BESTEMD - presentatie-wizard, géén aanpassing aan velden, API of opslaan/indienen.
(() => {
 'use strict';
 const form = document.querySelector('#form');
 const hero = document.querySelector('.hero');
 if (!form || !hero || !document.querySelector('#save') || !document.querySelector('#status')) return;
 const sections = [...form.querySelectorAll(':scope > section.card')];
 const titles = ['Contactpersoon','Onderneming','Kennismaking','Financieel beeld','Administratie','Documenten','Afronden'];
 // Bij een andere formulier-versie NIET het formulier verbergen.
 if (sections.length !== titles.length) return;
 if (hero.querySelector('.bestemd-stepper')) return;
 const oldSteps = hero.querySelector('.hero-grid');
 if(oldSteps) oldSteps.hidden = true;
 const stepper = document.createElement('nav');
 stepper.className='bestemd-stepper';
 stepper.setAttribute('aria-label','Stappen van jouw aanvraag');
 const pageInfo=document.createElement('p');
 pageInfo.className='bestemd-step-counter';
 pageInfo.setAttribute('aria-live','polite');
 const buttons=[];
 let current=0;
 let reached=0;
 const nav=document.createElement('div');
 nav.className='bestemd-wizard-navigation';
 const back=document.createElement('button'); back.type='button';back.className='bestemd-wizard-back';back.textContent='Vorige';
 const next=document.createElement('button'); next.type='button';next.className='bestemd-wizard-next';next.textContent='Volgende';
 const hint=document.createElement('span'); hint.className='bestemd-wizard-hint';hint.setAttribute('role','status');
 nav.append(back,hint,next);
 const scrollToTop=() => {window.scrollTo({top:0,behavior:'smooth'});};
 function visibleInput(el){return !el.disabled && !el.closest('.hidden, [hidden]') && getComputedStyle(el).visibility !== 'hidden';}
 function checkCurrent(){
   const fields=[...sections[current].querySelectorAll('input,select,textarea')];
   const invalid=fields.find(el=>visibleInput(el) && el.willValidate && !el.checkValidity());
   if(invalid){
     hint.textContent='Controleer eerst de verplichte gegevens in deze stap.';
     invalid.reportValidity();
     invalid.focus({preventScroll:false});
     return false;
   }
   hint.textContent='';return true;
 }
 function showStep(index,{scroll=true}={}){
   if(index<0||index>=sections.length)return;
   current=index;
   reached=Math.max(reached,current);
   sections.forEach((section,i)=>{
     section.classList.toggle('bestemd-step-hidden',i!==current);
     section.setAttribute('aria-hidden',String(i!==current));
   });
   buttons.forEach((b,i)=>{
     b.classList.toggle('is-active',i===current);
     b.classList.toggle('is-done',i<current);
     b.setAttribute('aria-current',i===current?'step':'false');
     b.disabled=i>reached;
   });
   back.hidden=current===0;
   next.hidden=current===sections.length-1;
   pageInfo.textContent=`Stap ${current+1} van ${sections.length}  ·  ${Math.round((current+1)/sections.length*100)}%`;hero.style.setProperty('--bestemd-progress',`${(current+1)/sections.length*100}%`);
   hint.textContent='';
   if(typeof updateSummary==='function')updateSummary();if(scroll)scrollToTop();
 }
 titles.forEach((title,i)=>{
   const b=document.createElement('button');b.type='button';b.className='bestemd-step-tab';
   const number=document.createElement('span');number.className='bestemd-step-number';number.textContent=String(i+1);
   const label=document.createElement('span');label.textContent=title;
   b.append(number,label);
   b.addEventListener('click',()=>{if(i<=reached)showStep(i)});
   buttons.push(b);stepper.append(b);
 });
 hero.append(stepper,pageInfo);
 // Reference-inspired desktop summary; presentation only, never changes form data or APIs.
 const layout=document.createElement('div');layout.className='bestemd-reference-layout';
 const sidebar=document.createElement('aside');sidebar.className='bestemd-reference-sidebar';
 sidebar.setAttribute('aria-label','Samenvatting van de aanvraag');
 const sidebarTitle=document.createElement('h2');sidebarTitle.textContent='Samenvatting';
 const business=document.createElement('div');business.className='bestemd-reference-business';
 const legal=document.createElement('div');legal.className='bestemd-reference-legal';
 const checklist=document.createElement('ol');checklist.className='bestemd-reference-checklist';
 const markers=titles.map((title)=>{const li=document.createElement('li');li.textContent=title;checklist.append(li);return li;});
 sidebar.append(sidebarTitle,business,legal,checklist);
 form.parentNode.insertBefore(layout,form);
 layout.append(form,sidebar);
 const updateSummary=()=>{
  const name=form.querySelector('[name="companyName"]')?.value?.trim()||'Nog niet ingevuld';
  const type=form.querySelector('[name="legalForm"]')?.value?.trim()||
    form.querySelector('[name="entityType"]:checked')?.closest('label')?.textContent?.trim()||'Nog niet ingevuld';
  business.replaceChildren();legal.replaceChildren();
  const bn=document.createElement('small');bn.textContent='Onderneming';
  const bv=document.createElement('strong');bv.textContent=name;
  const ln=document.createElement('small');ln.textContent='Rechtsvorm';
  const lv=document.createElement('strong');lv.textContent=type;
  business.append(bn,bv);legal.append(ln,lv);
  markers.forEach((li,i)=>{li.classList.toggle('done',i<current);li.classList.toggle('active',i===current);});
 };
 form.addEventListener('input',updateSummary);
 form.addEventListener('change',updateSummary);
 const footer=document.createElement('div');footer.className='bestemd-wizard-footer';footer.append(nav);
 form.after(footer);
 back.addEventListener('click',()=>showStep(current-1));
 next.addEventListener('click',()=>{if(checkCurrent()) showStep(current+1);});
 // De bestaande submit-handler blijft intact. Maak bij een ongeldig veld
 // op een andere pagina die pagina zichtbaar, zodat de gebruiker kan corrigeren.
 form.addEventListener('submit',e=>{
   const invalid=[...form.querySelectorAll('input,select,textarea')].find(el=>visibleInput(el) && el.willValidate && !el.checkValidity());
   if(invalid){
     const page=sections.findIndex(s=>s.contains(invalid));
     if(page>=0&&page!==current){e.preventDefault();e.stopImmediatePropagation();showStep(page);invalid.reportValidity();}
   }
 },true);
 // Toon de relevante pagina als de browser op een verplicht veld in een andere sectie stuit.
 form.addEventListener('invalid',e=>{
   const page=sections.findIndex(s=>s.contains(e.target));
   if(page>=0&&page!==current)showStep(page,{scroll:false});
 },true);
 // De terugknop van de browser kan niet naar een andere prospect.
 showStep(0,{scroll:false});
})();
