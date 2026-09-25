import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test('trusted MFA: actual PostgreSQL policies and RPCs cannot bypass expiration',async t=>{
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
    async function asUser(id, aal = "aal1", amr = [{method:"totp",timestamp:Math.floor(Date.now()/1000)}]) {
      await pg.exec("reset role");
      await pg.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub:id, aal, amr, iat:Math.floor(Date.now()/1000), role:"authenticated" })]);
      await pg.exec("set role authenticated");
    }
    const rows = async sql => (await pg.query(sql)).rows;
    const count = async table => (await rows(`select * from ${table}`)).length;
    await pg.exec('reset role');
    await pg.query("update office_memberships set role_id=(select id from roles where scope='office' and code='owner') where user_id=$1",[office]);
    const now=Math.floor(Date.now()/1000);
    const amr=age=>[{method:'password',timestamp:now-age-10},{method:'totp',timestamp:now-age}];
    await t.test('customer and Office access immediately and at 23:59, with organization isolation intact',async()=>{
      for(const age of [0,86340])for(const id of [office,customer]){
        await asUser(id,'aal2',amr(age));
        assert.equal((await rows('select public.has_aal2() as ok'))[0].ok,true);
        assert.equal(await count('organizations'),id===office?2:1);
        assert.equal(await count('documents'),1);assert.equal(await count('storage.objects'),id===office?2:1);
        if(id===customer)assert.deepEqual((await rows('select id from organizations')).map(o=>o.id),[org]);
      }
    });
    await t.test('24h boundary and refreshed iat/token_refresh never restore expired access',async()=>{
      for(const id of [office,customer]){
        await asUser(id,'aal2',[...amr(86400),{method:'token_refresh',timestamp:now}]);
        assert.equal((await rows('select public.has_aal2() as ok'))[0].ok,false);
        for(const table of ['organizations','customer_relationships','documents','storage.objects','conversations','sales_invoices'])assert.equal(await count(table),0,table);
        await assert.rejects(pg.query("select public.office_create_relationship($1::jsonb)",[JSON.stringify({name:'Denied'})]),e=>e.code==='42501');
        await assert.rejects(pg.query("insert into organizations(customer_relationship_id,name) values ($1,'Denied')",[rel]),/row-level security/);
      }
    });
    await t.test('malformed, missing, non-TOTP and future claims fail closed without SQL errors',async()=>{
      for(const invalid of [undefined,null,{},[],[null],[{method:'totp',timestamp:String(now)}],[{method:'totp',timestamp:now+.5}],[{method:'totp',timestamp:0}],[{method:'totp',timestamp:now+100}],[{method:'phone',timestamp:now}],[...amr(0),{}]]){
        // Explicit undefined must be tested as a missing claim rather than JS default args.
        await asUser(office,'aal2',invalid===undefined?null:invalid);
        if(invalid===undefined) await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:office,aal:'aal2'})]);
        assert.equal((await rows('select public.has_aal2() as ok'))[0].ok,false);
        assert.equal(await count('organizations'),0);
      }
    });
    await t.test('AAL1 and expired sessions retain minimal auth bootstrap, never business data',async()=>{
      for(const id of [office,customer])for(const aal of ['aal1','aal2']){
        await asUser(id,aal,amr(86400));
        assert.equal(await count('profiles'),1);
        assert.equal(await count(id===office?'office_memberships':'organization_memberships'),1);
        assert.equal(await count('roles'),1);
        assert.equal(await count('organizations'),0);
      }
    });
    await t.test('fresh TOTP restores access but cannot override membership or role boundaries',async()=>{
      await asUser(office,'aal2',[...amr(86400),{method:'totp',timestamp:now}]);
      assert.equal(await count('organizations'),2);
      await pg.query("select public.office_create_relationship($1::jsonb)",[JSON.stringify({name:'Fresh TOTP'})]);
      await asUser(customer,'aal2',amr(0));
      await assert.rejects(pg.query("select public.office_create_relationship($1::jsonb)",[JSON.stringify({name:'Denied'})]),e=>e.code==='42501');
      await pg.exec('reset role');await pg.query("update office_memberships set status='revoked' where user_id=$1",[office]);
      await asUser(office,'aal2',amr(0));assert.equal(await count('organizations'),0);
    });

 }finally{await pg.close();}
});
