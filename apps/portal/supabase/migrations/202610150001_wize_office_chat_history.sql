begin;

create table if not exists public.wize_office_chats(
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null references public.profiles(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 title text not null default 'Nieuwe chat',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.wize_office_messages(
 id uuid primary key default gen_random_uuid(),
 chat_id uuid not null references public.wize_office_chats(id) on delete cascade,
 role text not null check(role in('user','assistant')),
 content text not null,
 created_at timestamptz not null default now()
);

create index if not exists wize_office_chats_user_updated_idx on public.wize_office_chats(created_by,updated_at desc);
create index if not exists wize_office_messages_chat_created_idx on public.wize_office_messages(chat_id,created_at);

alter table public.wize_office_chats enable row level security;
alter table public.wize_office_messages enable row level security;

create policy wize_office_chats_own on public.wize_office_chats
for all to authenticated
using(created_by=auth.uid() and public.is_office_user())
with check(created_by=auth.uid() and public.is_office_user());

create policy wize_office_messages_own on public.wize_office_messages
for all to authenticated
using(exists(select 1 from public.wize_office_chats c where c.id=wize_office_messages.chat_id and c.created_by=auth.uid() and public.is_office_user()))
with check(exists(select 1 from public.wize_office_chats c where c.id=wize_office_messages.chat_id and c.created_by=auth.uid() and public.is_office_user()));

grant select,insert,update,delete on public.wize_office_chats to authenticated;
grant select,insert,delete on public.wize_office_messages to authenticated;

commit;
