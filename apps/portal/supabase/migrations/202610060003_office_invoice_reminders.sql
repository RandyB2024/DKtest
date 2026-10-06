begin;

-- ============================================================
-- BESTEMD AUTOMATISCHE BETALINGSHERINNERINGEN
--
-- Klant kan géén herinneringen versturen.
-- Alleen Bestemd Office / het systeem verzorgt dit proces.
--
-- Planning:
-- reminder_1  : eerste dag na vervaldatum
-- reminder_2  : minimaal 7 dagen na reminder_1
-- final_notice: minimaal 7 dagen na reminder_2
--
-- Iedere claim controleert opnieuw:
-- - definitieve factuur
-- - niet gecrediteerd/geannuleerd
-- - nog openstaand
-- - originele factuur verzonden
-- - vorige herinnering correct afgerond
-- ============================================================


create or replace function
public.get_office_due_invoice_reminders(
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_limit integer;
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
      message = 'Alleen Office heeft toegang tot betalingsbewaking.';
  end if;


  v_limit :=
    greatest(
      1,
      least(
        coalesce(
          p_limit,
          100
        ),
        500
      )
    );


  with eligible as (

    select
      i.id,
      i.organization_id,
      i.invoice_number,
      i.invoice_date,
      i.due_date,
      i.total_cents,
      i.paid_cents,

      greatest(
        i.total_cents -
        i.paid_cents,
        0
      )
        as outstanding_cents,

      i.payment_status,
      i.collection_status,

      d.id
        as debtor_id,

      d.name
        as debtor_name,

      d.email
        as debtor_email,

      (
        select max(sd.sent_at)
        from public.sales_invoice_deliveries sd
        where
          sd.organization_id =
            i.organization_id
          and sd.invoice_id =
            i.id
          and sd.delivery_type =
            'invoice'
          and sd.status =
            'sent'
      )
        as invoice_sent_at,

      (
        select max(sd.sent_at)
        from public.sales_invoice_deliveries sd
        where
          sd.organization_id =
            i.organization_id
          and sd.invoice_id =
            i.id
          and sd.delivery_type =
            'reminder_1'
          and sd.status =
            'sent'
      )
        as reminder_1_sent_at,

      (
        select max(sd.sent_at)
        from public.sales_invoice_deliveries sd
        where
          sd.organization_id =
            i.organization_id
          and sd.invoice_id =
            i.id
          and sd.delivery_type =
            'reminder_2'
          and sd.status =
            'sent'
      )
        as reminder_2_sent_at,

      (
        select max(sd.sent_at)
        from public.sales_invoice_deliveries sd
        where
          sd.organization_id =
            i.organization_id
          and sd.invoice_id =
            i.id
          and sd.delivery_type =
            'final_notice'
          and sd.status =
            'sent'
      )
        as final_notice_sent_at

    from public.sales_invoices i

    join public.debtors d
      on d.id =
        i.debtor_id
      and d.organization_id =
        i.organization_id

    where
      i.invoice_kind =
        'invoice'

      and i.document_status =
        'issued'

      and i.archived_at
        is null

      and i.payment_status
        in (
          'unpaid',
          'partially_paid'
        )

      and i.total_cents >
          i.paid_cents

      and i.sent_at
        is not null

      and i.due_date <
        current_date

      and d.email
        is not null

      and trim(d.email) <> ''
  ),

  due as (

    select
      eligible.*,

      case

        when
          reminder_1_sent_at is null
          and invoice_sent_at is not null
          and current_date >
              due_date
        then 'reminder_1'


        when
          reminder_1_sent_at is not null
          and reminder_2_sent_at is null
          and now() >=
              reminder_1_sent_at
              + interval '7 days'
        then 'reminder_2'


        when
          reminder_2_sent_at is not null
          and final_notice_sent_at is null
          and now() >=
              reminder_2_sent_at
              + interval '7 days'
        then 'final_notice'


        else null

      end
        as next_delivery_type

    from eligible
  )


  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'invoiceId',
            id,

          'organizationId',
            organization_id,

          'invoiceNumber',
            invoice_number,

          'invoiceDate',
            invoice_date,

          'dueDate',
            due_date,

          'totalCents',
            total_cents,

          'paidCents',
            paid_cents,

          'outstandingCents',
            outstanding_cents,

          'paymentStatus',
            payment_status,

          'collectionStatus',
            collection_status,

          'debtorId',
            debtor_id,

          'debtorName',
            debtor_name,

          'debtorEmail',
            debtor_email,

          'deliveryType',
            next_delivery_type
        )

        order by
          due_date asc,
          invoice_number asc
      ),
      '[]'::jsonb
    )

  into v_result

  from (
    select *
    from due
    where next_delivery_type
      is not null

    order by
      due_date asc,
      invoice_number asc

    limit v_limit
  ) items;


  return v_result;

end;
$$;



-- ============================================================
-- OFFICE CLAIM
--
-- Dit is de laatste controle vóór het daadwerkelijke
-- verzenden van een herinnering.
-- ============================================================

create or replace function
public.office_claim_invoice_reminder(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_delivery_type text,
  p_recipient_email text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare

  v_invoice
    public.sales_invoices%rowtype;

  v_delivery
    public.sales_invoice_deliveries%rowtype;

  v_invoice_sent_at
    timestamptz;

  v_reminder_1_sent_at
    timestamptz;

  v_reminder_2_sent_at
    timestamptz;

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
      message = 'Alleen Office mag betalingsherinneringen verwerken.';
  end if;


  if p_delivery_type not in (
    'reminder_1',
    'reminder_2',
    'final_notice'
  ) then
    raise exception
      'Ongeldig herinneringstype.';
  end if;


  if
    p_recipient_email is null
    or position(
      '@' in p_recipient_email
    ) < 2
  then
    raise exception
      'Ongeldig e-mailadres.';
  end if;


  select *
  into v_invoice
  from public.sales_invoices

  where
    id =
      p_invoice_id

    and organization_id =
      p_organization_id

  for update;


  if not found then
    raise exception
      'Factuur bestaat niet.';
  end if;


  -- =========================================================
  -- KRITISCHE LAATSTE CONTROLE
  -- =========================================================

  if v_invoice.invoice_kind <>
    'invoice'
  then
    raise exception
      'Deze factuur kan geen betalingsherinnering ontvangen.';
  end if;


  if v_invoice.document_status <>
    'issued'
  then
    raise exception
      'Deze factuur is niet meer actief.';
  end if;


  if v_invoice.payment_status not in (
    'unpaid',
    'partially_paid'
  ) then
    raise exception
      'Deze factuur hoeft niet meer te worden betaald.';
  end if;


  if
    v_invoice.paid_cents >=
    v_invoice.total_cents
  then
    raise exception
      'Deze factuur is inmiddels betaald.';
  end if;


  if current_date <=
    v_invoice.due_date
  then
    raise exception
      'De betaaltermijn is nog niet verstreken.';
  end if;


  select max(sent_at)
  into v_invoice_sent_at

  from public.sales_invoice_deliveries

  where
    organization_id =
      p_organization_id

    and invoice_id =
      p_invoice_id

    and delivery_type =
      'invoice'

    and status =
      'sent';


  if v_invoice_sent_at
    is null
  then
    raise exception
      'De oorspronkelijke factuur is nog niet verzonden.';
  end if;


  select max(sent_at)
  into v_reminder_1_sent_at

  from public.sales_invoice_deliveries

  where
    organization_id =
      p_organization_id

    and invoice_id =
      p_invoice_id

    and delivery_type =
      'reminder_1'

    and status =
      'sent';


  select max(sent_at)
  into v_reminder_2_sent_at

  from public.sales_invoice_deliveries

  where
    organization_id =
      p_organization_id

    and invoice_id =
      p_invoice_id

    and delivery_type =
      'reminder_2'

    and status =
      'sent';


  if p_delivery_type =
    'reminder_1'
  then

    if v_reminder_1_sent_at
      is not null
    then
      raise exception
        'De eerste betalingsherinnering is al verzonden.';
    end if;

  end if;


  if p_delivery_type =
    'reminder_2'
  then

    if v_reminder_1_sent_at
      is null
    then
      raise exception
        'De eerste betalingsherinnering ontbreekt.';
    end if;


    if now() <
      v_reminder_1_sent_at +
      interval '7 days'
    then
      raise exception
        'De tweede betalingsherinnering is nog niet toegestaan.';
    end if;


    if v_reminder_2_sent_at
      is not null
    then
      raise exception
        'De tweede betalingsherinnering is al verzonden.';
    end if;

  end if;


  if p_delivery_type =
    'final_notice'
  then

    if v_reminder_2_sent_at
      is null
    then
      raise exception
        'De tweede betalingsherinnering ontbreekt.';
    end if;


    if now() <
      v_reminder_2_sent_at +
      interval '7 days'
    then
      raise exception
        'De laatste betalingsherinnering is nog niet toegestaan.';
    end if;


    if exists (
      select 1

      from public.sales_invoice_deliveries

      where
        organization_id =
          p_organization_id

        and invoice_id =
          p_invoice_id

        and delivery_type =
          'final_notice'

        and status =
          'sent'
    ) then
      raise exception
        'De laatste betalingsherinnering is al verzonden.';
    end if;

  end if;


  -- Zelfde aanvraag opnieuw uitgevoerd?
  select *
  into v_delivery

  from public.sales_invoice_deliveries

  where
    organization_id =
      p_organization_id

    and invoice_id =
      p_invoice_id

    and delivery_type =
      p_delivery_type

    and idempotency_key =
      p_idempotency_key

  limit 1;


  if found then

    return jsonb_build_object(
      'deliveryId',
        v_delivery.id,

      'status',
        v_delivery.status,

      'claimed',
        false
    );

  end if;


  insert into
    public.sales_invoice_deliveries (
      organization_id,
      invoice_id,
      delivery_type,
      recipient_email,
      status,
      attempts,
      created_by,
      idempotency_key
    )

  values (
    p_organization_id,
    p_invoice_id,
    p_delivery_type,
    lower(
      trim(
        p_recipient_email
      )
    ),
    'pending',
    1,
    auth.uid(),
    p_idempotency_key
  )

  returning *
  into v_delivery;


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
    auth.uid(),
    p_organization_id,
    'invoice_reminder_claimed',
    'sales_invoice',
    p_invoice_id,
    'success',

    jsonb_build_object(
      'delivery_id',
        v_delivery.id,

      'delivery_type',
        p_delivery_type,

      'recipient_email',
        lower(
          trim(
            p_recipient_email
          )
        )
    )
  );


  return jsonb_build_object(
    'deliveryId',
      v_delivery.id,

    'status',
      v_delivery.status,

    'claimed',
      true
  );

end;
$$;



-- ============================================================
-- OFFICE FINISH
-- ============================================================

create or replace function
public.office_finish_invoice_reminder(
  p_organization_id uuid,
  p_delivery_id uuid,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare

  v_delivery
    public.sales_invoice_deliveries%rowtype;

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
      message = 'Alleen Office mag betalingsherinneringen verwerken.';
  end if;


  if p_status not in (
    'sent',
    'failed'
  ) then
    raise exception
      'Ongeldige verzendstatus.';
  end if;


  select *
  into v_delivery

  from public.sales_invoice_deliveries

  where
    id =
      p_delivery_id

    and organization_id =
      p_organization_id

  for update;


  if not found then
    raise exception
      'Verzendpoging bestaat niet.';
  end if;


  if v_delivery.delivery_type not in (
    'reminder_1',
    'reminder_2',
    'final_notice'
  ) then
    raise exception
      'Deze verzending is geen betalingsherinnering.';
  end if;


  update public.sales_invoice_deliveries
  set
    status =
      p_status,

    sent_at =
      case
        when p_status =
          'sent'
        then now()
        else sent_at
      end,

    last_error =
      case
        when p_status =
          'failed'
        then left(
          coalesce(
            p_error,
            'Onbekende verzendfout'
          ),
          1000
        )
        else null
      end,

    updated_at =
      now()

  where id =
    p_delivery_id

  returning *
  into v_delivery;


  if p_status =
    'sent'
  then

    update public.sales_invoices
    set
      last_reminder_at =
        v_delivery.sent_at,

      collection_status =
        v_delivery.delivery_type,

      updated_at =
        now()

    where
      id =
        v_delivery.invoice_id

      and organization_id =
        p_organization_id

      /*
       * Extra veiligheid:
       * betaling kan tussen claim en finish
       * binnengekomen zijn.
       */
      and payment_status in (
        'unpaid',
        'partially_paid'
      )

      and paid_cents <
        total_cents

      and document_status =
        'issued';

  end if;


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
    auth.uid(),
    p_organization_id,

    case
      when p_status =
        'sent'
      then 'invoice_reminder_sent'
      else 'invoice_reminder_failed'
    end,

    'sales_invoice',
    v_delivery.invoice_id,

    case
      when p_status =
        'sent'
      then 'success'
      else 'failed'
    end,

    jsonb_build_object(
      'delivery_id',
        v_delivery.id,

      'delivery_type',
        v_delivery.delivery_type,

      'recipient_email',
        v_delivery.recipient_email,

      'error',
        case
          when p_status =
            'failed'
          then left(
            coalesce(
              p_error,
              ''
            ),
            500
          )
          else null
        end
    )
  );


  return jsonb_build_object(
    'deliveryId',
      v_delivery.id,

    'invoiceId',
      v_delivery.invoice_id,

    'deliveryType',
      v_delivery.delivery_type,

    'status',
      v_delivery.status,

    'sentAt',
      v_delivery.sent_at
  );

end;
$$;



revoke all
on function
public.get_office_due_invoice_reminders(
  integer
)
from public, anon;


grant execute
on function
public.get_office_due_invoice_reminders(
  integer
)
to authenticated;



revoke all
on function
public.office_claim_invoice_reminder(
  uuid,
  uuid,
  text,
  text,
  uuid
)
from public, anon;


grant execute
on function
public.office_claim_invoice_reminder(
  uuid,
  uuid,
  text,
  text,
  uuid
)
to authenticated;



revoke all
on function
public.office_finish_invoice_reminder(
  uuid,
  uuid,
  text,
  text
)
from public, anon;


grant execute
on function
public.office_finish_invoice_reminder(
  uuid,
  uuid,
  text,
  text
)
to authenticated;


commit;
