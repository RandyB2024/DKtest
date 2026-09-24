-- Office phase 1: additive policies, no edits to applied migrations.
begin;

-- Bootstrap is possible at AAL1, but only for the caller's active Office identity.
create policy office_own_membership_read on public.office_memberships for select to authenticated
using (user_id = auth.uid() and status = 'active' and public.is_office_user());
create policy office_own_role_read on public.roles for select to authenticated
using (scope = 'office' and public.is_office_user() and exists (
  select 1 from public.office_memberships m
  where m.user_id = auth.uid() and m.role_id = roles.id and m.status = 'active'
));

create policy office_relationships_read on public.customer_relationships for select to authenticated
using (public.is_office_user() and public.has_aal2() and archived_at is null);
create policy office_relationships_boundary on public.customer_relationships as restrictive for select to authenticated
using (public.is_office_user() and public.has_aal2() and archived_at is null);

-- Keep the customer access branch intact; Office-only reads require AAL2.
create policy office_organization_aal_boundary on public.organizations as restrictive for select to authenticated
using (public.has_org_access(id) or (public.is_office_user() and public.has_aal2() and archived_at is null));
create policy office_profile_aal_boundary on public.profiles as restrictive for select to authenticated
using (id = auth.uid() or (public.is_office_user() and public.has_aal2()));
create policy office_customer_membership_aal_boundary on public.organization_memberships as restrictive for select to authenticated
using (user_id = auth.uid() or (public.is_office_user() and public.has_aal2()));

-- Office business reads require MFA even outside the Office HTTP server.
-- Preserve existing customer branches and the minimal AAL1 auth bootstrap.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organization_groups','permissions','role_permissions','organization_features',
    'customer_invitations','debtors','sales_invoices','sales_invoice_lines','payments',
    'documents','document_requests','conversations','conversation_participants',
    'messages','appointments','tasks','notifications','audit_events'
  ] loop
    execute format('create policy office_business_aal2 on public.%I as restrictive for select to authenticated using (not public.is_office_user() or public.has_aal2())', table_name);
  end loop;
end $$;

-- Existing broad Office write policies must not make unmigrated actions
-- available by calling PostgREST directly. Later modules replace their own
-- restriction with explicit role/field/organization policies and tests.
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
    execute format('create policy office_phase1_insert_disabled on public.%I as restrictive for insert to authenticated with check (not public.is_office_user())', table_name);
    execute format('create policy office_phase1_update_disabled on public.%I as restrictive for update to authenticated using (not public.is_office_user()) with check (not public.is_office_user())', table_name);
    execute format('create policy office_phase1_delete_disabled on public.%I as restrictive for delete to authenticated using (not public.is_office_user())', table_name);
  end loop;
end $$;
create policy office_storage_insert_disabled on storage.objects as restrictive for insert to authenticated
with check (bucket_id not in ('documents','invoice-pdfs','company-assets','message-attachments') or not public.is_office_user());
create policy office_storage_update_disabled on storage.objects as restrictive for update to authenticated
using (bucket_id not in ('documents','invoice-pdfs','company-assets','message-attachments') or not public.is_office_user())
with check (bucket_id not in ('documents','invoice-pdfs','company-assets','message-attachments') or not public.is_office_user());
create policy office_storage_delete_disabled on storage.objects as restrictive for delete to authenticated
using (bucket_id not in ('documents','invoice-pdfs','company-assets','message-attachments') or not public.is_office_user());
commit;
