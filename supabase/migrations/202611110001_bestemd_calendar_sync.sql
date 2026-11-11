-- BESTEMD central Cal.com bookings: additive migration, no changes to Wize.
-- The table already exists in production; this is idempotent for fresh environments.
create table if not exists public.bestemd_calendar_bookings (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 calcom_uid text not null unique,
 title text,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 status text not null default 'planned'
   check (status in ('planned','completed','cancelled','no_show')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint bestemd_booking_valid_time check (ends_at > starts_at)
);
create index if not exists idx_bestemd_calendar_upcoming
 on public.bestemd_calendar_bookings(starts_at,organization_id);
alter table public.bestemd_calendar_bookings enable row level security;
revoke all on public.bestemd_calendar_bookings from public,anon,authenticated;

-- Access through a tightly scoped RPC, never direct table SELECT.
create or replace function public.bestemd_office_calendar_upcoming()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
 if auth.uid() is null
   or public.is_office_user() is distinct from true
   or public.has_aal2() is distinct from true then
   raise exception 'Geen toegang tot Office-afspraken' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'organizationId',q.organization_id,
  'organizationName',q.organization_name,
  'startsAt',q.starts_at,
  'endsAt',q.ends_at,
  'status','Gepland',
  'title',q.title
 ) order by q.starts_at),'[]'::jsonb)
 into result
 from (
  select b.organization_id,o.name as organization_name,b.starts_at,b.ends_at,b.title
  from public.bestemd_calendar_bookings b
  join public.organizations o on o.id=b.organization_id
  where b.starts_at >= now() and b.status='planned'
  order by b.starts_at limit 100
 ) q;
 return result;
end $$;
revoke all on function public.bestemd_office_calendar_upcoming() from public,anon;
grant execute on function public.bestemd_office_calendar_upcoming() to authenticated;

-- Portal writes require verified AAL2, organization access, and existing server sync key.
-- This is NOT a webhook endpoint: webhook writes must use a separately verified
-- server-side route with an authenticated service role and trusted organization mapping.
create or replace function public.bestemd_portal_sync_calendar_booking(
 p_organization_id uuid,p_calcom_uid text,p_title text,
 p_starts_at timestamptz,p_ends_at timestamptz,p_status text,p_sync_key text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare existing_org uuid;
begin
 perform public.wize_require_calcom_sync_key(p_sync_key);
 if auth.uid() is null or public.has_aal2() is distinct from true
    or public.has_org_access(p_organization_id) is distinct from true then
  raise exception 'Geen toegang tot deze onderneming' using errcode='42501';
 end if;
 if p_calcom_uid is null or length(btrim(p_calcom_uid)) not between 8 and 300
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
    or p_status not in ('planned','completed','cancelled','no_show') then
  raise exception 'Ongeldige Cal.com-afspraak' using errcode='22023';
 end if;
 select organization_id into existing_org
 from public.bestemd_calendar_bookings where calcom_uid=btrim(p_calcom_uid) for update;
 if existing_org is not null and existing_org <> p_organization_id then
  raise exception 'Afspraak hoort bij een andere onderneming' using errcode='42501';
 end if;
 insert into public.bestemd_calendar_bookings
  (organization_id,calcom_uid,title,starts_at,ends_at,status)
 values (p_organization_id,btrim(p_calcom_uid),left(p_title,500),p_starts_at,p_ends_at,p_status)
 on conflict (calcom_uid) do update set
  title=excluded.title,starts_at=excluded.starts_at,
  ends_at=excluded.ends_at,status=excluded.status,updated_at=now()
 where public.bestemd_calendar_bookings.organization_id=excluded.organization_id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.bestemd_portal_sync_calendar_booking(uuid,text,text,timestamptz,timestamptz,text,text) from public,anon;
grant execute on function public.bestemd_portal_sync_calendar_booking(uuid,text,text,timestamptz,timestamptz,text,text) to authenticated;
