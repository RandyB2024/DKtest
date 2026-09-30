-- ============================================================
-- 202609300007_documents_foundation.sql
--
-- Uitbreiding bestaande documentenmodule.
--
-- Bestaande public.documents wordt BEHOUDEN.
-- Nieuwe functionaliteit:
-- - veilige klant/Office scheiding
-- - inbox / verwerking / archief
-- - mappen
-- - boekjaar / maand
-- - audittrail
-- ============================================================

begin;


-- ============================================================
-- 1. DOCUMENT FOLDERS
-- ============================================================

create table if not exists public.document_folders (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  parent_id uuid null
    references public.document_folders(id)
    on delete cascade,

  name text not null,

  slug text not null,

  folder_type text not null
    check (
      folder_type in (
        'inbox',
        'archive',
        'category'
      )
    ),

  book_year integer null,

  book_month integer null
    check (
      book_month is null
      or book_month between 1 and 12
    ),

  sort_order integer not null
    default 0,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  archived_at timestamptz null
);


create index if not exists
  document_folders_org_idx
on public.document_folders(
  organization_id
);


create index if not exists
  document_folders_parent_idx
on public.document_folders(
  parent_id
);


create unique index if not exists
  document_folders_org_parent_slug_unique
on public.document_folders(
  organization_id,
  coalesce(
    parent_id,
    '00000000-0000-0000-0000-000000000000'::uuid
  ),
  slug
)
where archived_at is null;


-- ============================================================
-- 2. BESTAANDE DOCUMENTS-TABEL UITBREIDEN
--
-- Bestaande kolommen blijven behouden:
-- id
-- organization_id
-- storage_path
-- filename
-- mime_type
-- size_bytes
-- status
-- uploaded_by
-- created_at
-- archived_at
-- ============================================================

alter table public.documents
  add column if not exists folder_id uuid null
    references public.document_folders(id)
    on delete set null;


alter table public.documents
  add column if not exists source text;


alter table public.documents
  add column if not exists document_type text;


alter table public.documents
  add column if not exists book_year integer null;


alter table public.documents
  add column if not exists book_month integer null;


alter table public.documents
  add column if not exists archive_folder_name text null;


alter table public.documents
  add column if not exists visible_to_customer boolean;


alter table public.documents
  add column if not exists customer_action_required boolean;


alter table public.documents
  add column if not exists assigned_to uuid null
    references public.profiles(id);


alter table public.documents
  add column if not exists notes text null;


alter table public.documents
  add column if not exists processed_at timestamptz null;


alter table public.documents
  add column if not exists updated_at timestamptz;


-- ============================================================
-- 3. BESTAANDE DATA NORMALISEREN
-- ============================================================

update public.documents
set
  source = 'customer'
where source is null;


update public.documents
set
  document_type = 'other'
where document_type is null;


update public.documents
set
  visible_to_customer = true
where visible_to_customer is null;


update public.documents
set
  customer_action_required = false
where customer_action_required is null;


update public.documents
set
  updated_at = created_at
where updated_at is null;


-- Oude status 'uploaded' wordt onze nieuwe inboxstatus.
update public.documents
set
  status = 'new'
where status = 'uploaded';


-- ============================================================
-- 4. DEFAULTS / NOT NULL
-- ============================================================

alter table public.documents
  alter column source
  set default 'customer';


alter table public.documents
  alter column source
  set not null;


alter table public.documents
  alter column document_type
  set default 'other';


alter table public.documents
  alter column document_type
  set not null;


alter table public.documents
  alter column visible_to_customer
  set default true;


alter table public.documents
  alter column visible_to_customer
  set not null;


alter table public.documents
  alter column customer_action_required
  set default false;


alter table public.documents
  alter column customer_action_required
  set not null;


alter table public.documents
  alter column updated_at
  set default now();


alter table public.documents
  alter column updated_at
  set not null;


alter table public.documents
  alter column status
  set default 'new';


-- ============================================================
-- 5. CHECK CONSTRAINTS
-- ============================================================

alter table public.documents
  drop constraint if exists
  documents_source_check;


alter table public.documents
  add constraint
  documents_source_check
  check (
    source in (
      'office',
      'customer',
      'email',
      'system'
    )
  );


alter table public.documents
  drop constraint if exists
  documents_status_check;


alter table public.documents
  add constraint
  documents_status_check
  check (
    status in (
      'new',
      'in_review',
      'needs_customer_action',
      'ready',
      'processed',
      'archived'
    )
  );


alter table public.documents
  drop constraint if exists
  documents_document_type_check;


alter table public.documents
  add constraint
  documents_document_type_check
  check (
    document_type in (
      'purchase_invoice',
      'sales_invoice',
      'bank_document',
      'tax_document',
      'payroll',
      'contract',
      'other'
    )
  );


alter table public.documents
  drop constraint if exists
  documents_book_month_check;


alter table public.documents
  add constraint
  documents_book_month_check
  check (
    book_month is null
    or book_month between 1 and 12
  );


-- ============================================================
-- 6. INDEXEN
-- ============================================================

create index if not exists
  documents_folder_idx
on public.documents(
  folder_id
);


create index if not exists
  documents_archive_idx
on public.documents(
  organization_id,
  book_year,
  book_month
);


create index if not exists
  documents_active_idx
on public.documents(
  organization_id,
  status,
  created_at desc
);


-- ============================================================
-- 7. DOCUMENT EVENTS / AUDIT
-- ============================================================

create table if not exists public.document_events (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  document_id uuid not null
    references public.documents(id)
    on delete cascade,

  event_type text not null
    check (
      event_type in (
        'uploaded',
        'status_changed',
        'moved',
        'archived',
        'restored',
        'note_added',
        'visibility_changed'
      )
    ),

  old_value jsonb null,

  new_value jsonb null,

  created_by uuid not null
    references public.profiles(id),

  created_at timestamptz not null
    default now()
);


create index if not exists
  document_events_document_idx
on public.document_events(
  document_id,
  created_at desc
);


create index if not exists
  document_events_org_idx
on public.document_events(
  organization_id,
  created_at desc
);


-- ============================================================
-- 8. FOLDER ↔ DOCUMENT ORGANISATIECONTROLE
-- ============================================================

create or replace function public.validate_document_folder_org()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_folder_org uuid;
begin

  if new.folder_id is null then
    return new;
  end if;

  select
    organization_id
  into
    v_folder_org
  from public.document_folders
  where id = new.folder_id;


  if v_folder_org is null then
    raise exception
      'Documentmap bestaat niet.';
  end if;


  if v_folder_org <> new.organization_id then
    raise exception
      'Document en map moeten bij dezelfde organisatie horen.';
  end if;


  return new;

end;
$$;


drop trigger if exists
  trg_validate_document_folder_org
on public.documents;


create trigger
  trg_validate_document_folder_org
before insert or update
on public.documents
for each row
execute function
  public.validate_document_folder_org();


-- ============================================================
-- 9. UPDATED_AT
-- ============================================================

create or replace function public.touch_document_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  new.updated_at := now();

  return new;

end;
$$;


drop trigger if exists
  trg_touch_document_updated_at
on public.documents;


create trigger
  trg_touch_document_updated_at
before update
on public.documents
for each row
execute function
  public.touch_document_updated_at();


-- ============================================================
-- 10. RLS
-- ============================================================

alter table public.document_folders
  enable row level security;

alter table public.documents
  enable row level security;

alter table public.document_events
  enable row level security;


-- ============================================================
-- 11. OUDE TE BREDE DOCUMENT POLICY VERWIJDEREN
--
-- Heel belangrijk:
-- deze oude policy gaf klantaccounts ook update/delete.
-- ============================================================

drop policy if exists
  documents_access
on public.documents;


-- Eventuele policies uit eerdere mislukte/handmatige tests.
drop policy if exists
  documents_select
on public.documents;

drop policy if exists
  documents_insert
on public.documents;

drop policy if exists
  documents_office_update
on public.documents;


-- ============================================================
-- 12. DOCUMENT FOLDERS - READ
-- ============================================================

drop policy if exists
  document_folders_select
on public.document_folders;


create policy
  document_folders_select
on public.document_folders
for select
to authenticated
using (
  public.has_aal2()
  and (
    public.has_org_access(
      organization_id
    )
    or public.is_office_user()
  )
);


-- ============================================================
-- 13. DOCUMENT FOLDERS - OFFICE WRITE
-- ============================================================

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
  and public.is_office_user()
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
  and public.is_office_user()
)
with check (
  public.has_aal2()
  and public.is_office_user()
);


-- Geen delete-policy:
-- folders worden niet rechtstreeks verwijderd.


-- ============================================================
-- 14. DOCUMENTS - READ
--
-- Office:
-- alle documenten.
--
-- Klant:
-- alleen documenten van eigen organisatie
-- EN alleen als visible_to_customer = true.
-- ============================================================

create policy
  documents_select
on public.documents
for select
to authenticated
using (
  public.has_aal2()
  and (
    public.is_office_user()
    or (
      public.has_org_access(
        organization_id
      )
      and visible_to_customer = true
    )
  )
);


-- ============================================================
-- 15. DOCUMENTS - INSERT
--
-- Klant:
-- eigen organisatie
-- uploaded_by = eigen account
-- source = customer
--
-- Office:
-- source = office
-- uploaded_by = eigen account
-- ============================================================

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
      public.has_org_access(
        organization_id
      )
      and source = 'customer'
    )
    or (
      public.is_office_user()
      and source = 'office'
    )
  )
);


-- ============================================================
-- 16. DOCUMENTS - UPDATE
--
-- Alleen Office.
-- Klanten kunnen dus NIET zelf:
-- - status wijzigen
-- - document archiveren
-- - andere organisatie instellen
-- - zichtbaarheid wijzigen
-- ============================================================

create policy
  documents_office_update
on public.documents
for update
to authenticated
using (
  public.has_aal2()
  and public.is_office_user()
)
with check (
  public.has_aal2()
  and public.is_office_user()
);


-- GEEN DELETE POLICY.
-- Een document wordt gearchiveerd, niet direct verwijderd.


-- ============================================================
-- 17. DOCUMENT EVENTS
-- ============================================================

drop policy if exists
  document_events_select
on public.document_events;


create policy
  document_events_select
on public.document_events
for select
to authenticated
using (
  public.has_aal2()
  and (
    public.has_org_access(
      organization_id
    )
    or public.is_office_user()
  )
);


drop policy if exists
  document_events_insert
on public.document_events;


create policy
  document_events_insert
on public.document_events
for insert
to authenticated
with check (
  public.has_aal2()
  and created_by = auth.uid()
  and (
    public.has_org_access(
      organization_id
    )
    or public.is_office_user()
  )
);


-- Geen update/delete van auditregels.


commit;