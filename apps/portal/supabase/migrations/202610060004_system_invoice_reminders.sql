begin;

-- ============================================================
-- BESTEMD SYSTEM REMINDER RUNNER
--
-- De automatische Cloudflare-run gebruikt de Supabase
-- service-role. Deze functies zijn NIET beschikbaar voor
-- authenticated/anon gebruikers.
-- ============================================================


-- Systeemacties hebben geen menselijke created_by.
alter table public.sales_invoice_deliveries
  alter column created_by drop not null;



create or replace function
public.system_get_due_invoice_reminders(
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

  v_limit :=
    greatest(
      1,
      least(
        coalesce(p_limit, 100),
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
      i.pdf_storage_path,

      greatest(
        i.total_cents -
        i.paid_cents,
        0
      ) as outstanding_cents,

      d.id as debtor_id,
      d.name as debtor_name,
      d.email as debtor_email,

      (
        select max(sd.sent_at)
        from public.sales_invoice_deliveries sd
        where
          sd.organization_id = i.organization_id
          and sd.invoice_id = i.id
          and sd.delivery_type = 'invoice'
          and sd.status = 'sent'
      ) as invoice_sent_at,

      (
        select max(sd.sent_at)
        from public.sales_invoice_deliveries sd
        where
          sd.organization_id = i.organization_id
          and sd.invoice_id = i.id
          and sd.delivery_type = 'reminder_1'
          and sd.status = 'sent'
      ) as reminder_1_sent_at,

      (
        select max(sd.sent_at)
        from public.sales_invoice_deliveries sd
        where
          sd.organization_id = i.organization_id
          and sd.invoice_id = i.id
          and sd.delivery_type = 'reminder_2'
          and sd.status = 'sent'
      ) as reminder_2_sent_at,

      (
        select max(sd.sent_at)
        from public.sales_invoice_deliveries sd
        where
          sd.organization_id = i.organization_id
          and sd.invoice_id = i.id
          and sd.delivery_type = 'final_notice'
          and sd.status = 'sent'
      ) as final_notice_sent_at

    from public.sales_invoices i

    join public.debtors d
      on d.id = i.debtor_id
      and d.organization_id = i.organization_id

    where
      i.invoice_kind = 'invoice'

      and i.document_status = 'issued'

      and i.archived_at is null

      and i.payment_status in (
        'unpaid',
        'partially_paid'
      )

      and i.total_cents >
          i.paid_cents

      and i.due_date <
          current_date

      and d.email is not null
      and trim(d.email) <> ''
  ),

  due as (

    select
      eligible.*,

      case
        when
          invoice_sent_at is not null
          and reminder_1_sent_at is null
          and current_date > due_date
        then 'reminder_1'

        when
          reminder_1_sent_at is not null
          and reminder_2_sent_at is null
          and now() >=
              reminder_1_sent_at +
              interval '7 days'
        then 'reminder_2'

        when
          reminder_2_sent_at is not null
          and final_notice_sent_at is null
          and now() >=
              reminder_2_sent_at +
              interval '7 days'
        then 'final_notice'

        else null
      end as delivery_type

    from eligible
  )

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'invoiceId', id,
        'organizationId', organization_id,
        'invoiceNumber', invoice_number,
        'invoiceDate', invoice_date,
        'dueDate', due_date,
        'totalCents', total_cents,
        'paidCents', paid_cents,
        'outstandingCents', outstanding_cents,
        'pdfStoragePath', pdf_storage_path,

        'debtorId', debtor_id,
        'debtorName', debtor_name,
        'debtorEmail', debtor_email,

        'deliveryType', delivery_type
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

    where delivery_type is not null

    order by
      due_date asc,
      invoice_number asc

    limit v_limit
  ) items;


  return v_result;

end;
$$;



create or replace function
public.system_claim_invoice_reminder(
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
  v_invoice public.sales_invoices%rowtype;
  v_delivery public.sales_invoice_deliveries%rowtype;

  v_previous_1 timestamptz;
  v_previous_2 timestamptz;
begin

  if p_delivery_type not in (
    'reminder_1',
    'reminder_2',
    'final_notice'
  ) then
    raise exception
      'Ongeldig herinneringstype.';
  end if;


  select *
  into v_invoice

  from public.sales_invoices

  where
    id = p_invoice_id
    and organization_id =
      p_organization_id

  for update;


  if not found then
    raise exception
      'Factuur bestaat niet.';
  end if;


  -- =========================================================
  -- LAATSTE CONTROLE VÓÓR VERZENDING
  -- =========================================================

  if v_invoice.invoice_kind <>
    'invoice'
  then
    raise exception
      'Geen gewone verkoopfactuur.';
  end if;


  if v_invoice.document_status <>
    'issued'
  then
    raise exception
      'Factuur is niet actief.';
  end if;


  if v_invoice.payment_status not in (
    'unpaid',
    'partially_paid'
  ) then
    raise exception
      'Factuur is niet meer openstaand.';
  end if;


  if
    v_invoice.paid_cents >=
    v_invoice.total_cents
  then
    raise exception
      'Factuur is inmiddels betaald.';
  end if;


  if
    current_date <=
    v_invoice.due_date
  then
    raise exception
      'Factuur is nog niet vervallen.';
  end if;


  if not exists (
    select 1
    from public.sales_invoice_deliveries sd

    where
      sd.organization_id =
        p_organization_id

      and sd.invoice_id =
        p_invoice_id

      and sd.delivery_type =
        'invoice'

      and sd.status =
        'sent'
  ) then
    raise exception
      'Oorspronkelijke factuur is nog niet verzonden.';
  end if;


  select max(sent_at)
  into v_previous_1

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
  into v_previous_2

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

    if v_previous_1 is not null then
      raise exception
        'Eerste herinnering is al verzonden.';
    end if;

  end if;


  if p_delivery_type =
    'reminder_2'
  then

    if v_previous_1 is null then
      raise exception
        'Eerste herinnering ontbreekt.';
    end if;

    if now() <
      v_previous_1 +
      interval '7 days'
    then
      raise exception
        'Tweede herinnering is nog niet toegestaan.';
    end if;

    if v_previous_2 is not null then
      raise exception
        'Tweede herinnering is al verzonden.';
    end if;

  end if;


  if p_delivery_type =
    'final_notice'
  then

    if v_previous_2 is null then
      raise exception
        'Tweede herinnering ontbreekt.';
    end if;

    if now() <
      v_previous_2 +
      interval '7 days'
    then
      raise exception
        'Laatste herinnering is nog niet toegestaan.';
    end if;

    if exists (
      select 1
      from public.sales_invoice_deliveries sd

      where
        sd.organization_id =
          p_organization_id

        and sd.invoice_id =
          p_invoice_id

        and sd.delivery_type =
          'final_notice'

        and sd.status =
          'sent'
    ) then
      raise exception
        'Laatste herinnering is al verzonden.';
    end if;

  end if;


  /*
   * Als dezelfde soort herinnering al wordt verwerkt,
   * starten we géén tweede verzending.
   */
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

    and status =
      'pending'

  order by created_at desc

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
    null,
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
    null,
    p_organization_id,
    'invoice_reminder_system_claimed',
    'sales_invoice',
    p_invoice_id,
    'success',

    jsonb_build_object(
      'actor',
        'system',

      'delivery_id',
        v_delivery.id,

      'delivery_type',
        p_delivery_type
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



create or replace function
public.system_finish_invoice_reminder(
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
  v_delivery public.sales_invoice_deliveries%rowtype;
begin

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
    id = p_delivery_id
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
      'Geen betalingsherinnering.';
  end if;


  update public.sales_invoice_deliveries
  set
    status =
      p_status,

    sent_at =
      case
        when p_status = 'sent'
        then now()
        else sent_at
      end,

    last_error =
      case
        when p_status = 'failed'
        then left(
          coalesce(
            p_error,
            'Onbekende fout'
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


  if p_status = 'sent' then

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

      and document_status =
        'issued'

      and payment_status in (
        'unpaid',
        'partially_paid'
      )

      and paid_cents <
        total_cents;

  end if;


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
    null,
    p_organization_id,

    case
      when p_status = 'sent'
      then 'invoice_reminder_system_sent'
      else 'invoice_reminder_system_failed'
    end,

    'sales_invoice',
    v_delivery.invoice_id,

    case
      when p_status = 'sent'
      then 'success'
      else 'failed'
    end,

    jsonb_build_object(
      'actor',
        'system',

      'delivery_id',
        v_delivery.id,

      'delivery_type',
        v_delivery.delivery_type,

      'error',
        case
          when p_status = 'failed'
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



-- Alleen backend/service-role.
revoke all
on function
public.system_get_due_invoice_reminders(
  integer
)
from public, anon, authenticated;


revoke all
on function
public.system_claim_invoice_reminder(
  uuid,
  uuid,
  text,
  text,
  uuid
)
from public, anon, authenticated;


revoke all
on function
public.system_finish_invoice_reminder(
  uuid,
  uuid,
  text,
  text
)
from public, anon, authenticated;


grant execute
on function
public.system_get_due_invoice_reminders(
  integer
)
to service_role;


grant execute
on function
public.system_claim_invoice_reminder(
  uuid,
  uuid,
  text,
  text,
  uuid
)
to service_role;


grant execute
on function
public.system_finish_invoice_reminder(
  uuid,
  uuid,
  text,
  text
)
to service_role;


commit;
