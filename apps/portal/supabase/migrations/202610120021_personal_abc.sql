begin;

create table
if not exists public.personal_abc (
  user_id uuid primary key
    references public.profiles(id)
    on delete restrict,

  monthly_income_cents bigint
    not null default 0
    check (monthly_income_cents >= 0),

  monthly_expenses_cents bigint
    not null default 0
    check (monthly_expenses_cents >= 0),

  current_buffer_cents bigint
    not null default 0
    check (current_buffer_cents >= 0),

  unforeseen_buffer_target_cents bigint
    not null default 0
    check (unforeseen_buffer_target_cents >= 0),

  bridge_buffer_target_cents bigint
    not null default 0
    check (bridge_buffer_target_cents >= 0),

  current_creation_cents bigint
    not null default 0
    check (current_creation_cents >= 0),

  creation_target_cents bigint
    not null default 0
    check (creation_target_cents >= 0),

  creation_goal_date date,

  notes text,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint personal_abc_notes_length
    check (
      notes is null
      or length(notes) <= 5000
    )
);


alter table
public.personal_abc
enable row level security;


revoke all
on public.personal_abc
from anon, authenticated;


-- Audit uitbreiden met ABC.
alter table
public.personal_portal_data_audit
drop constraint if exists
personal_portal_data_audit_entity_type_check;


alter table
public.personal_portal_data_audit
add constraint
personal_portal_data_audit_entity_type_check
check (
  entity_type in (
    'life_plan',
    'life_goal',
    'coaching_entry',
    'abc'
  )
);


create or replace function
public.personal_abc_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_result jsonb;
begin

  v_actor :=
    public.personal_portal_actor();


  select jsonb_build_object(
    'monthlyIncomeCents',
      abc.monthly_income_cents,

    'monthlyExpensesCents',
      abc.monthly_expenses_cents,

    'currentBufferCents',
      abc.current_buffer_cents,

    'unforeseenBufferTargetCents',
      abc.unforeseen_buffer_target_cents,

    'bridgeBufferTargetCents',
      abc.bridge_buffer_target_cents,

    'currentCreationCents',
      abc.current_creation_cents,

    'creationTargetCents',
      abc.creation_target_cents,

    'creationGoalDate',
      abc.creation_goal_date,

    'notes',
      abc.notes,

    'updatedAt',
      abc.updated_at
  )
  into v_result

  from public.personal_abc abc

  where abc.user_id =
    v_actor;


  if v_result is null then
    v_result :=
      jsonb_build_object(
        'monthlyIncomeCents', 0,
        'monthlyExpensesCents', 0,
        'currentBufferCents', 0,
        'unforeseenBufferTargetCents', 0,
        'bridgeBufferTargetCents', 0,
        'currentCreationCents', 0,
        'creationTargetCents', 0,
        'creationGoalDate', null,
        'notes', null,
        'updatedAt', null
      );
  end if;


  return v_result;
end;
$$;


create or replace function
public.personal_abc_save(
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;

  v_income bigint;
  v_expenses bigint;
  v_current_buffer bigint;
  v_unforeseen_target bigint;
  v_bridge_target bigint;
  v_current_creation bigint;
  v_creation_target bigint;

  v_goal_date date;
  v_notes text;

  v_exists boolean;
begin

  v_actor :=
    public.personal_portal_actor();


  if p_input is null
     or jsonb_typeof(p_input) <> 'object'
  then
    raise exception using
      errcode = '22023',
      message = 'Ongeldige ABC-gegevens.';
  end if;


  begin

    v_income :=
      coalesce(
        (p_input ->> 'monthlyIncomeCents')::bigint,
        0
      );

    v_expenses :=
      coalesce(
        (p_input ->> 'monthlyExpensesCents')::bigint,
        0
      );

    v_current_buffer :=
      coalesce(
        (p_input ->> 'currentBufferCents')::bigint,
        0
      );

    v_unforeseen_target :=
      coalesce(
        (p_input ->> 'unforeseenBufferTargetCents')::bigint,
        0
      );

    v_bridge_target :=
      coalesce(
        (p_input ->> 'bridgeBufferTargetCents')::bigint,
        0
      );

    v_current_creation :=
      coalesce(
        (p_input ->> 'currentCreationCents')::bigint,
        0
      );

    v_creation_target :=
      coalesce(
        (p_input ->> 'creationTargetCents')::bigint,
        0
      );

  exception
    when others then
      raise exception using
        errcode = '22023',
        message =
          'Een of meer bedragen zijn ongeldig.';
  end;


  if v_income < 0
     or v_expenses < 0
     or v_current_buffer < 0
     or v_unforeseen_target < 0
     or v_bridge_target < 0
     or v_current_creation < 0
     or v_creation_target < 0
  then
    raise exception using
      errcode = '22023',
      message =
        'Bedragen mogen niet negatief zijn.';
  end if;


  begin
    v_goal_date :=
      nullif(
        p_input ->> 'creationGoalDate',
        ''
      )::date;

  exception
    when others then
      raise exception using
        errcode = '22023',
        message = 'Ongeldige doeldatum.';
  end;


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


  if length(
    coalesce(
      v_notes,
      ''
    )
  ) > 5000
  then
    raise exception using
      errcode = '22023',
      message = 'Notitie is te lang.';
  end if;


  select exists (
    select 1
    from public.personal_abc
    where user_id =
      v_actor
  )
  into v_exists;


  insert into
  public.personal_abc (
    user_id,
    monthly_income_cents,
    monthly_expenses_cents,
    current_buffer_cents,
    unforeseen_buffer_target_cents,
    bridge_buffer_target_cents,
    current_creation_cents,
    creation_target_cents,
    creation_goal_date,
    notes,
    updated_at
  )
  values (
    v_actor,
    v_income,
    v_expenses,
    v_current_buffer,
    v_unforeseen_target,
    v_bridge_target,
    v_current_creation,
    v_creation_target,
    v_goal_date,
    v_notes,
    now()
  )

  on conflict (user_id)
  do update set

    monthly_income_cents =
      excluded.monthly_income_cents,

    monthly_expenses_cents =
      excluded.monthly_expenses_cents,

    current_buffer_cents =
      excluded.current_buffer_cents,

    unforeseen_buffer_target_cents =
      excluded.unforeseen_buffer_target_cents,

    bridge_buffer_target_cents =
      excluded.bridge_buffer_target_cents,

    current_creation_cents =
      excluded.current_creation_cents,

    creation_target_cents =
      excluded.creation_target_cents,

    creation_goal_date =
      excluded.creation_goal_date,

    notes =
      excluded.notes,

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
    'abc',
    null,

    case
      when v_exists
        then 'updated'
      else 'created'
    end
  );


  return
    public.personal_abc_get();
end;
$$;


revoke all
on function
  public.personal_abc_get(),
  public.personal_abc_save(jsonb)
from public, anon;


grant execute
on function
  public.personal_abc_get(),
  public.personal_abc_save(jsonb)
to authenticated;


commit;
