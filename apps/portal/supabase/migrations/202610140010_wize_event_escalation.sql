begin;


-- ============================================================
-- WIZE EVENT ESCALATION V1
--
-- Koppelt een Wize-event veilig aan een communicatiegesprek.
--
-- SECURITY:
-- - ingelogd
-- - AAL2
-- - klant moet toegang hebben tot onderneming
-- - gesprek moet bij dezelfde onderneming horen
-- - resolved/dismissed events kunnen niet opnieuw escaleren
-- ============================================================


create or replace function
public.wize_escalate_event(
  p_event_id uuid,
  p_conversation_id uuid
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


  if v_event.status in (
    'resolved',
    'dismissed'
  ) then

    raise exception using
      errcode = '22023',
      message = 'Dit Wize-signaal is al afgesloten.';

  end if;


  if not exists (
    select 1
    from public.conversations conversation
    where
      conversation.id =
        p_conversation_id

      and conversation.organization_id =
        v_event.organization_id

      and conversation.archived_at
        is null
  ) then

    raise exception using
      errcode = '22023',
      message = 'Gesprek hoort niet bij deze onderneming.';

  end if;


  if
    v_event.status =
      'escalated'

    and v_event.conversation_id =
      p_conversation_id
  then

    return
      jsonb_build_object(
        'id',
          v_event.id,

        'status',
          v_event.status,

        'conversationId',
          v_event.conversation_id,

        'duplicate',
          true
      );

  end if;


  if
    v_event.status =
      'escalated'

    and v_event.conversation_id
      is distinct from
      p_conversation_id
  then

    raise exception using
      errcode = '22023',
      message = 'Dit Wize-signaal is al aan een ander gesprek gekoppeld.';

  end if;


  update public.wize_events
  set
    status =
      'escalated',

    conversation_id =
      p_conversation_id,

    escalated_at =
      coalesce(
        escalated_at,
        now()
      ),

    next_reminder_at =
      null,

    updated_at =
      now()

  where id =
    p_event_id

  returning *
  into v_event;


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
    v_user_id,
    p_conversation_id,
    jsonb_build_object(
      'source',
      'wize_chat'
    )
  );


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
    'conversation_linked',
    v_user_id,
    p_conversation_id,
    jsonb_build_object(
      'source',
      'wize_chat'
    )
  );


  return
    jsonb_build_object(
      'id',
        v_event.id,

      'status',
        v_event.status,

      'conversationId',
        v_event.conversation_id,

      'duplicate',
        false
    );

end;
$$;


revoke all
on function
public.wize_escalate_event(
  uuid,
  uuid
)
from public, anon;


grant execute
on function
public.wize_escalate_event(
  uuid,
  uuid
)
to authenticated;


commit;
