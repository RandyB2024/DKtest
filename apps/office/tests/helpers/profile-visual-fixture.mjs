// Local browser QA only. Uses the real Office server/UI with a mocked Supabase
// transport. Never reads .env files, uses real accounts or contacts a provider.
// Run: node tests/helpers/profile-visual-fixture.mjs
import http from 'node:http';
import {createServer} from '../../src/server.mjs';
import {loadConfig} from '../../src/config.mjs';
import {supabaseFixture} from './supabase-fixture.mjs';
import {profileSections} from '../../public/profile-fields.js';
const fixture=supabaseFixture();fixture.password='visual-fixture-only';fixture.db.roles[0].code='owner';
const rel=fixture.db.customer_relationships[0],org=fixture.db.organizations[0];
rel.name='Voorbeeld Administratie & Ondernemersadvies';Object.assign(rel,{profile_version:0,relationship_number:1042,responsible_id:fixture.user.id,started_on:'2025-01-01'});
Object.assign(org,{name:'Voorbeeld Administratie',legal_name:'Voorbeeld Administratie & Ondernemersadvies B.V.',registration_number:'68750110',profile_version:0});
const sections={};for(const [section,spec] of Object.entries(profileSections)){sections[section]={};for(const [key,field] of Object.entries(spec.fields))sections[section][key]=field.type==='boolean'?true:field.type==='integer'?4:field.type==='date'?'2026-01-01':field.type==='staff'?fixture.user.id:field.type==='enum'?field.values[0]:field.type==='email'?'voorbeeld@example.invalid':field.type==='url'?'https://example.invalid':field.type==='currency'?'EUR':field.type==='iban'?'NL •••• 4300':field.max>500?'Synthetische testtekst voor de visuele controle. Er zijn geen echte klantgegevens gebruikt.':'Voorbeeld';}
sections.company.legal_form='Besloten vennootschap';let scenario='full';
function setCount(count){
 fixture.db.customer_relationships=Array.from({length:count},(_,i)=>({...rel,id:i?'d0000000-0000-4000-8000-'+String(i).padStart(12,'0'):rel.id,name:i?'Voorbeeldklant '+String(i+1).padStart(3,'0'):rel.name,status:i%5===0?'inactive':'active'}));
 fixture.db.organizations=fixture.db.customer_relationships.map((r,i)=>({...org,id:i?'e0000000-0000-4000-8000-'+String(i).padStart(12,'0'):org.id,customer_relationship_id:r.id,name:i?'Handelsnaam '+(i+1):org.name,legal_name:i%4===0?'':'Officiële Onderneming '+(i+1)+' B.V.',registration_number:String(10000000+i)}));
}
fixture.rpc=async(name,args)=>{
 if(name!=='office_customer_profile_read')return Response.json({id:org.id,version:1});
 if(scenario==='error')return Response.json({code:'XX000',message:'synthetic'},{status:500});
 if(args.p_section){
  const section=args.p_section,items=scenario==='empty'?[]:Array.from({length:25},(_,i)=>section==='history'?{id:String(i),actor:'Testmedewerker',actor_id:fixture.user.id,action:'profile.company.saved',created_at:'2026-09-28 10:00:00',object_id:org.id,metadata:{changed_fields:['email','phone']}}:{...sections[section],id:org.id,first_name:'Voorbeeld',last_name:'Contactpersoon '+(i+1),title:'Aandachtspunt '+(i+1),label:'Zakelijke rekening '+(i+1),created_by:fixture.user.id,created_at:'2026-09-28',updated_at:'2026-09-28'});
  return Response.json({items,version:0,page:args.p_page,hasMore:args.p_page===1&&scenario!=='empty'});
 }
 const empty=scenario==='empty';return Response.json({relationship:{...rel,...fixture.db.customer_relationships.find(r=>r.id===args.p_relationship_id),...(empty?{responsible_id:null,started_on:null}:{})},organization:{...org,...fixture.db.organizations.find(o=>o.id===args.p_organization_id),...(empty?{legal_name:null}:{})},staff:[{id:fixture.user.id,name:'Testmedewerker'}],sections:empty?Object.fromEntries(Object.keys(sections).map(k=>[k,{}])):sections,canWrite:true,role:'owner',source:empty?null:{checked_at:'2026-09-28 09:00',environment:'test',profile:{name:org.name,legalName:org.legal_name,kvkNumber:org.registration_number,legalForm:'Besloten vennootschap',status:'active',tradeNames:[org.name],visitAddress:{street:'Voorbeeldstraat',number:'1',city:'Testplaats'},activities:[{code:'6920',description:'Administratieve dienstverlening'}]}}});
};
const port=Number(process.argv[2]??4178);
const config=loadConfig({PORT:String(port),OFFICE_ORIGIN:'http://127.0.0.1:'+port,SUPABASE_URL:'https://office-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'});
const app=createServer({config,fetchImpl:fixture.fetch});
http.createServer((req,res)=>{
 const url=new URL(req.url,config.origin);
 if(url.pathname==='/__fixture/scenario'){
  scenario=['full','empty','error','long'].includes(url.searchParams.get('name'))?url.searchParams.get('name'):'full';
  rel.name=scenario==='long'?'Voorbeeldonderneming'.repeat(9)+' Internationale Administratieve Dienstverlening B.V.':'Voorbeeld Administratie & Ondernemersadvies';
  if(url.searchParams.has('count')){const count=Number(url.searchParams.get('count'));if([0,1,10,50,100].includes(count))setCount(count);}
  res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Synthetic scenario selected');return;
 }app.emit('request',req,res);
}).listen(port,'127.0.0.1',()=>console.log('Synthetic Office visual fixture listening on '+config.origin+'; PID '+process.pid));
