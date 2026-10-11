begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'personal-documents',
  'personal-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id)
do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[];


drop policy if exists
  personal_documents_insert_own
on public.personal_documents;

create policy
  personal_documents_insert_own
on public.personal_documents
for insert
to authenticated
with check (
  user_id = auth.uid()

  and exists (
    select 1
    from public.personal_portal_access access
    where access.user_id = auth.uid()
      and access.status = 'active'
  )
);


drop policy if exists
  personal_storage_insert_own
on storage.objects;

create policy
  personal_storage_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'personal-documents'

  and (storage.foldername(name))[1]
      = auth.uid()::text

  and exists (
    select 1
    from public.personal_portal_access access
    where access.user_id = auth.uid()
      and access.status = 'active'
  )
);


drop policy if exists
  personal_storage_select_own
on storage.objects;

create policy
  personal_storage_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'personal-documents'

  and (storage.foldername(name))[1]
      = auth.uid()::text

  and exists (
    select 1
    from public.personal_portal_access access
    where access.user_id = auth.uid()
      and access.status = 'active'
  )
);


drop policy if exists
  personal_storage_delete_own
on storage.objects;

create policy
  personal_storage_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'personal-documents'

  and (storage.foldername(name))[1]
      = auth.uid()::text
);

commit;
