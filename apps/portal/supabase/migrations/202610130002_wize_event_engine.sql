-- ============================================================
-- WIZE EVENT ENGINE V1
--
-- Persistente signalen voor Wize.
--
-- Voorbeelden:
-- - periodiek gesprek nodig
-- - document ontbreekt
-- - bankmutatie vraagt aandacht
-- - factuur is vervallen
-- - deadline nadert
--
-- Event lifecycle:
-- new
-- asked
-- snoozed
-- resolved
-- escalated
-- dismissed
--
-- SECURITY:
-- - geen directe tabeltoegang vanuit browser
-- - organization_id altijd server/database-side gecontroleerd
-- - klant ziet alleen events van eigen onderneming
-- - interne metadata wordt niet aan klant geretourneerd
-- ============================================================

begin;


-- ============================================================
-- 1. EVENTS
-- ============================================================

create table if not exists
public.wize_events (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  event_key text not null,

  event_type text not null,

  status text not null
    default 'new'
    check (
      status in (
        'new',
        'asked',
        'snoozed',
        'resolved',
        'escalated',
        'dismissed'
      )
    ),

  priority text not null
    default 'normal'
    check (
      priority in (
        'low',
        'normal',
        'high',
        'critical'
      )
    ),

  title text not null,

  customer_message text not null,

  source_type text,

  source_id uuid,

  conversation_id uuid
    references public.conversations(id)
    on delete set null,

  first_detected_at timestamptz
    not null default now(),

  last_checked_at timestamptz
    not null default now(),

  asked_at timestamptz,

  next_reminder_at timestamptz,

  resolved_at timestamptz,

  escalated_at timestamptz,

  dismissed_at timestamptz,

  metadata jsonb
    not null default '{}'::jsonb,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  unique (
    organization_id,
    event_key
  ),

  check (
    length(btrim(event_key))
      between 1 and 200
  ),

  check (
    event_type ~
      '^[a-z0-9][a-z0-9_.-]{0,119}$'
  ),

  check (
    length(btrim(title))
      between 1 and 200
  ),

  check (
    length(btrim(customer_message))
      between 1 and 5000
  ),

  check (
    source_type is null
    or source_type ~
      '^[a-z0-9][a-z0-9_.-]{0,119}$'
  ),

  check (
    jsonb_typeof(metadata) = 'object'
  )
);


create index if not exists
wize_events_org_status_idx
on public.wize_events (
  organization_id,
  status,
  priority,
  first_detected_at desc
);


create index if not exists
wize_events_reminder_idx
on public.wize_events (
  next_reminder_at
)
where
  status in (
    'new',
    'asked',
    'snoozed'
  );


create index if not exists
wize_events_source_idx
on public.wize_events (
  organization_id,
  source_type,
  source_id
)
where
  source_type is not null;


-- ============================================================
-- 2. RLS / DIRECTE TOEGANG BLOKKEREN
-- ============================================================

alter table
public.wize_events
enable row level security;


revoke all
on public.wize_events
from public, anon, authenticated;


-- ============================================================
-- 3. OFFICE EVENT UPSERT
--
-- Algemene event-aanmaak blijft Office-only.
--
-- Specifieke automatische detectors krijgen later hun eigen
-- beperkte RPC, zodat een klant nooit willekeurige events kan
-- fabriceren via een directe RPC-call.
-- ============================================================

create or replace function
public.office_wize_upsert_event(
  p_organization_id uuid,
  p_event_key text,
  p_event_type text,
  p_title text,
  p_customer_message text,
  p_priority text default 'normal',
  p_source_type text default null,
  p_source_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;

  v_event
    public.wize_events%rowtype;
begin

  v_actor :=
    public.wize_require_office_admin();


  -- ----------------------------------------------------------
  -- ORGANISATIE MOET ACTIEF ZIJN
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.organizations o

    join public.customer_relationships c
      on c.id =
        o.customer_relationship_id

    where
      o.id =
        p_organization_id

      and o.archived_at is null

      and c.archived_at is null

      and c.status = 'active'
  ) then

    raise exception using
      errcode = '22023',
      message = 'Onderneming niet gevonden.';

  end if;


  -- ----------------------------------------------------------
  -- VALIDATIE
  -- ----------------------------------------------------------

  if
    length(
      btrim(
        coalesce(
          p_event_key,
          ''
        )
      )
    ) not between 1 and 200

    or coalesce(
      p_event_type,
      ''
    ) !~
      '^[a-z0-9][a-z0-9_.-]{0,119}$'

    or length(
      btrim(
        coalesce(
          p_title,
          ''
        )
      )
    ) not between 1 and 200

    or length(
      btrim(
        coalesce(
          p_customer_message,
          ''
        )
      )
    ) not between 1 and 5000

    or p_priority not in (
      'low',
      'normal',
      'high',
      'critical'
    )

    or (
      p_source_type is not null
      and
      p_source_type !~
        '^[a-z0-9][a-z0-9_.-]{0,119}$'
    )

    or p_metadata is null

    or jsonb_typeof(
      p_metadata
    ) <> 'object'
  then

    raise exception using
      errcode = '22023',
      message = 'Ongeldig Wize-signaal.';

  end if;


  -- ----------------------------------------------------------
  -- UPSERT / DEDUPLICATIE
  --
  -- Zelfde event_key + organisatie =
  -- bestaand signaal bijwerken in plaats van dupliceren.
  --
  -- Een resolved/dismissed event wordt NIET vanzelf heropend.
  -- Een nieuwe detectie moet daarvoor een nieuwe event_key
  -- gebruiken, bijvoorbeeld appointment:q3:2027.
  -- ----------------------------------------------------------

  insert into
    public.wize_events (
      organization_id,
      event_key,
      event_type,
      status,
      priority,
      title,
      customer_message,
      source_type,
      source_id,
      first_detected_at,
      last_checked_at,
      metadata
    )
  values (
    p_organization_id,
    btrim(p_event_key),
    p_event_type,
    'new',
    p_priority,
    btrim(p_title),
    btrim(p_customer_message),
    p_source_type,
    p_source_id,
    now(),
    now(),
    p_metadata
  )

  on conflict (
    organization_id,
    event_key
  )

  do update
  set
    event_type =
      excluded.event_type,

    priority =
      excluded.priority,

    title =
      excluded.title,

    customer_message =
      excluded.customer_message,

    source_type =
      excluded.source_type,

    source_id =
      excluded.source_id,

    last_checked_at =
      now(),

    metadata =
      excluded.metadata,

    updated_at =
      now()

  returning *
  into
    v_event;


  -- ----------------------------------------------------------
  -- AUDIT
  --
  -- Geen customer_message / metadata in auditlog.
  -- ----------------------------------------------------------

  insert into
    public.audit_events (
      actor_id,
      organization_id,
      action,
      object_type,
      object_id,
      result,
      metadata
    )
  values (
    v_actor,
    p_organization_id,
    'wize.event_upserted',
    'wize_event',
    v_event.id,
    'success',
    jsonb_build_object(
      'eventKey',
        v_event.event_key,

      'eventType',
        v_event.event_type,

      'status',
        v_event.status,

      'priority',
        v_event.priority
    )
  );


  return
    jsonb_build_object(
      'id',
        v_event.id,

      'organizationId',
        v_event.organization_id,

      'eventKey',
        v_event.event_key,

      'eventType',
        v_event.event_type,

      'status',
        v_event.status,

      'priority',
        v_event.priority,

      'title',
        v_event.title,

      'customerMessage',
        v_event.customer_message,

      'firstDetectedAt',
        v_event.first_detected_at,

      'lastCheckedAt',
        v_event.last_checked_at
    );

end;
$$;


revoke all
on function
public.office_wize_upsert_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  jsonb
)
from public, anon;

grant execute
on function
public.office_wize_upsert_event(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  uuid,
  jsonb
)
to authenticated;


-- ============================================================
-- 4. ACTIEVE EVENTS VOOR WIZE / KLANT
--
-- Alleen veilige velden.
-- Geen interne metadata.
-- Geen andere ondernemingen.
-- ============================================================

create or replace function
public.wize_get_active_events(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_events jsonb;
begin

  v_user_id :=
    auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Niet ingelogd.';
  end if;


  if not public.has_aal2() then
    raise exception using
      errcode = '42501',
      message = 'Tweestapsverificatie is vereist.';
  end if;


  -- ----------------------------------------------------------
  -- TENANT CHECK
  -- ----------------------------------------------------------

  if public.is_office_user() then

    perform
      public.wize_require_office_admin();

  else

    if not public.has_org_access(
      p_organization_id
    ) then

      raise exception using
        errcode = '42501',
        message = 'Geen toegang tot deze onderneming.';

    end if;

  end if;


  -- ----------------------------------------------------------
  -- EVENTS
  -- ----------------------------------------------------------

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',
            e.id,

          'eventKey',
            e.event_key,

          'eventType',
            e.event_type,

          'status',
            e.status,

          'priority',
            e.priority,

          'title',
            e.title,

          'customerMessage',
            e.customer_message,

          'conversationId',
            e.conversation_id,

          'firstDetectedAt',
            e.first_detected_at,

          'lastCheckedAt',
            e.last_checked_at,

          'askedAt',
            e.asked_at,

          'nextReminderAt',
            e.next_reminder_at
        )
        order by
          case
            e.priority
            when 'critical' then 1
            when 'high' then 2
            when 'normal' then 3
            else 4
          end,

          e.first_detected_at asc
      ),
      '[]'::jsonb
    )
  into
    v_events
  from
    public.wize_events e
  where
    e.organization_id =
      p_organization_id

    and e.status in (
      'new',
      'asked',
      'snoozed'
    )

    and (
      e.status <> 'snoozed'

      or e.next_reminder_at is null

      or e.next_reminder_at <= now()
    );


  return
    jsonb_build_object(
      'organizationId',
        p_organization_id,

      'events',
        v_events
    );

end;
$$;


revoke all
on function
public.wize_get_active_events(uuid)
from public, anon;

grant execute
on function
public.wize_get_active_events(uuid)
to authenticated;


-- ============================================================
-- 5. EVENT ALS GEVRAAGD MARKEREN
--
-- Voor wanneer Wize het signaal daadwerkelijk aan de klant
-- heeft getoond.
--
-- Alleen klant met toegang tot organisatie of Office.
-- ============================================================

create or replace function
public.wize_mark_event_asked(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_event
    public.wize_events%rowtype;
begin

  v_user_id :=
    auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Niet ingelogd.';
  end if;


  if not public.has_aal2() then
    raise exception using
      errcode = '42501',
      message = 'Tweestapsverificatie is vereist.';
  end if;


  select *
  into v_event
  from public.wize_events
  where id =
    p_event_id
  for update;


  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Wize-signaal niet gevonden.';
  end if;


  if public.is_office_user() then

    perform
      public.wize_require_office_admin();

  elsif not public.has_org_access(
    v_event.organization_id
  ) then

    raise exception using
      errcode = '42501',
      message = 'Geen toegang tot dit Wize-signaal.';

  end if;


  if v_event.status = 'new' then

    update public.wize_events
    set
      status =
        'asked',

      asked_at =
        coalesce(
          asked_at,
          now()
        ),

      updated_at =
        now()

    where id =
      p_event_id

    returning *
    into v_event;

  end if;


  return
    jsonb_build_object(
      'id',
        v_event.id,

      'status',
        v_event.status,

      'askedAt',
        v_event.asked_at
    );

end;
$$;


revoke all
on function
public.wize_mark_event_asked(uuid)
from public, anon;

grant execute
on function
public.wize_mark_event_asked(uuid)
to authenticated;


-- ============================================================
-- 6. KLANTACTIES
--
-- Klant mag:
-- - later herinneren
-- - melding wegzetten
--
-- Klant mag NIET zelf:
-- - events fabriceren
-- - escalated zetten
-- - arbitrary metadata wijzigen
-- ============================================================

create or replace function
public.wize_customer_event_action(
  p_event_id uuid,
  p_action text,
  p_snooze_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_event
    public.wize_events%rowtype;
begin

  v_user_id :=
    auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Niet ingelogd.';
  end if;


  if not public.has_aal2() then
    raise exception using
      errcode = '42501',
      message = 'Tweestapsverificatie is vereist.';
  end if;


  select *
  into v_event
  from public.wize_events
  where id =
    p_event_id
  for update;


  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Wize-signaal niet gevonden.';
  end if;


  if not public.has_org_access(
    v_event.organization_id
  ) then

    raise exception using
      errcode = '42501',
      message = 'Geen toegang tot dit Wize-signaal.';

  end if;


  if p_action = 'snooze' then

    if
      p_snooze_until is null
      or p_snooze_until <= now()
      or p_snooze_until > now() + interval '90 days'
    then

      raise exception using
        errcode = '22023',
        message = 'Ongeldig herinneringsmoment.';

    end if;


    update public.wize_events
    set
      status =
        'snoozed',

      next_reminder_at =
        p_snooze_until,

      updated_at =
        now()

    where id =
      p_event_id

    returning *
    into v_event;


  elsif p_action = 'dismiss' then

    update public.wize_events
    set
      status =
        'dismissed',

      dismissed_at =
        now(),

      next_reminder_at =
        null,

      updated_at =
        now()

    where id =
      p_event_id

    returning *
    into v_event;


  else

    raise exception using
      errcode = '22023',
      message = 'Ongeldige Wize-actie.';

  end if;


  return
    jsonb_build_object(
      'id',
        v_event.id,

      'status',
        v_event.status,

      'nextReminderAt',
        v_event.next_reminder_at,

      'dismissedAt',
        v_event.dismissed_at
    );

end;
$$;


revoke all
on function
public.wize_customer_event_action(
  uuid,
  text,
  timestamptz
)
from public, anon;

grant execute
on function
public.wize_customer_event_action(
  uuid,
  text,
  timestamptz
)
to authenticated;


-- ============================================================
-- 7. OFFICE EVENT STATUS
--
-- Voor oplossen / escaleren / herstellen.
-- ============================================================

create or replace function
public.office_wize_set_event_status(
  p_event_id uuid,
  p_status text,
  p_conversation_id uuid default null,
  p_next_reminder_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;

  v_event
    public.wize_events%rowtype;
begin

  v_actor :=
    public.wize_require_office_admin();


  if p_status not in (
    'new',
    'asked',
    'snoozed',
    'resolved',
    'escalated',
    'dismissed'
  ) then

    raise exception using
      errcode = '22023',
      message = 'Ongeldige Wize-status.';

  end if;


  select *
  into v_event
  from public.wize_events
  where id =
    p_event_id
  for update;


  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Wize-signaal niet gevonden.';
  end if;


  if
    p_conversation_id is not null

    and not exists (
      select 1
      from public.conversations c
      where
        c.id =
          p_conversation_id

        and c.organization_id =
          v_event.organization_id
    )
  then

    raise exception using
      errcode = '22023',
      message = 'Gesprek hoort niet bij deze onderneming.';

  end if;


  update public.wize_events
  set
    status =
      p_status,

    conversation_id =
      coalesce(
        p_conversation_id,
        conversation_id
      ),

    asked_at =
      case
        when p_status = 'asked'
          then coalesce(
            asked_at,
            now()
          )
        else asked_at
      end,

    resolved_at =
      case
        when p_status = 'resolved'
          then now()
        else null
      end,

    escalated_at =
      case
        when p_status = 'escalated'
          then now()
        else null
      end,

    dismissed_at =
      case
        when p_status = 'dismissed'
          then now()
        else null
      end,

    next_reminder_at =
      case
        when p_status = 'snoozed'
          then p_next_reminder_at
        else null
      end,

    updated_at =
      now()

  where id =
    p_event_id

  returning *
  into v_event;


  insert into
    public.audit_events (
      actor_id,
      organization_id,
      action,
      object_type,
      object_id,
      result,
      metadata
    )
  values (
    v_actor,
    v_event.organization_id,
    'wize.event_status_changed',
    'wize_event',
    v_event.id,
    'success',
    jsonb_build_object(
      'eventKey',
        v_event.event_key,

      'status',
        v_event.status
    )
  );


  return
    jsonb_build_object(
      'id',
        v_event.id,

      'organizationId',
        v_event.organization_id,

      'status',
        v_event.status,

      'conversationId',
        v_event.conversation_id,

      'nextReminderAt',
        v_event.next_reminder_at,

      'resolvedAt',
        v_event.resolved_at,

      'escalatedAt',
        v_event.escalated_at,

      'dismissedAt',
        v_event.dismissed_at
    );

end;
$$;


revoke all
on function
public.office_wize_set_event_status(
  uuid,
  text,
  uuid,
  timestamptz
)
from public, anon;

grant execute
on function
public.office_wize_set_event_status(
  uuid,
  text,
  uuid,
  timestamptz
)
to authenticated;


commit;
