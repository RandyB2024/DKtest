import {validateProfile} from '../../public/profile-fields.js';
import {OfficeError} from '../auth/supabase.mjs';
import {createKvkClient,searchInput,kvkNumber,invalid} from './client.mjs';
import {normalizeSearch,normalizeBasis} from './normalize.mjs';
export const manualFields=['relationshipName','vatId','taxNumber','iban','email','phone','contactPerson','fiscalChoices','services'];
export function manualInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!manualFields.includes(k)))throw invalid();
  const out={};for(const [key,value] of Object.entries(input)){
    if(typeof value!=='string'||value.trim().length>(['fiscalChoices','services'].includes(key)?1000:200)||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw invalid();
    out[key]=value.trim();
  }
  if(!out.relationshipName)throw invalid();
  if(out.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))throw invalid();
  return out;
}
async function profile(kvk,number){
  // Only the documented basis/search endpoints; never follow provider links.
  const basis=await kvk.basis(number);
  const query=searchInput(new URLSearchParams({kvkNumber:number}));
  // Main/legal registrations carry company status; branch-only results cannot grant active status.
  query.append('type','hoofdvestiging');query.append('type','rechtspersoon');
  const search=normalizeSearch(await kvk.search(query));
  return normalizeBasis(basis,number,search);
}
export async function kvkRoute(req,url,client,user,config,readBody,transport){
  const search=url.pathname==='/api/kvk/search'&&req.method==='GET';
  const detail=url.pathname.match(/^\/api\/kvk\/organizations\/([^/]+)$/);
  const create=url.pathname==='/api/relationships/from-kvk'&&req.method==='POST';
  if(!search&&!(detail&&req.method==='GET')&&!create)return null;
  if(create&&!user.canManageCustomers)throw new OfficeError(403,'WRITE_DENIED','Uw Office-rol heeft alleen leesrechten.');
  const query=search?searchInput(url.searchParams):null;
  if(!search&&url.search)throw invalid();
  let number,input,intake;
  if(create){
    const body=await readBody(req);
    if(Object.keys(body).some(k=>!['kvkNumber','manual','intake'].includes(k)))throw invalid();
    number=kvkNumber(body.kvkNumber);input=manualInput(body.manual);
    if(body.intake!==undefined){if(!body.intake||typeof body.intake!=='object'||Array.isArray(body.intake)||Object.keys(body.intake).some(k=>!['company','administration','fiscal'].includes(k)))throw invalid();intake={};try{for(const [section,fields] of Object.entries(body.intake))intake[section]=validateProfile(section,fields);}catch{throw invalid();}}
    if(!/^[a-f0-9]{64}$/.test(config.kvk.rpcKey??''))throw new OfficeError(503,'KVK_CONFIGURATION','De KvK-intake is nog niet geconfigureerd.');
  } else if(detail)number=kvkNumber(detail[1]);
  const kvk=createKvkClient(config.kvk,transport);
  if(search)return {status:200,data:{...normalizeSearch(await kvk.search(query),Number(query.get('pagina'))),environment:config.kvk.mode}};
  const company=await profile(kvk,number),checkedAt=new Date().toISOString();
  if(!create)return {status:200,data:{company,checkedAt,environment:config.kvk.mode}};
  if(company.status!=='active')throw new OfficeError(409,'KVK_INACTIVE','Deze onderneming is uitgeschreven of de actieve status is onbekend. Aanmaken is geblokkeerd.');
  // The browser supplies only a number and manual data. Always re-fetch above.
  const {data,error}=await client.rpc(intake?'office_create_relationship_from_kvk_intake':'office_create_relationship_from_kvk',{
    ...(intake?{p_intake:intake}:{}),p_profile:company,p_manual:input,p_environment:config.kvk.mode,p_checked_at:checkedAt,p_server_key:config.kvk.rpcKey,
  });
  if(error){
    if(error.code==='23505')throw new OfficeError(409,'DUPLICATE_KVK','Er bestaat al een actieve onderneming met dit KvK-nummer. Open het bestaande klantdossier.');
    if(error.code==='42501')throw new OfficeError(403,'WRITE_DENIED','Geen toestemming voor deze intake. Controleer uw sessie of neem contact op met de beheerder.');
    if(['22023','22P02'].includes(error.code))throw invalid();
    throw new OfficeError(503,'WRITE_UNAVAILABLE','Geen bevestiging ontvangen. Controleer het klantoverzicht voordat u opnieuw aanmaakt.');
  }
  return {status:201,data};
}
