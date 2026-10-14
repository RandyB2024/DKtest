begin;


-- ============================================================
-- WIZE COMMUNICATION LIFECYCLE V1
--
-- Wanneer een gekoppeld communicatiegesprek wordt afgerond:
--   escalated -> resolved
--
-- Wanneer datzelfde gesprek opnieuw wordt geopend:
--   resolved -> escalated
--
-- Dit gebeurt transactioneel in de database en is dus niet
-- afhankelijk van de Office-frontend.
-- ============================================================


create or replace function
public.wize_sync_conversation_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;

  v_event record;
begin

  if new.status is not distinct from old.status then
    return new;
  end if;


  v_actor :=
    auth.uid();


  -- ==========================================================
  -- GESPREK AFGEROND
  -- ==========================================================

  if
    new.status =
      'closed'

    and old.status is distinct from
      'closed'
  then

    for v_event in

      update public.wize_events
      set
        status =
          'resolved',

        next_reminder_at =
          null,

        updated_at =
          now()

      where
        conversation_id =
          new.id

        and status =
          'escalated'

      returning
        id,
        organization_id,
        conversation_id

    loop

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
        'resolved',
        v_actor,
        v_event.conversation_id,
        jsonb_build_object(
          'source',
          'communication_closed'
        )
      );

    end loop;

  end if;


  -- ==========================================================
  -- GESPREK HEROPEND
  -- ==========================================================

  if
    new.status =
      'open'

    and old.status =
      'closed'
  then

    for v_event in

      update public.wize_events
      set
        status =
          'escalated',

        next_reminder_at =
          null,

        updated_at =
          now()

      where
        conversation_id =
          new.id

        and status =
          'resolved'

      returning
        id,
        organization_id,
        conversation_id

    loop

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
        'escalated',
        v_actor,
        v_event.conversation_id,
        jsonb_build_object(
          'source',
          'communication_reopened'
        )
      );

    end loop;

  end if;


  return new;

end;
$$;



drop trigger if exists
wize_sync_conversation_status_trigger
on public.conversations;


create trigger
wize_sync_conversation_status_trigger

after update of status
on public.conversations

for each row

when (
  old.status is distinct from
  new.status
)

execute function
public.wize_sync_conversation_status();


revoke all
on function
public.wize_sync_conversation_status()
from public, anon, authenticated;


commit;
