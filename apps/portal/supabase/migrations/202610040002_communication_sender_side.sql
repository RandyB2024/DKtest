begin;

alter table public.messages
  add column if not exists sender_side text;

update public.messages message
set sender_side =
  case
    when exists (
      select 1
      from public.office_memberships membership
      join public.roles role
        on role.id = membership.role_id
      where
        membership.user_id = message.sender_id
        and membership.status = 'active'
        and role.scope = 'office'
    )
      then 'office'
    else 'customer'
  end
where sender_side is null;

alter table public.messages
  alter column sender_side set not null;

alter table public.messages
  drop constraint if exists messages_sender_side_check;

alter table public.messages
  add constraint messages_sender_side_check
  check (
    sender_side in (
      'customer',
      'office'
    )
  );


create or replace function
  public.communication_set_sender_side()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  if exists (
    select 1
    from public.office_memberships membership
    join public.roles role
      on role.id = membership.role_id
    join public.profiles profile
      on profile.id = membership.user_id
    where
      membership.user_id = new.sender_id
      and membership.status = 'active'
      and role.scope = 'office'
      and profile.account_status = 'active'
  ) then
    new.sender_side := 'office';
  else
    new.sender_side := 'customer';
  end if;

  return new;

end;
$$;


drop trigger if exists
  communication_message_sender_side
on public.messages;

create trigger
  communication_message_sender_side
before insert
on public.messages
for each row
execute function
  public.communication_set_sender_side();


revoke all
on function public.communication_set_sender_side()
from public, anon, authenticated;


commit;
