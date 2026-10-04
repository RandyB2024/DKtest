begin;

alter table public.conversations
  add column if not exists closed_at timestamptz;

alter table public.conversations
  add column if not exists closed_by uuid
    references public.profiles(id)
    on delete restrict;


create index if not exists
  conversations_closed_archive_idx
on public.conversations (
  organization_id,
  closed_at desc
)
where
  status = 'closed'
  and archived_at is null;


-- ============================================================
-- OFFICE: GESPREK AFSLUITEN
-- Klanten kunnen deze RPC niet gebruiken.
-- ============================================================

create or replace function
  public.communication_close_thread(
    p_conversation_id uuid
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_conversation public.conversations%rowtype;
  v_closed_at timestamptz;
begin

  v_actor := auth.uid();

  if v_actor is null then
    raise exception
      'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception
      'Tweestapsverificatie is vereist.';
  end if;

  if not public.can_office_communicate() then
    raise exception
      'Geen rechten om gesprekken af te sluiten.';
  end if;


  select *
  into v_conversation
  from public.conversations
  where
    id = p_conversation_id
    and archived_at is null
  for update;


  if not found then
    raise exception
      'Gesprek niet gevonden.';
  end if;


  if v_conversation.status = 'closed' then
    return jsonb_build_object(
      'conversationId',
        v_conversation.id,
      'status',
        'closed',
      'closedAt',
        v_conversation.closed_at,
      'closedBy',
        v_conversation.closed_by,
      'duplicate',
        true
    );
  end if;


  if v_conversation.status <> 'open' then
    raise exception
      'Dit gesprek kan niet worden afgesloten.';
  end if;


  v_closed_at := now();


  update public.conversations
  set
    status = 'closed',
    closed_at = v_closed_at,
    closed_by = v_actor,
    updated_at = v_closed_at
  where
    id = p_conversation_id;


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
    v_actor,
    v_conversation.organization_id,
    'communication.thread_closed',
    'conversation',
    v_conversation.id,
    'success',
    jsonb_build_object(
      'closedAt',
      v_closed_at
    )
  );


  return jsonb_build_object(
    'conversationId',
      v_conversation.id,
    'status',
      'closed',
    'closedAt',
      v_closed_at,
    'closedBy',
      v_actor,
    'duplicate',
      false
  );

end;
$$;


revoke all
on function public.communication_close_thread(uuid)
from public, anon;

grant execute
on function public.communication_close_thread(uuid)
to authenticated;


-- ============================================================
-- OFFICE: GESPREK HEROPENEN
-- Alleen Office; wordt in 5A-3 gebruikt.
-- ============================================================

create or replace function
  public.communication_reopen_thread(
    p_conversation_id uuid
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_conversation public.conversations%rowtype;
begin

  v_actor := auth.uid();

  if v_actor is null then
    raise exception
      'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception
      'Tweestapsverificatie is vereist.';
  end if;

  if not public.can_office_communicate() then
    raise exception
      'Geen rechten om gesprekken te heropenen.';
  end if;


  select *
  into v_conversation
  from public.conversations
  where
    id = p_conversation_id
    and archived_at is null
  for update;


  if not found then
    raise exception
      'Gesprek niet gevonden.';
  end if;


  if v_conversation.status = 'open' then
    return jsonb_build_object(
      'conversationId',
        v_conversation.id,
      'status',
        'open',
      'duplicate',
        true
    );
  end if;


  if v_conversation.status <> 'closed' then
    raise exception
      'Dit gesprek kan niet worden heropend.';
  end if;


  update public.conversations
  set
    status = 'open',
    closed_at = null,
    closed_by = null,
    updated_at = now()
  where
    id = p_conversation_id;


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
    v_actor,
    v_conversation.organization_id,
    'communication.thread_reopened',
    'conversation',
    v_conversation.id,
    'success',
    '{}'::jsonb
  );


  return jsonb_build_object(
    'conversationId',
      v_conversation.id,
    'status',
      'open',
    'duplicate',
      false
  );

end;
$$;


revoke all
on function public.communication_reopen_thread(uuid)
from public, anon;

grant execute
on function public.communication_reopen_thread(uuid)
to authenticated;


commit;
