-- ============================================================
-- 202609300010_documents_write_boundary.sql
--
-- Documentenmodule uit de oude algemene write-freeze halen.
--
-- De eerdere portal/Office beveiligingsmigraties blokkeerden
-- bewust alle nog niet gemigreerde writes.
--
-- Nu documenten een eigen:
-- - RLS-model
-- - AAL2-controle
-- - organisatiecontrole
-- - storage-padcontrole
-- hebben, mag alleen DEZE module uit die freeze.
--
-- Andere modules blijven geblokkeerd.
-- ============================================================

begin;


-- ============================================================
-- 1. PUBLIC.DOCUMENTS:
-- OUDE RESTRICTIVE WRITE FREEZE VERWIJDEREN
-- ============================================================

drop policy if exists
  portal_customer_insert_disabled
on public.documents;

drop policy if exists
  portal_customer_update_disabled
on public.documents;

drop policy if exists
  portal_customer_delete_disabled
on public.documents;


drop policy if exists
  office_phase1_insert_disabled
on public.documents;

drop policy if exists
  office_phase1_update_disabled
on public.documents;

drop policy if exists
  office_phase1_delete_disabled
on public.documents;


-- ============================================================
-- 2. DOCUMENTENPOLICIES BLIJVEN DE SCHRIJFRECHTEN BEPALEN
--
-- documents_insert:
--   klant = eigen organisatie + source customer
--   Office = source office
--
-- documents_office_update:
--   alleen Office
--
-- Geen delete-policy:
--   dus verwijderen blijft onmogelijk.
-- ============================================================


-- ============================================================
-- 3. OUDE ALGEMENE STORAGE FREEZES VERWIJDEREN
--
-- Deze golden oorspronkelijk voor:
-- documents
-- invoice-pdfs
-- company-assets
-- message-attachments
--
-- We gaan ze opnieuw maken waarbij 'documents'
-- inmiddels een gemigreerde uitzondering is.
-- ============================================================

drop policy if exists
  portal_storage_insert_disabled
on storage.objects;

drop policy if exists
  portal_storage_update_disabled
on storage.objects;

drop policy if exists
  portal_storage_delete_disabled
on storage.objects;


drop policy if exists
  office_storage_insert_disabled
on storage.objects;

drop policy if exists
  office_storage_update_disabled
on storage.objects;

drop policy if exists
  office_storage_delete_disabled
on storage.objects;


-- ============================================================
-- 4. PORTAL FREEZE OPNIEUW MAKEN
--
-- documents is hier bewust NIET meer geblokkeerd.
--
-- De overige oude buckets blijven frozen totdat die
-- afzonderlijk veilig worden gemigreerd.
-- ============================================================

create policy
  portal_storage_insert_disabled
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id = 'documents'

  or bucket_id not in (
    'invoice-pdfs',
    'company-assets',
    'message-attachments'
  )

  or public.is_office_user()
);


create policy
  portal_storage_update_disabled
on storage.objects
as restrictive
for update
to authenticated
using (
  bucket_id = 'documents'

  or bucket_id not in (
    'invoice-pdfs',
    'company-assets',
    'message-attachments'
  )

  or public.is_office_user()
)
with check (
  bucket_id = 'documents'

  or bucket_id not in (
    'invoice-pdfs',
    'company-assets',
    'message-attachments'
  )

  or public.is_office_user()
);


create policy
  portal_storage_delete_disabled
on storage.objects
as restrictive
for delete
to authenticated
using (
  bucket_id = 'documents'

  or bucket_id not in (
    'invoice-pdfs',
    'company-assets',
    'message-attachments'
  )

  or public.is_office_user()
);


-- ============================================================
-- 5. OFFICE FREEZE OPNIEUW MAKEN
--
-- Ook hier is documents bewust uitgezonderd.
-- ============================================================

create policy
  office_storage_insert_disabled
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id = 'documents'

  or bucket_id not in (
    'invoice-pdfs',
    'company-assets',
    'message-attachments'
  )

  or not public.is_office_user()
);


create policy
  office_storage_update_disabled
on storage.objects
as restrictive
for update
to authenticated
using (
  bucket_id = 'documents'

  or bucket_id not in (
    'invoice-pdfs',
    'company-assets',
    'message-attachments'
  )

  or not public.is_office_user()
)
with check (
  bucket_id = 'documents'

  or bucket_id not in (
    'invoice-pdfs',
    'company-assets',
    'message-attachments'
  )

  or not public.is_office_user()
);


create policy
  office_storage_delete_disabled
on storage.objects
as restrictive
for delete
to authenticated
using (
  bucket_id = 'documents'

  or bucket_id not in (
    'invoice-pdfs',
    'company-assets',
    'message-attachments'
  )

  or not public.is_office_user()
);


commit;