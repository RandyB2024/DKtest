// Shared, public field contract. Contains no customer data or secrets.
const text=(label,max=200)=>({label,type:'text',max});
const choice=(label,values)=>({label,type:'enum',values});
const bool=label=>({label,type:'boolean'});
const date=label=>({label,type:'date'});
const staff=label=>({label,type:'staff'});
const integer=(label,max)=>({label,type:'integer',max});
export const profileSections={
 overview:{label:'Overzicht',fields:{name:{...text('Klantnaam'),required:true},status:choice('Klantstatus',['active','inactive']),responsible_id:staff('Verantwoordelijke medewerker'),started_on:date('Start klantrelatie')}},
 company:{label:'Onderneming',fields:{name:{...text('Handelsnaam'),required:true},legal_name:text('Officiële naam'),trade_names:text('Overige handelsnamen',1000),rsin:text('RSIN (tekst, indien van toepassing)',40),legal_form:text('Rechtsvorm'),business_status:choice('Ondernemingsstatus',['active','inactive']),visit_address:text('Bezoekadres',1000),postal_address:text('Postadres',1000),phone:text('Telefoon',80),email:{...text('Algemeen e-mailadres',254),type:'email'},website:{...text('Website',500),type:'url'},started_on:date('Start onderneming'),ended_on:date('Einde onderneming'),activities:text('Bedrijfsactiviteiten',2000)}},
 contacts:{label:'Contactpersonen',collection:true,fields:{first_name:text('Voornaam'),infix:text('Tussenvoegsel',80),last_name:{...text('Achternaam'),required:true},preferred_name:text('Aanspreeknaam'),job_title:text('Functie'),email:{...text('E-mailadres',254),type:'email'},phone:text('Telefoon',80),mobile:text('Mobiel',80),preferred_contact:choice('Voorkeurscontact',['email','phone','mobile','post']),is_primary:bool('Primaire contactpersoon'),can_sign:bool('Tekenbevoegd'),portal_access:bool('Portaaltoegang geregistreerd (maakt geen account)'),active:bool('Actief'),internal_comment:text('Interne opmerking',2000)}},
 fiscal:{label:'Fiscaal',sensitive:true,fields:{vat_id:text('Btw-identificatienummer',40),tax_number:text('Omzetbelastingnummer',40),vat_liable:bool('Omzetbelastingplichtig'),vat_period:choice('Btw-aangifteperiode',['month','quarter','year','not_applicable']),filing_start:date('Aanvang aangiftetijdvak'),fiscal_form:text('Fiscale ondernemingsvorm'),income_tax:choice('Winstbelasting',['income_tax','corporate_tax','not_applicable']),payroll_number:text('Loonheffingsnummer',40),payroll_period:choice('Loonheffingenaangifteperiode',['month','four_weeks','not_applicable']),fiscal_unity:bool('Fiscale eenheid'),kor:bool('KOR'),icp:bool('ICP'),oss:bool('OSS'),year_start:date('Boekjaar begin'),year_end:date('Boekjaar einde'),broken_year:bool('Gebroken boekjaar'),external_adviser:text('Externe belastingadviseur'),attention:text('Fiscale aandachtspunten',4000)}},
 administration:{label:'Administratie',private:true,fields:{status:choice('Administratiestatus',['setup','active','blocked','ended']),started_on:date('Administratiestart'),first_period:text('Eerste te verwerken periode',80),financial_year:integer('Boekjaar',9999),reporting_frequency:choice('Rapportagefrequentie',['month','quarter','half_year','year','on_request']),currency:{...text('Valuta (ISO-code)',3),type:'currency'},accounting_method:choice('Stelsel',['invoice','cash']),external_package:text('Extern boekhoudpakket'),migration_source:text('Migratiebron'),cost_centers:bool('Kostenplaatsen gewenst'),projects:bool('Projecten gewenst'),payroll:bool('Salarisadministratie'),employees:integer('Aantal werknemers',10000000),setup_notes:text('Inrichting en aandachtspunten',4000)}},
 banks:{label:'Bankrekeningen',private:true,collection:true,fields:{label:text('Omschrijving'),iban:{...text('IBAN',34),type:'iban',required:true}}},
 services:{label:'Diensten',private:true,collection:true,fields:{service:choice('Dienst',['administration','vat','income_tax','corporate_tax','annual_accounts','payroll','reporting','guidance','meeting','other']),status:choice('Status',['active','ended']),started_on:date('Startdatum'),ended_on:date('Einddatum'),frequency:text('Frequentie',120),responsible_id:staff('Verantwoordelijke medewerker'),price_agreement:text('Prijsafspraak (tekst)',1000),description:text('Interne beschrijving',2000)}},
 agreements:{label:'Afspraken',private:true,fields:{contact_frequency:text('Contactfrequentie',120),meetings_per_year:integer('Gesprekken per jaar',366),preferred_times:text('Voorkeursdagen of dagdelen',1000),reporting:text('Rapportageafspraken',2000),submission_deadline:text('Aanleverdeadline',500),particulars:text('Bijzonderheden',2000)}},
 notes:{label:'Interne notities',private:true,collection:true,fields:{title:{...text('Titel'),required:true},body:{...text('Inhoud',6000),required:true},category:text('Categorie',80),pinned:bool('Vastgepind')}}
};
export function validIban(value){
 const s=value.replace(/\s/g,'').toUpperCase();if(!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(s))return false;
 // NL format is unambiguous; other countries retain the international range.
 if(s.startsWith('NL')&&!/^NL[0-9]{2}[A-Z]{4}[0-9]{10}$/.test(s))return false;
 let remainder=0;for(const c of s.slice(4)+s.slice(0,4)){for(const digit of /[A-Z]/.test(c)?String(c.charCodeAt(0)-55):c)remainder=(remainder*10+Number(digit))%97;}
 return remainder===1;
}
export const maskIban=value=>value ? value.slice(0,2)+' •••• '+value.slice(-4) : '';
export function validateProfile(section,input){
 const schema=Object.hasOwn(profileSections,section)?profileSections[section]:null;if(!schema||!input||typeof input!=='object'||Array.isArray(input)||!Object.keys(input).length)throw Error('Controleer de ingevulde velden.');
 const out={};for(const [key,value] of Object.entries(input)){
  const field=Object.hasOwn(schema.fields,key)?schema.fields[key]:null;if(!field)throw Error('Onbekend veld.');
  if(value===null){if(field.required)throw Error(field.label+' is verplicht.');out[key]=null;continue;}
  let v=value;
  if(field.type==='boolean'){if(typeof v!=='boolean')throw Error(field.label+': kies ja of nee.');}
  else if(field.type==='integer'){if(!Number.isSafeInteger(v)||v<0||v>field.max)throw Error(field.label+': ongeldig aantal.');}
  else {
   if(typeof v!=='string')throw Error(field.label+': ongeldige invoer.');v=v.trim();
   if(v.length>(field.max??200)||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)||field.required&&!v)throw Error(field.label+': controleer de lengte.');
   if(!v){out[key]=null;continue;}
   if(field.type==='email'){v=v.toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw Error('Controleer het e-mailadres.');}
   if(field.type==='url'){let u;try{u=new URL(v);}catch{throw Error('Gebruik een volledige https:// of http:// website.');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Ongeldige website.');}
   if(field.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))throw Error('Ongeldige datum.');
   if(field.type==='staff'&&!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v))throw Error('Ongeldige medewerker.');
   if(field.type==='enum'&&!field.values.includes(v))throw Error('Ongeldige keuze.');
   if(field.type==='currency'){v=v.toUpperCase();if(!/^[A-Z]{3}$/.test(v))throw Error('Gebruik een drieletterige valutacode.');}
   if(field.type==='iban'){v=v.replace(/\s/g,'').toUpperCase();if(!validIban(v))throw Error('Controleer het IBAN.');}
  }out[key]=v;
 }return out;
}
