begin;

-- ============================================================
-- MIJN BESTEMMING - PERSOONLIJKE TOEGANG
--
-- Deze toegang staat BEWUST los van organization_memberships.
--
-- Een gebruiker kan dus:
-- - wel toegang hebben tot Mijn Onderneming
-- - maar geen toegang hebben tot Mijn Bestemming
--
-- Alleen expliciet geactiveerde personen mogen de persoonlijke
-- omgeving openen.
-- ============================================================

create table if not exists
public.personal_portal_access (
  user_id uuid primary key
    references public.profiles(id)
    on delete restrict,

  status text not null
    default 'active'
    check (
      status in (
        'active',
        'disabled'
      )
    ),

  enabled_at timestamptz
    not null default now(),

  disabled_at timestamptz,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint personal_portal_access_disabled
    check (
      (
        status = 'active'
        and disabled_at is null
      )
      or
      (
        status = 'disabled'
      )
    )
);


-- ============================================================
-- RLS
-- Een persoon mag alleen zijn EIGEN toegangsrecord lezen.
-- Er is geen klant-policy voor INSERT/UPDATE/DELETE.
-- ============================================================

alter table public.personal_portal_access
  enable row level security;


drop policy if exists
personal_portal_access_self_read
on public.personal_portal_access;


create policy personal_portal_access_self_read
on public.personal_portal_access
for select
to authenticated
using (
  user_id = auth.uid()
);


-- Expliciet geen writes vanuit klantaccounts.
revoke all
on public.personal_portal_access
from anon;

revoke insert, update, delete, truncate, references, trigger
on public.personal_portal_access
from authenticated;

grant select
on public.personal_portal_access
to authenticated;


-- ============================================================
-- GEEN RPC DIE EEN KLANT ZELF TOEGANG LAAT ACTIVEREN.
--
-- Toegang wordt later alleen vanuit Bestemd Office beheerd.
-- ============================================================

commit;
