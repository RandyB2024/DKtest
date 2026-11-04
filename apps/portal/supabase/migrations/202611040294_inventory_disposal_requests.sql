-- BESTEMD stap 294. Eerst beoordelen en handmatig toepassen in Supabase SQL Editor.
-- Afmeldverzoeken wijzigen NOOIT de inventaris of boekhouding.
begin;
create table if not exists public.inventory_disposal_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  requested_by uuid not null default auth.uid(),
  reason text not null check (reason in ('sold','discarded','broken','stolen','lost','other')),
  effective_date date not null,
  sale_amount_cents bigint check (sale_amount_cents is null or sale_amount_cents >= 0),
  note text not null default '' check (char_length(note) <= 1500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  constraint disposal_sale_only check (reason = 'sold' or sale_amount_cents is null)
);
create unique index if not exists inventory_disposal_one_pending
  on public.inventory_disposal_requests(inventory_item_id) where status='pending';
create index if not exists inventory_disposal_org_recent
  on public.inventory_disposal_requests(organization_id,created_at desc);
alter table public.inventory_disposal_requests enable row level security;
revoke all on public.inventory_disposal_requests from public, anon, authenticated;
grant select, insert on public.inventory_disposal_requests to authenticated;
-- Klant ziet uitsluitend eigen onderneming; Office ziet toegankelijke administraties.
drop policy if exists inventory_disposal_select on public.inventory_disposal_requests;
create policy inventory_disposal_select on public.inventory_disposal_requests
for select to authenticated using (
  auth.uid() is not null and public.has_aal2() and
  (public.has_org_access(organization_id) or public.is_office_user())
);
-- Klant mag uitsluitend verzoeken aanmaken voor actieve bedrijfsmiddelen van eigen onderneming.
drop policy if exists inventory_disposal_customer_request on public.inventory_disposal_requests;
create policy inventory_disposal_customer_request on public.inventory_disposal_requests
for insert to authenticated with check (
  auth.uid() is not null and requested_by=auth.uid()
  and status='pending'
  and reviewed_by is null and reviewed_at is null and review_note is null
  and public.has_aal2() and public.has_org_access(organization_id)
  and exists (
    select 1 from public.inventory_items i
    where i.id=inventory_item_id and i.organization_id=organization_id
      and i.archived_at is null and i.status='active'
  )
);
-- Geen rechtstreekse UPDATE/DELETE voor klanten of gewone authenticated-rollen.
-- Latere Office-goedkeuring krijgt een afzonderlijke gecontroleerde RPC.
commit;