import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test('Phase 2A transactional RPC security and portal regression', async t => {
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
    const rpcNames=['office_create_relationship','office_update_relationship','office_create_organization','office_update_organization','office_archive_relationship','office_archive_organization'];
    async function role(code) {
      await pg.exec('reset role');
      await pg.query("update office_memberships set status='active', role_id=(select id from roles where scope='office' and code=$1) where user_id=$2",[code,office]);
      await pg.query("update profiles set account_status='active' where id=$1",[office]);
      await asUser(office,'aal2');
    }
    const invoke=async (name,id,input={}) => (await pg.query(name==='office_create_relationship' ? `select public.${name}($1::jsonb) as data` : `select public.${name}($1,$2::jsonb) as data`, name==='office_create_relationship' ? [JSON.stringify(input)] : [id,JSON.stringify(input)])).rows[0].data;
    const payload=name=>name==='office_create_relationship'?{name:'Created',organization:{name:'First',registration_number:'12345678'}}:name.includes('archive')?{}:{name:'Changed'};
    const target=name=>name.endsWith('organization')&&!name.includes('create')?org:rel;
    async function denyAll() { for(const name of rpcNames) await assert.rejects(invoke(name,target(name),payload(name)),e=>e.code==='42501',name); }
    await t.test('all RPCs deny accountant, handler, viewer, customer, missing/inactive membership, blocked profile and AAL1',async()=>{
      for(const code of ['accountant','handler','viewer']){await role(code);await denyAll();}
      await asUser(customer,'aal2'); await denyAll();
      await asUser(other,'aal2'); await denyAll();
      await role('owner'); await asUser(office,'aal1'); await denyAll();
      await role('owner'); await pg.exec('reset role'); await pg.query("update office_memberships set status='revoked' where user_id=$1",[office]); await asUser(office,'aal2'); await denyAll();
      await role('owner'); await pg.exec('reset role'); await pg.query("update profiles set account_status='blocked' where id=$1",[office]); await asUser(office,'aal2'); await denyAll();
      await role('owner'); await pg.exec('reset role'); await pg.query("update office_memberships set role_id=(select id from roles where scope='customer' and code='owner') where user_id=$1",[office]); await asUser(office,'aal2'); await denyAll();
      await role('owner'); await pg.query("select set_config('request.jwt.claims','{}',false)"); await denyAll();
    });
    await t.test('owner and admin may execute every operation, with trimmed values and limited audits',async()=>{
      for(const code of ['owner','admin']){
        await role(code);
        const created=await invoke('office_create_relationship',null,{name:'  New customer  ',organization:{name:' First ',legal_name:' Legal ',registration_number:'12345678'}});
        const first=created.organization_id, relationship=created.relationship_id;
        assert.ok(first && relationship);
        assert.equal((await pg.query('select name from customer_relationships where id=$1',[relationship])).rows[0].name,'New customer');
        await invoke('office_update_relationship',relationship,{name:'Updated',status:'inactive'});
        await invoke('office_update_relationship',relationship,{status:'active'});
        const extra=await invoke('office_create_organization',relationship,{name:'Second'});
        await invoke('office_update_organization',first,{legal_name:null,registration_number:''});
        await invoke('office_archive_organization',first,{});
        await invoke('office_archive_relationship',relationship,{});
        assert.equal((await pg.query('select id from customer_relationships where id=$1',[relationship])).rows.length,0);
        assert.equal((await pg.query('select id from organizations where customer_relationship_id=$1',[relationship])).rows.length,0);
        await pg.exec('reset role');
        const audit=(await pg.query('select * from audit_events where customer_relationship_id=$1',[relationship])).rows;
        assert.equal(audit.length,9); // two creation events + updates + archives (including remaining child)
        assert.ok(audit.every(a=>a.actor_id===office&&a.result==='success'&&a.object_id&&Object.keys(a.metadata).join()==='changed_fields'));
        assert.ok(audit.every(a=>Array.isArray(a.metadata.changed_fields)&&a.metadata.changed_fields.every(f=>['name','status','legal_name','registration_number','archived_at'].includes(f))));
        assert.equal((await pg.query('select archived_at from organizations where id=$1',[extra.organization_id])).rows.length,1);
        assert.ok((await pg.query('select archived_at from customer_relationships where id=$1',[relationship])).rows[0].archived_at);
      }
    });
    await t.test('strict validation and ID manipulation cannot mutate data or create audit records',async()=>{
      await role('owner'); const before=await count('audit_events');
      for(const input of [{},{name:''},{name:'   '},{name:'x'.repeat(201)},{name:123},{name:'Valid',unexpected:true},{name:'Valid',status:'deleted'},{name:'Valid',organization:{name:'Org',registration_number:'1234567'}},{name:'Valid',organization:{name:'Org',legal_name:'x'.repeat(201)}},{name:'Valid',organization:null},[],null]){
        await assert.rejects(invoke('office_create_relationship',null,input),e=>e.code==='22023');
      }
      for(const name of rpcNames.filter(n=>n!=='office_create_relationship')){
        for(const id of ['bad',org.replaceAll('-',''),'',null]) await assert.rejects(invoke(name,id,payload(name)),e=>e.code==='22023');
        await assert.rejects(invoke(name,randomUUID(),payload(name)),e=>e.code==='P0002');
        await assert.rejects(invoke(name,target(name),{organization_id:foreignOrg}),e=>e.code==='22023');
      }
      for(const name of ['office_update_relationship','office_update_organization']) await assert.rejects(invoke(name,target(name),{}),e=>e.code==='22023');
      for(const value of ['1234abcd','123456789','1234567',12345678]) await assert.rejects(invoke('office_update_organization',org,{registration_number:value}),e=>e.code==='22023');
      assert.equal(await count('audit_events'),before);
      assert.equal((await pg.query('select name from organizations where id=$1',[org])).rows[0].name,'Fixture');
    });
    await t.test('every RPC rolls back business changes when audit insert fails',async()=>{
      await role('owner'); await pg.exec('reset role');
      await pg.exec(`create function public.fail_audit_test() returns trigger language plpgsql as $$ begin raise exception 'Test audit failure'; end $$;
        create trigger test_fail_audit before insert on audit_events for each row execute function public.fail_audit_test();`);
      const snapshot=async()=>JSON.stringify((await pg.query("select (select jsonb_agg(to_jsonb(c) order by id) from customer_relationships c) as r,(select jsonb_agg(to_jsonb(o) order by id) from organizations o) as o,(select count(*) from audit_events) as a")).rows);
      const before=await snapshot(); await asUser(office,'aal2');
      for(const name of rpcNames){
        await assert.rejects(invoke(name,target(name),payload(name)),/Test audit failure/);
        await pg.exec('reset role'); assert.equal(await snapshot(),before,name); await asUser(office,'aal2');
      }
      await pg.exec('reset role; drop trigger test_fail_audit on audit_events; drop function public.fail_audit_test()');
    });
    await t.test('first organization failure leaves no orphan relationship or audit',async()=>{
      await role('owner'); await pg.exec('reset role');
      await pg.exec(`create function public.fail_org_audit_test() returns trigger language plpgsql as $$ begin if new.object_type='organization' then raise exception 'Second audit failure'; end if; return new; end $$;
        create trigger test_fail_org_audit before insert on audit_events for each row execute function public.fail_org_audit_test();`);
      await asUser(office,'aal2'); const before=[await count('customer_relationships'),await count('organizations'),await count('audit_events')];
      await assert.rejects(invoke('office_create_relationship',null,{name:'Atomic',organization:{name:'Atomic child'}}),/Second audit failure/);
      assert.deepEqual([await count('customer_relationships'),await count('organizations'),await count('audit_events')],before);
      await pg.exec('reset role; drop trigger test_fail_org_audit on audit_events; drop function public.fail_org_audit_test()');
    });
    await t.test('direct table writes stay blocked even for owner and admin',async()=>{
      for(const code of ['owner','admin']){
        await role(code);
        for(const sql of ["insert into customer_relationships(name) values ('No')",`insert into organizations(name,customer_relationship_id) values ('No','${rel}')`,"insert into audit_events(action,object_type,result) values ('fake','fake','success')"]){await assert.rejects(pg.exec(sql),/row-level security/);}
        for(const table of ['customer_relationships','organizations','audit_events']){
          assert.equal((await pg.query(`delete from ${table} returning id`)).rows.length,0);
          const field=table==='audit_events'?'action':'name';
          assert.equal((await pg.query(`update ${table} set ${field}='No' returning id`)).rows.length,0);
        }
      }
    });
    await t.test('portal remains scoped; archive retains rows, hides records and rejects future changes',async()=>{
      await asUser(customer,'aal2'); assert.deepEqual((await rows('select id from organizations')).map(o=>o.id),[org]);
      assert.equal(await count('documents'),1); assert.equal(await count('customer_relationships'),0);
      await role('owner'); await invoke('office_archive_relationship',rel,{});
      for(const name of rpcNames.filter(n=>n!=='office_create_relationship'))await assert.rejects(invoke(name,target(name),payload(name)),e=>e.code==='P0002');
      await asUser(customer,'aal2'); assert.equal(await count('organizations'),0); assert.equal(await count('documents'),0);
      await pg.exec('reset role');
      assert.equal((await pg.query('select id from organizations where customer_relationship_id=$1 and archived_at is not null',[rel])).rows.length,2);
      assert.equal((await pg.query('select id from customer_relationships where id=$1 and archived_at is not null',[rel])).rows.length,1);
    });
    await t.test('RPC grants, definer and search_path are fixed; helpers cannot be called directly',async()=>{
      await pg.exec('reset role');
      for(const name of rpcNames){
        const sig=name==='office_create_relationship'?`${name}(jsonb)`:`${name}(text,jsonb)`;
        const flags=(await pg.query("select has_function_privilege('anon',$1,'execute') as anon,has_function_privilege('authenticated',$1,'execute') as authenticated",[sig])).rows[0];
        assert.equal(flags.anon,false); assert.equal(flags.authenticated,true);
        const info=(await pg.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[sig])).rows[0];
        assert.equal(info.prosecdef,true); assert.deepEqual(info.proconfig,['search_path=public']);
      }
      await asUser(office,'aal2'); await assert.rejects(pg.exec('select public.office_cm_actor()'),/permission denied/);
      await pg.exec('reset role; set role anon'); await assert.rejects(pg.exec(`select public.office_create_relationship('{"name":"No"}')`),/permission denied/);
    });

  } finally { await pg.close(); }
});
