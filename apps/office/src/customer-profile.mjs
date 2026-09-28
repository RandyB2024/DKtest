import {OfficeError} from './auth/supabase.mjs';
import {profileSections,validateProfile} from '../public/profile-fields.js';
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const invalid=()=>new OfficeError(400,'INVALID_INPUT','Controleer de ingevulde velden.');
export async function profileRoute(req,url,client,user,readBody){
 const match=url.pathname.match(/^\/api\/relationships\/([^/]+)\/organizations\/([^/]+)\/profile(?:\/([a-z]+)(?:\/([^/]+)(?:\/(archive))?)?)?$/);
 if(!match)return null;
 const [,relationship,organization,section,id,archive]=match;
 if(!uuid.test(relationship)||!uuid.test(organization)||id&&!uuid.test(id))throw invalid();
 const args={p_relationship_id:relationship,p_organization_id:organization};let rpc;
 if(req.method==='GET'){
  if(id||archive||section&&section!=='history'&&!profileSections[section]?.collection)throw invalid();
  if([...url.searchParams.keys()].some(k=>!['page','archived'].includes(k))||['page','archived'].some(k=>url.searchParams.getAll(k).length>1))throw invalid();
  const page=url.searchParams.get('page')??'1',archived=url.searchParams.get('archived')??'false';
  if(!/^[1-9][0-9]{0,3}$/.test(page)||!['true','false'].includes(archived))throw invalid();
  Object.assign(args,{p_section:section??null,p_page:Number(page),p_archived:archived==='true'});rpc='office_customer_profile_read';
 }else{
  if(!user.canManageCustomers)throw new OfficeError(403,'WRITE_DENIED','Uw Office-rol heeft alleen leesrechten.');
  const spec=Object.hasOwn(profileSections,section)?profileSections[section]:null;
  if(url.search||!spec||archive&&req.method!=='POST'||!archive&&req.method!==(spec.collection&&!id?'POST':'PATCH')||id&&!spec.collection)throw invalid();
  const body=await readBody(req);
  if(Object.keys(body).some(k=>!['version','fields'].includes(k))||!Number.isSafeInteger(body.version)||body.version<0)throw invalid();
  let fields;
  if(archive){if(!body.fields||Array.isArray(body.fields)||typeof body.fields!=='object'||Object.keys(body.fields).length)throw invalid();fields={};}
  else {try{fields=validateProfile(section,body.fields);}catch(e){throw new OfficeError(400,'INVALID_INPUT',e.message);}}
  Object.assign(args,{p_section:section,p_input:fields,p_version:body.version,p_record_id:id??null,p_archive:!!archive});rpc='office_customer_profile_write';
 }
 const {data,error}=await client.rpc(rpc,args);
 if(error){
  if(error.code==='42501')throw new OfficeError(403,'PROFILE_DENIED','Geen toegang tot dit dossieronderdeel.');
  if(error.code==='40001')throw new OfficeError(409,'VERSION_CONFLICT','Het dossier is ondertussen gewijzigd. Herlaad de gegevens en controleer uw wijziging.');
  if(error.code==='23505')throw new OfficeError(409,'PROFILE_CONFLICT','Er bestaat al een primaire actieve contactpersoon. Wijzig die eerst.');
  if(error.code==='P0002')throw new OfficeError(404,'RECORD_UNAVAILABLE','Dit dossier of record is niet beschikbaar.');
  if(['22023','22P02','23514','22007','22008','23502'].includes(error.code))throw invalid();
  throw new OfficeError(503,'PROFILE_UNAVAILABLE','Het dossier kan niet worden verwerkt. Controleer de actuele gegevens voordat u opnieuw opslaat.');
 }
 return {status:req.method==='POST'&&!archive?201:200,data};
}
