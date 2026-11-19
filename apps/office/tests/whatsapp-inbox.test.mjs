import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const foundation=new URL("../../portal/supabase/migrations/20261110210000_bestemd_whatsapp_inbox_storage.sql",import.meta.url);
const migration=new URL("../../portal/supabase/migrations/202611190001_office_whatsapp_inbox.sql",import.meta.url);
const staff="11111111-1111-4111-8111-111111111111";
const customer="22222222-2222-4222-8222-222222222222";
const channel="33333333-3333-4333-8333-333333333333";

test("WhatsApp Office inbox: verified staged messages are visible only with fresh Office MFA", async()=>{
 const db=new PGlite();
 try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
    $$;
    create function public.has_aal2() returns boolean language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal'='aal2',false)
    $$;
    create table public.roles(id uuid primary key, scope text, code text);
    create table public.office_memberships(user_id uuid,role_id uuid,status text);
    create function public.is_office_user() returns boolean language sql stable security definer as $$
      select exists(select 1 from public.office_memberships where user_id=auth.uid() and status='active')
    $$;
    grant usage on schema public,auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(readFileSync(foundation,"utf8"));
  await db.exec(readFileSync(migration,"utf8"));
  await db.query("insert into roles values ($1,'office','owner')",["44444444-4444-4444-8444-444444444444"]);
  await db.query("insert into office_memberships values($1,$2,'active')",[staff,"44444444-4444-4444-8444-444444444444"]);
  await db.query("insert into bestemd_wa_channel_accounts(id,channel_key,label,phone_e164,status) values ($1,'randy','WhatsApp Randy','+31612345678','active')",[channel]);
  await db.query("insert into bestemd_wa_inbound_events(provider_event_key,provider_phone_number_id,payload) values($1,$2,$3::jsonb)",
    ["twilio:SM123","twilio:"+channel,JSON.stringify({provider:"twilio",messageId:"SM123",senderPhone:"+31698765432",receiverPhone:"+31612345678",body:"Test WhatsApp"})]);
  const setIdentity=async(id,aal)=>{
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);
    await db.exec("set role authenticated");
  };
  await setIdentity(customer,"aal2");
  await assert.rejects(db.query("select public.bestemd_office_whatsapp_inbox(100)"),/Office MFA/);
  await setIdentity(staff,"aal1");
  await assert.rejects(db.query("select public.bestemd_office_whatsapp_inbox(100)"),/Office MFA/);
  await setIdentity(staff,"aal2");
  const response=await db.query("select public.bestemd_office_whatsapp_inbox(100) as messages");
  assert.equal(response.rows[0].messages.length,1);
  assert.equal(response.rows[0].messages[0].body,"Test WhatsApp");
  assert.equal(response.rows[0].messages[0].channel,"WhatsApp Randy");
  assert.equal(response.rows[0].messages[0].organizationId,undefined);
  await assert.rejects(db.query("select * from bestemd_wa_inbound_events"),/permission denied/);
 } finally { await db.close(); }
});
