begin;


-- ============================================================
-- TAX PERIODS + WIZE DEADLINES V1
--
-- Centrale bron voor fiscale perioden.
--
-- BELANGRIJK:
-- deadlines worden opgeslagen als gegevens.
-- Wize verzint/berekent geen wettelijke deadline zelf.
--
-- Voorbeeld:
-- VAT Q1 2027
-- period_start = 2027-01-01
-- period_end   = 2027-03-31
-- due_date     = echte aangiftedatum
-- ============================================================


create table if not exists
public.tax_periods (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  tax_type text not null
    check (
      tax_type in (
        'vat',
        'icp',
        'oss',
        'payroll',
        'corporate_tax',
        'income_tax',
        'dividend_tax'
      )
    ),

  period_start date not null,

  period_end date not null,

  due_date date not null,

  payment_due_date date,

  status text not null
    default 'draft'
    check (
      status in (
        'draft',
        'prepared',
        'ready',
        'submitted',
        'accepted',
        'rejected',
        'paid',
        'not_applicable'
      )
    ),

  reference text,

  source text not null
    default 'manual'
    check (
      source in (
        'manual',
        'system',
        'digipoort',
        'import'
      )
    ),

  submitted_at timestamptz,

  accepted_at timestamptz,

  paid_at timestamptz,

  created_by uuid
    references public.profiles(id)
    on delete set null,

  updated_by uuid
    references public.profiles(id)
    on delete set null,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  check (
    period_end >=
      period_start
  ),

  unique (
    organization_id,
    tax_type,
    period_start,
    period_end
  )
);


create index if not exists
tax_periods_org_due_idx
on public.tax_periods (
  organization_id,
  tax_type,
  due_date,
  status
);


alter table
public.tax_periods
enable row level security;


revoke all
on public.tax_periods
from public, anon, authenticated;



-- ============================================================
-- OFFICE: FISCALE PERIODE OPSLAAN
-- ============================================================

create or replace function
public.office_tax_upsert_period(
  p_organization_id uuid,
  p_tax_type text,
  p_period_start date,
  p_period_end date,
  p_due_date date,
  p_payment_due_date date default null,
  p_status text default 'draft',
  p_reference text default null,
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;

  v_period
    public.tax_periods%rowtype;
begin

  v_actor :=
    public.wize_require_office_admin();


  if p_tax_type not in (
    'vat',
    'icp',
    'oss',
    'payroll',
    'corporate_tax',
    'income_tax',
    'dividend_tax'
  ) then

    raise exception using
      errcode = '22023',
      message = 'Ongeldig aangiftetype.';

  end if;


  if p_status not in (
    'draft',
    'prepared',
    'ready',
    'submitted',
    'accepted',
    'rejected',
    'paid',
    'not_applicable'
  ) then

    raise exception using
      errcode = '22023',
      message = 'Ongeldige aangiftestatus.';

  end if;


  if
    p_period_start is null
    or p_period_end is null
    or p_due_date is null
    or p_period_end < p_period_start
  then

    raise exception using
      errcode = '22023',
      message = 'Ongeldige fiscale periode.';

  end if;


  if not exists (
    select 1

    from public.organizations organization

    join public.customer_relationships relationship
      on relationship.id =
        organization.customer_relationship_id

    where
      organization.id =
        p_organization_id

      and organization.archived_at
        is null

      and relationship.archived_at
        is null

      and relationship.status =
        'active'
  ) then

    raise exception using
      errcode = 'P0002',
      message = 'Onderneming niet gevonden.';

  end if;


  insert into
    public.tax_periods (
      organization_id,
      tax_type,
      period_start,
      period_end,
      due_date,
      payment_due_date,
      status,
      reference,
      source,
      submitted_at,
      accepted_at,
      paid_at,
      created_by,
      updated_by
    )

  values (
    p_organization_id,
    p_tax_type,
    p_period_start,
    p_period_end,
    p_due_date,
    p_payment_due_date,
    p_status,
    nullif(
      btrim(
        coalesce(
          p_reference,
          ''
        )
      ),
      ''
    ),
    p_source,

    case
      when p_status in (
        'submitted',
        'accepted',
        'paid'
      )
        then now()
      else null
    end,

    case
      when p_status in (
        'accepted',
        'paid'
      )
        then now()
      else null
    end,

    case
      when p_status =
        'paid'
        then now()
      else null
    end,

    v_actor,
    v_actor
  )

  on conflict (
    organization_id,
    tax_type,
    period_start,
    period_end
  )

  do update
  set
    due_date =
      excluded.due_date,

    payment_due_date =
      excluded.payment_due_date,

    status =
      excluded.status,

    reference =
      excluded.reference,

    source =
      excluded.source,

    submitted_at =
      case
        when excluded.status in (
          'submitted',
          'accepted',
          'paid'
        )
          then coalesce(
            tax_periods.submitted_at,
            now()
          )
        else
          tax_periods.submitted_at
      end,

    accepted_at =
      case
        when excluded.status in (
          'accepted',
          'paid'
        )
          then coalesce(
            tax_periods.accepted_at,
            now()
          )
        else
          tax_periods.accepted_at
      end,

    paid_at =
      case
        when excluded.status =
          'paid'
          then coalesce(
            tax_periods.paid_at,
            now()
          )
        else
          tax_periods.paid_at
      end,

    updated_by =
      v_actor,

    updated_at =
      now()

  returning *
  into v_period;


  return
    jsonb_build_object(
      'id',
        v_period.id,

      'organizationId',
        v_period.organization_id,

      'taxType',
        v_period.tax_type,

      'periodStart',
        v_period.period_start,

      'periodEnd',
        v_period.period_end,

      'dueDate',
        v_period.due_date,

      'status',
        v_period.status
    );

end;
$$;


revoke all
on function
public.office_tax_upsert_period(
  uuid,
  text,
  date,
  date,
  date,
  date,
  text,
  text,
  text
)
from public, anon;


grant execute
on function
public.office_tax_upsert_period(
  uuid,
  text,
  date,
  date,
  date,
  date,
  text,
  text,
  text
)
to authenticated;



-- ============================================================
-- WIZE BTW-DEADLINE DETECTOR
-- ============================================================

create or replace function
public.wize_detect_vat_deadline_events(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_period
    public.tax_periods%rowtype;

  v_event
    public.wize_events%rowtype;

  v_key text;

  v_days integer;

  v_created integer := 0;
  v_updated integer := 0;
  v_resolved integer := 0;
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


  -- ==========================================================
  -- AFGERONDE BTW-SIGNALEN OPLOSSEN
  -- ==========================================================

  with resolved_events as (

    update public.wize_events event

    set
      status =
        'resolved',

      resolved_at =
        coalesce(
          resolved_at,
          now()
        ),

      next_reminder_at =
        null,

      last_checked_at =
        now(),

      updated_at =
        now()

    where
      event.organization_id =
        p_organization_id

      and event.event_type =
        'vat_deadline'

      and event.status in (
        'new',
        'asked',
        'snoozed',
        'escalated'
      )

      and exists (
        select 1
        from public.tax_periods period

        where
          period.id =
            event.source_id

          and period.organization_id =
            p_organization_id

          and period.status in (
            'submitted',
            'accepted',
            'paid',
            'not_applicable'
          )
      )

    returning event.id
  )

  select count(*)
  into v_resolved
  from resolved_events;


  -- ==========================================================
  -- BTW-PERIODES BINNEN 14 DAGEN / VERLOPEN
  -- ==========================================================

  for v_period in

    select *

    from public.tax_periods

    where
      organization_id =
        p_organization_id

      and tax_type =
        'vat'

      and status in (
        'draft',
        'prepared',
        'ready',
        'rejected'
      )

      and due_date <=
        current_date + 14

    order by
      due_date asc

    limit 20

  loop

    v_days :=
      v_period.due_date -
      current_date;


    v_key :=
      'vat_deadline:' ||
      v_period.id::text;


    select *
    into v_event

    from public.wize_events

    where
      organization_id =
        p_organization_id

      and event_key =
        v_key

    limit 1;


    if found then

      if v_event.status not in (
        'resolved',
        'dismissed'
      ) then

        update public.wize_events

        set
          priority =
            case
              when v_days < 0
                then 'critical'

              when v_days <= 3
                then 'high'

              else
                'normal'
            end,

          title =
            case
              when v_days < 0
                then 'BTW-aangifte deadline verstreken'
              else
                'BTW-aangifte nadert'
            end,

          customer_message =
            case

              when v_days < 0 then
                'De deadline voor deze BTW-aangifte is verstreken. Bestemd controleert graag met je wat er nog nodig is.'

              when v_days = 0 then
                'De deadline voor deze BTW-aangifte is vandaag. Controleer of alles compleet is.'

              when v_days = 1 then
                'De deadline voor deze BTW-aangifte is morgen. Controleer of alles compleet is.'

              else
                'De deadline voor deze BTW-aangifte is over ' ||
                v_days ||
                ' dagen. Zorg dat ontbrekende documenten op tijd zijn aangeleverd.'

            end,

          source_type =
            'tax_period',

          source_id =
            v_period.id,

          last_checked_at =
            now(),

          metadata =
            jsonb_build_object(
              'taxType',
                'vat',

              'periodStart',
                v_period.period_start,

              'periodEnd',
                v_period.period_end,

              'dueDate',
                v_period.due_date,

              'status',
                v_period.status
            ),

          updated_at =
            now()

        where id =
          v_event.id;


        v_updated :=
          v_updated + 1;

      end if;


    else

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
          source_id,
          metadata
        )

      values (
        p_organization_id,
        v_key,
        'vat_deadline',
        'new',

        case
          when v_days < 0
            then 'critical'

          when v_days <= 3
            then 'high'

          else
            'normal'
        end,

        case
          when v_days < 0
            then 'BTW-aangifte deadline verstreken'
          else
            'BTW-aangifte nadert'
        end,

        case

          when v_days < 0 then
            'De deadline voor deze BTW-aangifte is verstreken. Bestemd controleert graag met je wat er nog nodig is.'

          when v_days = 0 then
            'De deadline voor deze BTW-aangifte is vandaag. Controleer of alles compleet is.'

          when v_days = 1 then
            'De deadline voor deze BTW-aangifte is morgen. Controleer of alles compleet is.'

          else
            'De deadline voor deze BTW-aangifte is over ' ||
            v_days ||
            ' dagen. Zorg dat ontbrekende documenten op tijd zijn aangeleverd.'

        end,

        'tax_period',
        v_period.id,

        jsonb_build_object(
          'taxType',
            'vat',

          'periodStart',
            v_period.period_start,

          'periodEnd',
            v_period.period_end,

          'dueDate',
            v_period.due_date,

          'status',
            v_period.status
        )
      );


      v_created :=
        v_created + 1;

    end if;

  end loop;


  return
    jsonb_build_object(
      'organizationId',
        p_organization_id,

      'created',
        v_created,

      'updated',
        v_updated,

      'resolved',
        v_resolved
    );

end;
$$;


revoke all
on function
public.wize_detect_vat_deadline_events(uuid)
from public, anon;


grant execute
on function
public.wize_detect_vat_deadline_events(uuid)
to authenticated;


commit;
