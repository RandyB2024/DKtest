import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("Office migration preserves portal RLS and enforces Office identity, AAL2 and read-only data", async () => {
  const pg = new PGlite();
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
    // from all three migrations is executed without modification.
    const foundation = readFileSync(new URL("../../portal/supabase/migrations/202609230001_initial_test_foundation.sql", import.meta.url), "utf8");
    await pg.exec(foundation.replace("create extension if not exists pgcrypto;", ""));
    await pg.exec(readFileSync(new URL("../../portal/supabase/migrations/202609240001_portal_auth_boundary.sql", import.meta.url), "utf8"));
    await pg.exec(readFileSync(new URL("../../portal/supabase/migrations/202609240002_office_phase1.sql", import.meta.url), "utf8"));
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
      await pg.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub:id, aal, role:"authenticated" })]);
      await pg.exec("set role authenticated");
    }
    const rows = async sql => (await pg.query(sql)).rows;
    const count = async table => (await rows(`select * from ${table}`)).length;
    await asUser(customer);
    assert.equal(await count("profiles"), 1);
    assert.equal(await count("organization_memberships"), 1);
    assert.deepEqual((await rows("select id from organizations")).map(o => o.id), [org]);
    assert.equal(await count("roles"), 1);
    assert.equal(await count("office_memberships"), 0);
    for (const table of ["debtors","sales_invoices","sales_invoice_lines","documents","storage.objects"]) assert.equal(await count(table), 0, `${table} requires AAL2`);
    await asUser(customer,"aal2");
    for (const table of ["debtors","sales_invoices","sales_invoice_lines","documents","storage.objects"]) assert.equal(await count(table), 1, `${table} only own organization`);
    await assert.rejects(pg.query("insert into debtors(organization_id,name) values ($1,'Blocked')", [org]), /row-level security/);
    await assert.rejects(pg.query("insert into storage.objects(bucket_id,name) values ('documents',$1)", [`${org}/blocked.pdf`]), /row-level security/);
    assert.equal((await pg.query("update debtors set name='Blocked' returning id")).rows.length, 0);
    assert.equal((await pg.query("delete from documents returning id")).rows.length, 0);
    // The profile flag cannot disable AAL2 on financial/document policies.
    await pg.exec("reset role"); await pg.query("update profiles set mfa_required=false where id=$1", [customer]);
    await asUser(customer,"aal1"); assert.equal(await count("documents"), 0);
    for (const change of ["status='revoked'", "status='expired'", "status='active', valid_from=now()+interval '1 day'", "valid_from=now()-interval '1 day',valid_until=now()-interval '1 second'"]) {
      await pg.exec("reset role"); await pg.exec(`update organization_memberships set ${change}`);
      await asUser(customer,"aal2"); assert.equal(await count("organizations"), 0); assert.equal(await count("documents"), 0); assert.equal(await count("roles"), 0);
    }
    await pg.exec("reset role; update organization_memberships set status='active',valid_from=now()-interval '1 day',valid_until=null");
    await pg.query("update profiles set account_status='blocked' where id=$1", [customer]);
    await asUser(customer,"aal2"); assert.equal(await count("organizations"), 0); assert.equal(await count("documents"), 0);
    await asUser(other,"aal2"); assert.equal(await count("organizations"), 0); assert.equal(await count("roles"), 0);
    // Customer roles cannot turn an office_membership into Office authority.
    await pg.exec("reset role");
    await pg.query("insert into office_memberships(user_id,role_id) select $1,id from roles where scope='customer' and code='owner'", [other]);
    await asUser(other,"aal2"); assert.equal((await rows("select public.is_office_user() as ok"))[0].ok, false);
    await asUser(office,"aal2"); assert.equal((await rows("select public.has_org_access('"+org+"') as ok"))[0].ok, false);
    // The customer cannot read Office memberships, roles or relationships.
    await asUser(customer,"aal2");
    assert.equal(await count("office_memberships"), 0);
    assert.equal(await count("customer_relationships"), 0);
    assert.equal((await rows("select * from roles where scope='office'")).length, 0);
    await asUser(office,"aal1");
    assert.equal(await count("conversations"), 0);
    assert.equal(await count("office_memberships"), 1);
    assert.equal(await count("roles"), 1);
    assert.equal(await count("profiles"), 1);
    assert.equal(await count("organizations"), 0);
    assert.equal(await count("customer_relationships"), 0);
    await asUser(office,"aal2");
    assert.equal(await count("conversations"), 1);
    assert.equal(await count("organizations"), 2);
    assert.equal(await count("customer_relationships"), 1);
    assert.equal(await count("documents"), 1);
    await assert.rejects(pg.query("insert into debtors(organization_id,name) values ($1,'Blocked')",[org]), /row-level security/);
    assert.equal((await pg.query("update debtors set name='Blocked' returning id")).rows.length, 0);
    assert.equal((await pg.query("delete from documents returning id")).rows.length, 0);
    await assert.rejects(pg.query("insert into storage.objects(bucket_id,name) values ('documents',$1)",[`${org}/office-blocked.pdf`]), /row-level security/);
    await pg.exec("reset role");
    await pg.query("update office_memberships set status='revoked' where user_id=$1",[office]);
    await asUser(office,"aal2");
    assert.equal(await count("office_memberships"), 0);
    assert.equal(await count("customer_relationships"), 0);
    assert.equal(await count("organizations"), 0);
    await pg.exec("reset role");
    await pg.query("update office_memberships set status='active' where user_id=$1",[office]);
    await pg.query("update profiles set account_status='blocked' where id=$1",[office]);
    await asUser(office,"aal2");
    assert.equal(await count("office_memberships"), 0);
    assert.equal(await count("customer_relationships"), 0);
    assert.equal(await count("organizations"), 0);
    await pg.exec("reset role; set role anon");
    await assert.rejects(pg.query("select public.has_org_access($1)",[org]), /permission denied/);
    await pg.exec("reset role");
    assert.equal((await rows("select count(*)::int as n from pg_tables where schemaname='public' and not rowsecurity"))[0].n, 0);
  } finally { await pg.close(); }
});
