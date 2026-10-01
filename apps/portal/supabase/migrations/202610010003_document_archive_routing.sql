-- ============================================================
-- Documenten stap 4A
--
-- Archiefstructuur:
--
-- Jaar
--   -> Maand
--      -> Maptype
--
-- Bestanden zelf blijven fysiek in Storage op hun bestaande pad.
-- De database bepaalt de logische archiefstructuur.
-- ============================================================

begin;


-- ============================================================
-- 1. HELPER: NAAM VAN MAPTYPE
-- ============================================================

create or replace function public.document_type_folder_name(
  p_document_type text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_document_type
    when 'purchase_invoice' then 'Inkoopfacturen'
    when 'sales_invoice' then 'Verkoopfacturen'
    when 'bank_document' then 'Bankdocumenten'
    when 'tax_document' then 'Belastingdocumenten'
    when 'payroll' then 'Loonadministratie'
    when 'contract' then 'Contracten'
    else 'Overig'
  end;
$$;


-- ============================================================
-- 2. HELPER: MAANDNAAM
-- ============================================================

create or replace function public.document_month_name(
  p_month integer
)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_month
    when 1 then 'Januari'
    when 2 then 'Februari'
    when 3 then 'Maart'
    when 4 then 'April'
    when 5 then 'Mei'
    when 6 then 'Juni'
    when 7 then 'Juli'
    when 8 then 'Augustus'
    when 9 then 'September'
    when 10 then 'Oktober'
    when 11 then 'November'
    when 12 then 'December'
  end;
$$;


-- ============================================================
-- 3. HELPER: JAAR -> MAAND -> MAPTYPE
-- ============================================================

create or replace function public.ensure_document_archive_folder(
  p_organization_id uuid,
  p_book_year integer,
  p_book_month integer,
  p_document_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_id uuid;
  v_month_id uuid;
  v_type_id uuid;
  v_month_name text;
  v_type_name text;
begin

  if p_book_year < 2000
     or p_book_year > 2100 then
    raise exception 'Ongeldig boekjaar.';
  end if;

  if p_book_month < 1
     or p_book_month > 12 then
    raise exception 'Ongeldige maand.';
  end if;

  v_month_name :=
    public.document_month_name(
      p_book_month
    );

  v_type_name :=
    public.document_type_folder_name(
      p_document_type
    );


  -- ----------------------------------------------------------
  -- JAAR
  -- ----------------------------------------------------------

  select id
  into v_year_id
  from public.document_folders
  where
    organization_id =
      p_organization_id
    and parent_id is null
    and slug =
      p_book_year::text
    and archived_at is null
  limit 1;

  if v_year_id is null then
    begin
      insert into public.document_folders (
        organization_id,
        parent_id,
        name,
        slug,
        folder_type,
        book_year,
        book_month,
        sort_order
      )
      values (
        p_organization_id,
        null,
        p_book_year::text,
        p_book_year::text,
        'archive',
        p_book_year,
        null,
        0
      )
      returning id
      into v_year_id;

    exception
      when unique_violation then
        select id
        into v_year_id
        from public.document_folders
        where
          organization_id =
            p_organization_id
          and parent_id is null
          and slug =
            p_book_year::text
          and archived_at is null
        limit 1;
    end;
  end if;


  -- ----------------------------------------------------------
  -- MAAND
  -- ----------------------------------------------------------

  select id
  into v_month_id
  from public.document_folders
  where
    organization_id =
      p_organization_id
    and parent_id =
      v_year_id
    and slug =
      lpad(
        p_book_month::text,
        2,
        '0'
      )
    and archived_at is null
  limit 1;

  if v_month_id is null then
    begin
      insert into public.document_folders (
        organization_id,
        parent_id,
        name,
        slug,
        folder_type,
        book_year,
        book_month,
        sort_order
      )
      values (
        p_organization_id,
        v_year_id,
        v_month_name,
        lpad(
          p_book_month::text,
          2,
          '0'
        ),
        'category',
        p_book_year,
        p_book_month,
        p_book_month
      )
      returning id
      into v_month_id;

    exception
      when unique_violation then
        select id
        into v_month_id
        from public.document_folders
        where
          organization_id =
            p_organization_id
          and parent_id =
            v_year_id
          and slug =
            lpad(
              p_book_month::text,
              2,
              '0'
            )
          and archived_at is null
        limit 1;
    end;
  end if;


  -- ----------------------------------------------------------
  -- MAPTYPE
  -- ----------------------------------------------------------

  select id
  into v_type_id
  from public.document_folders
  where
    organization_id =
      p_organization_id
    and parent_id =
      v_month_id
    and slug =
      p_document_type
    and archived_at is null
  limit 1;

  if v_type_id is null then
    begin
      insert into public.document_folders (
        organization_id,
        parent_id,
        name,
        slug,
        folder_type,
        book_year,
        book_month,
        sort_order
      )
      values (
        p_organization_id,
        v_month_id,
        v_type_name,
        p_document_type,
        'category',
        p_book_year,
        p_book_month,
        0
      )
      returning id
      into v_type_id;

    exception
      when unique_violation then
        select id
        into v_type_id
        from public.document_folders
        where
          organization_id =
            p_organization_id
          and parent_id =
            v_month_id
          and slug =
            p_document_type
          and archived_at is null
        limit 1;
    end;
  end if;

  return v_type_id;

end;
$$;


revoke all
on function public.ensure_document_archive_folder(
  uuid,
  integer,
  integer,
  text
)
from public, anon, authenticated;


-- ============================================================
-- 4. KLANTDOCUMENT VERWERKEN
--
-- Status processed betekent voortaan:
-- classificatie afgerond -> automatisch archiveren.
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
  v_folder_id uuid;
  v_final_status text;
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

  select *
  into v_old
  from public.documents
  where
    id = p_document_id
    and organization_id =
      p_organization_id
    and archived_at is null
  for update;

  if not found then
    raise exception 'Document niet gevonden.';
  end if;

  if v_old.source <> 'customer' then
    raise exception 'Alleen klantdocumenten kunnen hier worden verwerkt.';
  end if;

  if v_old.status = 'archived' then
    raise exception 'Dit document is al gearchiveerd.';
  end if;


  -- Een definitief verwerkt document moet weten
  -- in welk jaar en welke maand het hoort.
  if p_status = 'processed' then

    if p_book_year is null then
      raise exception 'Kies eerst een boekjaar.';
    end if;

    if p_book_month is null then
      raise exception 'Kies eerst een maand.';
    end if;

    v_folder_id :=
      public.ensure_document_archive_folder(
        p_organization_id,
        p_book_year,
        p_book_month,
        p_document_type
      );

    v_final_status :=
      'archived';

  else

    v_folder_id := null;
    v_final_status := p_status;

  end if;


  update public.documents
  set
    status =
      v_final_status,

    document_type =
      p_document_type,

    book_year =
      p_book_year,

    book_month =
      p_book_month,

    folder_id =
      case
        when v_final_status = 'archived'
          then v_folder_id
        else folder_id
      end,

    archive_folder_name =
      case
        when v_final_status = 'archived'
          then public.document_type_folder_name(
            p_document_type
          )
        else archive_folder_name
      end,

    customer_action_required =
      (
        v_final_status =
          'needs_customer_action'
      ),

    processed_at =
      case
        when v_final_status = 'archived'
          then coalesce(
            processed_at,
            now()
          )
        else null
      end

  where id =
    p_document_id

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
      'status',
      v_old.status,
      'documentType',
      v_old.document_type,
      'bookYear',
      v_old.book_year,
      'bookMonth',
      v_old.book_month
    ),
    jsonb_build_object(
      'status',
      v_new.status,
      'documentType',
      v_new.document_type,
      'bookYear',
      v_new.book_year,
      'bookMonth',
      v_new.book_month
    ),
    v_user_id
  );


  if v_final_status = 'archived' then

    insert into public.document_events (
      organization_id,
      document_id,
      event_type,
      new_value,
      created_by
    )
    values (
      p_organization_id,
      p_document_id,
      'archived',
      jsonb_build_object(
        'bookYear',
        p_book_year,
        'bookMonth',
        p_book_month,
        'folder',
        public.document_type_folder_name(
          p_document_type
        )
      ),
      v_user_id
    );

  end if;


  return jsonb_build_object(
    'id',
    v_new.id,
    'status',
    v_new.status,
    'folderId',
    v_new.folder_id,
    'bookYear',
    v_new.book_year,
    'bookMonth',
    v_new.book_month,
    'archiveFolder',
    v_new.archive_folder_name
  );

end;
$$;


-- ============================================================
-- 5. OFFICE-UPLOAD RPC VERVANGEN
-- ============================================================

drop function if exists
  public.office_register_document_upload(
    uuid,
    uuid,
    text,
    text,
    text,
    bigint,
    text,
    boolean,
    boolean
  );


create function public.office_register_document_upload(
  p_document_id uuid,
  p_organization_id uuid,
  p_storage_path text,
  p_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_document_type text,
  p_book_year integer,
  p_book_month integer,
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
  v_folder_id uuid;
  v_wait_for_ack boolean;
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

  if p_book_year is null
     or p_book_year < 2000
     or p_book_year > 2100 then
    raise exception 'Kies een geldig boekjaar.';
  end if;

  if p_book_month is null
     or p_book_month < 1
     or p_book_month > 12 then
    raise exception 'Kies een geldige maand.';
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
      when 'application/pdf'
        then 'pdf'
      when 'image/png'
        then 'png'
      when 'image/jpeg'
        then 'jpg'
    end;


  v_expected_path :=
    p_organization_id::text
    || '/inbox/'
    || p_document_id::text
    || '/file.'
    || v_extension;


  if p_storage_path <>
    v_expected_path then
    raise exception 'Ongeldig opslagpad.';
  end if;


  if not exists (
    select 1
    from storage.objects so
    where
      so.bucket_id =
        'documents'
      and so.name =
        p_storage_path
  ) then
    raise exception 'Het ge?ploade bestand is niet gevonden.';
  end if;


  v_wait_for_ack :=
    p_visible_to_customer
    and p_acknowledgement_required;


  if not v_wait_for_ack then
    v_folder_id :=
      public.ensure_document_archive_folder(
        p_organization_id,
        p_book_year,
        p_book_month,
        p_document_type
      );
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
    book_year,
    book_month,
    folder_id,
    archive_folder_name,
    visible_to_customer,
    acknowledgement_required,
    customer_action_required,
    processed_at
  )
  values (
    p_document_id,
    p_organization_id,
    p_storage_path,
    trim(p_filename),
    p_mime_type,
    p_size_bytes,

    case
      when v_wait_for_ack
        then 'ready'
      else 'archived'
    end,

    v_user_id,
    'office',
    p_document_type,
    p_book_year,
    p_book_month,
    v_folder_id,

    case
      when v_wait_for_ack
        then null
      else public.document_type_folder_name(
        p_document_type
      )
    end,

    p_visible_to_customer,

    (
      p_visible_to_customer
      and p_acknowledgement_required
    ),

    false,

    case
      when v_wait_for_ack
        then null
      else now()
    end
  );


  select *
  into v_document
  from public.documents
  where id =
    p_document_id;


  insert into public.document_events (
    organization_id,
    document_id,
    event_type,
    new_value,
    created_by
  )
  values (
    p_organization_id,
    p_document_id,
    'uploaded',
    jsonb_build_object(
      'source',
      'office',
      'filename',
      trim(p_filename),
      'visibleToCustomer',
      p_visible_to_customer,
      'acknowledgementRequired',
      (
        p_visible_to_customer
        and p_acknowledgement_required
      )
    ),
    v_user_id
  );


  if not v_wait_for_ack then

    insert into public.document_events (
      organization_id,
      document_id,
      event_type,
      new_value,
      created_by
    )
    values (
      p_organization_id,
      p_document_id,
      'archived',
      jsonb_build_object(
        'bookYear',
        p_book_year,
        'bookMonth',
        p_book_month,
        'folder',
        public.document_type_folder_name(
          p_document_type
        )
      ),
      v_user_id
    );

  end if;


  return jsonb_build_object(
    'id',
    v_document.id,
    'status',
    v_document.status,
    'bookYear',
    v_document.book_year,
    'bookMonth',
    v_document.book_month,
    'folderId',
    v_document.folder_id
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
  integer,
  integer,
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
  integer,
  integer,
  boolean,
  boolean
)
to authenticated;


-- ============================================================
-- 6. ACKNOWLEDGE: NA BEVESTIGING AUTOMATISCH ARCHIVEREN
-- ============================================================

create or replace function public.acknowledge_document(
  p_organization_id uuid,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_document public.documents%rowtype;
  v_receipt public.document_receipts%rowtype;
  v_folder_id uuid;
  v_archived boolean := false;
begin

  v_user_id :=
    auth.uid();

  if v_user_id is null then
    raise exception 'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception 'Tweestapsverificatie is vereist.';
  end if;

  if not public.has_org_access(
    p_organization_id
  ) then
    raise exception 'Geen toegang tot deze onderneming.';
  end if;


  select *
  into v_document
  from public.documents
  where
    id = p_document_id
    and organization_id =
      p_organization_id
    and visible_to_customer =
      true
  for update;


  if not found then
    raise exception 'Document is niet zichtbaar voor deze klant.';
  end if;

  if v_document.source <> 'office' then
    raise exception 'Alleen een document van de administratie kan worden bevestigd.';
  end if;


  insert into public.document_receipts (
    organization_id,
    document_id,
    user_id,
    opened_at,
    acknowledged_at
  )
  values (
    p_organization_id,
    p_document_id,
    v_user_id,
    now(),
    now()
  )

  on conflict (
    document_id,
    user_id
  )

  do update
  set
    opened_at =
      coalesce(
        public.document_receipts.opened_at,
        now()
      ),

    acknowledged_at =
      coalesce(
        public.document_receipts.acknowledged_at,
        now()
      )

  returning *
  into v_receipt;


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
    'acknowledged',
    jsonb_build_object(
      'acknowledgedAt',
      v_receipt.acknowledged_at
    ),
    v_user_id

  where not exists (
    select 1
    from public.document_events e
    where
      e.document_id =
        p_document_id
      and e.event_type =
        'acknowledged'
      and e.created_by =
        v_user_id
  );


  -- Alleen automatisch archiveren als het document
  -- daarvoor volledig is geclassificeerd.
  if
    v_document.acknowledgement_required
    and v_document.book_year is not null
    and v_document.book_month is not null
  then

    v_folder_id :=
      public.ensure_document_archive_folder(
        p_organization_id,
        v_document.book_year,
        v_document.book_month,
        v_document.document_type
      );


    update public.documents
    set
      status =
        'archived',

      folder_id =
        v_folder_id,

      archive_folder_name =
        public.document_type_folder_name(
          v_document.document_type
        ),

      processed_at =
        coalesce(
          processed_at,
          now()
        ),

      customer_action_required =
        false

    where id =
      p_document_id;


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
      'archived',
      jsonb_build_object(
        'bookYear',
        v_document.book_year,
        'bookMonth',
        v_document.book_month,
        'folder',
        public.document_type_folder_name(
          v_document.document_type
        ),
        'reason',
        'customer_acknowledged'
      ),
      v_user_id

    where not exists (
      select 1
      from public.document_events e
      where
        e.document_id =
          p_document_id
        and e.event_type =
          'archived'
    );


    v_archived := true;

  end if;


  return jsonb_build_object(
    'documentId',
    p_document_id,
    'openedAt',
    v_receipt.opened_at,
    'acknowledgedAt',
    v_receipt.acknowledged_at,
    'archived',
    v_archived
  );

end;
$$;


commit;
