import test from 'node:test';import assert from 'node:assert/strict';
import {tasksRoute} from '../src/tasks.mjs';import {createWorker} from '../src/worker.mjs';import {supabaseFixture} from './helpers/supabase-fixture.mjs';
test('tasks HTTP authorization, closed input, safe errors and RPC contract',async()=>{
 const f=supabaseFixture();f.db.roles[0].code='owner';let last;f.rpc=async(name,args)=>{last={name,args};return Response.json(name==='office_tasks_read'?{items:[],hasMore:false}:f.user.id);};
 const worker=createWorker(f.fetch),origin='https://office.testadmin.nl',env={OFFICE_ORIGIN:origin,SUPABASE_URL:'https://office-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};let cookie='';
 const call=async(path,body)=>{const r=await worker.fetch(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);if(r.headers.getSetCookie().length)cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');return r;};
 const login=async()=>{cookie='';await call('/api/auth/login',{email:f.user.email,password:f.password});};
 const base='/api/relationships/'+f.db.customer_relationships[0].id+'/organizations/'+f.db.organizations[0].id+'/tasks',input={title:' Task ',assignedTo:f.user.id,deadline:'2026-09-29'};
 assert.equal((await call(base)).status,401);await login();assert.equal((await call(base,input)).status,201);assert.equal(last.args.p_title,'Task');assert.equal(last.name,'office_task_create');assert.equal((await call(base+'/'+f.user.id+'/complete',{})).status,200);assert.equal(last.name,'office_task_complete');const read=await call('/api/tasks?bucket=today');assert.equal(read.status,200);assert.match(read.headers.get('Cache-Control'),/no-store/);
 for(const role of ['accountant','handler','viewer']){f.db.roles[0].code=role;assert.equal((await call(base)).status,200);assert.equal((await call(base,input)).status,403);assert.equal((await call(base+'/'+f.user.id+'/complete',{})).status,403);}
 f.db.roles[0].code='admin';for(const bad of [{...input,title:''},{...input,title:'x'.repeat(201)},{...input,deadline:'2026-02-30'},{...input,scope:'customer'},{...input,assignedTo:'bad'}])assert.equal((await call(base,bad)).status,400);
 assert.equal((await call('/api/tasks?bucket=today&bucket=overdue')).status,400);assert.equal((await call(base.replace(f.db.organizations[0].id,'bad'))).status,400);
 f.rpc=async()=>Response.json({code:'P0002',message:'PRIVATE DATABASE DETAIL'},{status:400});const missing=await call(base+'/'+f.user.id+'/complete',{});assert.equal(missing.status,404);assert.doesNotMatch(await missing.text(),/PRIVATE DATABASE/);
 for(const claims of [{aal:'aal1'},{aal:'aal2',amr:[]},{aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-86400}]}]){Object.assign(f,claims);await login();assert.equal((await call(base)).status,403);}
});

