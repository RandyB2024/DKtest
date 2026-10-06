-- ============================================================
-- Communicatie 5A-1
--
-- Veilige communicatie tussen:
--   Mijn Bestemming <-> Bestemd Office
--
-- Bestaande tabellen:
--   conversations
--   conversation_participants
--   messages
--
-- Directe writes blijven geblokkeerd.
-- Nieuwe berichten lopen uitsluitend via SECURITY DEFINER RPC's.
-- ============================================================

begin;


-- ============================================================
-- 1. CONVERSATION METADATA UITBREIDEN
-- ============================================================

alter table public.conversations
  add column if not exists updated_at
    timestamptz not null default now();

alter table public.conversations
  add column if not exists last_message_at
    timestamptz;

create index if not exists
  conversations_org_last_message_idx
on public.conversations (
  organization_id,
  last_message_at desc nulls last,
  created_at desc
)
where archived_at is null;


-- ============================================================
-- 2. E-MAILNOTIFICATIE OUTBOX
--
-- Wordt pas daadwerkelijk verzonden in stap 5A-4.
-- Deze tabel is niet direct toegankelijk voor klant/Office.
-- ============================================================

create table if not exists
  public.communication_email_notifications (
    id uuid primary key
      default gen_random_uuid(),

    message_id uuid not null
      references public.messages(id)
      on delete cascade,

    recipient_email text not null,

    direction text not null
      check (
        direction in (
          'office_to_customer',
          'customer_to_office'
        )
      ),

    status text not null
      default 'pending'
      check (
        status in (
          'pending',
          'sent',
          'failed'
        )
      ),

    attempts integer not null
      default 0
      check (attempts >= 0),

    sent_at timestamptz,

    last_error text,

    created_at timestamptz
      not null default now(),

    updated_at timestamptz
      not null default now(),

    unique (
      message_id,
      recipient_email
    )
  );

alter table
  public.communication_email_notifications
enable row level security;

create index if not exists
  communication_email_pending_idx
on public.communication_email_notifications (
  status,
  created_at
)
where status in (
  'pending',
  'failed'
);


-- ============================================================
-- 3. OFFICE WRITE PERMISSION
-- ============================================================

create or replace function
  public.can_office_communicate()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.office_memberships m

    join public.roles r
      on r.id = m.role_id

    join public.profiles p
      on p.id = m.user_id

    where
      m.user_id = auth.uid()

      and m.status = 'active'

      and p.account_status = 'active'

      and r.scope = 'office'

      and r.code in (
        'owner',
        'admin',
        'accountant',
        'handler'
      )
  );
$$;

revoke all
on function public.can_office_communicate()
from public, anon;

grant execute
on function public.can_office_communicate()
to authenticated;


-- ============================================================
-- 4. READ SECURITY
--
-- Communicatie bevat vertrouwelijke klantinformatie.
-- Ook klantreads vereisen daarom AAL2.
-- ============================================================

drop policy if exists
  communication_conversations_aal2
on public.conversations;

create policy
  communication_conversations_aal2
on public.conversations
as restrictive
for select
to authenticated
using (
  public.has_aal2()
);


drop policy if exists
  communication_messages_aal2
on public.messages;

create policy
  communication_messages_aal2
on public.messages
as restrictive
for select
to authenticated
using (
  public.has_aal2()
);


-- ============================================================
-- 5. PARTICIPANT READ
--
-- Een gebruiker mag uitsluitend zijn eigen read-status zien.
-- Mutaties gebeuren alleen via RPC.
-- ============================================================

drop policy if exists
  communication_participant_self_read
on public.conversation_participants;

create policy
  communication_participant_self_read
on public.conversation_participants
for select
to authenticated
using (
  public.has_aal2()
  and user_id = auth.uid()
);


-- ============================================================
-- 6. THREAD AANMAKEN + EERSTE BERICHT
--
-- Organisatie wordt server-side gecontroleerd.
-- sender_id wordt nooit door browser aangeleverd.
-- ============================================================

create or replace function
  public.communication_create_thread(
    p_organization_id uuid,
    p_subject text,
    p_body text,
    p_idempotency_key uuid
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_conversation
    public.conversations%rowtype;

  v_message
    public.messages%rowtype;

  v_existing
    public.messages%rowtype;

  v_subject text;
  v_body text;

  v_sender_side text;
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


  -- ----------------------------------------------------------
  -- ORGANISATIETOEGANG
  -- ----------------------------------------------------------

  if public.is_office_user() then

    if not public.can_office_communicate() then
      raise exception
        'Geen rechten om berichten te versturen.';
    end if;

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
      raise exception
        'Onderneming niet gevonden.';
    end if;

    v_sender_side :=
      'office';

  else

    if not public.has_org_access(
      p_organization_id
    ) then
      raise exception
        'Geen toegang tot deze onderneming.';
    end if;

    v_sender_side :=
      'customer';

  end if;


  -- ----------------------------------------------------------
  -- INPUT
  -- ----------------------------------------------------------

  v_subject :=
    trim(
      coalesce(
        p_subject,
        ''
      )
    );

  v_body :=
    trim(
      coalesce(
        p_body,
        ''
      )
    );

  if
    length(v_subject) < 1
    or length(v_subject) > 160
  then
    raise exception
      'Onderwerp moet tussen 1 en 160 tekens bevatten.';
  end if;

  if
    length(v_body) < 1
    or length(v_body) > 5000
  then
    raise exception
      'Bericht moet tussen 1 en 5000 tekens bevatten.';
  end if;

  if p_idempotency_key is null then
    raise exception
      'Ontbrekende bericht-ID.';
  end if;


  -- ----------------------------------------------------------
  -- IDEMPOTENT RETRY
  --
  -- Voorkomt dubbel gesprek wanneer browser dezelfde request
  -- opnieuw verstuurt.
  -- ----------------------------------------------------------

  select *
  into v_existing
  from public.messages
  where
    idempotency_key =
      p_idempotency_key
  limit 1;

  if found then

    if
      v_existing.sender_id <>
        v_user_id
    then
      raise exception
        'Bericht-ID is al gebruikt.';
    end if;

    select *
    into v_conversation
    from public.conversations
    where id =
      v_existing.conversation_id;

    return jsonb_build_object(
      'conversationId',
        v_conversation.id,

      'messageId',
        v_existing.id,

      'organizationId',
        v_conversation.organization_id,

      'subject',
        v_conversation.subject,

      'senderSide',
        v_sender_side,

      'createdAt',
        v_existing.created_at,

      'duplicate',
        true
    );

  end if;


  -- ----------------------------------------------------------
  -- CONVERSATION
  -- ----------------------------------------------------------

  insert into public.conversations (
    organization_id,
    subject,
    status,
    created_by,
    created_at,
    updated_at,
    last_message_at
  )
  values (
    p_organization_id,
    v_subject,
    'open',
    v_user_id,
    now(),
    now(),
    now()
  )
  returning *
  into v_conversation;


  -- ----------------------------------------------------------
  -- EERSTE BERICHT
  -- ----------------------------------------------------------

  insert into public.messages (
    conversation_id,
    sender_id,
    visibility,
    body,
    idempotency_key,
    created_at
  )
  values (
    v_conversation.id,
    v_user_id,
    'customer',
    v_body,
    p_idempotency_key,
    now()
  )
  returning *
  into v_message;


  -- ----------------------------------------------------------
  -- CREATOR IS PARTICIPANT EN HEEFT EIGEN BERICHT GELEZEN
  -- ----------------------------------------------------------

  insert into public.conversation_participants (
    conversation_id,
    user_id,
    last_read_at
  )
  values (
    v_conversation.id,
    v_user_id,
    v_message.created_at
  )

  on conflict (
    conversation_id,
    user_id
  )

  do update
  set
    last_read_at =
      greatest(
        coalesce(
          public.conversation_participants.last_read_at,
          '-infinity'::timestamptz
        ),
        excluded.last_read_at
      );


  -- ----------------------------------------------------------
  -- AUDIT
  -- ----------------------------------------------------------

  insert into public.audit_events (
    actor_id,
    organization_id,
    action,
    object_type,
    object_id,
    result,
    metadata
  )
  values (
    v_user_id,
    p_organization_id,
    'communication.thread_created',
    'conversation',
    v_conversation.id,
    'success',
    jsonb_build_object(
      'senderSide',
      v_sender_side,
      'messageId',
      v_message.id
    )
  );


  return jsonb_build_object(
    'conversationId',
      v_conversation.id,

    'messageId',
      v_message.id,

    'organizationId',
      p_organization_id,

    'subject',
      v_conversation.subject,

    'senderSide',
      v_sender_side,

    'createdAt',
      v_message.created_at,

    'duplicate',
      false
  );

end;
$$;


revoke all
on function public.communication_create_thread(
  uuid,
  text,
  text,
  uuid
)
from public, anon;

grant execute
on function public.communication_create_thread(
  uuid,
  text,
  text,
  uuid
)
to authenticated;


-- ============================================================
-- 7. BERICHT STUREN IN BESTAAND GESPREK
-- ============================================================

create or replace function
  public.communication_send_message(
    p_conversation_id uuid,
    p_body text,
    p_idempotency_key uuid
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_conversation
    public.conversations%rowtype;

  v_message
    public.messages%rowtype;

  v_existing
    public.messages%rowtype;

  v_body text;

  v_sender_side text;
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


  -- ----------------------------------------------------------
  -- IDEMPOTENT RETRY
  -- ----------------------------------------------------------

  select *
  into v_existing
  from public.messages
  where
    idempotency_key =
      p_idempotency_key
  limit 1;

  if found then

    if
      v_existing.sender_id <>
        v_user_id
      or
      v_existing.conversation_id <>
        p_conversation_id
    then
      raise exception
        'Bericht-ID is al gebruikt.';
    end if;

    select *
    into v_conversation
    from public.conversations
    where id =
      p_conversation_id;

    v_sender_side :=
      case
        when public.is_office_user()
          then 'office'
        else 'customer'
      end;

    return jsonb_build_object(
      'conversationId',
        p_conversation_id,

      'messageId',
        v_existing.id,

      'organizationId',
        v_conversation.organization_id,

      'senderSide',
        v_sender_side,

      'createdAt',
        v_existing.created_at,

      'duplicate',
        true
    );

  end if;


  v_body :=
    trim(
      coalesce(
        p_body,
        ''
      )
    );

  if
    length(v_body) < 1
    or length(v_body) > 5000
  then
    raise exception
      'Bericht moet tussen 1 en 5000 tekens bevatten.';
  end if;


  -- ----------------------------------------------------------
  -- THREAD LOCKEN
  -- ----------------------------------------------------------

  select *
  into v_conversation
  from public.conversations
  where
    id =
      p_conversation_id
    and archived_at is null
  for update;

  if not found then
    raise exception
      'Gesprek niet gevonden.';
  end if;

  if v_conversation.status <> 'open' then
    raise exception
      'Dit gesprek is gesloten.';
  end if;


  -- ----------------------------------------------------------
  -- TOEGANG
  -- ----------------------------------------------------------

  if public.is_office_user() then

    if not public.can_office_communicate() then
      raise exception
        'Geen rechten om berichten te versturen.';
    end if;

    v_sender_side :=
      'office';

  else

    if not public.has_org_access(
      v_conversation.organization_id
    ) then
      raise exception
        'Geen toegang tot dit gesprek.';
    end if;

    v_sender_side :=
      'customer';

  end if;


  -- ----------------------------------------------------------
  -- MESSAGE
  -- ----------------------------------------------------------

  insert into public.messages (
    conversation_id,
    sender_id,
    visibility,
    body,
    idempotency_key,
    created_at
  )
  values (
    p_conversation_id,
    v_user_id,
    'customer',
    v_body,
    p_idempotency_key,
    now()
  )
  returning *
  into v_message;


  update public.conversations
  set
    last_message_at =
      v_message.created_at,

    updated_at =
      v_message.created_at

  where id =
    p_conversation_id;


  -- Eigen bericht geldt als gelezen.
  insert into public.conversation_participants (
    conversation_id,
    user_id,
    last_read_at
  )
  values (
    p_conversation_id,
    v_user_id,
    v_message.created_at
  )

  on conflict (
    conversation_id,
    user_id
  )

  do update
  set
    last_read_at =
      greatest(
        coalesce(
          public.conversation_participants.last_read_at,
          '-infinity'::timestamptz
        ),
        excluded.last_read_at
      );


  -- ----------------------------------------------------------
  -- AUDIT
  -- ----------------------------------------------------------

  insert into public.audit_events (
    actor_id,
    organization_id,
    action,
    object_type,
    object_id,
    result,
    metadata
  )
  values (
    v_user_id,
    v_conversation.organization_id,
    'communication.message_sent',
    'message',
    v_message.id,
    'success',
    jsonb_build_object(
      'conversationId',
      p_conversation_id,
      'senderSide',
      v_sender_side
    )
  );


  return jsonb_build_object(
    'conversationId',
      p_conversation_id,

    'messageId',
      v_message.id,

    'organizationId',
      v_conversation.organization_id,

    'senderSide',
      v_sender_side,

    'createdAt',
      v_message.created_at,

    'duplicate',
      false
  );

end;
$$;


revoke all
on function public.communication_send_message(
  uuid,
  text,
  uuid
)
from public, anon;

grant execute
on function public.communication_send_message(
  uuid,
  text,
  uuid
)
to authenticated;


-- ============================================================
-- 8. GESPREK ALS GELEZEN MARKEREN
-- ============================================================

create or replace function
  public.communication_mark_read(
    p_conversation_id uuid
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_conversation
    public.conversations%rowtype;

  v_read_at timestamptz;
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


  select *
  into v_conversation
  from public.conversations
  where
    id =
      p_conversation_id
    and archived_at is null;

  if not found then
    raise exception
      'Gesprek niet gevonden.';
  end if;


  if public.is_office_user() then

    if not public.can_office_communicate() then
      raise exception
        'Geen toegang tot dit gesprek.';
    end if;

  elsif not public.has_org_access(
    v_conversation.organization_id
  ) then

    raise exception
      'Geen toegang tot dit gesprek.';

  end if;


  v_read_at :=
    now();


  insert into public.conversation_participants (
    conversation_id,
    user_id,
    last_read_at
  )
  values (
    p_conversation_id,
    v_user_id,
    v_read_at
  )

  on conflict (
    conversation_id,
    user_id
  )

  do update
  set
    last_read_at =
      greatest(
        coalesce(
          public.conversation_participants.last_read_at,
          '-infinity'::timestamptz
        ),
        excluded.last_read_at
      );


  return jsonb_build_object(
    'conversationId',
      p_conversation_id,

    'readAt',
      v_read_at
  );

end;
$$;


revoke all
on function public.communication_mark_read(
  uuid
)
from public, anon;

grant execute
on function public.communication_mark_read(
  uuid
)
to authenticated;


-- ============================================================
-- 9. DIRECTE EXECUTE / TABLE WRITE HARDENING
--
-- Geen browserclient mag de sender of organisatie zelf
-- manipuleren door rechtstreeks tabellen te schrijven.
-- ============================================================

revoke insert, update, delete
on public.communication_email_notifications
from authenticated;

revoke all
on public.communication_email_notifications
from anon;


-- ============================================================
-- 10. BESTAANDE READS BLIJVEN PER ORGANISATIE
--
-- conversations_access en messages_customer_read uit de
-- foundation blijven bestaan. De nieuwe restrictive AAL2
-- policies worden daar bovenop toegepast.
-- ============================================================


commit;
