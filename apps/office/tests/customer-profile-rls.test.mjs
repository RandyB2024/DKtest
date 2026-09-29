import {basis,search} from './helpers/kvk-fixture.mjs';
import {normalizeBasis,normalizeSearch} from '../src/kvk/normalize.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test('Complete customer profile: PostgreSQL authorization, validation and transactions', async t => {
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
    const read=async(section=null,page=1,archived=false,r=rel,o=org)=>(await pg.query('select office_customer_profile_read($1,$2,$3,$4,$5) data',[r,o,section,page,archived])).rows[0].data;
    const write=async(section,fields,{id=null,archive=false,version,r=rel,o=org}={})=>{
      if(version===undefined){const d=await read(null,1,false,r,o);version=section==='overview'?d.relationship.profile_version:d.organization.profile_version;}
      return (await pg.query('select office_customer_profile_write($1,$2,$3,$4::jsonb,$5,$6,$7) data',[r,o,section,JSON.stringify(fields),version,id,archive])).rows[0].data;
    };
    await t.test('new intake preserves legacy fields, requires explicit profit-tax confirmation and isolates KOR',async()=>{
      await role('owner');await write('company',{name:'Fixture',visit_address:'Original unparsed address',visit_country:'NL',visit_postcode:'3526KP',visit_house_number:'93',visit_street:'Europalaan',visit_city:'Utrecht',postal_same:true});
      let d=await read();assert.equal(d.sections.company.visit_address,'Original unparsed address');assert.equal(d.sections.company.postal_postcode,'3526KP');assert.ok(d.sections.company.address_reviewed_at);
      await assert.rejects(write('fiscal',{income_tax:'corporate_tax'}),e=>e.code==='22023');
      await write('fiscal',{income_tax:'corporate_tax',income_tax_confirm:true,vat_status:'kor'});d=await read();assert.equal(d.sections.fiscal.income_tax,'corporate_tax');assert.equal(d.sections.fiscal.kor,true);assert.equal(d.sections.fiscal.income_tax_confirmed_by,office);assert.ok(d.sections.fiscal.income_tax_confirmed_at);assert.equal(d.sections.fiscal.vat_unity,null);assert.equal(d.sections.fiscal.vpb_unity,null);
      await assert.rejects(write('fiscal',{income_tax:'income_tax'}),e=>e.code==='22023');await assert.rejects(write('fiscal',{income_tax_confirmed_by:office}),e=>e.code==='22023');
      await write('fiscal',{income_tax:'income_tax',income_tax_confirm:true});assert.equal((await read()).sections.fiscal.kor,true);
      await write('administration',{vehicles:true,vehicle_count:2,vehicle_use:'owned',vehicle_notes:'INTERNAL VEHICLE',klaas_vis:'to_check',insurance_notes:'PRIVATE INSURANCE'});
      await assert.rejects(write('administration',{vehicles:false}),e=>e.code==='22023');await write('administration',{vehicles:false,vehicle_count:null,vehicle_use:null,vehicle_notes:null});
      await role('accountant');d=await read();assert.equal(d.sections.fiscal.income_tax,'income_tax');assert.equal(d.sections.administration,undefined);
      for(const code of ['handler','viewer']){await role(code);d=await read();assert.equal(d.sections.fiscal,undefined);assert.equal(d.sections.administration,undefined);}
      await role('owner');assert.doesNotMatch(JSON.stringify(await read('history')),/PRIVATE INSURANCE|INTERNAL VEHICLE|Europalaan/);
      await assert.rejects(pg.query('select office_customer_profile_write_v1($1,$2,$3,$4::jsonb,0,null,false)',[rel,org,'fiscal','{}']),e=>e.code==='42501');
      // Return the explicit VAT status to unreviewed for legacy regression edits below.
      await write('fiscal',{vat_status:null});
    });
    await t.test('distributed address throttle and private counter table',async()=>{await role('admin');for(let i=0;i<30;i++)assert.equal((await pg.query('select office_address_lookup_allow() allowed')).rows[0].allowed,true);assert.equal((await pg.query('select office_address_lookup_allow() allowed')).rows[0].allowed,false);await assert.rejects(pg.query('select * from office_address_lookup_limits'),e=>e.code==='42501');await role('viewer');await assert.rejects(pg.query('select office_address_lookup_allow()'),e=>e.code==='42501');});
    let contact,note,bank;
    await t.test('owner/admin save typed sections, audit redacts values, historical source not copied',async()=>{
      await role('owner');const initial=await read();assert.ok(initial.relationship.relationship_number);assert.equal(initial.source,null);
      await write('overview',{name:'Client',responsible_id:office,started_on:'2026-01-01'});
      await write('company',{name:'Company',legal_form:'BV',email:' HELLO@EXAMPLE.INVALID ',rsin:'001234567',visit_address:'Manual address'});
      await write('fiscal',{vat_id:'exception-text-001',tax_number:'private-tax',year_start:'2026-01-01',year_end:'2026-12-31',kor:false});
      await role('admin');await write('administration',{status:'setup',accounting_method:'invoice'});
      await write('agreements',{meetings_per_year:4,submission_deadline:'In overleg'});
      await write('services',{service:'administration',status:'active',price_agreement:'PRIVATE PRICE'});
      const d=await read();assert.equal(d.sections.company.email,'hello@example.invalid');assert.equal(d.sections.administration.currency,'EUR');assert.equal(d.sections.fiscal.vat_id,'exception-text-001');
      const history=await read('history');assert.ok(history.items.length>=6);assert.doesNotMatch(JSON.stringify(history),/private-tax|PRIVATE PRICE|exception-text/);
      assert.ok(history.items.every(x=>x.actor_id===office&&x.result==='success'));
    });
    await t.test('contact uniqueness, normalization, primary active requirement and portal flag has no Auth effect',async()=>{
      contact=await write('contacts',{first_name:'Test',last_name:'Contact',email:'UPPER@EXAMPLE.INVALID',active:true,is_primary:true,portal_access:true,internal_comment:'PRIVATE COMMENT'});
      assert.equal((await read('contacts')).items[0].email,'upper@example.invalid');
      await assert.rejects(write('contacts',{last_name:'Other',active:true,is_primary:true}),e=>e.code==='23505');
      await assert.rejects(write('contacts',{last_name:'Other',active:false,is_primary:true}),e=>e.code==='22023');
      await assert.rejects(write('contacts',{first_name:'Only'}),e=>e.code==='22023');
      await pg.exec('reset role');assert.equal((await rows('select * from auth.users')).length,3);await role('owner');
    });
    await t.test('IBAN locally validated, masked by read RPC; invalid input and unknown fiscal fields rejected',async()=>{
      bank=await write('banks',{label:'Test bank',iban:'NL91 ABNA 0417 1643 00'});
      assert.equal((await read('banks')).items[0].iban,'NL •••• 4300');
      await assert.rejects(write('banks',{iban:'NL90ABNA0417164300'}),e=>e.code==='22023');
      for(const fields of [{vat_period:'weekly'},{year_start:'2026-02-30'},{rsin:'should_be_in_company'},{}])await assert.rejects(write('fiscal',fields),e=>e.code==='22023');
      await assert.rejects(write('fiscal',{year_end:'2025-01-01'}),e=>e.code==='22023');
      await assert.rejects(write('company',{registration_number:'12345678'}),e=>e.code==='22023');
      await assert.rejects(pg.query('select office_update_organization($1,$2::jsonb)',[org,JSON.stringify({registration_number:'12345678'})]),e=>e.code==='22023');
    });
    await t.test('version conflicts include legacy updates; wrong relationship/record IDs cannot cross boundaries',async()=>{
      const version=(await read()).organization.profile_version;await write('company',{phone:'1'});
      await assert.rejects(write('company',{phone:'2'},{version}),e=>e.code==='40001');
      const current=(await read()).organization.profile_version;
      await pg.query('select office_update_organization($1,$2::jsonb)',[org,'{"name":"Legacy edit"}']);
      await assert.rejects(write('company',{phone:'2'},{version:current}),e=>e.code==='40001');
      await assert.rejects(write('contacts',{last_name:'Cross'},{id:contact.id,o:foreignOrg}),e=>e.code==='P0002');
      await assert.rejects(read(null,1,false,randomUUID(),org),e=>e.code==='P0002');
      await assert.rejects(read(null,1,false,rel,'invalid'),e=>e.code==='22023');
      await assert.rejects(write('overview',{responsible_id:customer}),e=>e.code==='22023');
    });
    await t.test('notes retain author and revisions; archive instead of delete; audit failure rolls back everything',async()=>{
      note=await write('notes',{title:'Private title',body:'SECRET NOTE',category:'general',pinned:true});
      await pg.exec('reset role');await pg.query("insert into office_memberships(user_id,role_id) select $1,id from roles where scope='office' and code='admin'",[other]);await asUser(other,'aal2');
      await write('notes',{body:'NEW SECRET NOTE'},{id:note.id});
      assert.equal((await rows('select * from office_customer_note_revisions')).length,2);
      assert.equal((await read('notes')).items[0].created_by,office);
      assert.equal((await read('notes')).items[0].updated_by,other);
      await pg.exec('reset role');await pg.query('delete from office_memberships where user_id=$1',[other]);await role('owner');
      assert.doesNotMatch(JSON.stringify(await read('history')),/SECRET NOTE|Private title/);
      await pg.exec('reset role');await pg.exec("create function fail_profile_audit() returns trigger language plpgsql as $$ begin raise exception 'fixture';end $$;create trigger fail_profile_audit before insert on audit_events for each row execute function fail_profile_audit();");await role('owner');
      const before=(await read()).organization.profile_version;
      await assert.rejects(write('notes',{body:'MUST ROLLBACK'},{id:note.id}));
      assert.equal((await read()).organization.profile_version,before);assert.equal((await read('notes')).items[0].body,'NEW SECRET NOTE');assert.equal((await rows('select * from office_customer_note_revisions')).length,2);
      await pg.exec('reset role');await pg.exec('drop trigger fail_profile_audit on audit_events');await role('owner');
      await write('notes',{},{id:note.id,archive:true});assert.equal((await read('notes')).items.length,0);assert.equal((await read('notes',1,true)).items.length,1);
      await assert.rejects(write('notes',{title:'restore'},{id:note.id}),e=>e.code==='P0002');
      await write('contacts',{},{id:contact.id,archive:true});assert.equal((await read('contacts',1,true)).items.length,1);
      await assert.rejects(pg.query('delete from office_customer_notes'),e=>e.code==='42501');
    });
    await t.test('direct PostgREST-equivalent table/RPC access enforces roles and customer isolation',async()=>{
      for(const code of ['accountant','handler','viewer']){
        await role(code);const d=await read();assert.equal(d.canWrite,false);assert.equal(d.legacyManual,undefined);assert.equal(d.sections.administration,undefined);
        if(code==='accountant'){assert.equal(d.sections.fiscal.tax_number,'private-tax');assert.equal(d.sections.company.rsin,'001234567');}else{assert.equal(d.sections.fiscal,undefined);assert.equal(d.sections.company.rsin,undefined);assert.equal(await count('office_customer_company'),0);}
        assert.equal((await read('contacts',1,true)).items[0].internal_comment,undefined);
        for(const section of ['notes','services','banks','history'])await assert.rejects(read(section),e=>e.code==='42501');
        assert.equal(await count('office_customer_notes'),0);assert.equal(await count('office_customer_contacts'),0);assert.equal(await count('audit_events'),0);
        await assert.rejects(write('company',{name:'No'}),e=>e.code==='42501');
      }
      for(const id of [customer,other]){await asUser(id,'aal2');await assert.rejects(read(),e=>e.code==='42501');for(const table of ['office_customer_fiscal','office_customer_notes','office_customer_banks','office_customer_note_revisions'])assert.equal(await count(table),0);}
      await asUser(customer,'aal2');assert.equal(await count('organizations'),1);assert.equal(await count('sales_invoices'),1);assert.equal(await count('storage.objects'),1);
      assert.equal((await rows('select * from organizations'))[0].profile_version,undefined);await assert.rejects(pg.query('select * from office_customer_versions'),e=>e.code==='42501');
      await role('owner');await assert.rejects(pg.query('update office_customer_fiscal set vat_id=$1',['no']),e=>e.code==='42501');
      await pg.exec('reset role;set role anon');await assert.rejects(read(),e=>e.code==='42501');await assert.rejects(pg.query('select * from office_customer_company'),e=>e.code==='42501');
    });
    await t.test('AAL1, exact 24h, absent AMR, revoked membership and blocked profile fail closed',async()=>{
      for(const claims of [{aal:'aal1',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]},{aal:'aal2',amr:[]},{aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-86400}]},{aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)+3600}]}]){
        await role('owner');await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:office,...claims})]);await assert.rejects(read(),e=>e.code==='42501');assert.equal(await count('office_customer_fiscal'),0);
      }
      for(const sql of ["update profiles set account_status='blocked' where id=$1","update office_memberships set status='revoked' where user_id=$1"]){await role('owner');await pg.exec('reset role');await pg.query(sql,[office]);await asUser(office,'aal2');await assert.rejects(read(),e=>e.code==='42501');}
      await role('owner');
    });
    await t.test('paginated history and archived organizations remain inaccessible',async()=>{
      for(let i=0;i<26;i++)await write('company',{phone:String(i)});
      const first=await read('history'),second=await read('history',2);assert.equal(first.items.length,25);assert.ok(second.items.length);assert.ok(!first.items.some(a=>second.items.some(b=>a.id===b.id)));
      await pg.query('select office_archive_organization($1,$2::jsonb)',[org,'{}']);await assert.rejects(read(),e=>e.code==='P0002');assert.equal(await count('office_customer_notes'),0);
    });
    await t.test('existing KvK intake and legacy creation still work after all migrations',async()=>{
      await role('owner');await pg.exec('reset role');const key=randomBytes(32).toString('hex');await pg.query("insert into office_kvk_private.worker_gate values(true,encode(sha256(convert_to($1,'UTF8')),'hex'),'test')",[key]);await role('owner');
      const profile=normalizeBasis(basis('68750110'),'68750110',normalizeSearch(search('68750110')));
      const initialCount=await count('customer_relationships');
      const extended={company:{visit_country:'NL',visit_postcode:'3526KP',visit_house_number:'93',postal_same:true},fiscal:{income_tax:'corporate_tax',income_tax_confirm:true,vat_status:'kor'},administration:{klaas_vis:'unknown',vehicles:null}};
      const extendedProfile={...profile,kvkNumber:'12345678'};
      const callIntake=async fields=>(await pg.query('select office_create_relationship_from_kvk_intake($1::jsonb,$2::jsonb,$3,$4::timestamptz,$5,$6::jsonb) data',[JSON.stringify(extendedProfile),'{"relationshipName":"Extended"}','test',new Date().toISOString(),key,JSON.stringify(fields)])).rows[0].data;
      await assert.rejects(callIntake({...extended,fiscal:{income_tax:'corporate_tax'}}),e=>e.code==='22023');assert.equal(await count('customer_relationships'),initialCount);
      const complete=await callIntake(extended);const full=await read(null,1,false,complete.relationship_id,complete.organization_id);assert.equal(full.sections.fiscal.vat_status,'kor');assert.equal(full.sections.administration.klaas_vis,'unknown');assert.equal(full.sections.company.postal_postcode,'3526KP');assert.ok((await read('history',1,false,complete.relationship_id,complete.organization_id)).items.length>=6);
      const beforeFailure=await count('customer_relationships'),auditBefore=await count('audit_events');extendedProfile.kvkNumber='23456789';
      await pg.exec('reset role');await pg.exec("create trigger fail_extended_audit before insert on audit_events for each row execute function fail_profile_audit()");await role('owner');await assert.rejects(callIntake(extended));assert.equal(await count('customer_relationships'),beforeFailure);assert.equal(await count('audit_events'),auditBefore);await pg.exec('reset role');await pg.exec('drop trigger fail_extended_audit on audit_events');await role('owner');
      const created=(await pg.query('select office_create_relationship_from_kvk($1::jsonb,$2::jsonb,$3,$4::timestamptz,$5) data',[JSON.stringify(profile),'{"relationshipName":"Intake","taxNumber":"PRIVATE LEGACY"}','test',new Date().toISOString(),key])).rows[0].data;
      const snapshot=await read(null,1,false,created.relationship_id,created.organization_id);assert.equal(snapshot.source.profile.kvkNumber,'68750110');assert.equal(snapshot.legacyManual.taxNumber,'PRIVATE LEGACY');
      await role('viewer');const redacted=await read(null,1,false,created.relationship_id,created.organization_id);assert.equal(redacted.source.profile.kvkNumber,'68750110');assert.equal(redacted.legacyManual,undefined);assert.equal(await count('organization_kvk_intakes'),0);
      await role('owner');const legacy=(await pg.query('select office_create_relationship($1::jsonb) data',['{"name":"Legacy","organization":{"name":"Company"}}'])).rows[0].data;assert.equal((await read(null,1,false,legacy.relationship_id,legacy.organization_id)).source,null);
    });
  }finally{await pg.close();}
});
