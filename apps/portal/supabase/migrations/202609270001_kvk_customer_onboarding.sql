-- Additive KvK intake. No existing policies/functions are relaxed or replaced.
begin;

-- Fail on existing duplicates; operators must review them, never auto-merge data.
create unique index organizations_active_kvk_unique
  on public.organizations (btrim(registration_number))
  where archived_at is null and nullif(btrim(registration_number),'') is not null;

-- A narrowly scoped Worker capability, NOT a service-role credential.
-- Provision a SHA-256 hash of a random 32-byte hex secret separately, offline
-- from this migration. No row => intake fails closed. Never expose this schema.
create schema office_kvk_private;
revoke all on schema office_kvk_private from public, anon, authenticated;
create table office_kvk_private.worker_gate (
  singleton boolean primary key default true check(singleton),
  secret_hash text not null check(secret_hash ~ '^[a-f0-9]{64}$'),
  environment text not null check(environment in ('test','production'))
);
revoke all on office_kvk_private.worker_gate from public, anon, authenticated;

create table public.organization_kvk_intakes (
  organization_id uuid primary key references public.organizations(id),
  customer_relationship_id uuid not null references public.customer_relationships(id),
  kvk_number text not null check(kvk_number ~ '^[0-9]{8}$'),
  profile jsonb not null check(jsonb_typeof(profile)='object'),
  manual_details jsonb not null check(jsonb_typeof(manual_details)='object'),
  kvk_checked_at timestamptz not null,
  kvk_environment text not null check(kvk_environment in ('test','production')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.organization_kvk_intakes enable row level security;
revoke all on public.organization_kvk_intakes from public, anon, authenticated;
grant select on public.organization_kvk_intakes to authenticated;
create policy office_kvk_intake_read on public.organization_kvk_intakes for select to authenticated
  using (public.is_office_user() and public.has_aal2() and exists (
    select 1 from public.organizations o where o.id=organization_id and o.archived_at is null));

create function public.office_create_relationship_from_kvk(
  p_profile jsonb, p_manual jsonb, p_environment text, p_checked_at timestamptz, p_server_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare actor uuid; result jsonb; field text;
begin
  actor := public.office_cm_actor();
  if p_server_key is null or p_server_key !~ '^[a-f0-9]{64}$' or not exists (
    select 1 from office_kvk_private.worker_gate g where g.singleton
      and g.secret_hash=encode(sha256(convert_to(p_server_key,'UTF8')),'hex')
      and g.environment=p_environment
  ) then raise exception using errcode='42501', message='Intake denied'; end if;
  if p_environment is null or p_environment not in ('test','production') or p_checked_at is null
    or p_checked_at > clock_timestamp() or p_checked_at <= clock_timestamp()-interval '5 minutes'
    or p_profile is null or jsonb_typeof(p_profile)<>'object' or octet_length(p_profile::text)>30000
    or p_manual is null or jsonb_typeof(p_manual)<>'object' then
    raise exception using errcode='22023',message='Invalid intake';
  end if;
  for field in select jsonb_object_keys(p_profile) loop
    if field not in ('kvkNumber','name','legalName','tradeNames','legalForm','status','registeredAt','startedAt','visitAddress','postalAddress','mainBranchNumber','branchCount','activities') then
      raise exception using errcode='22023',message='Invalid intake';
    end if;
  end loop;
  if coalesce(p_profile->>'status','')<>'active' or coalesce(p_profile->>'kvkNumber','') !~ '^[0-9]{8}$'
    or jsonb_typeof(p_profile->'name') is distinct from 'string' or length(btrim(p_profile->>'name')) not between 1 and 200
    or jsonb_typeof(p_profile->'tradeNames') is distinct from 'array'
    or jsonb_typeof(p_profile->'activities') is distinct from 'array' then
    raise exception using errcode='22023',message='Invalid intake';
  end if;
  for field in select jsonb_object_keys(p_manual) loop
    if field not in ('relationshipName','vatId','taxNumber','iban','email','phone','contactPerson','fiscalChoices','services')
      or jsonb_typeof(p_manual->field)<>'string'
      or length(p_manual->>field)>(case when field in ('fiscalChoices','services') then 1000 else 200 end) then
      raise exception using errcode='22023',message='Invalid intake';
    end if;
  end loop;
  if coalesce(length(btrim(p_manual->>'relationshipName')),0) not between 1 and 200 then
    raise exception using errcode='22023',message='Invalid intake';
  end if;
  -- The existing RPC supplies the same authorization, validation and two audits.
  -- This call, the snapshot and the additional audit are ONE transaction.
  result := public.office_create_relationship(jsonb_build_object(
    'name',p_manual->>'relationshipName','organization',jsonb_build_object(
      'name',p_profile->>'name','legal_name',p_profile->>'legalName','registration_number',p_profile->>'kvkNumber')));
  update public.organizations set test_record=(p_environment='test') where id=(result->>'organization_id')::uuid;
  insert into public.organization_kvk_intakes(organization_id,customer_relationship_id,kvk_number,profile,manual_details,kvk_checked_at,kvk_environment,created_by)
    values ((result->>'organization_id')::uuid,(result->>'relationship_id')::uuid,p_profile->>'kvkNumber',p_profile,p_manual,p_checked_at,p_environment,actor);
  perform public.office_cm_audit(actor,(result->>'relationship_id')::uuid,(result->>'organization_id')::uuid,
    'organization.kvk_intake','organization',(result->>'organization_id')::uuid,
    '["kvk_profile","manual_details","kvk_checked_at","kvk_environment","created_by"]'::jsonb);
  return result;
end $$;
revoke all on function public.office_create_relationship_from_kvk(jsonb,jsonb,text,timestamptz,text) from public,anon;
grant execute on function public.office_create_relationship_from_kvk(jsonb,jsonb,text,timestamptz,text) to authenticated;
commit;
