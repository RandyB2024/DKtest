// Shared additions; unknown remains null and is never inferred as false.
const text=(label,max=200)=>({label,type:'text',max});
const choice=(label,values)=>({label,type:'enum',values});
const bool=label=>({label,type:'boolean'});
export const addressKeys=['country','postcode','house_number','addition','street','city','municipality','bag_id'];
export const intakeExtensions={company:{postal_same:bool('Postadres gelijk aan bezoekadres')},administration:{vehicles:bool('Zakelijke voertuigen aanwezig'),vehicle_count:{label:'Aantal voertuigen',type:'integer',max:100000},vehicle_use:choice('Gebruik voertuigen',['owned','financial_lease','operational_lease','mixed','unknown']),vehicle_notes:text('Interne toelichting voertuigen',2000),premises:bool('Bedrijfspand aanwezig'),premises_use:choice('Gebruik pand',['rented','owned','mixed','borrowed','other','unknown']),premises_same:bool('Pandadres gelijk aan bezoekadres'),premises_notes:text('Interne toelichting pand',2000),klaas_vis:choice('Verzekeringen via Klaas Vis (opgave)',['yes','no','unknown','to_check']),insurance_notes:text('Interne toelichting verzekeringsopgave',2000)},fiscal:{income_tax_start:{label:'Ingang winstbelasting',type:'date'},income_tax_confirm:bool('Winstbelasting expliciet beoordeeld en bevestigd'),vat_status:choice('Omzetbelastingstatus',['regular','kor','exempt','mixed','not_liable','unknown']),vat_status_start:{label:'Ingang btw-status',type:'date'},vat_unity:bool('Fiscale eenheid btw'),vpb_unity:bool('Fiscale eenheid VPB'),payroll_obligation:bool('Loonheffingen van toepassing'),dividend_tax:bool('Dividendbelasting van toepassing'),other_obligations:text('Overige fiscale verplichting',1000),tax_responsible_id:{label:'Verantwoordelijke fiscale intake',type:'staff'}}};
for(const [prefix,label] of [['visit','Bezoekadres'],['postal','Postadres']])Object.assign(intakeExtensions.company,Object.fromEntries(Object.entries({country:text(label+' · landcode',2),postcode:text(label+' · postcode',20),house_number:text(label+' · huisnummer',20),addition:text(label+' · toevoeging',20),street:text(label+' · straat'),city:text(label+' · woonplaats'),municipality:text(label+' · gemeente'),bag_id:text(label+' · BAG-identificatie',16)}).map(([key,v])=>[prefix+'_'+key,v])));
for(const prefix of ['visit','postal'])Object.assign(intakeExtensions.company,{[prefix+'_source']:choice((prefix==='visit'?'Bezoek':'Post')+'adres · bron (Office-opgave)',['manual','pdok_suggestion']),[prefix+'_manual']:bool((prefix==='visit'?'Bezoek':'Post')+'adres · handmatig aangepast')});
export const dependentFields={administration:{vehicles:['vehicle_count','vehicle_use','vehicle_notes'],premises:['premises_use','premises_same','premises_notes']},fiscal:{payroll_obligation:['payroll_period']}};
export const korMessage='KOR betreft alleen de omzetbelasting. Inkomstenbelasting of vennootschapsbelasting kan nog steeds van toepassing zijn.';
export function extendProfile(sections){for(const [s,fields]of Object.entries(intakeExtensions))Object.assign(sections[s].fields,fields);sections.fiscal.fields.income_tax.values.push('unknown');sections.fiscal.fields.vat_period.values.push('unknown');sections.fiscal.fields.fiscal_unity.label='Historisch: fiscale eenheid (btw/VPB niet gespecificeerd)';}
export function validateIntakeFields(section,out){
 if(section==='company')for(const prefix of ['visit','postal']){
  const country=out[prefix+'_country'];if(country!=null&&!/^[A-Z]{2}$/.test(country))throw Error('Gebruik een tweeletterige landcode.');
  if(country==='NL'){
   const p=out[prefix+'_postcode'];if(p!=null){out[prefix+'_postcode']=p.replace(/\s/g,'').toUpperCase();if(!/^[1-9][0-9]{3}[A-Z]{2}$/.test(out[prefix+'_postcode']))throw Error('Controleer de postcode.');}
   const n=out[prefix+'_house_number'];if(n!=null&&!/^[1-9][0-9]{0,4}$/.test(n))throw Error('Controleer het huisnummer.');
  }
  const bag=out[prefix+'_bag_id'];if(bag!=null&&!/^[0-9]{16}$/.test(bag))throw Error('Controleer de BAG-identificatie.');
 }
 for(const [parent,keys] of Object.entries(dependentFields[section]??{}))if(Object.hasOwn(out,parent)&&out[parent]!==true)for(const key of keys){if(out[key]!=null)throw Error('Wis eerst de afhankelijke gegevens.');out[key]=null;}
 return out;
}

export const intakeGroups={
 company:[['Bezoekadres',Object.keys(intakeExtensions.company).filter(k=>k.startsWith('visit_'))],['Postadres',['postal_same',...Object.keys(intakeExtensions.company).filter(k=>k.startsWith('postal_')&&k!=='postal_same')]]],
 administration:[['Zakelijke voertuigen',['vehicles','vehicle_count','vehicle_use','vehicle_notes']],['Bedrijfspand',['premises','premises_use','premises_same','premises_notes']],['Verzekeringsopgave',['klaas_vis','insurance_notes']]],
 fiscal:[['Winstbelasting',['income_tax','income_tax_start','income_tax_confirm']],['Omzetbelasting',['vat_status','vat_status_start','vat_id','tax_number','vat_period','filing_start','icp','oss','vat_unity']],['Overige verplichtingen',['payroll_obligation','payroll_number','payroll_period','dividend_tax','vpb_unity','other_obligations','tax_responsible_id']],['Boekjaar en aandachtspunten',['year_start','year_end','broken_year','attention']]]
};
