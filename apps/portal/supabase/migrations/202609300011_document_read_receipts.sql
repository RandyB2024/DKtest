-- ============================================================
-- 202609300011_document_read_receipts.sql
--
-- Leesbevestigingen voor documenten die Office aan klanten stuurt.
--
-- Administratieve documentstatus en leesstatus blijven bewust
-- gescheiden.
-- ============================================================

begin;


-- ============================================================
-- 1. OPTIONELE VERPLICHTE LEESBEVESTIGING
-- ============================================================

alter table public.documents
  add column if not exists
    acknowledgement_required boolean;


update public.documents
set
  acknowledgement_required =
    false
where
  acknowledgement_required
    is null;


alter table public.documents
  alter column
    acknowledgement_required
  set default false;


alter table public.documents
  alter column
    acknowledgement_required
  set not null;


-- ============================================================
-- 2. RECEIPTS PER GEBRUIKER
--
-- Hiermee ondersteunen we ook meerdere gebruikers per klant.
-- ============================================================

create table if not exists
  public.document_receipts (
    id uuid primary key
      default gen_random_uuid(),

    organization_id uuid not null
      references public.organizations(id)
      on delete cascade,

    document_id uuid not null
      references public.documents(id)
      on delete cascade,

    user_id uuid not null
      references public.profiles(id)
      on delete cascade,

    opened_at timestamptz null,

    acknowledged_at timestamptz null,

    created_at timestamptz not null
      default now(),

    updated_at timestamptz not null
      default now(),

    unique (
      document_id,
      user_id
    )
  );


create index if not exists
  document_receipts_org_idx
on public.document_receipts(
  organization_id,
  document_id
);


create index if not exists
  document_receipts_user_idx
on public.document_receipts(
  user_id,
  updated_at desc
);


-- ============================================================
-- 3. ORGANISATIE-INTEGRITEIT
-- ============================================================

create or replace function
  public.validate_document_receipt_org()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_document_org uuid;
begin

  select
    organization_id
  into
    v_document_org
  from public.documents
  where id =
    new.document_id;

  if v_document_org is null then
    raise exception
      'Document bestaat niet.';
  end if;

  if v_document_org <>
    new.organization_id then
    raise exception
      'Document en leesbevestiging moeten bij dezelfde organisatie horen.';
  end if;

  return new;

end;
$$;


drop trigger if exists
  trg_validate_document_receipt_org
on public.document_receipts;


create trigger
  trg_validate_document_receipt_org
before insert or update
on public.document_receipts
for each row
execute function
  public.validate_document_receipt_org();


-- ============================================================
-- 4. UPDATED_AT
-- ============================================================

create or replace function
  public.touch_document_receipt_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  new.updated_at :=
    now();

  return new;

end;
$$;


drop trigger if exists
  trg_touch_document_receipt_updated_at
on public.document_receipts;


create trigger
  trg_touch_document_receipt_updated_at
before update
on public.document_receipts
for each row
execute function
  public.touch_document_receipt_updated_at();


-- ============================================================
-- 5. RLS
--
-- Klant ziet uitsluitend eigen receipts.
-- Office mag receipts lezen.
-- Writes verlopen uitsluitend via gecontroleerde RPC's.
-- ============================================================

alter table
  public.document_receipts
enable row level security;


drop policy if exists
  document_receipts_select
on public.document_receipts;


create policy
  document_receipts_select
on public.document_receipts
for select
to authenticated
using (
  public.has_aal2()
  and (
    (
      user_id =
        auth.uid()
      and public.has_org_access(
        organization_id
      )
    )
    or public.is_office_user()
  )
);


-- Geen directe INSERT / UPDATE / DELETE policies.


-- ============================================================
-- 6. AUDIT EVENT TYPES UITBREIDEN
-- ============================================================

alter table public.document_events
  drop constraint if exists
    document_events_event_type_check;


alter table public.document_events
  add constraint
    document_events_event_type_check
  check (
    event_type in (
      'uploaded',
      'opened',
      'acknowledged',
      'status_changed',
      'moved',
      'archived',
      'restored',
      'note_added',
      'visibility_changed'
    )
  );


-- ============================================================
-- 7. DOCUMENT GEOPEND
--
-- Dit is GEEN leesbevestiging.
-- Het registreert alleen dat het document is geopend.
-- ============================================================

create or replace function
  public.mark_document_opened(
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
  v_document
    public.documents%rowtype;
  v_receipt
    public.document_receipts%rowtype;
begin

  v_user_id :=
    auth.uid();

  if v_user_id is null then
    raise exception
      'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception
      'Tweestapsverificatie is vereist.';
  end if;

  if not public.has_org_access(
    p_organization_id
  ) then
    raise exception
      'Geen toegang tot deze onderneming.';
  end if;

  select *
  into
    v_document
  from public.documents
  where
    id =
      p_document_id
    and organization_id =
      p_organization_id
    and visible_to_customer =
      true;

  if not found then
    raise exception
      'Document is niet zichtbaar voor deze klant.';
  end if;

  if v_document.source <>
    'office' then

    return jsonb_build_object(
      'documentId',
      p_document_id,
      'openedAt',
      null,
      'acknowledgedAt',
      null
    );

  end if;

  insert into
    public.document_receipts (
      organization_id,
      document_id,
      user_id,
      opened_at
    )
  values (
    p_organization_id,
    p_document_id,
    v_user_id,
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
        excluded.opened_at
      )
  returning *
  into
    v_receipt;

  insert into
    public.document_events (
      organization_id,
      document_id,
      event_type,
      new_value,
      created_by
    )
  select
    p_organization_id,
    p_document_id,
    'opened',
    jsonb_build_object(
      'openedAt',
      v_receipt.opened_at
    ),
    v_user_id
  where not exists (
    select 1
    from public.document_events e
    where
      e.document_id =
        p_document_id
      and e.event_type =
        'opened'
      and e.created_by =
        v_user_id
  );

  return jsonb_build_object(
    'documentId',
    p_document_id,
    'openedAt',
    v_receipt.opened_at,
    'acknowledgedAt',
    v_receipt.acknowledged_at
  );

end;
$$;


-- ============================================================
-- 8. KLANT BEVESTIGT EXPLICIET "GELEZEN"
-- ============================================================

create or replace function
  public.acknowledge_document(
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
  v_document
    public.documents%rowtype;
  v_receipt
    public.document_receipts%rowtype;
begin

  v_user_id :=
    auth.uid();

  if v_user_id is null then
    raise exception
      'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception
      'Tweestapsverificatie is vereist.';
  end if;

  if not public.has_org_access(
    p_organization_id
  ) then
    raise exception
      'Geen toegang tot deze onderneming.';
  end if;

  select *
  into
    v_document
  from public.documents
  where
    id =
      p_document_id
    and organization_id =
      p_organization_id
    and visible_to_customer =
      true;

  if not found then
    raise exception
      'Document is niet zichtbaar voor deze klant.';
  end if;

  if v_document.source <>
    'office' then
    raise exception
      'Alleen een inkomend document van de administratie kan worden bevestigd.';
  end if;

  insert into
    public.document_receipts (
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
  into
    v_receipt;

  insert into
    public.document_events (
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

  return jsonb_build_object(
    'documentId',
    p_document_id,
    'openedAt',
    v_receipt.opened_at,
    'acknowledgedAt',
    v_receipt.acknowledged_at
  );

end;
$$;


-- ============================================================
-- 9. FUNCTION PERMISSIONS
-- ============================================================

revoke all
on function
  public.mark_document_opened(
    uuid,
    uuid
  )
from public, anon;


grant execute
on function
  public.mark_document_opened(
    uuid,
    uuid
  )
to authenticated;


revoke all
on function
  public.acknowledge_document(
    uuid,
    uuid
  )
from public, anon;


grant execute
on function
  public.acknowledge_document(
    uuid,
    uuid
  )
to authenticated;


commit;
