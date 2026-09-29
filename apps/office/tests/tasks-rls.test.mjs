import {basis,search} from './helpers/kvk-fixture.mjs';
import {normalizeBasis,normalizeSearch} from '../src/kvk/normalize.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test('Office tasks: actual PostgreSQL RLS and atomic writes', async t => {
  const pg=new PGlite();
  try {
    // Minimal Supabase-managed schemas/functions for an isolated PostgreSQL
    // test. Auth network, Storage service and deployment drift need live tests.
    await pg.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    `);
    // gen_random_uuid is a PostgreSQL built-in; PGlite has no pgcrypto extension.
    // Only that extension declaration is skipped. Every table/policy/function
    // from all five migrations is executed without modification.
    const foundation = readFileSync(new URL("../../portal/supabase/migrations/202609230001_initial_test_foundation.sql", import.meta.url), "utf8");
    await pg.exec(foundation.replace("create extension if not exists pgcrypto;", ""));
    await pg.exec(readFileSync(new URL("../../portal/supabase/migrations/202609240001_portal_auth_boundary.sql", import.meta.url), "utf8"));
    await pg.exec(readFileSync(new URL("../../portal/supabase/migrations/202609240002_office_phase1.sql", import.meta.url), "utf8"));
    await pg.exec(readFileSync(new URL("../../portal/supabase/migrations/202609240003_office_customer_management.sql", import.meta.url), "utf8"));
    await pg.exec(readFileSync(new URL("../../portal/supabase/migrations/202609250001_trusted_mfa_sessions.sql",import.meta.url),'utf8'));
    await pg.exec(`grant usage on schema public,auth,storage to authenticated,anon;
      grant select,insert,update,delete on all tables in schema public,storage to authenticated;
      grant select on all tables in schema public,storage to anon;`);

    const customer = randomUUID(), other = randomUUID(), office = randomUUID();
    const rel = randomUUID(), org = randomUUID(), foreignOrg = randomUUID(), debtor = randomUUID(), invoice = randomUUID();
    for (const id of [customer,other,office]) {
      await pg.query("insert into auth.users values ($1)", [id]);
      await pg.query("insert into public.profiles(id,email,display_name,account_status) values ($1,$2,'Fixture','active')", [id, `${id}@example.invalid`]);
    }
    await pg.query("insert into customer_relationships(id,name) values ($1,'Fixture')", [rel]);
    for (const id of [org,foreignOrg]) await pg.query("insert into organizations(id,customer_relationship_id,name) values ($1,$2,'Fixture')", [id,rel]);
    await pg.query("insert into organization_memberships(organization_id,user_id,role_id) select $1,$2,id from roles where scope='customer' and code='viewer'", [org,customer]);
    await pg.query("insert into office_memberships(user_id,role_id) select $1,id from roles where scope='office' and code='viewer'", [office]);
    await pg.query("insert into debtors(id,organization_id,name) values ($1,$2,'Fixture')", [debtor,org]);
    await pg.query("insert into sales_invoices(id,organization_id,debtor_id,invoice_date,due_date,created_by) values ($1,$2,$3,current_date,current_date,$4)", [invoice,org,debtor,customer]);
    await pg.query("insert into sales_invoice_lines(invoice_id,description,quantity,unit_price_cents,vat_rate,line_total_cents,position) values ($1,'Fixture',1,100,21,121,1)", [invoice]);
    await pg.query("insert into documents(organization_id,storage_path,filename,mime_type,size_bytes,uploaded_by) values ($1,$2,'fixture.pdf','application/pdf',1,$3)", [org,`${org}/fixture.pdf`,customer]);
    await pg.query("insert into storage.objects(bucket_id,name) values ('documents',$1)", [`${org}/fixture.pdf`]);
    await pg.query("insert into storage.objects(bucket_id,name) values ('documents',$1)", [`${foreignOrg}/fixture.pdf`]);
    await pg.query("insert into conversations(organization_id,subject,created_by) values ($1,'Fixture',$2)", [org,office]);
    async function asUser(id, aal = "aal1") {
      await pg.exec("reset role");
      await pg.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub:id, aal, amr:[{method:"totp",timestamp:Math.floor(Date.now()/1000)}], role:"authenticated" })]);
      await pg.exec("set role authenticated");
    }
    const rows = async sql => (await pg.query(sql)).rows;
    const count = async table => (await rows(`select * from ${table}`)).length;
    await pg.exec('reset role');
    await pg.exec(readFileSync(new URL('../../portal/supabase/migrations/202609270001_kvk_customer_onboarding.sql',import.meta.url),'utf8'));

    await pg.exec(readFileSync(new URL('../../portal/supabase/migrations/202609280001_complete_customer_profile.sql',import.meta.url),'utf8'));
    await pg.exec(readFileSync(new URL('../../portal/supabase/migrations/202609280002_address_business_tax_intake.sql',import.meta.url),'utf8'));
    async function role(code){await pg.exec('reset role');await pg.query("update office_memberships set role_id=(select id from roles where scope='office' and code=$1),status='active' where user_id=$2",[code,office]);await pg.query("update profiles set account_status='active' where id=$1",[office]);await asUser(office,'aal2');}
    await pg.exec('reset role');
    await pg.exec(readFileSync(new URL('../../portal/supabase/migrations/202609290001_office_tasks.sql',import.meta.url),'utf8'));
    const create=async(title='Internal task',r=rel,o=org,assignee=office,date='2026-09-29')=>(await pg.query('select office_task_create($1,$2,$3,$4,$5) id',[r,o,title,assignee,date])).rows[0].id;
    const complete=async(id,r=rel,o=org)=>pg.query('select office_task_complete($1,$2,$3)',[r,o,id]);
    const list=async(bucket='client',r=rel,o=org)=>(await pg.query('select office_tasks_read($1,$2,$3,1) data',[r,o,bucket])).rows[0].data;
    let task;
    await t.test('owner/admin create and complete; audit redacts title and is idempotent',async()=>{
      for(const code of ['owner','admin']){await role(code);task=await create('PRIVATE TITLE');assert.ok((await list()).items.some(x=>x.id===task));await complete(task);await complete(task);assert.ok(!(await list()).items.some(x=>x.id===task));}
      await pg.exec('reset role');const a=await rows("select * from audit_events where object_id='"+task+"'");assert.equal(a.length,2);assert.doesNotMatch(JSON.stringify(a),/PRIVATE TITLE/);await role('owner');task=await create();
    });
    await t.test('direct table access under PostgREST roles/claims preserves old customer rows, hides internal rows',async()=>{
      await pg.exec('reset role');await pg.query("insert into tasks(organization_id,title,created_by) values($1,'Legacy customer task',$2)",[org,customer]);
      await asUser(customer,'aal2');assert.deepEqual((await rows('select title from tasks')).map(x=>x.title),['Legacy customer task']);await assert.rejects(list(),e=>e.code==='42501');await assert.rejects(create(),e=>e.code==='42501');await assert.rejects(complete(task),e=>e.code==='42501');
      await asUser(other,'aal2');assert.equal((await rows('select * from tasks')).length,0);
      for(const code of ['accountant','handler','viewer']){await role(code);assert.ok((await rows("select * from tasks where scope='office'")).length);await assert.rejects(create(),e=>e.code==='42501');await assert.rejects(complete(task),e=>e.code==='42501');}
      await role('owner');await assert.rejects(pg.query("insert into tasks(organization_id,title,created_by) values($1,'Forbidden',$2)",[org,office]),e=>e.code==='42501');assert.equal((await pg.query("update tasks set title='Forbidden' where id=$1 returning id",[task])).rows.length,0);
      for(const claims of [{aal:'aal1'},{aal:'aal2',amr:[]},{aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-86400}]},{aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)+3600}]}]){await pg.exec('reset role');await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:office,role:'authenticated',...claims})]);await pg.exec('set role authenticated');assert.equal((await rows('select * from tasks')).length,0);await assert.rejects(list(),e=>e.code==='42501');await assert.rejects(create(),e=>e.code==='42501');await assert.rejects(complete(task),e=>e.code==='42501');}
    });
    await t.test('IDOR, validation, inactive assignee/membership and archived organizations',async()=>{
      await role('owner');await assert.rejects(complete(task,rel,foreignOrg),e=>e.code==='P0002');await assert.rejects(create('x',randomUUID()),e=>e.code==='P0002');await assert.rejects(create('x',rel,org,customer),e=>e.code==='22023');for(const title of ['', ' '.repeat(3),'x'.repeat(201)])await assert.rejects(create(title),e=>e.code==='22023');
      await pg.exec('reset role');await pg.query("update office_memberships set status='revoked' where user_id=$1",[office]);await asUser(office,'aal2');await assert.rejects(create(),e=>e.code==='42501');await role('owner');await pg.exec('reset role');await pg.query("update profiles set account_status='blocked' where id=$1",[office]);await asUser(office,'aal2');await assert.rejects(create(),e=>e.code==='42501');await role('owner');
      await pg.exec('reset role');await pg.query('update organizations set archived_at=now() where id=$1',[org]);await asUser(office,'aal2');await assert.rejects(complete(task),e=>e.code==='P0002');assert.equal((await rows("select * from tasks where scope='office' and organization_id='"+org+"'")).length,0);await pg.exec('reset role');await pg.query('update organizations set archived_at=null where id=$1',[org]);
    });
    await t.test('audit failure rolls back creation and completion',async()=>{
      await pg.exec('reset role');await pg.exec("create function task_audit_fail() returns trigger language plpgsql as $$ begin raise exception 'Test audit failure'; end $$; create trigger task_audit_fail before insert on audit_events for each row execute function task_audit_fail();");await role('owner');const before=await count('tasks');await assert.rejects(create());assert.equal(await count('tasks'),before);await assert.rejects(complete(task));assert.ok((await list()).items.some(x=>x.id===task));await pg.exec('reset role');await pg.exec('drop trigger task_audit_fail on audit_events');
    });
    await t.test('today/overdue use Amsterdam date and exclude completed or foreign-scope tasks; pagination',async()=>{
      await role('owner');await pg.exec('reset role');await pg.exec("delete from tasks where scope='office'");await asUser(office,'aal2');const today=(await rows("select to_char(now() at time zone 'Europe/Amsterdam','YYYY-MM-DD') d"))[0].d;const yesterday=(await rows("select to_char((now() at time zone 'Europe/Amsterdam')-interval '1 day','YYYY-MM-DD') d"))[0].d;
      const done=await create('Today',rel,org,office,today);await create('Late',rel,foreignOrg,office,yesterday);assert.equal((await list('today',null,null)).items.length,1);assert.equal((await list('overdue',null,null)).items.length,1);await complete(done);assert.equal((await list('today',null,null)).items.length,0);
      for(let i=0;i<26;i++)await create('Task '+i,rel,org,office,today);assert.equal((await list()).items.length,25);assert.equal((await list()).hasMore,true);
    });
  }finally{await pg.close();}
});
