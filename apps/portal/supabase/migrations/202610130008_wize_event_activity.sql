begin;


-- ============================================================
-- WIZE EVENT ACTIVITY V1
--
-- Historie van wat Wize met een event heeft gedaan.
--
-- Geen nep-klantberichten in Communicatie.
-- Pas bij echte escalatie/reactie wordt conversation_id gebruikt.
-- ============================================================

create table if not exists
public.wize_event_activity (
  id uuid primary key
    default gen_random_uuid(),

  event_id uuid not null
    references public.wize_events(id)
    on delete cascade,

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  activity_type text not null
    check (
      activity_type in (
        'shown',
        'reminded',
        'customer_action',
        'escalated',
        'conversation_linked',
        'resolved'
      )
    ),

  actor_user_id uuid
    references public.profiles(id)
    on delete set null,

  conversation_id uuid
    references public.conversations(id)
    on delete set null,

  details jsonb not null
    default '{}'::jsonb,

  created_at timestamptz
    not null default now(),

  check (
    jsonb_typeof(details) =
      'object'
  )
);


create index if not exists
wize_event_activity_event_idx
on public.wize_event_activity (
  event_id,
  created_at desc
);


create index if not exists
wize_event_activity_org_idx
on public.wize_event_activity (
  organization_id,
  created_at desc
);


alter table
public.wize_event_activity
enable row level security;


revoke all
on public.wize_event_activity
from public, anon, authenticated;



-- ============================================================
-- ACTIVITY SCHRIJVEN
--
-- Alleen vanuit gecontroleerde Wize-flow.
-- Klant kan alleen activiteit schrijven bij event van eigen org.
-- ============================================================

create or replace function
public.wize_log_event_activity(
  p_event_id uuid,
  p_activity_type text,
  p_conversation_id uuid default null,
  p_details jsonb default '{}'::jsonb
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

  v_activity
    public.wize_event_activity%rowtype;
begin

  v_actor :=
    auth.uid();


  if v_actor is null then
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
    p_event_id;


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


  if p_activity_type not in (
    'shown',
    'reminded',
    'customer_action',
    'escalated',
    'conversation_linked',
    'resolved'
  ) then

    raise exception using
      errcode = '22023',
      message = 'Ongeldig Wize-activiteitstype.';

  end if;


  if
    p_conversation_id is not null

    and not exists (
      select 1
      from public.conversations conversation

      where
        conversation.id =
          p_conversation_id

        and conversation.organization_id =
          v_event.organization_id
    )
  then

    raise exception using
      errcode = '22023',
      message = 'Gesprek hoort niet bij deze onderneming.';

  end if;


  if
    p_details is null
    or jsonb_typeof(
      p_details
    ) <> 'object'
  then

    raise exception using
      errcode = '22023',
      message = 'Ongeldige Wize-activiteit.';

  end if;


  insert into
    public.wize_event_activity (
      event_id,
      organization_id,
      activity_type,
      actor_user_id,
      conversation_id,
      details
    )
  values (
    v_event.id,
    v_event.organization_id,
    p_activity_type,
    v_actor,
    p_conversation_id,
    p_details
  )

  returning *
  into v_activity;


  return
    jsonb_build_object(
      'id',
        v_activity.id,

      'eventId',
        v_activity.event_id,

      'activityType',
        v_activity.activity_type,

      'conversationId',
        v_activity.conversation_id,

      'createdAt',
        v_activity.created_at
    );

end;
$$;


revoke all
on function
public.wize_log_event_activity(
  uuid,
  text,
  uuid,
  jsonb
)
from public, anon;


grant execute
on function
public.wize_log_event_activity(
  uuid,
  text,
  uuid,
  jsonb
)
to authenticated;



-- ============================================================
-- OFFICE LEEST EVENT + ACTIVITEIT
-- ============================================================

create or replace function
public.office_wize_get_event_activity(
  p_organization_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;

  v_result jsonb;
begin

  perform
    public.wize_require_office_admin();


  v_limit :=
    greatest(
      1,
      least(
        coalesce(
          p_limit,
          100
        ),
        500
      )
    );


  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'eventId',
            event.id,

          'eventType',
            event.event_type,

          'eventStatus',
            event.status,

          'title',
            event.title,

          'conversationId',
            event.conversation_id,

          'activityId',
            activity.id,

          'activityType',
            activity.activity_type,

          'activityConversationId',
            activity.conversation_id,

          'activityCreatedAt',
            activity.created_at
        )

        order by
          activity.created_at desc
      ),
      '[]'::jsonb
    )
  into v_result

  from (
    select *
    from public.wize_event_activity
    where organization_id =
      p_organization_id

    order by created_at desc
    limit v_limit
  ) activity

  join public.wize_events event
    on event.id =
      activity.event_id;


  return
    jsonb_build_object(
      'organizationId',
        p_organization_id,

      'items',
        v_result
    );

end;
$$;


revoke all
on function
public.office_wize_get_event_activity(
  uuid,
  integer
)
from public, anon;


grant execute
on function
public.office_wize_get_event_activity(
  uuid,
  integer
)
to authenticated;


commit;
