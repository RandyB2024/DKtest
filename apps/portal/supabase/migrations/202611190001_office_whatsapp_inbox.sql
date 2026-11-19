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
    'channel', i.channel_label,
    'channelKey', i.channel_key,
    'senderPhone', i.sender_phone,
    'receiverPhone', i.receiver_phone,
    'body', i.message_body,
    'receivedAt', i.received_at,
    'status', i.processing_status,
    'channelAccountId', i.channel_account_id
  ) order by i.received_at desc), '[]'::jsonb)
  into result
  from (
    select e.id, e.received_at, e.processing_status,
      c.id as channel_account_id, c.label as channel_label, c.channel_key,
      left(coalesce(e.payload->>'senderPhone', ''), 25) as sender_phone,
      left(coalesce(e.payload->>'receiverPhone', c.phone_e164, ''), 25) as receiver_phone,
      left(coalesce(e.payload->>'body', ''), 16000) as message_body
    from public.bestemd_wa_inbound_events e
    join public.bestemd_wa_channel_accounts c
      on (e.provider_phone_number_id = c.provider_phone_number_id
          or e.provider_phone_number_id = 'twilio:' || c.id::text)
    where c.status = 'active'
      and e.processing_status in ('pending','failed','processed')
      and (
        (e.payload->>'provider' = 'twilio' and e.payload ? 'messageId')
        or (e.payload ? 'messageId' and e.payload ? 'senderPhone'
          and not (e.payload ? 'recipientPhone'))
      )
    order by e.received_at desc, e.id desc
    limit p_limit
  ) i;
  return result;
end;
$$;

revoke all on function public.bestemd_office_whatsapp_inbox(integer) from public, anon;
grant execute on function public.bestemd_office_whatsapp_inbox(integer) to authenticated;

commit;
