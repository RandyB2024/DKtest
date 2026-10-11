begin;

-- ============================================================
-- MIJN BESTEMMING
-- Persoonlijk levensplan + lifecoaching
--
-- Persoonsgebonden:
-- user_id = auth.uid()
--
-- Geen organization_id.
-- Geen zakelijke medewerkerstoegang.
-- ============================================================


create table
if not exists public.personal_life_plans (
  user_id uuid primary key
    references public.profiles(id)
    on delete restrict,

  destination text,
  current_situation text,
  desired_situation text,
  important_values text,
  opportunities text,
  concerns text,

  annual_review_date date,
  next_review_date date,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint personal_life_plan_destination_length
    check (
      destination is null
      or length(destination) <= 3000
    ),

  constraint personal_life_plan_current_length
    check (
      current_situation is null
      or length(current_situation) <= 10000
    ),

  constraint personal_life_plan_desired_length
    check (
      desired_situation is null
      or length(desired_situation) <= 10000
    ),

  constraint personal_life_plan_values_length
    check (
      important_values is null
      or length(important_values) <= 5000
    ),

  constraint personal_life_plan_opportunities_length
    check (
      opportunities is null
      or length(opportunities) <= 5000
    ),

  constraint personal_life_plan_concerns_length
    check (
      concerns is null
      or length(concerns) <= 5000
    )
);


create table
if not exists public.personal_life_goals (
  id uuid primary key
    default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete restrict,

  title text not null,

  category text not null
    default 'personal'
    check (
      category in (
        'personal',
        'financial',
        'work',
        'family',
        'living',
        'health',
        'travel',
        'retirement',
        'other'
      )
    ),

  target_date date,

  status text not null
    default 'active'
    check (
      status in (
        'active',
        'achieved',
        'paused'
      )
    ),

  notes text,

  position integer
    not null default 0
    check (
      position >= 0
      and position <= 10000
    ),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint personal_life_goal_title_length
    check (
      length(btrim(title))
      between 1 and 200
    ),

  constraint personal_life_goal_notes_length
    check (
      notes is null
      or length(notes) <= 5000
    )
);


create index
if not exists personal_life_goals_user_idx
on public.personal_life_goals (
  user_id,
  status,
  position,
  target_date
);


-- ============================================================
-- LIFECOACHING
--
-- Dit zijn persoonlijke sessie-/reflectieregels.
-- Interne coachnotities bouwen we later apart in Office.
-- ============================================================

create table
if not exists public.personal_coaching_entries (
  id uuid primary key
    default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete restrict,

  session_date date not null,

  title text not null,

  preparation text,
  reflection text,
  action_points text,

  next_session_date date,

  status text not null
    default 'planned'
    check (
      status in (
        'planned',
        'completed',
        'cancelled'
      )
    ),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint personal_coaching_title_length
    check (
      length(btrim(title))
      between 1 and 200
    ),

  constraint personal_coaching_preparation_length
    check (
      preparation is null
      or length(preparation) <= 10000
    ),

  constraint personal_coaching_reflection_length
    check (
      reflection is null
      or length(reflection) <= 10000
    ),

  constraint personal_coaching_actions_length
    check (
      action_points is null
      or length(action_points) <= 10000
    )
);


create index
if not exists personal_coaching_entries_user_idx
on public.personal_coaching_entries (
  user_id,
  session_date desc
);


-- ============================================================
-- AUDIT
-- ============================================================

create table
if not exists public.personal_portal_data_audit (
  id uuid primary key
    default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id)
    on delete restrict,

  entity_type text not null
    check (
      entity_type in (
        'life_plan',
        'life_goal',
        'coaching_entry'
      )
    ),

  entity_id uuid,

  action text not null
    check (
      action in (
        'created',
        'updated',
        'deleted'
      )
    ),

  created_at timestamptz
    not null default now()
);


create index
if not exists personal_portal_data_audit_user_idx
on public.personal_portal_data_audit (
  user_id,
  created_at desc
);


-- ============================================================
-- RLS
--
-- Geen directe writes.
-- Alle mutaties lopen via beveiligde RPC's.
-- ============================================================

alter table public.personal_life_plans
  enable row level security;

alter table public.personal_life_goals
  enable row level security;

alter table public.personal_coaching_entries
  enable row level security;

alter table public.personal_portal_data_audit
  enable row level security;


revoke all
on public.personal_life_plans,
   public.personal_life_goals,
   public.personal_coaching_entries,
   public.personal_portal_data_audit
from anon, authenticated;


-- ============================================================
-- ACTOR HELPER
--
-- Controleert:
-- - ingelogd
-- - actieve profile
-- - AAL2
-- - expliciete Mijn Bestemming toegang
-- ============================================================

create or replace function
public.personal_portal_actor()
returns uuid
language plpgsql
stable
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
      message =
        'Tweestapsverificatie is vereist.';
  end if;


  if not exists (
    select 1
    from public.profiles profile
    where profile.id = v_actor
      and profile.account_status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Persoonlijk account is niet actief.';
  end if;


  if not exists (
    select 1
    from public.personal_portal_access access
    where access.user_id = v_actor
      and access.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message =
        'Geen toegang tot Mijn Bestemming.';
  end if;


  return v_actor;
end;
$$;


revoke all
on function public.personal_portal_actor()
from public, anon, authenticated;


-- ============================================================
-- LEVENSPLAN LEZEN
-- ============================================================

create or replace function
public.personal_life_plan_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_plan jsonb;
  v_goals jsonb;
begin

  v_actor :=
    public.personal_portal_actor();


  select jsonb_build_object(
    'destination',
      plan.destination,

    'currentSituation',
      plan.current_situation,

    'desiredSituation',
      plan.desired_situation,

    'importantValues',
      plan.important_values,

    'opportunities',
      plan.opportunities,

    'concerns',
      plan.concerns,

    'annualReviewDate',
      plan.annual_review_date,

    'nextReviewDate',
      plan.next_review_date,

    'updatedAt',
      plan.updated_at
  )
  into v_plan

  from public.personal_life_plans plan

  where plan.user_id =
    v_actor;


  if v_plan is null then
    v_plan :=
      jsonb_build_object(
        'destination', null,
        'currentSituation', null,
        'desiredSituation', null,
        'importantValues', null,
        'opportunities', null,
        'concerns', null,
        'annualReviewDate', null,
        'nextReviewDate', null,
        'updatedAt', null
      );
  end if;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
          goal.id,

        'title',
          goal.title,

        'category',
          goal.category,

        'targetDate',
          goal.target_date,

        'status',
          goal.status,

        'notes',
          goal.notes,

        'position',
          goal.position
      )
      order by
        goal.position,
        goal.target_date nulls last,
        goal.created_at
    ),
    '[]'::jsonb
  )
  into v_goals

  from public.personal_life_goals goal

  where goal.user_id =
    v_actor;


  return jsonb_build_object(
    'plan',
      v_plan,

    'goals',
      v_goals
  );
end;
$$;


-- ============================================================
-- LEVENSPLAN OPSLAAN
-- ============================================================

create or replace function
public.personal_life_plan_save(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;

  v_destination text;
  v_current text;
  v_desired text;
  v_values text;
  v_opportunities text;
  v_concerns text;

  v_annual date;
  v_next date;

  v_exists boolean;
begin

  v_actor :=
    public.personal_portal_actor();


  if p_input is null
     or jsonb_typeof(p_input) <> 'object'
  then
    raise exception using
      errcode = '22023',
      message = 'Ongeldige gegevens.';
  end if;


  v_destination :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'destination',
          ''
        )
      ),
      ''
    );

  v_current :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'currentSituation',
          ''
        )
      ),
      ''
    );

  v_desired :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'desiredSituation',
          ''
        )
      ),
      ''
    );

  v_values :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'importantValues',
          ''
        )
      ),
      ''
    );

  v_opportunities :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'opportunities',
          ''
        )
      ),
      ''
    );

  v_concerns :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'concerns',
          ''
        )
      ),
      ''
    );


  if length(
    coalesce(
      v_destination,
      ''
    )
  ) > 3000
  or length(
    coalesce(v_current, '')
  ) > 10000
  or length(
    coalesce(v_desired, '')
  ) > 10000
  or length(
    coalesce(v_values, '')
  ) > 5000
  or length(
    coalesce(v_opportunities, '')
  ) > 5000
  or length(
    coalesce(v_concerns, '')
  ) > 5000
  then
    raise exception using
      errcode = '22023',
      message =
        'Een of meer teksten zijn te lang.';
  end if;


  begin
    v_annual :=
      nullif(
        p_input ->> 'annualReviewDate',
        ''
      )::date;

    v_next :=
      nullif(
        p_input ->> 'nextReviewDate',
        ''
      )::date;

  exception
    when others then
      raise exception using
        errcode = '22023',
        message =
          'Ongeldige datum.';
  end;


  select exists (
    select 1
    from public.personal_life_plans
    where user_id =
      v_actor
  )
  into v_exists;


  insert into
  public.personal_life_plans (
    user_id,
    destination,
    current_situation,
    desired_situation,
    important_values,
    opportunities,
    concerns,
    annual_review_date,
    next_review_date,
    updated_at
  )
  values (
    v_actor,
    v_destination,
    v_current,
    v_desired,
    v_values,
    v_opportunities,
    v_concerns,
    v_annual,
    v_next,
    now()
  )

  on conflict (user_id)
  do update set
    destination =
      excluded.destination,

    current_situation =
      excluded.current_situation,

    desired_situation =
      excluded.desired_situation,

    important_values =
      excluded.important_values,

    opportunities =
      excluded.opportunities,

    concerns =
      excluded.concerns,

    annual_review_date =
      excluded.annual_review_date,

    next_review_date =
      excluded.next_review_date,

    updated_at =
      now();


  insert into
  public.personal_portal_data_audit (
    user_id,
    entity_type,
    entity_id,
    action
  )
  values (
    v_actor,
    'life_plan',
    null,

    case
      when v_exists
        then 'updated'
      else 'created'
    end
  );


  return
    public.personal_life_plan_get();
end;
$$;


-- ============================================================
-- DOEL OPSLAAN
-- ============================================================

create or replace function
public.personal_life_goal_save(
  p_goal_id uuid,
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id uuid;

  v_title text;
  v_category text;
  v_target date;
  v_status text;
  v_notes text;
  v_position integer;
begin

  v_actor :=
    public.personal_portal_actor();


  if p_input is null
     or jsonb_typeof(p_input) <> 'object'
  then
    raise exception using
      errcode = '22023',
      message = 'Ongeldige gegevens.';
  end if;


  v_title :=
    btrim(
      coalesce(
        p_input ->> 'title',
        ''
      )
    );

  v_category :=
    coalesce(
      nullif(
        p_input ->> 'category',
        ''
      ),
      'personal'
    );

  v_status :=
    coalesce(
      nullif(
        p_input ->> 'status',
        ''
      ),
      'active'
    );

  v_notes :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'notes',
          ''
        )
      ),
      ''
    );


  if length(v_title)
     not between 1 and 200
  then
    raise exception using
      errcode = '22023',
      message = 'Naam van doel is ongeldig.';
  end if;


  if v_category not in (
    'personal',
    'financial',
    'work',
    'family',
    'living',
    'health',
    'travel',
    'retirement',
    'other'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Categorie is ongeldig.';
  end if;


  if v_status not in (
    'active',
    'achieved',
    'paused'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Status is ongeldig.';
  end if;


  if length(
    coalesce(v_notes, '')
  ) > 5000 then
    raise exception using
      errcode = '22023',
      message = 'Notitie is te lang.';
  end if;


  begin
    v_target :=
      nullif(
        p_input ->> 'targetDate',
        ''
      )::date;

    v_position :=
      coalesce(
        (
          p_input ->> 'position'
        )::integer,
        0
      );

  exception
    when others then
      raise exception using
        errcode = '22023',
        message = 'Ongeldige doelgegevens.';
  end;


  if v_position < 0
     or v_position > 10000
  then
    raise exception using
      errcode = '22023',
      message = 'Ongeldige positie.';
  end if;


  if p_goal_id is null then

    insert into
    public.personal_life_goals (
      user_id,
      title,
      category,
      target_date,
      status,
      notes,
      position
    )
    values (
      v_actor,
      v_title,
      v_category,
      v_target,
      v_status,
      v_notes,
      v_position
    )
    returning id
    into v_id;


    insert into
    public.personal_portal_data_audit (
      user_id,
      entity_type,
      entity_id,
      action
    )
    values (
      v_actor,
      'life_goal',
      v_id,
      'created'
    );

  else

    update
    public.personal_life_goals
    set
      title =
        v_title,

      category =
        v_category,

      target_date =
        v_target,

      status =
        v_status,

      notes =
        v_notes,

      position =
        v_position,

      updated_at =
        now()

    where id =
      p_goal_id

      and user_id =
        v_actor

    returning id
    into v_id;


    if v_id is null then
      raise exception using
        errcode = 'P0002',
        message = 'Doel niet gevonden.';
    end if;


    insert into
    public.personal_portal_data_audit (
      user_id,
      entity_type,
      entity_id,
      action
    )
    values (
      v_actor,
      'life_goal',
      v_id,
      'updated'
    );

  end if;


  return v_id;
end;
$$;


create or replace function
public.personal_life_goal_delete(
  p_goal_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id uuid;
begin

  v_actor :=
    public.personal_portal_actor();


  delete from
  public.personal_life_goals

  where id =
    p_goal_id

    and user_id =
      v_actor

  returning id
  into v_id;


  if v_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Doel niet gevonden.';
  end if;


  insert into
  public.personal_portal_data_audit (
    user_id,
    entity_type,
    entity_id,
    action
  )
  values (
    v_actor,
    'life_goal',
    v_id,
    'deleted'
  );


  return v_id;
end;
$$;


-- ============================================================
-- COACHING LEZEN
-- ============================================================

create or replace function
public.personal_coaching_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_entries jsonb;
begin

  v_actor :=
    public.personal_portal_actor();


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
          entry.id,

        'sessionDate',
          entry.session_date,

        'title',
          entry.title,

        'preparation',
          entry.preparation,

        'reflection',
          entry.reflection,

        'actionPoints',
          entry.action_points,

        'nextSessionDate',
          entry.next_session_date,

        'status',
          entry.status
      )
      order by
        entry.session_date desc,
        entry.created_at desc
    ),
    '[]'::jsonb
  )
  into v_entries

  from public.personal_coaching_entries entry

  where entry.user_id =
    v_actor;


  return jsonb_build_object(
    'entries',
      v_entries
  );
end;
$$;


-- ============================================================
-- COACHING OPSLAAN
-- ============================================================

create or replace function
public.personal_coaching_save(
  p_entry_id uuid,
  p_input jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id uuid;

  v_date date;
  v_title text;
  v_preparation text;
  v_reflection text;
  v_actions text;
  v_next date;
  v_status text;
begin

  v_actor :=
    public.personal_portal_actor();


  if p_input is null
     or jsonb_typeof(p_input) <> 'object'
  then
    raise exception using
      errcode = '22023',
      message = 'Ongeldige gegevens.';
  end if;


  v_title :=
    btrim(
      coalesce(
        p_input ->> 'title',
        ''
      )
    );

  v_preparation :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'preparation',
          ''
        )
      ),
      ''
    );

  v_reflection :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'reflection',
          ''
        )
      ),
      ''
    );

  v_actions :=
    nullif(
      btrim(
        coalesce(
          p_input ->> 'actionPoints',
          ''
        )
      ),
      ''
    );

  v_status :=
    coalesce(
      nullif(
        p_input ->> 'status',
        ''
      ),
      'planned'
    );


  if length(v_title)
     not between 1 and 200
  then
    raise exception using
      errcode = '22023',
      message =
        'Naam van coachingmoment is ongeldig.';
  end if;


  if v_status not in (
    'planned',
    'completed',
    'cancelled'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Status is ongeldig.';
  end if;


  if length(
    coalesce(v_preparation, '')
  ) > 10000
  or length(
    coalesce(v_reflection, '')
  ) > 10000
  or length(
    coalesce(v_actions, '')
  ) > 10000
  then
    raise exception using
      errcode = '22023',
      message =
        'Een of meer teksten zijn te lang.';
  end if;


  begin
    v_date :=
      (
        p_input ->> 'sessionDate'
      )::date;

    v_next :=
      nullif(
        p_input ->> 'nextSessionDate',
        ''
      )::date;

  exception
    when others then
      raise exception using
        errcode = '22023',
        message =
          'Ongeldige datum.';
  end;


  if p_entry_id is null then

    insert into
    public.personal_coaching_entries (
      user_id,
      session_date,
      title,
      preparation,
      reflection,
      action_points,
      next_session_date,
      status
    )
    values (
      v_actor,
      v_date,
      v_title,
      v_preparation,
      v_reflection,
      v_actions,
      v_next,
      v_status
    )
    returning id
    into v_id;


    insert into
    public.personal_portal_data_audit (
      user_id,
      entity_type,
      entity_id,
      action
    )
    values (
      v_actor,
      'coaching_entry',
      v_id,
      'created'
    );

  else

    update
    public.personal_coaching_entries
    set
      session_date =
        v_date,

      title =
        v_title,

      preparation =
        v_preparation,

      reflection =
        v_reflection,

      action_points =
        v_actions,

      next_session_date =
        v_next,

      status =
        v_status,

      updated_at =
        now()

    where id =
      p_entry_id

      and user_id =
        v_actor

    returning id
    into v_id;


    if v_id is null then
      raise exception using
        errcode = 'P0002',
        message =
          'Coachingmoment niet gevonden.';
    end if;


    insert into
    public.personal_portal_data_audit (
      user_id,
      entity_type,
      entity_id,
      action
    )
    values (
      v_actor,
      'coaching_entry',
      v_id,
      'updated'
    );

  end if;


  return v_id;
end;
$$;


create or replace function
public.personal_coaching_delete(
  p_entry_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_id uuid;
begin

  v_actor :=
    public.personal_portal_actor();


  delete from
  public.personal_coaching_entries

  where id =
    p_entry_id

    and user_id =
      v_actor

  returning id
  into v_id;


  if v_id is null then
    raise exception using
      errcode = 'P0002',
      message =
        'Coachingmoment niet gevonden.';
  end if;


  insert into
  public.personal_portal_data_audit (
    user_id,
    entity_type,
    entity_id,
    action
  )
  values (
    v_actor,
    'coaching_entry',
    v_id,
    'deleted'
  );


  return v_id;
end;
$$;


revoke all
on function public.personal_life_plan_get(),
            public.personal_life_plan_save(jsonb),
            public.personal_life_goal_save(uuid,jsonb),
            public.personal_life_goal_delete(uuid),
            public.personal_coaching_get(),
            public.personal_coaching_save(uuid,jsonb),
            public.personal_coaching_delete(uuid)
from public, anon;


grant execute
on function public.personal_life_plan_get(),
            public.personal_life_plan_save(jsonb),
            public.personal_life_goal_save(uuid,jsonb),
            public.personal_life_goal_delete(uuid),
            public.personal_coaching_get(),
            public.personal_coaching_save(uuid,jsonb),
            public.personal_coaching_delete(uuid)
to authenticated;


commit;
