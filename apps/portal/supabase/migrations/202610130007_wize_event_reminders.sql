begin;


-- ============================================================
-- WIZE EVENT REMINDERS V1
--
-- Doel:
-- - nieuwe events direct tonen;
-- - na tonen status = asked;
-- - niet bij iedere login opnieuw tonen;
-- - bank/document na 3 dagen opnieuw;
-- - afspraak na 7 dagen opnieuw;
-- - snooze blijft eigen datum gebruiken.
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

  v_next_reminder_at timestamptz;
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


  if v_event.status not in (
    'new',
    'asked'
  ) then

    return
      jsonb_build_object(
        'id',
          v_event.id,

        'status',
          v_event.status,

        'askedAt',
          v_event.asked_at,

        'nextReminderAt',
          v_event.next_reminder_at
      );

  end if;


  v_next_reminder_at :=
    case
      when v_event.event_type =
        'appointment_due'
        then now() + interval '7 days'

      when v_event.event_type =
        'bank_document_missing'
        then now() + interval '3 days'

      else
        now() + interval '3 days'
    end;


  update public.wize_events
  set
    status =
      'asked',

    asked_at =
      coalesce(
        asked_at,
        now()
      ),

    next_reminder_at =
      v_next_reminder_at,

    updated_at =
      now()

  where id =
    p_event_id

  returning *
  into v_event;


  return
    jsonb_build_object(
      'id',
        v_event.id,

      'status',
        v_event.status,

      'askedAt',
        v_event.asked_at,

      'nextReminderAt',
        v_event.next_reminder_at
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

  from public.wize_events e

  where
    e.organization_id =
      p_organization_id

    and (

      e.status =
        'new'

      or (

        e.status =
          'asked'

        and (

          e.next_reminder_at
            is null

          or e.next_reminder_at <=
            now()

        )
      )

      or (

        e.status =
          'snoozed'

        and (

          e.next_reminder_at
            is null

          or e.next_reminder_at <=
            now()

        )
      )

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


commit;
