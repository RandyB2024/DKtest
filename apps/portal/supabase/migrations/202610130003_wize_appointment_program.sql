-- ============================================================
-- WIZE APPOINTMENT PROGRAM V1
--
-- Bestemd periodieke gesprekken:
-- - 4 gesprekken per kalenderjaar
-- - gesprek 1 t/m 3: circa 30 minuten
-- - gesprek 4: circa 60 minuten, volledig financieel plaatje
--
-- Dit model houdt de Bestemd-status bij.
-- Cal.com blijft de externe agenda/boeking.
-- ============================================================

begin;


-- ============================================================
-- 1. PROGRAMMA PER ONDERNEMING
-- ============================================================

create table if not exists
public.wize_appointment_programs (
  organization_id uuid primary key
    references public.organizations(id)
    on delete cascade,

  meetings_per_year integer not null
    default 4
    check (
      meetings_per_year between 1 and 12
    ),

  regular_duration_minutes integer not null
    default 30
    check (
      regular_duration_minutes between 15 and 240
    ),

  annual_review_duration_minutes integer not null
    default 60
    check (
      annual_review_duration_minutes between 15 and 240
    ),

  enabled boolean not null
    default true,

  updated_by uuid
    references public.profiles(id),

  updated_at timestamptz
    not null default now()
);


-- ============================================================
-- 2. AFSPRAAKREGISTRATIE
--
-- Cal.com UID is optioneel.
-- Hierdoor kan Office ook historische gesprekken registreren.
-- ============================================================

create table if not exists
public.wize_appointments (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  calendar_year integer not null
    check (
      calendar_year between 2020 and 2200
    ),

  sequence_number integer not null
    check (
      sequence_number between 1 and 12
    ),

  appointment_type text not null
    check (
      appointment_type in (
        'periodic',
        'annual_review'
      )
    ),

  planned_duration_minutes integer not null
    check (
      planned_duration_minutes between 15 and 240
    ),

  status text not null
    default 'planned'
    check (
      status in (
        'planned',
        'completed',
        'cancelled',
        'no_show'
      )
    ),

  starts_at timestamptz,

  ends_at timestamptz,

  calcom_uid text,

  created_by uuid
    references public.profiles(id),

  completed_at timestamptz,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  unique (
    organization_id,
    calendar_year,
    sequence_number
  ),

  check (
    calcom_uid is null
    or length(btrim(calcom_uid))
      between 8 and 300
  ),

  check (
    ends_at is null
    or starts_at is null
    or ends_at > starts_at
  )
);


create unique index if not exists
wize_appointments_calcom_uid_unique
on public.wize_appointments (
  calcom_uid
)
where
  calcom_uid is not null;


create index if not exists
wize_appointments_org_year_idx
on public.wize_appointments (
  organization_id,
  calendar_year,
  sequence_number
);


create index if not exists
wize_appointments_upcoming_idx
on public.wize_appointments (
  organization_id,
  starts_at
)
where
  status = 'planned';


-- ============================================================
-- 3. RLS / DIRECTE TABLE ACCESS UIT
-- ============================================================

alter table
public.wize_appointment_programs
enable row level security;

alter table
public.wize_appointments
enable row level security;


revoke all
on public.wize_appointment_programs
from public, anon, authenticated;

revoke all
on public.wize_appointments
from public, anon, authenticated;


-- ============================================================
-- 4. DEFAULT PROGRAMMA
-- ============================================================

create or replace function
public.wize_ensure_appointment_program(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  insert into
    public.wize_appointment_programs (
      organization_id
    )
  values (
    p_organization_id
  )

  on conflict (
    organization_id
  )
  do nothing;

end;
$$;


revoke all
on function
public.wize_ensure_appointment_program(uuid)
from public, anon, authenticated;


-- ============================================================
-- 5. BESTEMD AFSPRAAKSTATUS OPHALEN
--
-- Dit is de kern die Wize straks gebruikt.
-- ============================================================

create or replace function
public.wize_get_appointment_status(
  p_organization_id uuid,
  p_year integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_year integer;

  v_program
    public.wize_appointment_programs%rowtype;

  v_completed integer;

  v_planned integer;

  v_next_sequence integer;

  v_next_type text;

  v_next_duration integer;

  v_next_appointment jsonb;

  v_result jsonb;
begin

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


  v_year :=
    coalesce(
      p_year,
      extract(
        year from
        (
          now()
          at time zone
          'Europe/Amsterdam'
        )
      )::integer
    );


  if
    v_year < 2020
    or v_year > 2200
  then

    raise exception using
      errcode = '22023',
      message = 'Ongeldig kalenderjaar.';

  end if;


  perform
    public.wize_ensure_appointment_program(
      p_organization_id
    );


  select *
  into v_program
  from public.wize_appointment_programs
  where organization_id =
    p_organization_id;


  select
    count(*) filter (
      where status =
        'completed'
    ),

    count(*) filter (
      where status =
        'planned'
    )
  into
    v_completed,
    v_planned

  from
    public.wize_appointments

  where
    organization_id =
      p_organization_id

    and calendar_year =
      v_year;


  select
    jsonb_build_object(
      'id',
        a.id,

      'sequenceNumber',
        a.sequence_number,

      'type',
        a.appointment_type,

      'durationMinutes',
        a.planned_duration_minutes,

      'startsAt',
        a.starts_at,

      'endsAt',
        a.ends_at,

      'calcomUid',
        a.calcom_uid
    )
  into
    v_next_appointment

  from
    public.wize_appointments a

  where
    a.organization_id =
      p_organization_id

    and a.calendar_year =
      v_year

    and a.status =
      'planned'

    and (
      a.starts_at is null
      or a.starts_at >= now()
    )

  order by
    a.starts_at asc nulls last,
    a.sequence_number asc

  limit 1;


  select
    gs
  into
    v_next_sequence

  from
    generate_series(
      1,
      v_program.meetings_per_year
    ) gs

  where not exists (
    select 1
    from public.wize_appointments a

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


  if
    v_next_sequence is not null
  then

    if
      v_next_sequence =
        v_program.meetings_per_year
    then

      v_next_type :=
        'annual_review';

      v_next_duration :=
        v_program
          .annual_review_duration_minutes;

    else

      v_next_type :=
        'periodic';

      v_next_duration :=
        v_program
          .regular_duration_minutes;

    end if;

  end if;


  v_result :=
    jsonb_build_object(
      'organizationId',
        p_organization_id,

      'year',
        v_year,

      'program',
        jsonb_build_object(
          'enabled',
            v_program.enabled,

          'meetingsPerYear',
            v_program.meetings_per_year,

          'regularDurationMinutes',
            v_program.regular_duration_minutes,

          'annualReviewDurationMinutes',
            v_program.annual_review_duration_minutes
        ),

      'completedCount',
        coalesce(
          v_completed,
          0
        ),

      'plannedCount',
        coalesce(
          v_planned,
          0
        ),

      'remainingCount',
        greatest(
          v_program.meetings_per_year
          -
          coalesce(
            v_completed,
            0
          )
          -
          coalesce(
            v_planned,
            0
          ),
          0
        ),

      'nextAppointment',
        v_next_appointment,

      'nextRequiredMeeting',
        case
          when
            v_next_sequence is null
            then null

          else
            jsonb_build_object(
              'sequenceNumber',
                v_next_sequence,

              'type',
                v_next_type,

              'durationMinutes',
                v_next_duration
            )
        end
    );


  return
    v_result;

end;
$$;


revoke all
on function
public.wize_get_appointment_status(
  uuid,
  integer
)
from public, anon;

grant execute
on function
public.wize_get_appointment_status(
  uuid,
  integer
)
to authenticated;


-- ============================================================
-- 6. CAL.COM AFSPRAAK REGISTREREN
--
-- Wordt later vanuit de server/API aangeroepen nadat Cal.com
-- de afspraak voor de ingelogde klant heeft bevestigd.
--
-- De browser bepaalt NIET vrij sequence/type/duration.
-- Database berekent zelf wat het volgende gesprek is.
-- ============================================================

create or replace function
public.wize_register_calcom_appointment(
  p_organization_id uuid,
  p_calcom_uid text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_year integer;

  v_program
    public.wize_appointment_programs%rowtype;

  v_sequence integer;

  v_type text;

  v_duration integer;

  v_appointment
    public.wize_appointments%rowtype;
begin

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
    or length(
      btrim(
        p_calcom_uid
      )
    ) not between 8 and 300

    or p_starts_at is null

    or p_ends_at is null

    or p_ends_at <= p_starts_at
  then

    raise exception using
      errcode = '22023',
      message = 'Ongeldige afspraak.';

  end if;


  -- idempotent
  select *
  into v_appointment
  from public.wize_appointments
  where calcom_uid =
    btrim(
      p_calcom_uid
    );

  if found then

    if
      v_appointment.organization_id <>
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
        'planned',

      updated_at =
        now()

    where id =
      v_appointment.id

    returning *
    into v_appointment;


    return
      jsonb_build_object(
        'id',
          v_appointment.id,

        'sequenceNumber',
          v_appointment.sequence_number,

        'type',
          v_appointment.appointment_type,

        'durationMinutes',
          v_appointment.planned_duration_minutes,

        'status',
          v_appointment.status,

        'duplicate',
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
  into v_program
  from public.wize_appointment_programs
  where organization_id =
    p_organization_id;


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
    from public.wize_appointments a

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

    raise exception using
      errcode = '22023',
      message = 'Alle periodieke gesprekken voor dit jaar zijn al gepland of afgerond.';

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
      created_by
    )
  values (
    p_organization_id,
    v_year,
    v_sequence,
    v_type,
    v_duration,
    'planned',
    p_starts_at,
    p_ends_at,
    btrim(
      p_calcom_uid
    ),
    v_user_id
  )

  returning *
  into v_appointment;


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
    'wize.appointment_registered',
    'wize_appointment',
    v_appointment.id,
    'success',
    jsonb_build_object(
      'calendarYear',
        v_year,

      'sequenceNumber',
        v_sequence,

      'type',
        v_type,

      'durationMinutes',
        v_duration
    )
  );


  return
    jsonb_build_object(
      'id',
        v_appointment.id,

      'sequenceNumber',
        v_appointment.sequence_number,

      'type',
        v_appointment.appointment_type,

      'durationMinutes',
        v_appointment.planned_duration_minutes,

      'status',
        v_appointment.status,

      'duplicate',
        false
    );

end;
$$;


revoke all
on function
public.wize_register_calcom_appointment(
  uuid,
  text,
  timestamptz,
  timestamptz
)
from public, anon;

grant execute
on function
public.wize_register_calcom_appointment(
  uuid,
  text,
  timestamptz,
  timestamptz
)
to authenticated;


-- ============================================================
-- 7. GESPREK AFRONDEN - OFFICE
-- ============================================================

create or replace function
public.office_wize_complete_appointment(
  p_appointment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;

  v_appointment
    public.wize_appointments%rowtype;
begin

  v_actor :=
    public.wize_require_office_admin();


  select *
  into v_appointment
  from public.wize_appointments
  where id =
    p_appointment_id
  for update;


  if not found then

    raise exception using
      errcode = 'P0002',
      message = 'Afspraak niet gevonden.';

  end if;


  if
    v_appointment.status <>
      'planned'
  then

    raise exception using
      errcode = '22023',
      message = 'Alleen een geplande afspraak kan worden afgerond.';

  end if;


  update
    public.wize_appointments

  set
    status =
      'completed',

    completed_at =
      now(),

    updated_at =
      now()

  where id =
    p_appointment_id

  returning *
  into v_appointment;


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
    v_actor,
    v_appointment.organization_id,
    'wize.appointment_completed',
    'wize_appointment',
    v_appointment.id,
    'success',
    jsonb_build_object(
      'calendarYear',
        v_appointment.calendar_year,

      'sequenceNumber',
        v_appointment.sequence_number,

      'type',
        v_appointment.appointment_type
    )
  );


  return
    jsonb_build_object(
      'id',
        v_appointment.id,

      'status',
        v_appointment.status,

      'completedAt',
        v_appointment.completed_at
    );

end;
$$;


revoke all
on function
public.office_wize_complete_appointment(uuid)
from public, anon;

grant execute
on function
public.office_wize_complete_appointment(uuid)
to authenticated;


-- ============================================================
-- 8. WIZE QUARTERLY DETECTOR
--
-- Deze functie:
-- - kijkt naar huidig kwartaal
-- - wacht tot kwartaal voorbij is
-- - kijkt of er nog een gesprek nodig is
-- - kijkt of er al iets gepland staat
-- - maakt dan maximaal één persistent Wize-event
--
-- Voor Q4 wordt het uitgebreide jaaroverzicht voorgesteld.
-- ============================================================

create or replace function
public.wize_detect_appointment_event(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_now_local timestamp;

  v_year integer;

  v_quarter integer;

  v_target_quarter integer;

  v_status jsonb;

  v_next jsonb;

  v_event_key text;

  v_title text;

  v_message text;

  v_existing
    public.wize_events%rowtype;

  v_event
    public.wize_events%rowtype;
begin

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


  v_now_local :=
    now()
    at time zone
    'Europe/Amsterdam';


  v_year :=
    extract(
      year from
      v_now_local
    )::integer;


  v_quarter :=
    extract(
      quarter from
      v_now_local
    )::integer;


  -- We herinneren pas na een afgerond kwartaal.
  -- In Q1 bestaat dus nog geen verstreken kwartaal van dit jaar.
  if v_quarter = 1 then

    return
      jsonb_build_object(
        'created',
          false,

        'reason',
          'no_completed_quarter'
      );

  end if;


  v_target_quarter :=
    v_quarter - 1;


  v_status :=
    public.wize_get_appointment_status(
      p_organization_id,
      v_year
    );


  -- Alles al gepland/afgerond.
  if
    coalesce(
      (
        v_status ->
        'remainingCount'
      )::text::integer,
      0
    ) <= 0
  then

    return
      jsonb_build_object(
        'created',
          false,

        'reason',
          'program_complete'
      );

  end if;


  -- Er staat al een volgende afspraak.
  if
    v_status ->
      'nextAppointment'
    is not null

    and
    v_status ->
      'nextAppointment'
    <> 'null'::jsonb
  then

    return
      jsonb_build_object(
        'created',
          false,

        'reason',
          'appointment_already_planned',

        'appointment',
          v_status ->
            'nextAppointment'
      );

  end if;


  v_next :=
    v_status ->
      'nextRequiredMeeting';


  if
    v_next is null
    or v_next =
      'null'::jsonb
  then

    return
      jsonb_build_object(
        'created',
          false,

        'reason',
          'no_meeting_required'
      );

  end if;


  v_event_key :=
    format(
      'appointment:q%s:%s',
      v_target_quarter,
      v_year
    );


  if
    v_next ->> 'type' =
      'annual_review'
  then

    v_title :=
      'Tijd voor het uitgebreide gesprek';

    v_message :=
      'Je bent toe aan het uitgebreide gesprek van ongeveer een uur. Dan nemen we het hele plaatje weer samen door. Ik zie nog geen volgende afspraak staan. Zullen we iets inplannen?';

  else

    v_title :=
      'Tijd om even bij te praten';

    v_message :=
      format(
        'Het vorige kwartaal is afgerond en ik zie nog geen volgend gesprek staan. Je hebt dit jaar nog %s gesprek%s over. Zullen we iets inplannen?',
        (
          v_status ->
          'remainingCount'
        )::text,
        case
          when (
            v_status ->
            'remainingCount'
          )::text::integer = 1
            then ''
          else 'ken'
        end
      );

  end if;


  select *
  into v_existing
  from public.wize_events
  where
    organization_id =
      p_organization_id

    and event_key =
      v_event_key;


  if found then

    update
      public.wize_events

    set
      last_checked_at =
        now(),

      updated_at =
        now()

    where id =
      v_existing.id

    returning *
    into v_existing;


    return
      jsonb_build_object(
        'created',
          false,

        'reason',
          'event_exists',

        'eventId',
          v_existing.id,

        'status',
          v_existing.status
      );

  end if;


  insert into
    public.wize_events (
      organization_id,
      event_key,
      event_type,
      status,
      priority,
      title,
      customer_message,
      source_type,
      first_detected_at,
      last_checked_at,
      metadata
    )
  values (
    p_organization_id,
    v_event_key,
    'appointment_due',
    'new',
    'normal',
    v_title,
    v_message,
    'appointment_program',
    now(),
    now(),
    jsonb_build_object(
      'calendarYear',
        v_year,

      'quarter',
        v_target_quarter,

      'nextRequiredMeeting',
        v_next
    )
  )

  returning *
  into v_event;


  return
    jsonb_build_object(
      'created',
        true,

      'eventId',
        v_event.id,

      'eventKey',
        v_event.event_key,

      'title',
        v_event.title,

      'customerMessage',
        v_event.customer_message
    );

end;
$$;


revoke all
on function
public.wize_detect_appointment_event(uuid)
from public, anon;

grant execute
on function
public.wize_detect_appointment_event(uuid)
to authenticated;


commit;
