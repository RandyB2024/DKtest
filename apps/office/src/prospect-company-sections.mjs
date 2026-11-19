// Validate per-enterprise onboarding sections independently from the public UI.
// These objects are stored inside each office_onboarding_companies.company_data JSON.
const fields = Object.freeze({
 financial: Object.freeze([
  'previousYearTurnover','expectedYearTurnover','profitability','outstandingDebtors',
  'outstandingCreditors','financing','lease','taxDebt','cashBookkeeping',
  'cashTransactions','financialNotes','currentBookkeeper','transferNotes'
 ]),
 administration: Object.freeze([
  'vatRequired','vatFrequency','kor','vatIdNumber','turnoverTaxNumber','vatNumber',
  'rsin','fiscalUnit','iban','extraBankAccounts','hasCreditCard',
  'creditCardDetails','hasEmployees','payrollNumber','website','logoNotes',
  'administrationNotes'
 ])
});
const err=(message)=>{throw new Error(message);};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const clean=(v,max=1500)=>typeof v==='string'?v.trim().slice(0,max):'';
export function normalizeCompanySections(input,positions,{submit=false}={}){
 if(!Array.isArray(positions)||positions.length<1||positions.length>5||
    new Set(positions).size!==positions.length||
    positions.some(p=>!Number.isInteger(p)||p<1||p>5))
   err('Ongeldige ondernemingsselectie.');
 if(!Array.isArray(input)||input.length>5)err('Ongeldige ondernemingsvragen.');
 const result=new Map();
 for(const row of input){
  if(!obj(row)||!Number.isInteger(row.position)||!positions.includes(row.position)||
     result.has(row.position))err('Dubbele of onbekende onderneming in de vragenlijst.');
  const normalized={};
  for(const section of ['financial','administration']){
   const source=row[section]??{};
   if(!obj(source)||Object.keys(source).some(k=>!fields[section].includes(k)))
    err('Onbekend veld in '+section+'.');
   normalized[section]=Object.fromEntries(fields[section]
     .filter(k=>Object.hasOwn(source,k)).map(k=>[k,clean(source[k])]));
  }
  // Een onderneming zonder btw-plicht mag geen oude btw-gegevens uit een
  // eerder ingevuld formulier meenemen naar het definitieve dossier.
  if(normalized.administration.vatRequired==='no'){
   for(const key of ['vatFrequency','kor','vatIdNumber','turnoverTaxNumber','vatNumber']){
    normalized.administration[key]='';
   }
  }
  result.set(row.position,normalized);
 }
 if(submit){
  if(result.size!==positions.length)err('Vul alle ondernemingsvragen afzonderlijk in.');
  for(const pos of positions){
   const {financial:f,administration:a}=result.get(pos);
   if(!['yes','no'].includes(f.cashBookkeeping)||
      !['yes','no'].includes(f.cashTransactions))
      err('Vul het kasoverzicht in voor onderneming '+pos+'.');
   if(!['yes','no'].includes(a.vatRequired))err('Vul btw-plicht in voor onderneming '+pos+'.');
   if(a.vatRequired==='yes'&&!['year','quarter','month','kor'].includes(a.vatFrequency))
      err('Kies de btw-aangiftefrequentie voor onderneming '+pos+'.');
   if(!a.iban)err('Zakelijk IBAN ontbreekt bij onderneming '+pos+'.');
  }
 }
 return result;
}
