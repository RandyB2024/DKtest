import {mountTasks} from './tasks.js';
import {enhanceIntakeForm,intakeLabels} from './intake-form.js';
import {intakeExtensions,addressKeys,intakeGroups} from './intake-fields.js';
import {profileSections,validateProfile,maskIban} from './profile-fields.js';
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const labels={active:'Actief',inactive:'Inactief',setup:'Nog in te richten',blocked:'Tijdelijk geblokkeerd',ended:'Beëindigd',month:'Maand',quarter:'Kwartaal',year:'Jaar',half_year:'Halfjaar',not_applicable:'Niet van toepassing',on_request:'Op verzoek',income_tax:'Inkomstenbelasting',corporate_tax:'Vennootschapsbelasting',four_weeks:'Vier weken',invoice:'Factuurstelsel',cash:'Kasstelsel',administration:'Administratie',vat:'Omzetbelasting',annual_accounts:'Jaarrekening',payroll:'Salarisadministratie',reporting:'Rapportage',guidance:'Ondernemingsbegeleiding',meeting:'Periodiek gesprek',other:'Overig',email:'E-mail',phone:'Telefoon',mobile:'Mobiel',post:'Post'};
Object.assign(labels,intakeLabels);
const display=v=>v===null||v===undefined||v===''?'Niet ingevuld':typeof v==='boolean'?v?'Ja':'Nee':labels[v]??String(v);
function pair(parent,label,value){const p=el('div',undefined,'profile-value');p.append(el('span',label,'profile-label'),el('span',display(value),value===null||value===undefined||value===''?'profile-empty-value':'profile-value-text'));parent.append(p);}
function button(label,fn,style='secondary'){const b=el('button',label,'profile-button profile-button--'+style);b.type='button';b.onclick=fn;return b;}
function badge(value){return el('span',display(value),'profile-badge'+(['active'].includes(value)?' profile-badge--active':['inactive','ended','blocked'].includes(value)?' profile-badge--quiet':''));}
const fieldGroups={
 overview:[['Relatie',['name','status']],['Begeleiding',['responsible_id','started_on']]],
 company:[['Identiteit',['name','legal_name','trade_names','legal_form','rsin','business_status']],['Adres en bereikbaarheid',['visit_address','postal_address','phone','email','website']],['Activiteiten en looptijd',['started_on','ended_on','activities']]],
 contacts:[['Persoon',['first_name','infix','last_name','preferred_name','job_title']],['Bereikbaarheid',['email','phone','mobile','preferred_contact']],['Rol en toegang',['is_primary','can_sign','portal_access','active']],['Intern',['internal_comment']]],
 fiscal:[['Omzetbelasting',['vat_id','tax_number','vat_liable','vat_period','filing_start']],['Winstbelasting en loonheffingen',['fiscal_form','income_tax','payroll_number','payroll_period']],['Regelingen',['fiscal_unity','kor','icp','oss']],['Boekjaar',['year_start','year_end','broken_year']],['Advies en aandachtspunten',['external_adviser','attention']]],
 administration:[['Inrichting',['status','started_on','first_period','financial_year','reporting_frequency']],['Verwerking',['currency','accounting_method','external_package','migration_source']],['Organisatie',['cost_centers','projects','payroll','employees']],['Intern',['setup_notes']]],
 banks:[['Rekening',['label','iban']]],services:[['Dienst',['service','status','frequency']],['Looptijd en verantwoordelijkheid',['started_on','ended_on','responsible_id']],['Afspraken',['price_agreement','description']]],
 agreements:[['Contact',['contact_frequency','meetings_per_year','preferred_times']],['Aanlevering en rapportage',['reporting','submission_deadline','particulars']]],
 notes:[['Notitie',['title','body']],['Indeling',['category','pinned']]]
};
for(const [section,fields]of Object.entries(intakeExtensions)){
 const groups=section==='company'?[['Bezoekadres',[...addressKeys,'source','manual'].map(k=>'visit_'+k)],['Postadres',['postal_same',...[...addressKeys,'source','manual'].map(k=>'postal_'+k)]]]:section==='administration'?[['Zakelijke voertuigen',['vehicles','vehicle_count','vehicle_use','vehicle_notes']],['Bedrijfspand',['premises','premises_use','premises_same','premises_notes']],['Verzekeringsopgave',['klaas_vis','insurance_notes']]]:[['Fiscale beoordeling',Object.keys(fields)]];fieldGroups[section].push(...groups);
}
fieldGroups.fiscal=[...intakeGroups.fiscal,['Historische registratie',['fiscal_unity','kor','vat_liable','fiscal_form','external_adviser']]];
const historyTitle=action=>{const match=String(action).match(/^profile\.([a-z]+)\.(saved|archived)$/);return match&&profileSections[match[1]]?profileSections[match[1]].label+(match[2]==='archived'?' gearchiveerd':' bijgewerkt'):action;};
function viewGroups(section,fields,record,staff){
 const container=el('div',undefined,'profile-field-groups');
 for(const [title,keys] of fieldGroups[section]){
  const visible=keys.filter(k=>Object.hasOwn(fields,k));if(!visible.length)continue;
  const group=el('section',undefined,'profile-field-group');group.append(el('h4',title));
  const grid=el('div',undefined,'profile-grid');
  if(visible.every(k=>record[k]===null||record[k]===undefined||record[k]===''))grid.append(el('p','Nog geen gegevens vastgelegd.','profile-empty-group'));
  else for(const key of visible){const field=fields[key];pair(grid,field.label,field.type==='staff'?staff.find(s=>s.id===record[key])?.name:record[key]);}
  group.append(grid);container.append(group);
 }return container;
}
const groups=[['overview'],['company'],['contacts'],['fiscal'],['administration','banks'],['services','agreements'],['notes'],['history']];
const groupNames=['Overzicht','Onderneming','Contactpersonen','Fiscaal','Administratie','Diensten en afspraken','Interne notities','Historie'];

export async function mountCustomerProfile(root,api,relationship,organizations){
 root.className='customer-profile';
 let selected=organizations[0]?.id,tab=0,data,pending=false,dirty=false,request=0,pageBy={},archiveBy={};
 const abort=new AbortController();
 const leave=event=>{if(!root.isConnected)return;if(pending||dirty&&!confirm('Niet-opgeslagen wijzigingen verlaten?'))event.preventDefault();};
 window.addEventListener('profile-before-leave',leave,{signal:abort.signal});
 window.addEventListener('beforeunload',event=>{if(dirty||pending){event.preventDefault();event.returnValue='';}},{signal:abort.signal});
 const observer=new MutationObserver(()=>{if(!root.isConnected){abort.abort();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
 const base=()=>'/api/relationships/'+encodeURIComponent(relationship.id)+'/organizations/'+encodeURIComponent(selected)+'/profile';
 const allowed=section=>data.canWrite||['overview','company','contacts'].includes(section)||section==='fiscal'&&data.role==='accountant';
 function errorBox(message){const p=el('p',message,'mutation-error profile-message profile-message--error');p.setAttribute('role','alert');return p;}
 async function load(message=''){
  const seq=++request;root.replaceChildren(el('p','Dossier veilig laden…','profile-empty'));if(!selected){root.replaceChildren(el('p','Voeg eerst een onderneming toe om het profiel in te richten.','profile-empty'));return;}
  try{const fresh=await api(base());if(!root.isConnected||seq!==request)return;data=fresh;await render(message);}
  catch(e){if(root.isConnected&&seq===request)root.replaceChildren(errorBox(e.message),button('Opnieuw laden',()=>load()));}
 }
 function sourcePanel(parent){
  const src=data.source;if(!src){parent.append(el('p','Geen KvK-broncontrole vastgelegd. Bestaande gegevens blijven bruikbaar.'));return;}
  const details=el('details',undefined,'profile-source');details.append(el('summary','KvK-brongegevens (historische momentopname)'));
  pair(details,'Laatste KvK-controle',src.checked_at);pair(details,'Omgeving',src.environment);
  const p=src.profile;
  for(const [key,label] of Object.entries({name:'Handelsnaam',legalName:'Officiële naam',kvkNumber:'KvK-nummer',legalForm:'Rechtsvorm',status:'Status',registeredAt:'Registratiedatum',startedAt:'Aanvang',mainBranchNumber:'Hoofdvestiging',branchCount:'Aantal vestigingen'}))pair(details,label,p[key]);
  pair(details,'Overige handelsnamen',p.tradeNames?.join(', '));
  for(const [key,label] of [['visitAddress','Bezoekadres'],['postalAddress','Postadres']]){const address=p[key];pair(details,label,address?.shielded?'Afgeschermd':address?Object.values(address).filter(x=>typeof x==='string'||typeof x==='number').join(' '):null);}
  pair(details,'Activiteiten / SBI',p.activities?.map(a=>a.code+' — '+a.description).join('\n'));parent.append(details);
 }

 /*
  * BESTEMD OFFICE INVOICE SETTINGS V1
  *
  * Zelfde invoicing_settings als Mijn Bestemming.
  * Geen dubbele administratie.
  */
 async function renderInvoiceSettings(parent){
  const shell=el('section',undefined,'profile-field-group office-invoice-settings');
  const head=el('div',undefined,'profile-section-heading');
  const title=el('div');

  title.append(
    el('h4','Factuurinstellingen'),
    el(
      'p',
      'Instellingen die worden gebruikt voor verkoopfacturen in Mijn Bestemming.',
      'profile-help'
    )
  );

  head.append(title);
  shell.append(head);

  const loading=el(
    'p',
    'Factuurinstellingen laden…',
    'profile-empty'
  );

  shell.append(loading);
  parent.append(shell);

  let result;

  try{
    result=await api(
      '/api/organizations/'
      +encodeURIComponent(selected)
      +'/invoicing-settings'
    );
  }catch(e){
    loading.remove();
    shell.append(
      errorBox(
        e.message||
        'Factuurinstellingen konden niet worden geladen.'
      )
    );
    return;
  }

  if(!root.isConnected)return;

  loading.remove();

  const profile=
    result.profile??{};

  const address=
    profile.businessAddress??{};

  const complete=
    Boolean(
      profile.companyName
      && profile.invoiceEmail
      && address.street
      && address.postalCode
      && address.city
    );

  const summary=
    el(
      'div',
      undefined,
      'profile-grid office-invoice-settings-summary'
    );

  pair(
    summary,
    'Bedrijfsnaam',
    profile.companyName
  );

  pair(
    summary,
    'Factuur e-mailadres',
    profile.invoiceEmail
  );

  pair(
    summary,
    'Betaaltermijn',
    profile.defaultPaymentTermDays
      ? profile.defaultPaymentTermDays+' dagen'
      : null
  );

  pair(
    summary,
    'Factuurnummering',
    profile.invoicePrefix
      ? profile.invoicePrefix+'-YYYY-00001'
      : null
  );

  pair(
    summary,
    'Creditnummering',
    profile.creditPrefix
      ? profile.creditPrefix+'-YYYY-00001'
      : null
  );

  pair(
    summary,
    'Btw-verwerking',
    profile.vatAccountingMethod==='cash'
      ? 'Kasstelsel'
      : profile.vatAccountingMethod==='invoice'
        ? 'Factuurstelsel'
        : profile.vatAccountingMethod
  );

  pair(
    summary,
    'Logo',
    profile.logoStoragePath
      ? 'Ingesteld'
      : 'Nog niet ingesteld'
  );

  pair(
    summary,
    'Status',
    complete
      ? 'Factuurgegevens compleet'
      : 'Factuurgegevens aanvullen'
  );

  shell.append(summary);


  const details=
    el(
      'details',
      undefined,
      'profile-source'
    );

  details.append(
    el(
      'summary',
      'Alle factuurgegevens bekijken'
    )
  );

  const detailGrid=
    el(
      'div',
      undefined,
      'profile-grid'
    );

  pair(
    detailGrid,
    'KvK-nummer',
    profile.registrationNumber
  );

  pair(
    detailGrid,
    'Btw-id',
    profile.vatNumber
  );

  pair(
    detailGrid,
    'Telefoonnummer',
    profile.phone
  );

  pair(
    detailGrid,
    'Website',
    profile.website
  );

  pair(
    detailGrid,
    'IBAN',
    profile.iban
  );

  pair(
    detailGrid,
    'BIC',
    profile.bic
  );

  const addressLine=[
    address.street,
    address.houseNumber,
    address.addition
  ].filter(Boolean).join(' ');

  const cityLine=[
    address.postalCode,
    address.city
  ].filter(Boolean).join(' ');

  pair(
    detailGrid,
    'Adres',
    [
      addressLine,
      cityLine,
      address.country
    ].filter(Boolean).join(', ')
  );

  pair(
    detailGrid,
    'Factuurfooter',
    profile.footerText
  );

  details.append(detailGrid);
  shell.append(details);


  if(result.canWrite){
    head.append(
      button(
        'Factuurinstellingen bewerken',
        ()=>editInvoiceSettings(
          profile,
          result
        ),
        'primary'
      )
    );
  }
 }


 function editInvoiceSettings(profile,result){
  if(
    pending
    ||root.querySelector('dialog')
  ){
    return;
  }

  const address=
    profile.businessAddress??{};

  const dialog=
    el(
      'dialog',
      undefined,
      'customer-dialog profile-dialog'
    );

  const form=
    el('form');

  const fieldset=
    el('fieldset');

  const errors=
    errorBox('');

  const head=
    el(
      'div',
      undefined,
      'profile-dialog-head'
    );

  head.append(
    el(
      'p',
      'Facturatie',
      'eyebrow'
    ),
    el(
      'h2',
      'Factuurinstellingen bewerken'
    ),
    el(
      'p',
      'Deze instellingen worden direct gebruikt door Mijn Bestemming.',
      'profile-help'
    )
  );

  form.append(
    head,
    fieldset,
    errors
  );

  dialog.append(form);
  root.append(dialog);


  const controls={};


  function inputField(
    key,
    labelText,
    value='',
    type='text',
    max=200,
    required=false
  ){
    const label=
      el(
        'label',
        labelText+
        (required?' *':'')
      );

    const input=
      el('input');

    input.type=type;
    input.name=key;
    input.value=value??'';
    input.maxLength=max;
    input.required=required;

    label.append(input);
    fieldset.append(label);

    controls[key]=input;
  }


  inputField(
    'companyName',
    'Bedrijfsnaam',
    profile.companyName,
    'text',
    200,
    true
  );

  inputField(
    'registrationNumber',
    'KvK-nummer',
    profile.registrationNumber,
    'text',
    40
  );

  inputField(
    'vatNumber',
    'Btw-id',
    profile.vatNumber,
    'text',
    40
  );

  inputField(
    'invoiceEmail',
    'Factuur e-mailadres',
    profile.invoiceEmail,
    'email',
    254,
    true
  );

  inputField(
    'phone',
    'Telefoonnummer',
    profile.phone,
    'text',
    40
  );

  inputField(
    'website',
    'Website',
    profile.website,
    'text',
    200
  );

  inputField(
    'iban',
    'IBAN',
    profile.iban,
    'text',
    40
  );

  inputField(
    'bic',
    'BIC',
    profile.bic,
    'text',
    20
  );

  inputField(
    'street',
    'Straat',
    address.street,
    'text',
    120
  );

  inputField(
    'houseNumber',
    'Huisnummer',
    address.houseNumber,
    'text',
    20
  );

  inputField(
    'addition',
    'Toevoeging',
    address.addition,
    'text',
    20
  );

  inputField(
    'postalCode',
    'Postcode',
    address.postalCode,
    'text',
    20
  );

  inputField(
    'city',
    'Plaats',
    address.city,
    'text',
    100
  );

  inputField(
    'country',
    'Land',
    address.country||'Nederland',
    'text',
    80
  );

  inputField(
    'invoicePrefix',
    'Factuurprefix',
    profile.invoicePrefix||'F',
    'text',
    10,
    true
  );

  inputField(
    'creditPrefix',
    'Creditprefix',
    profile.creditPrefix||'C',
    'text',
    10,
    true
  );


  const termLabel=
    el(
      'label',
      'Standaard betaaltermijn *'
    );

  const term=
    el('select');

  for(
    const days of [
      7,
      14,
      30,
      45,
      60
    ]
  ){
    const option=
      el(
        'option',
        days+' dagen'
      );

    option.value=
      String(days);

    option.selected=
      Number(
        profile.defaultPaymentTermDays
        ??30
      )===days;

    term.append(option);
  }

  termLabel.append(term);
  fieldset.append(termLabel);

  controls.defaultPaymentTermDays=
    term;


  const footerLabel=
    el(
      'label',
      'Tekst onderaan factuur'
    );

  footerLabel.className=
    'profile-field-wide';

  const footer=
    el('textarea');

  footer.name=
    'footerText';

  footer.maxLength=
    500;

  footer.value=
    profile.footerText??'';

  footerLabel.append(footer);
  fieldset.append(footerLabel);

  controls.footerText=
    footer;


  const readonly=
    el(
      'div',
      undefined,
      'profile-warning'
    );

  readonly.textContent=
    'Btw-verwerking: '
    +(
      profile.vatAccountingMethod==='cash'
        ?'Kasstelsel'
        :'Factuurstelsel'
    )
    +'. Dit veld wijzigen we bewust niet vanuit dit formulier.';

  fieldset.append(readonly);


  const actions=
    el(
      'div',
      undefined,
      'profile-form-actions'
    );

  const cancel=
    button(
      'Annuleren',
      ()=>{
        if(pending)return;
        dialog.close();
      }
    );

  const save=
    el(
      'button',
      'Opslaan',
      'primary profile-button profile-button--primary'
    );

  save.type=
    'submit';

  actions.append(
    cancel,
    save
  );

  form.append(actions);


  form.onsubmit=
    async event=>{
      event.preventDefault();

      if(pending)return;

      errors.textContent='';

      pending=true;
      fieldset.disabled=true;
      save.disabled=true;
      cancel.disabled=true;
      save.textContent='Opslaan…';

      try{
        await api(
          '/api/organizations/'
          +encodeURIComponent(selected)
          +'/invoicing-settings',
          {
            companyName:
              controls.companyName.value,

            registrationNumber:
              controls.registrationNumber.value,

            vatNumber:
              controls.vatNumber.value,

            phone:
              controls.phone.value,

            website:
              controls.website.value,

            businessAddress:{
              street:
                controls.street.value,

              houseNumber:
                controls.houseNumber.value,

              addition:
                controls.addition.value,

              postalCode:
                controls.postalCode.value,

              city:
                controls.city.value,

              country:
                controls.country.value
            },

            iban:
              controls.iban.value,

            bic:
              controls.bic.value,

            invoiceEmail:
              controls.invoiceEmail.value,

            footerText:
              controls.footerText.value,

            defaultPaymentTermDays:
              Number(
                controls.defaultPaymentTermDays.value
              ),

            invoicePrefix:
              controls.invoicePrefix.value,

            creditPrefix:
              controls.creditPrefix.value
          },
          'PUT'
        );

        dialog.close();

        if(root.isConnected){
          await load(
            'Factuurinstellingen opgeslagen.'
          );
        }

      }catch(e){
        errors.textContent=
          e.message||
          'Factuurinstellingen konden niet worden opgeslagen.';
      }finally{
        pending=false;
        fieldset.disabled=false;
        save.disabled=false;
        cancel.disabled=false;
        save.textContent='Opslaan';
      }
    };


  dialog.addEventListener(
    'close',
    ()=>{
      dialog.remove();
    }
  );


  dialog.showModal();
 }

 async function render(message=''){
  root.replaceChildren();const hero=el('section',undefined,'panel profile-hero');
  const org=data.organization,rel=data.relationship,company=data.sections.company??{};
  hero.append(el('p','Klantdossier','eyebrow'));const title=el('div',undefined,'profile-title');title.append(el('h2',rel.name),badge(rel.status));hero.append(title,el('p',org.legal_name||'Officiële naam nog niet ingevuld','profile-subtitle'));
  const top=el('div',undefined,'profile-header-meta');
  for(const [label,value] of [['Relatienummer',rel.relationship_number],['KvK · alleen-lezen',org.registration_number],['Verantwoordelijke',data.staff.find(s=>s.id===rel.responsible_id)?.name],['Start relatie',rel.started_on]])pair(top,label,value);
  hero.append(top);
  const missing=[];if(!rel.responsible_id)missing.push('verantwoordelijke medewerker');if(!rel.started_on)missing.push('start relatie');if(!org.legal_name)missing.push('officiële naam');
  if(missing.length)hero.append(el('p','Aanvullen: '+missing.join(', ')+'.','profile-warning'));
  if(organizations.length>1){const label=el('label','Onderneming kiezen','profile-organization-select');const select=el('select');for(const o of organizations){const option=el('option',o.name);option.value=o.id;option.selected=o.id===selected;select.append(option);}select.onchange=()=>{selected=select.value;pageBy={};archiveBy={};void load();};label.append(select);hero.append(label);}
  root.append(hero);const status=el('p',message,'profile-message profile-message--success');status.setAttribute('role','status');root.append(status);
  const layout=el('div',undefined,'profile-layout'),nav=el('nav',undefined,'profile-tabs'),content=el('div',undefined,'profile-content');nav.setAttribute('aria-label','Dossieronderdelen');
  groups.forEach((g,i)=>{const b=button(groupNames[i],()=>{tab=i;void render().then(()=>{if(root.isConnected)root.querySelector('[aria-current="page"]')?.focus();});});b.setAttribute('aria-current',tab===i?'page':'false');nav.append(b);});layout.append(nav,content);root.append(layout);
  const seq=++request;
  for(const section of groups[tab]){
   if(!root.isConnected||seq!==request)return;
   const panel=el('section',undefined,'panel profile-section'),heading=el('div',undefined,'profile-section-heading'),headingText=el('div');headingText.append(el('h3',profileSections[section]?.label??'Historie'));heading.append(headingText);panel.append(heading);content.append(panel);
   if(profileSections[section]?.private||section==='history')headingText.append(el('span','Intern','profile-badge'));

   /*
    * Factuurinstellingen zijn een apart beveiligd
    * onderdeel binnen Administratie.
    */
   if(section==='administration'){
     await renderInvoiceSettings(panel);
   }

   if(!allowed(section)){
     if(section==='administration'){
       panel.append(
         el(
           'p',
           'De overige administratieve profielgegevens zijn niet beschikbaar voor uw Office-rol.',
           'profile-empty'
         )
       );
       continue;
     }

     panel.append(
       el(
         'p',
         'Dit onderdeel is niet beschikbaar voor uw Office-rol.',
         'profile-empty'
       )
     );
     continue;
   }

   if(section==='history'||profileSections[section].collection){await collection(panel,section,seq);continue;}
   const record=section==='overview'?data.relationship:section==='company'?{...company,name:org.name,legal_name:org.legal_name}:data.sections[section]??{};
   const fields=Object.fromEntries(Object.entries(profileSections[section].fields).filter(([key])=>(key!=='rsin'||allowed('fiscal'))&&!(section==='fiscal'&&record.vat_status&&['kor','vat_liable'].includes(key))));
   panel.append(viewGroups(section,fields,record,data.staff));
   if(section==='overview'){

    if(data.legacyManual&&Object.values(data.legacyManual).some(Boolean)){const d=el('details',undefined,'profile-source');d.append(el('summary','Historische handmatige KvK-intake — nog beoordelen'));
     const names={relationshipName:'Oorspronkelijke klantnaam',vatId:'Btw-identificatienummer',taxNumber:'Omzetbelastingnummer',iban:'IBAN (gemaskeerd)',email:'E-mail',phone:'Telefoon',contactPerson:'Contactpersoon',fiscalChoices:'Fiscale keuzes',services:'Dienstverlening'};
     for(const [key,value] of Object.entries(data.legacyManual))pair(d,names[key]??key,key==='iban'?maskIban(value):value);d.append(el('p','Historische invoer; niet automatisch omgezet naar actuele instellingen.','profile-help'));panel.append(d);}
   }
   if(section==='company'){sourcePanel(panel);}
   if(section==='fiscal'){pair(panel,'RSIN (ondernemingsgegevens)',company.rsin);pair(panel,'Winstbelasting bevestigd op',record.income_tax_confirmed_at);pair(panel,'Bevestigd door',data.staff.find(s=>s.id===record.income_tax_confirmed_by)?.name);if(record.vat_status==='kor'||record.kor===true&&!record.vat_status)panel.append(el('p','KOR betreft alleen de omzetbelasting. Inkomstenbelasting of vennootschapsbelasting kan nog steeds van toepassing zijn.','profile-warning'));}
   if(section==='company'){pair(panel,'Bezoekadres: laatste Office-controle',record.visit_checked_at);pair(panel,'Postadres: laatste Office-controle',record.postal_checked_at);}
   if(data.canWrite)heading.append(button('Bewerken',()=>edit(section,record),'primary'));
   if(section==='overview'){const tasks=el('section');content.append(tasks);await mountTasks(tasks,api,{relationship:rel.id,organization:org.id,staff:data.staff,canWrite:data.canWrite});}
  }
 }
 async function collection(panel,section,seq){
  const page=pageBy[section]??1,archived=archiveBy[section]??false;
  const loading=el('p','Gegevens laden…','profile-empty');loading.setAttribute('role','status');panel.append(loading);
  try{
   const result=await api(base()+'/'+section+'?page='+page+'&archived='+archived);if(!root.isConnected||seq!==request)return;loading.remove();
   // Use exactly the version loaded with the form's data, never silently refresh a stale form.
   const version=result.version;
   const toolbar=el('div',undefined,'profile-list-toolbar');panel.append(toolbar);
   if(section!=='history'){
    toolbar.append(button(archived?'Actieve records tonen':'Archief tonen',()=>{archiveBy[section]=!archived;pageBy[section]=1;void render();},'quiet'));
    if(data.canWrite&&!archived)toolbar.append(button('Toevoegen',()=>edit(section,{},version),'primary'));
   }
   if(!result.items.length)panel.append(el('p',archived?'Geen gearchiveerde records gevonden.':'Geen records gevonden.','profile-empty'));
   for(const item of result.items){
    const article=el('article',undefined,'profile-record');
    if(section==='history'){
     article.className+=' profile-history-record';const head=el('div',undefined,'profile-record-heading');head.append(el('h4',historyTitle(item.action)),el('span',item.created_at,'profile-caption'));article.append(head);
     pair(article,'Medewerker',item.actor??item.actor_id);const details=el('details',undefined,'profile-record-details');details.append(el('summary','Wijziging bekijken'));pair(details,'Registratie',item.action);pair(details,'Record',item.object_id);pair(details,'Gewijzigde velden',item.metadata?.changed_fields?.join(', '));article.append(details);
    }else{
     const head=el('div',undefined,'profile-record-heading');
     const title=section==='contacts'?[item.first_name,item.infix,item.last_name].filter(Boolean).join(' '):section==='services'?display(item.service):section==='banks'?item.label||'Bankrekening':item.title;
     head.append(el('h4',title||profileSections[section].label));
     if(section==='contacts'&&item.active!==null&&item.active!==undefined)head.append(badge(item.active?'active':'inactive'));
     if(section==='services'&&item.status)head.append(badge(item.status));
     if(section==='contacts'&&item.is_primary)head.append(el('span','Primair','profile-badge'));
     if(section==='notes'&&item.pinned)head.append(el('span','Vastgepind','profile-badge'));
     article.append(head);
     const summary=section==='contacts'?item.email||item.phone:section==='banks'?item.iban:section==='services'?item.frequency:item.category;
     if(summary)article.append(el('p',summary,'profile-record-preview'));
     const details=el('details',undefined,'profile-record-details');details.append(el('summary',section==='notes'?'Notitie lezen':'Alle gegevens bekijken'));
     const grid=el('div',undefined,'profile-grid');
     for(const [key,field] of Object.entries(profileSections[section].fields))if(Object.hasOwn(item,key))pair(grid,field.label,field.type==='staff'?data.staff.find(s=>s.id===item[key])?.name:item[key]);
     if(section==='notes'){pair(grid,'Auteur',data.staff.find(s=>s.id===item.created_by)?.name??item.created_by);pair(grid,'Aangemaakt',item.created_at);pair(grid,'Laatst gewijzigd',item.updated_at);}
     details.append(grid);article.append(details);
     if(data.canWrite&&!archived){const actions=el('div',undefined,'profile-record-actions');actions.append(button('Bewerken',()=>edit(section,item,version),'quiet'),button('Archiveren',()=>archive(section,item,version),'danger'));details.append(actions);}
    }panel.append(article);
   }
   const paging=el('div',undefined,'profile-pagination');if(page>1)paging.append(button('Vorige pagina',()=>{pageBy[section]=page-1;void render();}));paging.append(el('span','Pagina '+page));if(result.hasMore)paging.append(button('Volgende pagina',()=>{pageBy[section]=page+1;void render();}));panel.append(paging);
  }catch(e){if(root.isConnected&&seq===request){loading.remove();panel.append(errorBox(e.message),button('Opnieuw proberen',()=>render()));}}
 }
 function edit(section,record,collectionVersion){
  if(pending||root.querySelector('dialog'))return;
  const dialog=el('dialog',undefined,'customer-dialog profile-dialog'),form=el('form'),fieldset=el('fieldset'),errors=errorBox('');
  const dialogHead=el('div',undefined,'profile-dialog-head');dialogHead.append(el('p','Klantdossier','eyebrow'),el('h2',profileSections[section].label+' bewerken'),el('p','Velden met * zijn verplicht.','profile-help'));
  dialogHead.querySelector('h2').id='profile-dialog-title';dialog.setAttribute('aria-labelledby','profile-dialog-title');
  form.append(dialogHead,fieldset,errors);dialog.append(form);root.append(dialog);const controls={},fieldContainers={};
  for(const [title,keys] of fieldGroups[section]){const group=el('section',undefined,'profile-form-group');group.append(el('h3',title));const grid=el('div',undefined,'profile-form-grid');group.append(grid);fieldset.append(group);for(const key of keys)fieldContainers[key]=grid;}
  const version=collectionVersion??(section==='overview'?data.relationship.profile_version:data.organization.profile_version);
  for(const [key,field] of Object.entries(profileSections[section].fields)){
   const label=el('label',field.label+(field.required&&!(section==='banks'&&record.id&&key==='iban')?' *':''));if(field.max>500)label.className='profile-field-wide';let input;
   if(['enum','boolean','staff'].includes(field.type)){
    input=el('select');const empty=el('option',field.type==='boolean'?'Onbekend / nog te beoordelen':'Niet ingevuld');empty.value='';input.append(empty);
    const values=field.type==='boolean'?['true','false']:field.type==='staff'?data.staff.map(s=>s.id):field.values;
    for(const v of values){const option=el('option',field.type==='staff'?data.staff.find(s=>s.id===v).name:field.type==='boolean'?v==='true'?'Ja':'Nee':labels[v]??v);option.value=v;input.append(option);}
   }else{input=el(field.type==='text'&&field.max>500?'textarea':'input');if(input.tagName==='INPUT')input.type=field.type==='date'?'date':field.type==='integer'?'number':field.type==='email'?'email':'text';if(field.max)input.maxLength=field.max;if(field.type==='integer'){input.min='0';input.max=String(field.max);input.step='1';}}
   input.name=key;input.value=section==='banks'&&key==='iban'?'':record[key]??(section==='administration'&&key==='currency'?'EUR':'');
   // Existing bank numbers are never echoed into an editable control. Empty keeps the old number.
   input.required=!!field.required&&!(section==='banks'&&record.id&&key==='iban');
   label.append(input);fieldContainers[key].append(label);controls[key]=input;
  }
  if(section==='banks'&&record.id)fieldset.append(el('p','IBAN leeg laten behoudt het bestaande rekeningnummer. Een ingevuld IBAN vervangt het na bevestiging.'));
  if(section==='contacts')fieldset.append(el('p','Portaaltoegang is alleen een registratie. Accountuitnodigingen blijven uitgeschakeld.'));
  enhanceIntakeForm(section,controls,record,api,fieldset);
  const save=el('button','Opslaan');save.type='submit';save.className='primary profile-button profile-button--primary';const cancel=button('Annuleren',()=>close()),actions=el('div',undefined,'profile-form-actions');actions.append(cancel,save);form.append(actions);
  form.oninput=()=>{dirty=true;};
  function close(){if(pending)return;if(dirty&&!confirm('Wijzigingen verwerpen?'))return;dirty=false;dialog.close();}
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>{dirty=false;dialog.remove();});
  form.onsubmit=async event=>{
   event.preventDefault();if(pending)return;errors.textContent='';let fields={};
   for(const [key,input] of Object.entries(controls)){
    const field=profileSections[section].fields[key],v=input.value;
    if(section==='banks'&&record.id&&key==='iban'&&!v)continue;
    if(key==='income_tax_confirm'&&!v)continue;
    const value=v===''?null:field.type==='boolean'?v==='true':field.type==='integer'?Number(v):v;
    if((record[key]??null)!==value||key==='income_tax_confirm'&&value===true)fields[key]=value;
   }
   if(!Object.keys(fields).length){errors.textContent='Geen wijzigingen om op te slaan.';return;}
   try{fields=validateProfile(section,fields);}catch(e){errors.textContent=e.message;return;}
   if((section==='banks'&&fields.iban||section==='overview'&&fields.status==='inactive'||section==='contacts'&&fields.portal_access!==undefined)&&!confirm('Deze wijziging bevestigen?'))return;
   pending=true;fieldset.disabled=true;save.disabled=true;cancel.disabled=true;save.textContent='Opslaan…';
   try{
    await api(base()+'/'+section+(record.id&&profileSections[section].collection?'/'+record.id:''),{version,fields},profileSections[section].collection&&!record.id?'POST':'PATCH');
    dirty=false;dialog.close();if(root.isConnected)await load('Wijziging opgeslagen. Actuele gegevens opnieuw geladen.');
   }catch(e){if(dialog.isConnected){errors.textContent=e.message;if(e.code==='VERSION_CONFLICT')errors.append(button('Annuleren en herladen',()=>{if(confirm('Uw invoer verwerpen en de actuele versie laden?')){dirty=false;dialog.close();void load();}}));}}
   finally{pending=false;fieldset.disabled=false;save.disabled=false;cancel.disabled=false;save.textContent='Opslaan';}
  };dialog.showModal();
 }
 async function archive(section,record,version){
  if(pending||!confirm('Dit record archiveren? De historie blijft bewaard.'))return;pending=true;
  try{await api(base()+'/'+section+'/'+record.id+'/archive',{version,fields:{}});if(root.isConnected)await load('Record gearchiveerd.');}
  catch(e){if(root.isConnected)root.prepend(errorBox(e.message));}finally{pending=false;}
 }
 await load();
}
