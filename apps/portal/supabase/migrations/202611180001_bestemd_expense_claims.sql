-- BESTEMD digitale declaraties — additieve migratie, geen resets.
begin;

create table if not exists public.bestemd_expense_claims (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 claimant_id uuid not null references auth.users(id),
 month date not null,
 private_iban text,
 status text not null default 'draft' check(status in ('draft','submitted','waiting_evidence','under_review','approved','rejected','booking_pending','booked','paid')),
 rejection_reason text,
 submitted_at timestamptz,
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 booked_at timestamptz,
 paid_at timestamptz,
 total_cents bigint not null default 0 check(total_cents>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint claim_month_first check(month=date_trunc('month',month)::date),
 constraint claim_private_iban check(private_iban is null or (private_iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$'))
);
create index if not exists bestemd_claims_org_month on public.bestemd_expense_claims(organization_id,month desc);
create table if not exists public.bestemd_expense_lines (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references public.bestemd_expense_claims(id) on delete cascade,
 expense_date date not null,
 supplier text not null check(length(trim(supplier)) between 2 and 180),
 category text not null check(category in ('kantoorartikelen','kantinekosten','representatiekosten','relatiegeschenken','lunches_en_diners','telefoonkosten','internetkosten','portikosten','reclamekosten','kilometervergoeding','brandstof','parkeerkosten','beurzen_en_congressen','overige_zakelijke_kosten')),
 gross_cents bigint not null check(gross_cents>=0),
 vat_cents bigint not null default 0 check(vat_cents>=0 and vat_cents<=gross_cents),
 description text,
 receipt_status text not null default 'missing' check(receipt_status in ('missing','received','checked')),
 created_at timestamptz not null default now()
);
create index if not exists bestemd_lines_claim on public.bestemd_expense_lines(claim_id);

create table if not exists public.bestemd_expense_evidence (
 id uuid primary key default gen_random_uuid(),
 line_id uuid not null references public.bestemd_expense_lines(id) on delete restrict,
 organization_id uuid not null references public.organizations(id),
 storage_path text not null unique,
 document_id uuid unique references public.documents(id),
 filename text not null,
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/heic')),
 size_bytes bigint not null check(size_bytes>0 and size_bytes<=15728640),
 uploaded_by uuid not null references auth.users(id),
 checked_by uuid references auth.users(id),
 checked_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.bestemd_expense_mileage (
 id uuid primary key default gen_random_uuid(),
 line_id uuid not null references public.bestemd_expense_lines(id) on delete cascade,
 trip_date date not null,
 route text not null,
 business_reason text not null,
 kilometers numeric(12,2) not null check(kilometers>0),
 rate_cents integer not null check(rate_cents>=0),
 constraint mileage_length check(length(route)>3 and length(business_reason)>3)
);
create table if not exists public.bestemd_expense_audit (
 id bigint generated always as identity primary key,
 claim_id uuid not null references public.bestemd_expense_claims(id) on delete restrict,
 actor_id uuid,
 event text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists bestemd_audit_claim_idx on public.bestemd_expense_audit(claim_id,created_at desc);
create table if not exists public.bestemd_expense_account_mapping (
 organization_id uuid not null references public.organizations(id),
 category text not null,
 ledger_account text not null,
 vat_code text,
 primary key(organization_id,category)
);
create table if not exists public.bestemd_expense_postings (
 claim_id uuid primary key references public.bestemd_expense_claims(id),
 external_entry_id text unique,
 idempotency_key text not null unique,
 state text not null default 'pending' check(state in ('pending','posted','failed')),
 last_error_code text,
 last_attempt_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.bestemd_expense_repayments (
 claim_id uuid primary key references public.bestemd_expense_claims(id),
 bank_transaction_id uuid unique,
 status text not null default 'unmatched' check(status in ('unmatched','suggested','confirmed')),
 confirmed_by uuid references auth.users(id),
 confirmed_at timestamptz
);

alter table public.bestemd_expense_claims enable row level security;
alter table public.bestemd_expense_lines enable row level security;
alter table public.bestemd_expense_evidence enable row level security;
alter table public.bestemd_expense_mileage enable row level security;
alter table public.bestemd_expense_audit enable row level security;
alter table public.bestemd_expense_account_mapping enable row level security;
alter table public.bestemd_expense_postings enable row level security;
alter table public.bestemd_expense_repayments enable row level security;

revoke all on public.bestemd_expense_claims,public.bestemd_expense_lines,public.bestemd_expense_evidence,public.bestemd_expense_mileage,public.bestemd_expense_audit,public.bestemd_expense_account_mapping,public.bestemd_expense_postings,public.bestemd_expense_repayments from anon,authenticated;
grant select on public.bestemd_expense_claims,public.bestemd_expense_lines,public.bestemd_expense_evidence,public.bestemd_expense_mileage to authenticated;

create policy expense_claim_read on public.bestemd_expense_claims for select to authenticated using (
 public.has_aal2() and (
  (claimant_id=auth.uid() and public.has_org_access(organization_id))
  or public.is_office_user()
 )
);
create policy expense_line_read on public.bestemd_expense_lines for select to authenticated using (
 exists(select 1 from public.bestemd_expense_claims c where c.id=claim_id)
);
create policy expense_evidence_read on public.bestemd_expense_evidence for select to authenticated using (
 exists(select 1 from public.bestemd_expense_lines l join public.bestemd_expense_claims c on c.id=l.claim_id where l.id=line_id and c.organization_id=organization_id)
);
create policy expense_mileage_read on public.bestemd_expense_mileage for select to authenticated using (
 exists(select 1 from public.bestemd_expense_lines l where l.id=line_id)
);

-- Draft saves are atomic and only allowed for own, MFA-protected organization.
create or replace function public.bestemd_expense_save_draft(
 p_organization_id uuid, p_month date, p_private_iban text, p_claim_id uuid, p_lines jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid := auth.uid(); v_claim public.bestemd_expense_claims%rowtype;
        v_line jsonb; v_id uuid; v_total bigint:=0; v_amount bigint; v_vat bigint;
begin
 if v_user is null or not public.has_aal2() or not public.has_org_access(p_organization_id) then raise exception 'Geen toegang.' using errcode='42501'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'Ongeldige maand.'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>500 then raise exception 'Ongeldige kostenposten.'; end if;
 if p_private_iban is not null and upper(replace(p_private_iban,' ','')) !~ '^[A-Z]{2}[0-9A-Z]{13,32}$' then raise exception 'Ongeldig IBAN.'; end if;
 if p_claim_id is null then
  insert into public.bestemd_expense_claims(organization_id,claimant_id,month,private_iban)
  values(p_organization_id,v_user,p_month,upper(replace(p_private_iban,' ',''))) returning * into v_claim;
 else
  select * into v_claim from public.bestemd_expense_claims where id=p_claim_id for update;
  if not found or v_claim.claimant_id<>v_user or v_claim.organization_id<>p_organization_id or v_claim.status<>'draft' then raise exception 'Concept is niet bewerkbaar.' using errcode='42501'; end if;
  update public.bestemd_expense_claims set month=p_month,private_iban=upper(replace(p_private_iban,' ','')),updated_at=now() where id=v_claim.id;
  -- Existing evidence cannot be silently deleted when updating a draft.
  if exists(select 1 from public.bestemd_expense_evidence e join public.bestemd_expense_lines l on l.id=e.line_id where l.claim_id=v_claim.id)
    then raise exception 'Concept bevat bonnen: gebruik de regelgerichte wijzigingsroute.'; end if;
  delete from public.bestemd_expense_lines where claim_id=v_claim.id;
 end if;
 for v_line in select value from jsonb_array_elements(p_lines) loop
  v_amount:=(v_line->>'grossCents')::bigint;
  v_vat:=coalesce((v_line->>'vatCents')::bigint,0);
  if v_amount<0 or v_vat<0 or v_vat>v_amount or v_amount>100000000000 then raise exception 'Ongeldig bedrag of btw.'; end if;
  insert into public.bestemd_expense_lines(claim_id,expense_date,supplier,category,gross_cents,vat_cents,description)
  values(v_claim.id,(v_line->>'date')::date,trim(v_line->>'supplier'),v_line->>'category',v_amount,v_vat,left(coalesce(v_line->>'description',''),1000));
  v_total:=v_total+v_amount;
 end loop;
 update public.bestemd_expense_claims set total_cents=v_total,updated_at=now() where id=v_claim.id;
 insert into public.bestemd_expense_audit(claim_id,actor_id,event) values(v_claim.id,v_user,'draft_saved');
 return v_claim.id;
end; $$;

create or replace function public.bestemd_expense_submit(p_claim_id uuid)
 returns text language plpgsql security definer set search_path=public as $$
declare v_claim public.bestemd_expense_claims%rowtype; v_status text;
begin
 select * into v_claim from public.bestemd_expense_claims where id=p_claim_id for update;
 if not found or v_claim.claimant_id<>auth.uid() or not public.has_aal2() or not public.has_org_access(v_claim.organization_id) then raise exception 'Geen toegang.' using errcode='42501'; end if;
 if v_claim.status in ('submitted','waiting_evidence') then return v_claim.status; end if;
 if v_claim.status<>'draft' or v_claim.total_cents<=0 or not exists(select 1 from public.bestemd_expense_lines where claim_id=p_claim_id) then raise exception 'Concept kan niet worden ingediend.'; end if;
 v_status:=case when exists(
   select 1 from public.bestemd_expense_lines l
   where l.claim_id=p_claim_id and
   ((l.category<>'kilometervergoeding' and not exists(select 1 from public.bestemd_expense_evidence e where e.line_id=l.id))
   or (l.category='kilometervergoeding' and not exists(select 1 from public.bestemd_expense_mileage m where m.line_id=l.id)))
 ) then 'waiting_evidence' else 'submitted' end;
 update public.bestemd_expense_claims set status=v_status,submitted_at=now(),updated_at=now() where id=p_claim_id;
 insert into public.bestemd_expense_audit(claim_id,actor_id,event) values(p_claim_id,auth.uid(),'submitted');
 return v_status;
end; $$;

revoke all on function public.bestemd_expense_save_draft(uuid,date,text,uuid,jsonb), public.bestemd_expense_submit(uuid) from public,anon;
grant execute on function public.bestemd_expense_save_draft(uuid,date,text,uuid,jsonb), public.bestemd_expense_submit(uuid) to authenticated;

-- Existing authenticated document uploads can be attached to a single claim
-- line without granting the customer blanket write access to evidence metadata.
create or replace function public.bestemd_expense_attach_document(
 p_line_id uuid, p_document_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_line public.bestemd_expense_lines%rowtype; v_claim public.bestemd_expense_claims%rowtype;
        v_doc public.documents%rowtype; v_new_id uuid;
begin
 select * into v_line from public.bestemd_expense_lines where id=p_line_id;
 if not found then raise exception 'Kostenpost onbekend.'; end if;
 select * into v_claim from public.bestemd_expense_claims where id=v_line.claim_id for update;
 if not found or not public.has_aal2() or v_claim.claimant_id<>auth.uid()
   or not public.has_org_access(v_claim.organization_id) or
   v_claim.status not in ('draft','submitted','waiting_evidence','under_review') then
   raise exception 'Geen toegang tot kostenpost.' using errcode='42501';
 end if;
 select * into v_doc from public.documents where id=p_document_id and organization_id=v_claim.organization_id;
 if not found or v_doc.uploaded_by<>auth.uid() or
   v_doc.mime_type not in ('application/pdf','image/jpeg','image/png','image/heic') or
   v_doc.size_bytes>15728640 or v_doc.size_bytes<=0 then
   raise exception 'Ongeldig of niet beschikbaar document.' using errcode='42501';
 end if;
 insert into public.bestemd_expense_evidence(line_id,organization_id,document_id,storage_path,filename,mime_type,size_bytes,uploaded_by)
 values(v_line.id,v_claim.organization_id,v_doc.id,v_doc.storage_path,v_doc.filename,v_doc.mime_type,v_doc.size_bytes,auth.uid())
 on conflict (document_id) do nothing returning id into v_new_id;
 if v_new_id is null then raise exception 'Dit bewijsstuk is al gekoppeld.'; end if;
 update public.bestemd_expense_lines set receipt_status='received' where id=v_line.id;
 insert into public.bestemd_expense_audit(claim_id,actor_id,event,details)
 values(v_claim.id,auth.uid(),'evidence_added',jsonb_build_object('line_id',v_line.id));
 return v_new_id;
end; $$;

create or replace function public.bestemd_expense_save_mileage(
 p_line_id uuid,p_date date,p_route text,p_reason text,p_kilometers numeric,p_rate_cents integer
) returns void language plpgsql security definer set search_path=public as $$
declare v_claim public.bestemd_expense_claims%rowtype; v_line public.bestemd_expense_lines%rowtype;
begin
 select * into v_line from public.bestemd_expense_lines where id=p_line_id;
 select c.* into v_claim from public.bestemd_expense_claims c where c.id=v_line.claim_id for update;
 if v_claim.claimant_id<>auth.uid() or not public.has_aal2() or
   not public.has_org_access(v_claim.organization_id) or
   v_claim.status not in ('draft','submitted','waiting_evidence','under_review') or
   v_line.category<>'kilometervergoeding' then raise exception 'Geen toegang.' using errcode='42501'; end if;
 if (select coalesce(sum(round(kilometers*rate_cents)),0) from public.bestemd_expense_mileage where line_id=p_line_id)
    + round(p_kilometers*p_rate_cents) > v_line.gross_cents then raise exception 'Ritten overschrijden opgegeven vergoeding.'; end if;
 insert into public.bestemd_expense_mileage(line_id,trip_date,route,business_reason,kilometers,rate_cents)
 values(p_line_id,p_date,p_route,p_reason,p_kilometers,p_rate_cents);
 update public.bestemd_expense_lines set receipt_status='received' where id=p_line_id;
 insert into public.bestemd_expense_audit(claim_id,actor_id,event)values(v_claim.id,auth.uid(),'mileage_log_saved');
end; $$;

-- Office finance roles can review but no role can mark a claim as
-- booked or paid through this function.
create or replace function public.bestemd_expense_office_decide(
 p_claim_id uuid,p_decision text,p_reason text default null
) returns text language plpgsql security definer set search_path=public as $$
declare v_claim public.bestemd_expense_claims%rowtype;
begin
 if not public.has_aal2() or not public.is_office_user() or not exists(
   select 1 from public.office_memberships m join public.roles r on r.id=m.role_id
    where m.user_id=auth.uid() and m.status='active' and r.scope='office'
    and r.code in ('owner','admin','accountant')
 ) then raise exception 'Office beoordelingsrecht vereist.' using errcode='42501'; end if;
 select * into v_claim from public.bestemd_expense_claims where id=p_claim_id for update;
 if not found or v_claim.status not in ('submitted','waiting_evidence','under_review')
    then raise exception 'Declaratie niet in behandeling.'; end if;
 if p_decision='reject' then
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Toelichting vereist.'; end if;
  update public.bestemd_expense_claims set status='rejected',rejection_reason=left(p_reason,1000),reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=p_claim_id;
 elsif p_decision='approve' then
  if exists(select 1 from public.bestemd_expense_lines l where l.claim_id=p_claim_id
    and ((l.category<>'kilometervergoeding' and not exists(select 1 from public.bestemd_expense_evidence e where e.line_id=l.id and e.checked_at is not null))
     or (l.category='kilometervergoeding' and
       coalesce((select sum(round(m.kilometers*m.rate_cents)) from public.bestemd_expense_mileage m where m.line_id=l.id),0)<>l.gross_cents)))
  then raise exception 'Bewijsstukken of rittenoverzicht moeten eerst gecontroleerd zijn.'; end if;
  update public.bestemd_expense_claims set status='approved',reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=p_claim_id;
 else raise exception 'Ongeldige beoordeling.'; end if;
 insert into public.bestemd_expense_audit(claim_id,actor_id,event,details) values(p_claim_id,auth.uid(),'office_'||p_decision,jsonb_build_object('reason',left(coalesce(p_reason,''),1000)));
 return (select status from public.bestemd_expense_claims where id=p_claim_id);
end; $$;

create or replace function public.bestemd_expense_office_check_evidence(p_evidence_id uuid)
 returns boolean language plpgsql security definer set search_path=public as $$
declare v_claim_id uuid;
begin
 if not public.has_aal2() or not public.is_office_user() or not exists(
   select 1 from public.office_memberships m join public.roles r on r.id=m.role_id
   where m.user_id=auth.uid() and m.status='active' and r.scope='office' and r.code in ('owner','admin','accountant','handler')
 ) then raise exception 'Geen Office beoordelingsrecht.' using errcode='42501'; end if;
 select l.claim_id into v_claim_id from public.bestemd_expense_evidence e
 join public.bestemd_expense_lines l on l.id=e.line_id where e.id=p_evidence_id;
 if v_claim_id is null then raise exception 'Bewijsstuk niet gevonden.'; end if;
 if (select status from public.bestemd_expense_claims where id=v_claim_id) in ('booked','paid','rejected') then raise exception 'Declaratie is afgesloten.'; end if;
 update public.bestemd_expense_evidence set checked_by=auth.uid(),checked_at=now() where id=p_evidence_id;
 update public.bestemd_expense_lines set receipt_status='checked' where id=(select line_id from public.bestemd_expense_evidence where id=p_evidence_id);
 insert into public.bestemd_expense_audit(claim_id,actor_id,event) values(v_claim_id,auth.uid(),'evidence_checked');
 return true;
end; $$;

revoke all on function public.bestemd_expense_attach_document(uuid,uuid),public.bestemd_expense_save_mileage(uuid,date,text,text,numeric,integer),public.bestemd_expense_office_decide(uuid,text,text),public.bestemd_expense_office_check_evidence(uuid) from public,anon;
grant execute on function public.bestemd_expense_attach_document(uuid,uuid),public.bestemd_expense_save_mileage(uuid,date,text,text,numeric,integer),public.bestemd_expense_office_decide(uuid,text,text),public.bestemd_expense_office_check_evidence(uuid) to authenticated;

commit;
