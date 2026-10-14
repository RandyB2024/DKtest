begin;


-- ============================================================
-- WIZE OFFICE SIGNAL OVERVIEW V1
--
-- Geeft Bestemd Office een overzicht van actieve Wize-events.
--
-- Status voor Office:
-- new             = nieuw signaal
-- waiting_customer = Wize heeft gevraagd, wachtperiode loopt
-- reminder_due    = opnieuw aandacht nodig
-- snoozed         = bewust uitgesteld
--
-- Alleen Office.
-- ============================================================


create or replace function
public.office_wize_get_signal_overview(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid;

  v_items jsonb;

  v_new integer;
  v_waiting integer;
  v_reminder integer;
  v_snoozed integer;
begin

  v_actor :=
    public.wize_require_office_admin();


  if not exists (
    select 1

    from public.organizations organization

    join public.customer_relationships relationship
      on relationship.id =
        organization.customer_relationship_id

    where
      organization.id =
        p_organization_id

      and organization.archived_at
        is null

      and relationship.archived_at
        is null

      and relationship.status =
        'active'
  ) then

    raise exception using
      errcode = '22023',
      message = 'Onderneming niet gevonden.';

  end if;


  select
    count(*) filter (
      where event.status =
        'new'
    ),

    count(*) filter (
      where
        event.status =
          'asked'

        and (
          event.next_reminder_at is null
          or event.next_reminder_at > now()
        )
    ),

    count(*) filter (
      where
        event.status in (
          'asked',
          'snoozed'
        )

        and event.next_reminder_at
          is not null

        and event.next_reminder_at <=
          now()
    ),

    count(*) filter (
      where
        event.status =
          'snoozed'

        and (
          event.next_reminder_at is null
          or event.next_reminder_at > now()
        )
    )

  into
    v_new,
    v_waiting,
    v_reminder,
    v_snoozed

  from public.wize_events event

  where
    event.organization_id =
      p_organization_id

    and event.status in (
      'new',
      'asked',
      'snoozed'
    );


  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',
            event.id,

          'eventType',
            event.event_type,

          'eventKey',
            event.event_key,

          'title',
            event.title,

          'priority',
            event.priority,

          'status',
            event.status,

          'officeState',
            case

              when event.status =
                'new'
                then 'new'

              when
                event.status in (
                  'asked',
                  'snoozed'
                )

                and event.next_reminder_at
                  is not null

                and event.next_reminder_at <=
                  now()
                then 'reminder_due'

              when event.status =
                'asked'
                then 'waiting_customer'

              when event.status =
                'snoozed'
                then 'snoozed'

              else
                'waiting_customer'

            end,

          'firstDetectedAt',
            event.first_detected_at,

          'lastCheckedAt',
            event.last_checked_at,

          'askedAt',
            event.asked_at,

          'nextReminderAt',
            event.next_reminder_at,

          'conversationId',
            event.conversation_id

        )

        order by

          case
            when event.status =
              'new'
              then 1

            when
              event.next_reminder_at
                is not null

              and event.next_reminder_at <=
                now()
              then 2

            when event.status =
              'asked'
              then 3

            when event.status =
              'snoozed'
              then 4

            else 5
          end,

          case event.priority
            when 'critical' then 1
            when 'high' then 2
            when 'normal' then 3
            else 4
          end,

          event.first_detected_at asc
      ),
      '[]'::jsonb
    )

  into
    v_items

  from public.wize_events event

  where
    event.organization_id =
      p_organization_id

    and event.status in (
      'new',
      'asked',
      'snoozed'
    );


  return
    jsonb_build_object(
      'organizationId',
        p_organization_id,

      'counts',
        jsonb_build_object(
          'new',
            coalesce(
              v_new,
              0
            ),

          'waitingCustomer',
            coalesce(
              v_waiting,
              0
            ),

          'reminderDue',
            coalesce(
              v_reminder,
              0
            ),

          'snoozed',
            coalesce(
              v_snoozed,
              0
            )
        ),

      'items',
        v_items
    );

end;
$$;


revoke all
on function
public.office_wize_get_signal_overview(uuid)
from public, anon;


grant execute
on function
public.office_wize_get_signal_overview(uuid)
to authenticated;


commit;
