-- ============================================================
-- WIZE BANK / DOCUMENT EVENTS V1
--
-- Detecteert uitgaande bankmutaties die nog niet verwerkt zijn.
--
-- Wize maakt hiervoor een persistent event:
--
-- bank_document_missing:<transaction_uuid>
--
-- Het event wordt automatisch opgelost zodra:
-- - de bankmutatie matched is;
-- - de bankmutatie genegeerd/geannuleerd is;
-- - er een payment is gekoppeld;
-- - een documentverzoek als received is geregistreerd.
--
-- SECURITY:
-- - alleen ingelogd;
-- - AAL2 verplicht;
-- - klant alleen eigen onderneming;
-- - Office alleen via bestaande Office-toegang;
-- - geen vrije event-parameters vanuit browser.
-- ============================================================

begin;


create or replace function
public.wize_detect_bank_document_events(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_transaction
    public.bank_transactions%rowtype;

  v_event_key text;

  v_event
    public.wize_events%rowtype;

  v_created integer := 0;
  v_updated integer := 0;
  v_resolved integer := 0;

  v_party text;
  v_amount text;
  v_message text;
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
    from public.organizations o

    join public.customer_relationships c
      on c.id =
        o.customer_relationship_id

    where
      o.id =
        p_organization_id

      and o.archived_at is null

      and c.archived_at is null

      and c.status = 'active'
  ) then

    raise exception using
      errcode = 'P0002',
      message = 'Onderneming niet gevonden.';

  end if;


  -- ==========================================================
  -- 1. EVENTS OPLOSSEN
  --
  -- Een bestaand ontbrekend-document-signaal is niet meer
  -- relevant als de bankmutatie inmiddels is verwerkt.
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
        'bank_document_missing'

      and event.status in (
        'new',
        'asked',
        'snoozed',
        'escalated'
      )

      and exists (
        select 1
        from public.bank_transactions transaction

        where
          transaction.id =
            event.source_id

          and transaction.organization_id =
            p_organization_id

          and (
            transaction.status =
              'cancelled'

            or transaction.reconciliation_status in (
              'matched',
              'ignored'
            )

            or transaction.payment_id
              is not null

            or exists (
              select 1
              from public.bank_document_requests request

              where
                request.organization_id =
                  p_organization_id

                and request.bank_transaction_id =
                  transaction.id

                and request.status =
                  'received'
            )
          )
      )

    returning event.id
  )

  select count(*)
  into v_resolved
  from resolved_events;


  -- ==========================================================
  -- 2. ONTBREKENDE DOCUMENTEN DETECTEREN
  --
  -- Alleen:
  -- - geboekte mutaties
  -- - uitgaand
  -- - nog niet verwerkt
  -- - maximaal 90 dagen terug
  --
  -- Eén bankmutatie = één stabiele event_key.
  -- ==========================================================

  for v_transaction in

    select transaction.*

    from public.bank_transactions transaction

    where
      transaction.organization_id =
        p_organization_id

      and transaction.status =
        'booked'

      and transaction.amount_cents < 0

      and transaction.reconciliation_status in (
        'unmatched',
        'suggested'
      )

      and transaction.payment_id
        is null

      and transaction.booked_at >=
        now() - interval '90 days'

      and not exists (
        select 1
        from public.bank_document_requests request

        where
          request.organization_id =
            p_organization_id

          and request.bank_transaction_id =
            transaction.id

          and request.status =
            'received'
      )

    order by
      transaction.booked_at desc,
      transaction.id desc

    limit 50

  loop

    v_event_key :=
      'bank_document_missing:' ||
      v_transaction.id::text;


    v_party :=
      nullif(
        btrim(
          coalesce(
            v_transaction.counterparty_name,
            ''
          )
        ),
        ''
      );


    v_amount :=
      replace(
        to_char(
          (
            abs(
              v_transaction.amount_cents
            )::numeric
            / 100
          ),
          'FM999999990.00'
        ),
        '.',
        ','
      );


    v_message :=
      'Ik mis volgens mij nog een bon of factuur bij de betaling van €' ||
      v_amount ||
      case
        when v_party is not null
          then ' aan ' || v_party
        else ''
      end ||
      '. Wil je die even toevoegen? Dan kan de administratie weer verder.';


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

      -- -------------------------------------------------------
      -- Resolved/dismissed signalen worden niet automatisch
      -- opnieuw geopend.
      -- -------------------------------------------------------

      if v_event.status not in (
        'resolved',
        'dismissed'
      ) then

        update public.wize_events

        set
          priority =
            case
              when v_transaction.booked_at <
                now() - interval '30 days'
                then 'high'
              else 'normal'
            end,

          title =
            'Bon of factuur ontbreekt',

          customer_message =
            v_message,

          source_type =
            'bank_transaction',

          source_id =
            v_transaction.id,

          last_checked_at =
            now(),

          metadata =
            jsonb_build_object(
              'amountCents',
                abs(
                  v_transaction.amount_cents
                ),

              'bookedAt',
                v_transaction.booked_at,

              'counterpartyName',
                v_transaction.counterparty_name,

              'reconciliationStatus',
                v_transaction.reconciliation_status
            ),

          updated_at =
            now()

        where id =
          v_event.id;


        v_updated :=
          v_updated + 1;

      end if;


    else

      insert into public.wize_events (
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
        'bank_document_missing',
        'new',

        case
          when v_transaction.booked_at <
            now() - interval '30 days'
            then 'high'
          else 'normal'
        end,

        'Bon of factuur ontbreekt',
        v_message,
        'bank_transaction',
        v_transaction.id,
        now(),
        now(),

        jsonb_build_object(
          'amountCents',
            abs(
              v_transaction.amount_cents
            ),

          'bookedAt',
            v_transaction.booked_at,

          'counterpartyName',
            v_transaction.counterparty_name,

          'reconciliationStatus',
            v_transaction.reconciliation_status
        )
      );


      v_created :=
        v_created + 1;

    end if;

  end loop;


  -- ==========================================================
  -- AUDIT
  --
  -- Geen klantbericht / volledige metadata in audit.
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
    'wize.bank_document_detection',
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


  return jsonb_build_object(
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
public.wize_detect_bank_document_events(uuid)
from public, anon;


grant execute
on function
public.wize_detect_bank_document_events(uuid)
to authenticated;


commit;
