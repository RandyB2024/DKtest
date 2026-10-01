-- ============================================================
-- Office documenten stap 3B
--
-- - Office -> klant uploads
-- - Viewer blijft read-only
-- - uploadregistratie + audit atomair
-- ============================================================

begin;


-- ============================================================
-- 1. DOCUMENT WRITE PERMISSION
-- ============================================================

create or replace function public.can_office_manage_documents()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.office_memberships m
    join public.roles r
      on r.id = m.role_id
    join public.profiles p
      on p.id = m.user_id
    where
      m.user_id = auth.uid()
      and m.status = 'active'
      and p.account_status = 'active'
      and r.scope = 'office'
      and r.code in (
        'owner',
        'admin',
        'accountant',
        'handler'
      )
  );
$$;

revoke all
on function public.can_office_manage_documents()
from public, anon;

grant execute
on function public.can_office_manage_documents()
to authenticated;


-- ============================================================
-- 2. DOCUMENT WRITE POLICIES AANSCHERPEN
-- ============================================================

drop policy if exists
  documents_insert
on public.documents;

create policy
  documents_insert
on public.documents
for insert
to authenticated
with check (
  public.has_aal2()
  and uploaded_by = auth.uid()
  and (
    (
      public.has_org_access(organization_id)
      and source = 'customer'
    )
    or (
      public.can_office_manage_documents()
      and source = 'office'
    )
  )
);


drop policy if exists
  documents_office_update
on public.documents;

create policy
  documents_office_update
on public.documents
for update
to authenticated
using (
  public.has_aal2()
  and public.can_office_manage_documents()
)
with check (
  public.has_aal2()
  and public.can_office_manage_documents()
);


drop policy if exists
  document_folders_office_insert
on public.document_folders;

create policy
  document_folders_office_insert
on public.document_folders
for insert
to authenticated
with check (
  public.has_aal2()
  and public.can_office_manage_documents()
);


drop policy if exists
  document_folders_office_update
on public.document_folders;

create policy
  document_folders_office_update
on public.document_folders
for update
to authenticated
using (
  public.has_aal2()
  and public.can_office_manage_documents()
)
with check (
  public.has_aal2()
  and public.can_office_manage_documents()
);


-- ============================================================
-- 3. STORAGE INSERT: VIEWER MAG NIET UPLOADEN
-- ============================================================

drop policy if exists
  documents_storage_insert
on storage.objects;

create policy
  documents_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and public.has_aal2()
  and public.storage_object_organization_id(name) is not null
  and (
    public.has_org_access(
      public.storage_object_organization_id(name)
    )
    or public.can_office_manage_documents()
  )
);


-- ============================================================
-- 4. BESTAANDE PROCESSING RPC AANSCHERPEN
-- ============================================================

create or replace function public.office_process_customer_document(
  p_organization_id uuid,
  p_document_id uuid,
  p_status text,
  p_document_type text,
  p_book_year integer default null,
  p_book_month integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_old public.documents%rowtype;
  v_new public.documents%rowtype;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception 'Tweestapsverificatie is vereist.';
  end if;

  if not public.can_office_manage_documents() then
    raise exception 'Geen rechten om documenten te verwerken.';
  end if;

  if p_status not in (
    'new',
    'in_review',
    'needs_customer_action',
    'ready',
    'processed'
  ) then
    raise exception 'Ongeldige documentstatus.';
  end if;

  if p_document_type not in (
    'purchase_invoice',
    'sales_invoice',
    'bank_document',
    'tax_document',
    'payroll',
    'contract',
    'other'
  ) then
    raise exception 'Ongeldig documenttype.';
  end if;

  if p_book_year is not null
     and (p_book_year < 2000 or p_book_year > 2100) then
    raise exception 'Ongeldig boekjaar.';
  end if;

  if p_book_month is not null
     and (p_book_month < 1 or p_book_month > 12) then
    raise exception 'Ongeldige maand.';
  end if;

  select *
  into v_old
  from public.documents
  where
    id = p_document_id
    and organization_id = p_organization_id
    and archived_at is null
  for update;

  if not found then
    raise exception 'Document niet gevonden.';
  end if;

  if v_old.source <> 'customer' then
    raise exception 'Alleen klantdocumenten kunnen hier worden verwerkt.';
  end if;

  update public.documents
  set
    status = p_status,
    document_type = p_document_type,
    book_year = p_book_year,
    book_month = p_book_month,
    customer_action_required =
      (p_status = 'needs_customer_action'),
    processed_at =
      case
        when p_status = 'processed'
          then coalesce(processed_at, now())
        else null
      end
  where id = p_document_id
  returning *
  into v_new;

  insert into public.document_events (
    organization_id,
    document_id,
    event_type,
    old_value,
    new_value,
    created_by
  )
  values (
    p_organization_id,
    p_document_id,
    'status_changed',
    jsonb_build_object(
      'status', v_old.status,
      'documentType', v_old.document_type,
      'bookYear', v_old.book_year,
      'bookMonth', v_old.book_month
    ),
    jsonb_build_object(
      'status', v_new.status,
      'documentType', v_new.document_type,
      'bookYear', v_new.book_year,
      'bookMonth', v_new.book_month
    ),
    v_user_id
  );

  return jsonb_build_object(
    'id', v_new.id,
    'status', v_new.status
  );
end;
$$;


-- ============================================================
-- 5. OFFICE UPLOAD REGISTREREN
--
-- De Storage-upload moet al bestaan voordat metadata wordt
-- geregistreerd.
-- ============================================================

create or replace function public.office_register_document_upload(
  p_document_id uuid,
  p_organization_id uuid,
  p_storage_path text,
  p_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_document_type text,
  p_visible_to_customer boolean,
  p_acknowledgement_required boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_user_id uuid;
  v_expected_path text;
  v_extension text;
  v_document public.documents%rowtype;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception 'Tweestapsverificatie is vereist.';
  end if;

  if not public.can_office_manage_documents() then
    raise exception 'Geen rechten om documenten te uploaden.';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where
      o.id = p_organization_id
      and o.archived_at is null
  ) then
    raise exception 'Onderneming niet gevonden.';
  end if;

  if p_mime_type not in (
    'application/pdf',
    'image/png',
    'image/jpeg'
  ) then
    raise exception 'Bestandstype niet toegestaan.';
  end if;

  if p_size_bytes <= 0
     or p_size_bytes > 52428800 then
    raise exception 'Bestandsgrootte niet toegestaan.';
  end if;

  if p_filename is null
     or length(trim(p_filename)) = 0
     or length(p_filename) > 180 then
    raise exception 'Ongeldige bestandsnaam.';
  end if;

  if p_filename ~ '[[:cntrl:]]' then
    raise exception 'Ongeldige bestandsnaam.';
  end if;

  if p_document_type not in (
    'purchase_invoice',
    'sales_invoice',
    'bank_document',
    'tax_document',
    'payroll',
    'contract',
    'other'
  ) then
    raise exception 'Ongeldig documenttype.';
  end if;

  v_extension :=
    case p_mime_type
      when 'application/pdf' then 'pdf'
      when 'image/png' then 'png'
      when 'image/jpeg' then 'jpg'
    end;

  v_expected_path :=
    p_organization_id::text
    || '/inbox/'
    || p_document_id::text
    || '/file.'
    || v_extension;

  if p_storage_path <> v_expected_path then
    raise exception 'Ongeldig opslagpad.';
  end if;

  if not exists (
    select 1
    from storage.objects so
    where
      so.bucket_id = 'documents'
      and so.name = p_storage_path
  ) then
    raise exception 'Het ge?ploade bestand is niet gevonden.';
  end if;

  insert into public.documents (
    id,
    organization_id,
    storage_path,
    filename,
    mime_type,
    size_bytes,
    status,
    uploaded_by,
    source,
    document_type,
    visible_to_customer,
    acknowledgement_required,
    customer_action_required
  )
  values (
    p_document_id,
    p_organization_id,
    p_storage_path,
    trim(p_filename),
    p_mime_type,
    p_size_bytes,
    'ready',
    v_user_id,
    'office',
    p_document_type,
    p_visible_to_customer,
    (
      p_visible_to_customer
      and p_acknowledgement_required
    ),
    false
  )
  on conflict (id) do nothing;

  select *
  into v_document
  from public.documents
  where id = p_document_id;

  if not found
     or v_document.organization_id <> p_organization_id
     or v_document.storage_path <> p_storage_path then
    raise exception 'Documentregistratie is ongeldig.';
  end if;

  insert into public.document_events (
    organization_id,
    document_id,
    event_type,
    new_value,
    created_by
  )
  select
    p_organization_id,
    p_document_id,
    'uploaded',
    jsonb_build_object(
      'source', 'office',
      'filename', trim(p_filename),
      'visibleToCustomer', p_visible_to_customer,
      'acknowledgementRequired',
        (
          p_visible_to_customer
          and p_acknowledgement_required
        )
    ),
    v_user_id
  where not exists (
    select 1
    from public.document_events e
    where
      e.document_id = p_document_id
      and e.event_type = 'uploaded'
  );

  return jsonb_build_object(
    'id', v_document.id,
    'organizationId', v_document.organization_id,
    'filename', v_document.filename,
    'status', v_document.status
  );
end;
$$;

revoke all
on function public.office_register_document_upload(
  uuid,
  uuid,
  text,
  text,
  text,
  bigint,
  text,
  boolean,
  boolean
)
from public, anon;

grant execute
on function public.office_register_document_upload(
  uuid,
  uuid,
  text,
  text,
  text,
  bigint,
  text,
  boolean,
  boolean
)
to authenticated;


commit;
