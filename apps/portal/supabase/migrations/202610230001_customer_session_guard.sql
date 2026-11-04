-- BESTEMD: beveiligde klantensessies.
-- Deze migratie is nog NIET voor productie vrijgegeven.

create schema if not exists bestemd_security;

revoke all on schema bestemd_security
from public, anon, authenticated;

create table bestemd_security.customer_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mfa_verified_at timestamptz not null,
  risk_status text not null default 'active'
    check (risk_status in ('active', 'reverify', 'blocked')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customer_sessions_user_id_idx
on bestemd_security.customer_sessions(user_id);

alter table bestemd_security.customer_sessions
enable row level security;

alter table bestemd_security.customer_sessions
force row level security;

revoke all on bestemd_security.customer_sessions
from public, anon, authenticated;

-- Alleen vertrouwde backend-/beheerdersprocessen mogen
-- sessies registreren of wijzigen. Geen klant-RPC voor writes.

create or replace function public.customer_session_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.has_aal2()
    and exists (
      select 1
      from bestemd_security.customer_sessions s
      where s.user_id = auth.uid()
        and s.session_id = (
          case
            when (auth.jwt()->>'session_id') ~*
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (auth.jwt()->>'session_id')::uuid
            else null
          end
        )
        and s.risk_status = 'active'
        and s.revoked_at is null
        and s.mfa_verified_at <= now()
        and s.mfa_verified_at > now() - interval '24 hours'
    ),
    false
  );
$$;

revoke all on function public.customer_session_allowed()
from public, anon, authenticated;

grant execute on function public.customer_session_allowed()
to authenticated;