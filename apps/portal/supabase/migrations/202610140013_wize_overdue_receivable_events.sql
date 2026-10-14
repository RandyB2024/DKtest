begin;


-- ============================================================
-- WIZE OVERDUE RECEIVABLE EVENTS V1
--
-- Per vervallen verkoopfactuur ontstaat één persistent signaal:
--
-- overdue_invoice:<invoice_uuid>
--
-- Automatisch opgelost zodra:
-- - factuur volledig betaald is;
-- - factuur niet meer vervallen is;
-- - factuur gecrediteerd/geannuleerd/gearchiveerd is.
--
-- SECURITY:
-- - ingelogd
-- - AAL2
-- - klant alleen eigen onderneming
-- - Office via bestaande Wize Office-grens
-- ============================================================


create or replace function
public.wize_detect_overdue_receivable_events(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_invoice record;

  v_event
    public.wize_events%rowtype;

  v_event_key text;

  v_amount text;
  v_debtor text;
  v_invoice_number text;
  v_message text;

  v_created integer := 0;
  v_updated integer := 0;
  v_resolved integer := 0;
begin

  -- ==========================================================
  -- AUTH
  -- ==========================================================

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


  -- ==========================================================
  -- TENANT BOUNDARY
  -- ==========================================================

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


  -- ==========================================================
  -- 1. OUDE SIGNALEN AUTOMATISCH OPLOSSEN
  -- ==========================================================

  with resolved_events as (

    update public.wize_events event

    set
      status =
        'resolved',

      resolved_at =
        coalesce(
          event.resolved_at,
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
        'overdue_invoice'

      and event.status in (
        'new',
        'asked',
        'snoozed',
        'escalated'
      )

      and not exists (
        select 1
        from public.sales_invoices invoice

        where
          invoice.id =
            event.source_id

          and invoice.organization_id =
            p_organization_id

          and invoice.archived_at
            is null

          and invoice.due_date <
            current_date

          and invoice.total_cents >
            invoice.paid_cents

          and lower(
            invoice.status
          ) not in (
            'draft',
            'concept',
            'paid',
            'betaald',
            'credited',
            'gecrediteerd',
            'cancelled',
            'geannuleerd'
          )
      )

    returning event.id
  )

  select count(*)
  into v_resolved
  from resolved_events;


  -- ==========================================================
  -- 2. VERLOPEN FACTUREN DETECTEREN
  -- ==========================================================

  for v_invoice in

    select
      invoice.id,
      invoice.invoice_number,
      invoice.due_date,
      invoice.total_cents,
      invoice.paid_cents,

      greatest(
        invoice.total_cents -
        invoice.paid_cents,
        0
      ) as outstanding_cents,

      debtor.name
        as debtor_name,

      (
        current_date -
        invoice.due_date
      )::integer
        as days_overdue

    from public.sales_invoices invoice

    join public.debtors debtor
      on debtor.id =
        invoice.debtor_id

      and debtor.organization_id =
        invoice.organization_id

    where
      invoice.organization_id =
        p_organization_id

      and invoice.archived_at
        is null

      and invoice.due_date <
        current_date

      and invoice.total_cents >
        invoice.paid_cents

      and lower(
        invoice.status
      ) not in (
        'draft',
        'concept',
        'paid',
        'betaald',
        'credited',
        'gecrediteerd',
        'cancelled',
        'geannuleerd'
      )

    order by
      invoice.due_date asc,
      invoice.id asc

    limit 100

  loop

    v_event_key :=
      'overdue_invoice:' ||
      v_invoice.id::text;


    v_amount :=
      replace(
        to_char(
          (
            v_invoice.outstanding_cents::numeric
            / 100
          ),
          'FM999999990.00'
        ),
        '.',
        ','
      );


    v_debtor :=
      nullif(
        btrim(
          coalesce(
            v_invoice.debtor_name,
            ''
          )
        ),
        ''
      );


    v_invoice_number :=
      nullif(
        btrim(
          coalesce(
            v_invoice.invoice_number,
            ''
          )
        ),
        ''
      );


    v_message :=
      'Even een seintje: ' ||

      case
        when v_invoice_number is not null
          then 'factuur ' ||
            v_invoice_number ||
            ' '
        else
          'een factuur '
      end ||

      case
        when v_debtor is not null
          then 'aan ' ||
            v_debtor ||
            ' '
        else
          ''
      end ||

      'staat nog voor €' ||
      v_amount ||
      ' open en is inmiddels ' ||
      v_invoice.days_overdue ||
      case
        when v_invoice.days_overdue = 1
          then ' dag'
        else
          ' dagen'
      end ||
      ' over de betaaltermijn. Wil je die even bekijken?';


    select *
    into v_event

    from public.wize_events event

    where
      event.organization_id =
        p_organization_id

      and event.event_key =
        v_event_key

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
              when v_invoice.days_overdue >= 30
                then 'high'
              else
                'normal'
            end,

          title =
            'Factuur over betaaltermijn',

          customer_message =
            v_message,

          source_type =
            'sales_invoice',

          source_id =
            v_invoice.id,

          last_checked_at =
            now(),

          metadata =
            jsonb_build_object(
              'invoiceNumber',
                v_invoice.invoice_number,

              'debtorName',
                v_invoice.debtor_name,

              'dueDate',
                v_invoice.due_date,

              'daysOverdue',
                v_invoice.days_overdue,

              'outstandingCents',
                v_invoice.outstanding_cents
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
          first_detected_at,
          last_checked_at,
          metadata
        )

      values (
        p_organization_id,
        v_event_key,
        'overdue_invoice',
        'new',

        case
          when v_invoice.days_overdue >= 30
            then 'high'
          else
            'normal'
        end,

        'Factuur over betaaltermijn',
        v_message,
        'sales_invoice',
        v_invoice.id,
        now(),
        now(),

        jsonb_build_object(
          'invoiceNumber',
            v_invoice.invoice_number,

          'debtorName',
            v_invoice.debtor_name,

          'dueDate',
            v_invoice.due_date,

          'daysOverdue',
            v_invoice.days_overdue,

          'outstandingCents',
            v_invoice.outstanding_cents
        )
      );


      v_created :=
        v_created + 1;

    end if;

  end loop;


  -- ==========================================================
  -- AUDIT
  -- ==========================================================

  insert into public.audit_events (
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
    'wize.overdue_receivable_detection',
    'organization',
    p_organization_id,
    'success',

    jsonb_build_object(
      'created',
        v_created,

      'updated',
        v_updated,

      'resolved',
        v_resolved
    )
  );


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
public.wize_detect_overdue_receivable_events(uuid)
from public, anon;


grant execute
on function
public.wize_detect_overdue_receivable_events(uuid)
to authenticated;


commit;
