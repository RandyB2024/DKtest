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
 filename text not null,
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/heic')),
 size_bytes bigint not null check(size_bytes>0 and size_bytes<=15728640),
 uploaded_by uuid not null references auth.users(id),
 checked_by uuid references auth.users(id),
 checked_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.bestemd_expense_mileage (
 line_id uuid primary key references public.bestemd_expense_lines(id) on delete cascade,
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
  if v_amount<0 or v_vat<0 or v_vat>v_amount then raise exception 'Ongeldig bedrag of btw.'; end if;
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
   where l.claim_id=p_claim_id and l.category<>'kilometervergoeding'
   and not exists(select 1 from public.bestemd_expense_evidence e where e.line_id=l.id)
 ) then 'waiting_evidence' else 'submitted' end;
 update public.bestemd_expense_claims set status=v_status,submitted_at=now(),updated_at=now() where id=p_claim_id;
 insert into public.bestemd_expense_audit(claim_id,actor_id,event) values(p_claim_id,auth.uid(),'submitted');
 return v_status;
end; $$;

revoke all on function public.bestemd_expense_save_draft(uuid,date,text,uuid,jsonb), public.bestemd_expense_submit(uuid) from public,anon;
grant execute on function public.bestemd_expense_save_draft(uuid,date,text,uuid,jsonb), public.bestemd_expense_submit(uuid) to authenticated;
commit;
