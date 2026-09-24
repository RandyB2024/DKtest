-- Additive migration: do not edit the deployed foundation.
begin;

create or replace function public.has_org_access(target uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.profiles p on p.id = m.user_id
    join public.roles r on r.id = m.role_id and r.scope = 'customer'
    join public.organizations o on o.id = m.organization_id
    join public.customer_relationships c on c.id = o.customer_relationship_id
    where m.user_id = auth.uid() and m.organization_id = target
      and m.status = 'active' and p.account_status = 'active'
      and m.valid_from <= now() and (m.valid_until is null or m.valid_until > now())
      and o.archived_at is null and c.archived_at is null and c.status = 'active'
  )
$$;

create or replace function public.is_office_user()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.office_memberships m
    join public.profiles p on p.id = m.user_id
    join public.roles r on r.id = m.role_id and r.scope = 'office'
    where m.user_id = auth.uid() and m.status = 'active' and p.account_status = 'active'
  )
$$;

-- These reference tables were not enabled by the original foundation.
alter table public.customer_relationships enable row level security;
alter table public.organization_groups enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.office_memberships enable row level security;
alter table public.organization_features enable row level security;
alter table public.customer_invitations enable row level security;

-- No policy is introduced for Office memberships, invitations, permissions or
-- relationship metadata. The portal does not need direct access to those rows.
create policy portal_customer_roles_read on public.roles for select to authenticated
using (scope = 'customer' and exists (
  select 1 from public.organization_memberships m
  where m.role_id = roles.id and m.user_id = auth.uid()
    and m.status = 'active' and m.valid_from <= now()
    and (m.valid_until is null or m.valid_until > now())
    and public.has_org_access(m.organization_id)
));

-- Restrictive policies also constrain any earlier permissive SELECT policy.
create policy portal_profiles_boundary on public.profiles as restrictive for select to authenticated
using (id = auth.uid() or public.is_office_user());
create policy portal_memberships_boundary on public.organization_memberships as restrictive for select to authenticated
using (user_id = auth.uid() or public.is_office_user());
create policy portal_organizations_boundary on public.organizations as restrictive for select to authenticated
using (public.has_org_access(id) or public.is_office_user());

-- Freeze customer mutations until each module has transactional writes, role
-- checks, audit and RLS acceptance tests. Service/admin maintenance and existing
-- authorized Office policies are not granted any additional access by this.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','customer_relationships','organization_groups','organizations',
    'roles','permissions','role_permissions','organization_memberships',
    'office_memberships','organization_features','customer_invitations',
    'debtors','sales_invoices','sales_invoice_lines','payments','documents',
    'document_requests','conversations','conversation_participants','messages',
    'appointments','tasks','notifications','audit_events'
  ] loop
    execute format('create policy portal_customer_insert_disabled on public.%I as restrictive for insert to authenticated with check (public.is_office_user())', table_name);
    execute format('create policy portal_customer_update_disabled on public.%I as restrictive for update to authenticated using (public.is_office_user()) with check (public.is_office_user())', table_name);
    execute format('create policy portal_customer_delete_disabled on public.%I as restrictive for delete to authenticated using (public.is_office_user())', table_name);
  end loop;
end $$;

-- AAL2 remains unconditional for financial/document rows, regardless of the
-- profile flag. Include invoice lines explicitly (not only transitively).
do $$
declare table_name text;
begin
  foreach table_name in array array['debtors','sales_invoices','sales_invoice_lines','payments','documents'] loop
    execute format('create policy portal_aal2_required on public.%I as restrictive for all to authenticated using (public.has_aal2()) with check (public.has_aal2())', table_name);
  end loop;
end $$;

create policy portal_storage_insert_disabled on storage.objects as restrictive for insert to authenticated
with check (bucket_id not in ('documents','invoice-pdfs','company-assets','message-attachments') or public.is_office_user());
create policy portal_storage_update_disabled on storage.objects as restrictive for update to authenticated
using (bucket_id not in ('documents','invoice-pdfs','company-assets','message-attachments') or public.is_office_user())
with check (bucket_id not in ('documents','invoice-pdfs','company-assets','message-attachments') or public.is_office_user());
create policy portal_storage_delete_disabled on storage.objects as restrictive for delete to authenticated
using (bucket_id not in ('documents','invoice-pdfs','company-assets','message-attachments') or public.is_office_user());

revoke all on function public.has_org_access(uuid) from public, anon;
revoke all on function public.is_office_user() from public, anon;
grant execute on function public.has_org_access(uuid) to authenticated;
grant execute on function public.is_office_user() to authenticated;
commit;
