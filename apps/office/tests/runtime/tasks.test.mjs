import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {supabaseFixture} from '../helpers/supabase-fixture.mjs';
test('actual workerd task routes: list/create/complete and origin denial',async()=>{
 const f=supabaseFixture(),origin='https://office.testadmin.nl';f.db.roles[0].code='owner';let last;
 f.rpc=async(name,args)=>{last={name,args};return Response.json(name==='office_tasks_read'?{items:[],hasMore:false}:f.user.id);};
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../../worker-build/worker.js',import.meta.url)),compatibilityDate:'2026-09-27',compatibilityFlags:['nodejs_compat'],bindings:{OFFICE_ORIGIN:origin,SUPABASE_URL:'https://office-fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},outboundService:async request=>f.fetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),...(request.method==='POST'?{body:await request.text()}:{})})}));
 try{
 const login=await runtime.dispatchFetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:f.user.email,password:f.password})});assert.equal(login.status,200);
 const headers={Origin:origin,Cookie:login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),'Content-Type':'application/json'},base=origin+'/api/relationships/'+f.db.customer_relationships[0].id+'/organizations/'+f.db.organizations[0].id+'/tasks';
 assert.equal((await runtime.dispatchFetch(base,{headers})).status,200);assert.equal(last.name,'office_tasks_read');
 const body=JSON.stringify({title:'Task',assignedTo:f.user.id,deadline:'2026-09-29'});assert.equal((await runtime.dispatchFetch(base,{method:'POST',headers,body})).status,201);assert.equal(last.name,'office_task_create');
 assert.equal((await runtime.dispatchFetch(base+'/'+f.user.id+'/complete',{method:'POST',headers,body:'{}'})).status,200);assert.equal(last.name,'office_task_complete');
 assert.equal((await runtime.dispatchFetch(base,{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body})).status,403);
 }finally{await runtime.dispose();}
});
