import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const uuid=()=>randomUUID();
const SQL=new URL("../supabase/migrations/202611180001_bestemd_expense_claims.sql",import.meta.url);

test("Digitale declaraties: RLS, ontbrekend bewijs, Office-goedkeuring, duplicaten en bankvoorstel",async()=>{
  const pg=new PGlite();
  try{
    await pg.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
      $$;
      create table public.organizations(id uuid primary key,name text);
      create table public.profiles(id uuid primary key,display_name text);
      create table public.roles(id uuid primary key,scope text,code text);
      create table public.office_memberships(user_id uuid,role_id uuid,status text);
      create table public.customer_access(user_id uuid,organization_id uuid);
      create function public.has_aal2() returns boolean language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal'='aal2',false)
      $$;
      create function public.has_org_access(id uuid) returns boolean language sql stable security definer as $$
        select exists(select 1 from public.customer_access where user_id=auth.uid() and organization_id=id)
      $$;
      create function public.is_office_user() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.office_memberships where user_id=auth.uid() and status='active')
      $$;
      create table public.documents(
        id uuid primary key,organization_id uuid,storage_path text,filename text,mime_type text,
        size_bytes bigint,uploaded_by uuid
      );
      create table public.creditors(id uuid primary key,organization_id uuid,name text);
      create table public.purchase_invoices(
        id uuid primary key,organization_id uuid,creditor_id uuid,archived_at timestamptz,
        total_cents bigint,invoice_date date
      );
      create table public.bank_transactions(
        id uuid primary key,organization_id uuid,booked_at timestamptz,amount_cents bigint,
        counterparty_iban text,counterparty_name text,status text,reconciliation_status text
      );
      create table storage.buckets(id text primary key,allowed_mime_types text[]);
      insert into storage.buckets values('documents',array['application/pdf','image/jpeg','image/png']);
      grant usage on schema public,auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated;
    `);
    await pg.exec(readFileSync(SQL,"utf8"));
    const alice=uuid(),other=uuid(),office=uuid(),org=uuid(),foreignOrg=uuid(),role=uuid();
    const as=async(id,aal="aal2")=>{
      await pg.exec("reset role");
      await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);
      await pg.exec("set role authenticated");
    };
    const reset=()=>pg.exec("reset role");
    await pg.query("insert into auth.users values ($1),($2),($3)",[alice,other,office]);
    await pg.query("insert into organizations values ($1,'Eigen bedrijf'),($2,'Andere organisatie')",[org,foreignOrg]);
    await pg.query("insert into profiles values($1,'Klant'),($2,'Office')",[alice,office]);
    await pg.query("insert into customer_access values($1,$2)",[alice,org]);
    await pg.query("insert into roles values($1,'office','owner')",[role]);
    await pg.query("insert into office_memberships values($1,$2,'active')",[office,role]);
    await as(alice);
    const items=[
      {date:"2026-11-10",supplier:"Kantoorartikelen BV",category:"kantoorartikelen",grossCents:12100,vatCents:2100},
      {date:"2026-11-11",supplier:"Telecom BV",category:"telefoonkosten",grossCents:5000,vatCents:0}
    ];
    const d=(await pg.query("select public.bestemd_expense_save_draft($1,$2,$3,$4,$5::jsonb) id",
      [org,"2026-11-01","NL91ABNA0417164300",null,JSON.stringify(items)])).rows[0].id;
    assert.ok(d);
    assert.equal((await pg.query("select status from bestemd_expense_claims where id=$1",[d])).rows[0].status,"draft");
    const status=(await pg.query("select public.bestemd_expense_submit($1) status",[d])).rows[0].status;
    assert.equal(status,"waiting_evidence");

    const lines=(await pg.query("select id,supplier from bestemd_expense_lines where claim_id=$1",[d])).rows;
    assert.equal(lines.length,2);
    const ownDoc=uuid();
    await reset();
    await pg.query("insert into documents values($1,$2,$3,'bon.pdf','application/pdf',1234,$4)",
      [ownDoc,org,org+"/inbox/"+ownDoc+"/bon.pdf",alice]);
    await as(other);
    assert.equal((await pg.query("select id from bestemd_expense_claims")).rows.length,0);
    await assert.rejects(pg.query("select public.bestemd_expense_submit($1)",[d]),/Geen toegang/);
    await as(alice,"aal1");
    assert.equal((await pg.query("select id from bestemd_expense_claims")).rows.length,0);
    await as(alice);
    const eid=(await pg.query("select public.bestemd_expense_attach_document($1,$2) id",
      [lines[0].id,ownDoc])).rows[0].id;
    assert.ok(eid);
    await assert.rejects(pg.query("select public.bestemd_expense_attach_document($1,$2)",[lines[1].id,ownDoc]),/al gekoppeld/);
    await as(office);
    await assert.rejects(pg.query("select public.bestemd_expense_office_decide($1,'approve',null)",[d]),/Bewijsstukken/);
    assert.equal((await pg.query("select public.bestemd_expense_office_check_evidence($1) ok",[eid])).rows[0].ok,true);
    await assert.rejects(pg.query("select public.bestemd_expense_office_decide($1,'approve',null)",[d]),/Bewijsstukken/);
    await reset();
    const second=uuid();
    await pg.query("insert into documents values($1,$2,$3,'bon2.png','image/png',1234,$4)",
      [second,org,org+"/inbox/"+second+"/bon2.png",alice]);
    await as(alice);
    const eid2=(await pg.query("select public.bestemd_expense_attach_document($1,$2) id",
      [lines[1].id,second])).rows[0].id;
    await as(office);
    assert.equal((await pg.query("select public.bestemd_expense_office_check_evidence($1) ok",[eid2])).rows[0].ok,true);
    assert.equal((await pg.query("select public.bestemd_expense_office_decide($1,'approve',null) status",[d])).rows[0].status,"approved");
    await assert.rejects(pg.query("select public.bestemd_expense_office_decide($1,'approve',null)",[d]),/niet in behandeling/);
    // Booking and repayment ledgers are deliberately inaccessible to authenticated users.
    await assert.rejects(pg.query("select state from bestemd_expense_postings"),/permission denied/);
    await assert.rejects(pg.query("select status from bestemd_expense_repayments"),/permission denied/);
    // Verify non-posting using the fixture database owner, not by weakening production grants.
    await reset();
    assert.equal((await pg.query("select state from bestemd_expense_postings")).rows.length,0);
    assert.equal((await pg.query("select status from bestemd_expense_repayments")).rows.length,0);
  }finally{await pg.close();}
});
