import {OfficeError} from './auth/supabase.mjs';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const invalid=()=>new OfficeError(400,'INVALID_INPUT','Controleer de taakgegevens.');
export async function tasksRoute(req,url,client,user,readBody){
 const dashboard=url.pathname==='/api/tasks';
 const match=url.pathname.match(/^\/api\/relationships\/([^/]+)\/organizations\/([^/]+)\/tasks(?:\/([^/]+)\/complete)?$/);
 if(!dashboard&&!match)return null;
 const [,relationship,organization,id]=match??[];
 if(match&&(!uuid.test(relationship)||!uuid.test(organization)||id&&!uuid.test(id)))throw invalid();
 let name,args={p_relationship_id:relationship??null,p_organization_id:organization??null};
 if(req.method==='GET'&&!id){
  const keys=dashboard?['bucket','page']:['page'];
  if([...url.searchParams.keys()].some(k=>!keys.includes(k)||url.searchParams.getAll(k).length!==1))throw invalid();
  const page=url.searchParams.get('page')??'1',bucket=dashboard?url.searchParams.get('bucket'):'client';
  if(!/^[1-9][0-9]{0,3}$/.test(page)||!['client','today','overdue'].includes(bucket)||dashboard&&bucket==='client')throw invalid();
  name='office_tasks_read';Object.assign(args,{p_bucket:bucket,p_page:Number(page)});
 }else if(req.method==='POST'&&!dashboard&&!url.search){
  if(!user.canManageCustomers)throw new OfficeError(403,'WRITE_DENIED','Uw Office-rol heeft alleen leesrechten.');
  const input=await readBody(req);
  if(!input||typeof input!=='object'||Array.isArray(input))throw invalid();
  if(id){if(Object.keys(input).length)throw invalid();name='office_task_complete';args.p_task_id=id;}
  else{
   if(Object.keys(input).some(k=>!['title','assignedTo','deadline'].includes(k))||typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>200||typeof input.assignedTo!=='string'||!uuid.test(input.assignedTo)||typeof input.deadline!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.deadline)||!Number.isFinite(Date.parse(input.deadline))||new Date(input.deadline).toISOString().slice(0,10)!==input.deadline||input.deadline<'1900-01-01')throw invalid();
   name='office_task_create';Object.assign(args,{p_title:input.title.trim(),p_assigned_to:input.assignedTo,p_deadline:input.deadline});
  }
 }else throw invalid();
 const {data,error}=await client.rpc(name,args);
 if(error){if(error.code==='42501')throw new OfficeError(403,'TASK_DENIED','Geen toegang tot deze taak.');if(error.code==='P0002')throw new OfficeError(404,'TASK_UNAVAILABLE','Deze taak of klant is niet beschikbaar.');if(['22023','22P02','22007','22008','23514'].includes(error.code))throw invalid();throw new OfficeError(503,'TASK_UNAVAILABLE','Taken kunnen niet worden verwerkt. Herlaad voordat u opnieuw probeert.');}
 return {status:name==='office_task_create'?201:200,data};
}
