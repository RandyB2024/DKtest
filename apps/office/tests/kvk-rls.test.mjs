import {basis,search} from './helpers/kvk-fixture.mjs';
import {normalizeBasis,normalizeSearch} from '../src/kvk/normalize.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test('KvK atomic intake, server capability, uniqueness and RLS', async t => {
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
    const serverKey=randomBytes(32).toString('hex');
    await pg.query("insert into office_kvk_private.worker_gate values(true,encode(sha256(convert_to($1,'UTF8')),'hex'),'test')",[serverKey]);
    const company=number=>normalizeBasis(basis(number),number,normalizeSearch(search(number)));
    async function role(code){await pg.exec('reset role');await pg.query("update office_memberships set role_id=(select id from roles where scope='office' and code=$1),status='active' where user_id=$2",[code,office]);await pg.query("update profiles set account_status='active' where id=$1",[office]);await asUser(office,'aal2');}
    async function intake(number='68750110',key=serverKey,manual={relationshipName:'Intake'},profile=company(number)){
      return (await pg.query('select public.office_create_relationship_from_kvk($1::jsonb,$2::jsonb,$3,$4::timestamptz,$5) as data',[JSON.stringify(profile),JSON.stringify(manual),'test',new Date().toISOString(),key])).rows[0].data;
    }
    let created;
    await t.test('owner creates relationship, organization, snapshot and three audits together',async()=>{
      await role('owner');created=await intake();
      const snap=(await pg.query('select * from organization_kvk_intakes where organization_id=$1',[created.organization_id])).rows[0];
      assert.equal(snap.created_by,office);assert.equal(snap.kvk_environment,'test');assert.equal(snap.profile.kvkNumber,'68750110');
      assert.equal((await pg.query('select count(*)::int as n from audit_events where customer_relationship_id=$1',[created.relationship_id])).rows[0].n,3);
      assert.equal((await pg.query('select test_record from organizations where id=$1',[created.organization_id])).rows[0].test_record,true);
    });
    await t.test('duplicate rejects atomically; legacy RPC also cannot insert duplicate',async()=>{
      const before=await count('customer_relationships');await assert.rejects(intake(),e=>e.code==='23505');assert.equal(await count('customer_relationships'),before);
      await assert.rejects(pg.query('select office_create_relationship($1::jsonb)',[JSON.stringify({name:'Dup',organization:{name:'Dup',registration_number:'68750110'}})]),e=>e.code==='23505');assert.equal(await count('customer_relationships'),before);
    });
    await t.test('admin can create; old contracts without KvK still work',async()=>{
      await role('admin');await intake('69599084');await pg.query('select office_create_relationship($1::jsonb)',[JSON.stringify({name:'Manual',organization:{name:'No number'}})]);
    });
    await t.test('direct RPC without server capability and direct writes are denied',async()=>{
      await role('owner');for(const key of [null,'',randomBytes(32).toString('hex')])await assert.rejects(intake('68727720',key),e=>e.code==='42501');
      await assert.rejects(pg.query('select * from office_kvk_private.worker_gate'),e=>e.code==='42501');
      await assert.rejects(pg.query("update organization_kvk_intakes set kvk_environment='production'"),e=>e.code==='42501');
      await assert.rejects(pg.query('delete from organization_kvk_intakes'),e=>e.code==='42501');
    });
    await t.test('roles, AAL1, expired TOTP, blocked profile and revoked membership fail closed',async()=>{
      for(const code of ['accountant','handler','viewer']){await role(code);await assert.rejects(intake('68727720'),e=>e.code==='42501');}
      for(const id of [customer,other]){await asUser(id,'aal2');await assert.rejects(intake('68727720'),e=>e.code==='42501');assert.equal(await count('organization_kvk_intakes'),0);}
      await role('owner');await asUser(office,'aal1');await assert.rejects(intake('68727720'),e=>e.code==='42501');assert.equal(await count('organization_kvk_intakes'),0);
      await role('owner');await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:office,aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-86400}]})]);await assert.rejects(intake('68727720'),e=>e.code==='42501');
      for(const sql of ["update profiles set account_status='blocked'", "update office_memberships set status='revoked'"]){await role('owner');await pg.exec('reset role');await pg.exec(sql);await asUser(office,'aal2');await assert.rejects(intake('68727720'),e=>e.code==='42501');}
      await role('owner');
    });
    await t.test('validation or audit failure rolls back ALL business changes',async()=>{
      const before=await count('customer_relationships');
      for(const [manual,profile] of [[{relationshipName:''},company('68727720')],[{relationshipName:'x',unexpected:'x'},company('68727720')],[{relationshipName:'x'},{...company('68727720'),status:'inactive'}]])await assert.rejects(intake('68727720',serverKey,manual,profile),e=>e.code==='22023');
      await pg.exec('reset role');await pg.exec("create function reject_kvk_audit() returns trigger language plpgsql as $$ begin if new.action='organization.kvk_intake' then raise exception 'fixture audit failure'; end if; return new; end $$; create trigger fail_kvk_audit before insert on audit_events for each row execute function reject_kvk_audit();");
      await asUser(office,'aal2');await assert.rejects(intake('68727720'),/fixture audit failure/);assert.equal(await count('customer_relationships'),before);
      assert.equal((await pg.query("select count(*)::int as n from organizations where registration_number='68727720'")).rows[0].n,0);
      await pg.exec('reset role');await pg.exec('drop trigger fail_kvk_audit on audit_events');await asUser(office,'aal2');
    });
    await t.test('soft archive hides source and permits a new active registration; portal isolation intact',async()=>{
      await pg.query('select office_archive_relationship($1,$2::jsonb)',[created.relationship_id,'{}']);
      assert.equal((await pg.query('select * from organization_kvk_intakes where organization_id=$1',[created.organization_id])).rows.length,0);
      await intake();
      await pg.exec('reset role');await pg.query("update profiles set account_status='active' where id=$1",[customer]);await asUser(customer,'aal2');
      assert.deepEqual((await rows('select id from organizations')).map(o=>o.id),[org]);assert.equal(await count('organization_kvk_intakes'),0);
      await assert.rejects(pg.query('select office_create_relationship_from_kvk($1::jsonb,$2::jsonb,$3,$4::timestamptz,$5)',[JSON.stringify(company('68727720')),'{}','test',new Date().toISOString(),serverKey]),e=>e.code==='42501');
    });
  } finally {await pg.close();}
});
