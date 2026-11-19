-- BESTEMD Office: safely display verified provider inbound events.
-- Additive only: no changes to existing WhatsApp messages or phone channels.
-- Events are NOT assigned to a company until an authorized, audited review.
begin;

create or replace function public.bestemd_office_whatsapp_inbox(p_limit integer default 100)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_aal2() or not public.is_office_user()
     or not exists (
       select 1 from public.office_memberships m
       join public.roles r on r.id = m.role_id
       where m.user_id = auth.uid()
         and m.status = 'active' and r.scope = 'office'
         and r.code in ('owner','admin','accountant','handler')
     ) then
    raise exception 'Office MFA and an active staff role required.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid WhatsApp inbox limit.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'conversationId', i.conversation_id,
    'organizationId', i.organization_id,
    'channel', i.channel_label,
    'channelKey', i.channel_key,
    'senderPhone', i.sender_phone,
    'receiverPhone', i.receiver_phone,
    'body', i.message_body,
    'receivedAt', i.created_at,
    'status', i.delivery_status,
    'channelAccountId', i.channel_account_id
  ) order by i.created_at desc), '[]'::jsonb)
  into result
  from (
    select m.id, m.conversation_id, m.organization_id,
      m.created_at, m.delivery_status, m.channel_account_id,
      c.label as channel_label, c.channel_key,
      left(coalesce(m.sender_phone_e164, conv.contact_phone_e164, ''), 25) as sender_phone,
      left(coalesce(c.phone_e164, ''), 25) as receiver_phone,
      left(coalesce(m.body, ''), 16000) as message_body
    from public.bestemd_wa_messages m
    join public.bestemd_wa_channel_accounts c
      on c.id = m.channel_account_id
    join public.bestemd_wa_conversations conv
      on conv.id = m.conversation_id
     and conv.channel_account_id = m.channel_account_id
     and conv.organization_id is not distinct from m.organization_id
    where c.status = 'active' and m.direction = 'inbound'
    order by m.created_at desc, m.id desc
    limit p_limit
  ) i;
  return result;
end;
$$;

revoke all on function public.bestemd_office_whatsapp_inbox(integer) from public, anon;
grant execute on function public.bestemd_office_whatsapp_inbox(integer) to authenticated;

commit;
