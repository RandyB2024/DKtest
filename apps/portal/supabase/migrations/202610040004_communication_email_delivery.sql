begin;

create or replace function
  public.communication_record_email_delivery(
    p_message_id uuid,
    p_recipient_email text,
    p_direction text,
    p_status text,
    p_error text default null
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_message public.messages%rowtype;
  v_conversation public.conversations%rowtype;
  v_recipient text;
begin

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception 'Tweestapsverificatie is vereist.';
  end if;

  if p_direction not in (
    'office_to_customer',
    'customer_to_office'
  ) then
    raise exception 'Ongeldige notificatierichting.';
  end if;

  if p_status not in (
    'sent',
    'failed'
  ) then
    raise exception 'Ongeldige notificatiestatus.';
  end if;

  v_recipient :=
    lower(
      trim(
        coalesce(
          p_recipient_email,
          ''
        )
      )
    );

  if
    length(v_recipient) < 3
    or length(v_recipient) > 254
    or position('@' in v_recipient) < 2
  then
    raise exception 'Ongeldig e-mailadres.';
  end if;


  select *
  into v_message
  from public.messages
  where id = p_message_id;

  if not found then
    raise exception 'Bericht niet gevonden.';
  end if;


  select *
  into v_conversation
  from public.conversations
  where id =
    v_message.conversation_id;

  if not found then
    raise exception 'Gesprek niet gevonden.';
  end if;


  if public.is_office_user() then

    if not public.can_office_communicate() then
      raise exception 'Geen toegang.';
    end if;

  elsif not public.has_org_access(
    v_conversation.organization_id
  ) then

    raise exception 'Geen toegang.';
  end if;


  if
    p_direction = 'office_to_customer'
    and v_message.sender_side <> 'office'
  then
    raise exception 'Ongeldige notificatierichting.';
  end if;

  if
    p_direction = 'customer_to_office'
    and v_message.sender_side <> 'customer'
  then
    raise exception 'Ongeldige notificatierichting.';
  end if;


  insert into
    public.communication_email_notifications (
      message_id,
      recipient_email,
      direction,
      status,
      attempts,
      sent_at,
      last_error,
      created_at,
      updated_at
    )
  values (
    p_message_id,
    v_recipient,
    p_direction,
    p_status,
    1,

    case
      when p_status = 'sent'
        then now()
      else null
    end,

    case
      when p_status = 'failed'
        then left(
          coalesce(
            p_error,
            'Verzending mislukt.'
          ),
          500
        )
      else null
    end,

    now(),
    now()
  )

  on conflict (
    message_id,
    recipient_email
  )

  do update
  set
    direction =
      excluded.direction,

    status =
      excluded.status,

    attempts =
      public.communication_email_notifications.attempts + 1,

    sent_at =
      case
        when excluded.status = 'sent'
          then now()
        else public.communication_email_notifications.sent_at
      end,

    last_error =
      excluded.last_error,

    updated_at =
      now();


  return jsonb_build_object(
    'messageId',
      p_message_id,

    'recipient',
      v_recipient,

    'status',
      p_status
  );

end;
$$;


revoke all
on function public.communication_record_email_delivery(
  uuid,
  text,
  text,
  text,
  text
)
from public, anon;

grant execute
on function public.communication_record_email_delivery(
  uuid,
  text,
  text,
  text,
  text
)
to authenticated;


commit;
