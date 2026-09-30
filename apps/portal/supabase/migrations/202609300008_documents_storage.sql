-- ============================================================
-- 202609300008_documents_storage.sql
--
-- Veilige Supabase Storage policies voor documenten.
--
-- Padstructuur:
--
-- {organization_id}/inbox/{document_id}/{filename}
--
-- Later hoeft een bestand bij archivering niet fysiek verplaatst
-- te worden. De database bepaalt inbox / archief / boekjaar / maand.
-- ============================================================

begin;


-- ============================================================
-- 1. VEILIGE HELPER VOOR ORGANISATIE-ID UIT STORAGE PATH
--
-- Voorkomt fouten als iemand een ongeldig pad probeert te gebruiken.
-- ============================================================

create or replace function public.storage_object_organization_id(
  object_name text
)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_first_part text;
begin

  v_first_part :=
    (storage.foldername(object_name))[1];

  if v_first_part is null then
    return null;
  end if;

  begin
    return v_first_part::uuid;
  exception
    when invalid_text_representation then
      return null;
  end;

end;
$$;


-- ============================================================
-- 2. OUDE GENERIEKE STORAGE POLICIES VERWIJDEREN
--
-- Deze oude policies golden tegelijk voor documents,
-- invoice-pdfs, company-assets en message-attachments.
--
-- Voor documents willen we strengere regels.
-- ============================================================

drop policy if exists
  storage_read_authorized
on storage.objects;


drop policy if exists
  storage_insert_authorized
on storage.objects;


-- Eventuele eerdere testpolicies opruimen.
drop policy if exists
  documents_storage_read
on storage.objects;


drop policy if exists
  documents_storage_insert
on storage.objects;


drop policy if exists
  storage_read_authorized_non_documents
on storage.objects;


drop policy if exists
  storage_insert_authorized_non_documents
on storage.objects;


-- ============================================================
-- 3. BESTAANDE NIET-DOCUMENT BUCKETS BEHOUDEN
--
-- Gedrag blijft hetzelfde als voorheen.
-- ============================================================

create policy
  storage_read_authorized_non_documents
on storage.objects
for select
to authenticated
using (
  bucket_id in (
    'invoice-pdfs',
    'company-assets',
    'message-attachments'
  )
  and public.has_aal2()
  and (
    public.has_org_access(
      public.storage_object_organization_id(name)
    )
    or public.is_office_user()
  )
);


create policy
  storage_insert_authorized_non_documents
on storage.objects
for insert
to authenticated
with check (
  bucket_id in (
    'invoice-pdfs',
    'company-assets',
    'message-attachments'
  )
  and public.has_aal2()
  and public.has_org_access(
    public.storage_object_organization_id(name)
  )
);


-- ============================================================
-- 4. DOCUMENTS BUCKET - UPLOAD
--
-- Klant:
-- - AAL2
-- - eerste padsegment moet eigen organisatie zijn
--
-- Office:
-- - AAL2
-- - mag naar klantorganisaties uploaden
--
-- Database-RLS bepaalt daarna of bron customer/office correct is.
-- ============================================================

create policy
  documents_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and public.has_aal2()
  and public.storage_object_organization_id(name)
      is not null
  and (
    public.has_org_access(
      public.storage_object_organization_id(name)
    )
    or public.is_office_user()
  )
);


-- ============================================================
-- 5. DOCUMENTS BUCKET - LEZEN
--
-- Office:
-- mag alle documentbestanden lezen.
--
-- Klant:
-- alleen:
--   - eigen organisatie
--   - bestand bestaat in public.documents
--   - visible_to_customer = true
--
-- Hierdoor kan een klant NIET via een direct storage-path
-- een intern Office-document openen.
-- ============================================================

create policy
  documents_storage_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and public.has_aal2()
  and (
    public.is_office_user()

    or exists (
      select 1
      from public.documents d
      where
        d.storage_path = storage.objects.name

        and d.organization_id =
          public.storage_object_organization_id(
            storage.objects.name
          )

        and public.has_org_access(
          d.organization_id
        )

        and d.visible_to_customer = true
    )
  )
);


-- ============================================================
-- 6. GEEN UPDATE / DELETE POLICIES
--
-- Bewust niet toevoegen.
--
-- Bestanden worden:
-- - niet rechtstreeks overschreven
-- - niet rechtstreeks verwijderd
--
-- Archiveren gebeurt met metadata in public.documents.
-- ============================================================


commit;