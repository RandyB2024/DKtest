-- ============================================================
-- WIZE CAL.COM SERVER-SIDE SYNC
--
-- Alleen de portalserver kent de capability.
-- Een klant kan deze RPC niet rechtstreeks gebruiken zonder
-- de geheime server-capability.
-- ============================================================

begin;


create schema if not exists
wize_private;


revoke all
on schema wize_private
from public, anon, authenticated;


create table if not exists
wize_private.calcom_sync_gate (
  singleton boolean primary key
    default true
    check (singleton),

  secret_hash text not null,

  updated_at timestamptz
    not null default now()
);


revoke all
on wize_private.calcom_sync_gate
from public, anon, authenticated;


insert into
  wize_private.calcom_sync_gate (
    singleton,
    secret_hash
  )
values (
  true,
  '892127f15773d9c528f84fd9e66fd76f97f3fca16dcc5467fad291e94542a333'
)

on conflict (singleton)
do update
set
  secret_hash =
    excluded.secret_hash,

  updated_at =
    now();


-- ============================================================
-- SERVER CAPABILITY CHECK
-- ============================================================

create or replace function
public.wize_require_calcom_sync_key(
  p_key text
)
returns void
language plpgsql
security definer
set search_path = public, wize_private
as $$
declare
  v_expected text;

  v_actual text;
begin

  if
    p_key is null
    or length(p_key) < 32
    or length(p_key) > 256
  then

    raise exception using
      errcode = '42501',
      message = 'Cal.com synchronisatie geweigerd.';

  end if;


  select
    secret_hash
  into
    v_expected
  from
    wize_private.calcom_sync_gate
  where singleton = true;


  if v_expected is null then
    raise exception using
      errcode = '42501',
      message = 'Cal.com synchronisatie is niet geconfigureerd.';
  end if;


  v_actual :=
    encode(
      sha256(
        convert_to(
          p_key,
          'UTF8'
        )
      ),
      'hex'
    );


  if v_actual <> v_expected then
    raise exception using
      errcode = '42501',
      message = 'Cal.com synchronisatie geweigerd.';
  end if;

end;
$$;


revoke all
on function
public.wize_require_calcom_sync_key(text)
from public, anon, authenticated;


-- ============================================================
-- SERVER-SIDE BOOKING SYNC
--
-- Status vanuit onze eigen gecontroleerde serverroute:
-- planned / completed / cancelled / no_show
--
-- sequence_number wordt NOOIT door browser/model bepaald.
-- ============================================================

create or replace function
public.wize_sync_calcom_booking(
  p_organization_id uuid,
  p_calcom_uid text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_status text,
  p_sync_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, wize_private
as $$
declare
  v_user_id uuid;

  v_year integer;

  v_sequence integer;

  v_program
    public.wize_appointment_programs%rowtype;

  v_existing
    public.wize_appointments%rowtype;

  v_row
    public.wize_appointments%rowtype;

  v_type text;

  v_duration integer;
begin

  perform
    public.wize_require_calcom_sync_key(
      p_sync_key
    );


  v_user_id :=
    auth.uid();


  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Niet ingelogd.';
  end if;


  if not public.has_aal2() then
    raise exception using
      errcode = '42501',
      message = 'Tweestapsverificatie is vereist.';
  end if;


  if public.is_office_user() then

    perform
      public.wize_require_office_admin();

  elsif not public.has_org_access(
    p_organization_id
  ) then

    raise exception using
      errcode = '42501',
      message = 'Geen toegang tot deze onderneming.';

  end if;


  if
    p_calcom_uid is null
    or length(btrim(p_calcom_uid))
      not between 8 and 300

    or p_starts_at is null

    or p_ends_at is null

    or p_ends_at <= p_starts_at

    or p_status not in (
      'planned',
      'completed',
      'cancelled',
      'no_show'
    )
  then

    raise exception using
      errcode = '22023',
      message = 'Ongeldige Cal.com-afspraak.';

  end if;


  -- ----------------------------------------------------------
  -- Bestaande Cal.com UID
  -- ----------------------------------------------------------

  select *
  into
    v_existing

  from
    public.wize_appointments

  where
    calcom_uid =
      btrim(
        p_calcom_uid
      )

  for update;


  if found then

    if
      v_existing.organization_id <>
      p_organization_id
    then

      raise exception using
        errcode = '42501',
        message = 'Afspraak hoort bij een andere onderneming.';
    end if;


    update
      public.wize_appointments

    set
      starts_at =
        p_starts_at,

      ends_at =
        p_ends_at,

      status =
        p_status,

      completed_at =
        case
          when p_status = 'completed'
            then coalesce(
              completed_at,
              now()
            )
          else null
        end,

      updated_at =
        now()

    where
      id =
        v_existing.id

    returning *
    into
      v_row;


    return
      jsonb_build_object(
        'id',
          v_row.id,

        'sequenceNumber',
          v_row.sequence_number,

        'type',
          v_row.appointment_type,

        'durationMinutes',
          v_row.planned_duration_minutes,

        'status',
          v_row.status,

        'existing',
          true
      );

  end if;


  -- ----------------------------------------------------------
  -- Nieuwe geannuleerde booking hoeft niet als gespreknummer
  -- te worden aangemaakt.
  -- ----------------------------------------------------------

  if p_status in (
    'cancelled',
    'no_show'
  ) then

    return
      jsonb_build_object(
        'id',
          null,

        'status',
          p_status,

        'existing',
          false,

        'ignored',
          true
      );

  end if;


  v_year :=
    extract(
      year from
      (
        p_starts_at
        at time zone
        'Europe/Amsterdam'
      )
    )::integer;


  perform
    public.wize_ensure_appointment_program(
      p_organization_id
    );


  select *
  into
    v_program

  from
    public.wize_appointment_programs

  where
    organization_id =
      p_organization_id;


  if not v_program.enabled then

    return
      jsonb_build_object(
        'id',
          null,

        'status',
          p_status,

        'existing',
          false,

        'ignored',
          true,

        'reason',
          'program_disabled'
      );

  end if;


  -- ----------------------------------------------------------
  -- Eerste vrije plek 1..meetings_per_year.
  -- Alleen planned/completed reserveren een nummer.
  -- ----------------------------------------------------------

  select
    gs
  into
    v_sequence

  from
    generate_series(
      1,
      v_program.meetings_per_year
    ) gs

  where not exists (
    select 1

    from
      public.wize_appointments a

    where
      a.organization_id =
        p_organization_id

      and a.calendar_year =
        v_year

      and a.sequence_number =
        gs

      and a.status in (
        'planned',
        'completed'
      )
  )

  order by
    gs

  limit 1;


  if v_sequence is null then

    return
      jsonb_build_object(
        'id',
          null,

        'status',
          p_status,

        'existing',
          false,

        'ignored',
          true,

        'reason',
          'program_complete'
      );

  end if;


  if
    v_sequence =
      v_program.meetings_per_year
  then

    v_type :=
      'annual_review';

    v_duration :=
      v_program
        .annual_review_duration_minutes;

  else

    v_type :=
      'periodic';

    v_duration :=
      v_program
        .regular_duration_minutes;

  end if;


  insert into
    public.wize_appointments (
      organization_id,
      calendar_year,
      sequence_number,
      appointment_type,
      planned_duration_minutes,
      status,
      starts_at,
      ends_at,
      calcom_uid,
      created_by,
      completed_at
    )
  values (
    p_organization_id,
    v_year,
    v_sequence,
    v_type,
    v_duration,
    p_status,
    p_starts_at,
    p_ends_at,
    btrim(
      p_calcom_uid
    ),
    v_user_id,
    case
      when p_status =
        'completed'
        then now()
      else null
    end
  )

  returning *
  into
    v_row;


  insert into
    public.audit_events (
      actor_id,
      organization_id,
      action,
      object_type,
      object_id,
      result,
      metadata
    )
  values (
    v_user_id,
    p_organization_id,
    'wize.calcom_booking_synced',
    'wize_appointment',
    v_row.id,
    'success',
    jsonb_build_object(
      'calendarYear',
        v_year,

      'sequenceNumber',
        v_sequence,

      'type',
        v_type,

      'status',
        p_status
    )
  );


  return
    jsonb_build_object(
      'id',
        v_row.id,

      'sequenceNumber',
        v_row.sequence_number,

      'type',
        v_row.appointment_type,

      'durationMinutes',
        v_row.planned_duration_minutes,

      'status',
        v_row.status,

      'existing',
        false
    );

end;
$$;


revoke all
on function
public.wize_sync_calcom_booking(
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  text
)
from public, anon;

grant execute
on function
public.wize_sync_calcom_booking(
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  text
)
to authenticated;


commit;
