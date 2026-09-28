import { OfficeError } from '../auth/supabase.mjs';
const fail=()=>{throw new OfficeError(503,'KVK_RESPONSE','KvK-gegevens zijn niet volledig te controleren. Probeer het later opnieuw.');};
const text=(v,max=200)=>v===undefined||v===null?null:typeof v==='string'&&v.trim().length<=max?v.trim()||null:fail();
const array=v=>v===undefined?[]:Array.isArray(v)&&v.length<=1000?v:fail();
const active=v=>v===true||v==='Ja'||v==='true'?'active':v===false||v==='Nee'||v==='false'?'inactive':'unknown';
function address(v){
  if(!v)return null;
  if(v.indAfgeschermd==='Ja'||v.IndAfgeschermd==='Ja'||v.indAfgeschermd===true)return {shielded:true};
  const result={};
  for(const k of ['volledigAdres','straatnaam','huisnummer','huisletter','huisnummerToevoeging','toevoegingAdres','postcode','postbusnummer','plaats','straatHuisnummer','postcodeWoonplaats','regio','land']){
    if(v[k]!==undefined)result[k]=text(typeof v[k]==='number'?String(v[k]):v[k],300);
  }
  return result;
}
export function normalizeSearch(raw,page=1){
  if(!raw||!Array.isArray(raw.resultaten))fail();
  const results=raw.resultaten.slice(0,10).map(r=>{
    if(!/^\d{8}$/.test(r.kvkNummer??''))fail();
    return {kvkNumber:r.kvkNummer,name:text(r.naam),type:text(r.type),status:active(r.actief),city:text(r.adres?.binnenlandsAdres?.plaats??r.adres?.buitenlandsAdres?.postcodeWoonplaats)};
  });
  return {results,page,hasMore:page<10&&Number.isSafeInteger(raw.totaal)&&raw.totaal>page*10};
}
function date(v){if(v===undefined||v===null||v==='')return null;if(typeof v!=='string'||!/^\d{8}(?:\d{6})?$/.test(v))fail();return v;}
export function normalizeBasis(raw,number,search) {
  if(!raw||raw.kvkNummer!==number)fail();
  const h=raw._embedded?.hoofdvestiging??{},owner=raw._embedded?.eigenaar??{},branches=raw._embedded?.vestigingen??{};
  const names=array(raw.handelsnamen??h.handelsnamen).map(n=>text(n.naam)).filter(Boolean);
  const candidates=search.results.filter(r=>r.kvkNumber===number&&['hoofdvestiging','rechtspersoon'].includes(r.type));
  let status=candidates.some(r=>r.status==='active')?'active':candidates.length&&candidates.every(r=>r.status==='inactive')?'inactive':'unknown';
  if(raw.materieleRegistratie?.datumEinde||owner.datumUitschrijving)status='inactive';
  const addresses=array(h.adressen??owner.adressen);
  const branch=h.vestigingsnummer??null;if(branch!==null&&!/^\d{12}$/.test(branch))fail();
  const count=branches.totaalAantalVestigingen??null;if(count!==null&&(!Number.isSafeInteger(count)||count<0))fail();
  const name=text(h.eersteHandelsnaam??raw.eersteHandelsnaam??names[0]??raw.naam);if(!name)fail();
  return {kvkNumber:number,name,legalName:text(raw.statutaireNaam),tradeNames:[...new Set(names)],legalForm:text(owner.rechtsvorm),status,
    registeredAt:date(raw.formeleRegistratiedatum),startedAt:date(raw.materieleRegistratie?.datumAanvang),
    visitAddress:address(addresses.find(a=>a.type==='bezoekadres')),postalAddress:address(addresses.find(a=>a.type==='correspondentieadres')),
    mainBranchNumber:branch,branchCount:count,
    activities:array(raw.sbiActiviteiten??h.sbiActiviteiten).map(a=>({code:text(a.sbiCode,10),description:text(a.sbiOmschrijving,500),primary:a.indHoofdactiviteit==='Ja'}))};
}
