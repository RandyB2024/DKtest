begin;

-- ============================================================
-- MIJN BESTEMMING - OFFICE BEHEER
--
-- 016 maakt personal_portal_access aan.
-- 017 voegt gecontroleerde Office-beheerfuncties en audit toe.
-- ============================================================


create table if not exists
public.personal_portal_access_audit (
  id uuid primary key default gen_random_uuid(),

  actor_user_id uuid not null
    references public.profiles(id)
    on delete restrict,

  target_user_id uuid not null
    references public.profiles(id)
    on delete restrict,

  customer_relationship_id uuid not null
    references public.customer_relationships(id)
    on delete restrict,

  action text not null
    check (
      action in (
        'enabled',
        'disabled'
      )
    ),

  created_at timestamptz
    not null default now()
);


create index if not exists
personal_portal_access_audit_relationship_idx
on public.personal_portal_access_audit (
  customer_relationship_id,
  created_at desc
);


alter table
public.personal_portal_access_audit
enable row level security;


-- Geen directe klant- of Office-writes op audit.
revoke all
on public.personal_portal_access_audit
from anon, authenticated;


-- ============================================================
-- HELPER:
-- controleert of target daadwerkelijk als klantgebruiker
-- gekoppeld is aan een onderneming binnen de relatie.
-- ============================================================

create or replace function
public.office_personal_access_target_valid(
  p_relationship_id uuid,
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1

    from public.organization_memberships membership

    join public.organizations organization
      on organization.id =
        membership.organization_id

    join public.roles role
      on role.id =
        membership.role_id

    join public.profiles profile
      on profile.id =
        membership.user_id

    where
      organization.customer_relationship_id =
        p_relationship_id

      and organization.archived_at
        is null

      and membership.user_id =
        p_target_user_id

      and membership.status =
        'active'

      and membership.valid_from
        <= now()

      and (
        membership.valid_until is null
        or membership.valid_until > now()
      )

      and role.scope =
        'customer'

      and profile.account_status =
        'active'
  );
$$;


revoke all on function
public.office_personal_access_target_valid(
  uuid,
  uuid
)
from public, anon, authenticated;


-- ============================================================
-- OFFICE READ
--
-- Geeft alleen actieve klantgebruikers binnen deze relatie terug.
-- Geen wachtwoorden, auth tokens of andere gevoelige auth-data.
-- ============================================================

create or replace function
public.office_personal_portal_access_read(
  p_relationship_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin

  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception using
      errcode = '42501',
      message = 'Tweestapsverificatie is vereist.';
  end if;

  if not public.is_office_user() then
    raise exception using
      errcode = '42501',
      message = 'Geen Office-toegang.';
  end if;


  perform 1
  from public.customer_relationships relationship
  where relationship.id =
    p_relationship_id
    and relationship.archived_at
      is null;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Klantrelatie niet beschikbaar.';
  end if;


  with candidates as (
    select distinct
      profile.id,
      profile.display_name,
      profile.email,

      exists (
        select 1
        from public.personal_portal_access access
        where access.user_id =
          profile.id
          and access.status =
            'active'
      ) as personal_access_active

    from public.organization_memberships membership

    join public.organizations organization
      on organization.id =
        membership.organization_id

    join public.roles role
      on role.id =
        membership.role_id

    join public.profiles profile
      on profile.id =
        membership.user_id

    where
      organization.customer_relationship_id =
        p_relationship_id

      and organization.archived_at
        is null

      and membership.status =
        'active'

      and membership.valid_from
        <= now()

      and (
        membership.valid_until is null
        or membership.valid_until > now()
      )

      and role.scope =
        'customer'

      and profile.account_status =
        'active'
  )

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId',
          candidate.id,

        'displayName',
          candidate.display_name,

        'email',
          candidate.email,

        'active',
          candidate.personal_access_active
      )
      order by
        candidate.display_name,
        candidate.id
    ),
    '[]'::jsonb
  )
  into v_result
  from candidates candidate;


  return jsonb_build_object(
    'relationshipId',
      p_relationship_id,

    'people',
      v_result
  );
end;
$$;


-- ============================================================
-- OFFICE MUTATION
-- ============================================================

create or replace function
public.office_personal_portal_access_set(
  p_relationship_id uuid,
  p_target_user_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin

  v_actor := auth.uid();

  if v_actor is null then
    raise exception using
      errcode = '42501',
      message = 'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception using
      errcode = '42501',
      message = 'Tweestapsverificatie is vereist.';
  end if;

  if not public.is_office_user() then
    raise exception using
      errcode = '42501',
      message = 'Geen Office-toegang.';
  end if;


  if not public.office_personal_access_target_valid(
    p_relationship_id,
    p_target_user_id
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Deze persoon behoort niet tot deze actieve klantrelatie.';
  end if;


  if p_enabled then

    insert into public.personal_portal_access (
      user_id,
      status,
      enabled_at,
      disabled_at,
      updated_at
    )
    values (
      p_target_user_id,
      'active',
      now(),
      null,
      now()
    )

    on conflict (user_id)
    do update set
      status =
        'active',

      enabled_at =
        now(),

      disabled_at =
        null,

      updated_at =
        now();

  else

    update public.personal_portal_access
    set
      status =
        'disabled',

      disabled_at =
        now(),

      updated_at =
        now()

    where user_id =
      p_target_user_id;

  end if;


  insert into
  public.personal_portal_access_audit (
    actor_user_id,
    target_user_id,
    customer_relationship_id,
    action
  )
  values (
    v_actor,
    p_target_user_id,
    p_relationship_id,

    case
      when p_enabled
        then 'enabled'
      else 'disabled'
    end
  );


  return jsonb_build_object(
    'userId',
      p_target_user_id,

    'active',
      p_enabled
  );
end;
$$;


revoke all on function
public.office_personal_portal_access_read(uuid),
public.office_personal_portal_access_set(
  uuid,
  uuid,
  boolean
)
from public, anon;


grant execute on function
public.office_personal_portal_access_read(uuid),
public.office_personal_portal_access_set(
  uuid,
  uuid,
  boolean
)
to authenticated;


commit;
