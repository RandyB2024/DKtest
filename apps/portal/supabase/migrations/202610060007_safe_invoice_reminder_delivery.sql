begin;

-- ============================================================
-- BESTEMD - VEILIGE AUTOMATISCHE BETALINGSHERINNERINGEN
--
-- 1. Laatste databasecontrole direct voor verzending.
-- 2. Cancelled status voor facturen die ondertussen betaald,
--    gecrediteerd of geannuleerd zijn.
-- 3. Service-role-only.
-- ============================================================


-- ============================================================
-- DELIVERY STATUS UITBREIDEN
-- ============================================================

alter table public.sales_invoice_deliveries
  drop constraint if exists
  sales_invoice_deliveries_status_check;


alter table public.sales_invoice_deliveries
  add constraint
  sales_invoice_deliveries_status_check
  check (
    status in (
      'pending',
      'sent',
      'failed',
      'cancelled'
    )
  );


-- ============================================================
-- LAATSTE VALIDATIE DIRECT VOOR PROVIDER-CALL
-- ============================================================

create or replace function
public.system_validate_invoice_reminder_delivery(
  p_organization_id uuid,
  p_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_delivery public.sales_invoice_deliveries%rowtype;
  v_invoice public.sales_invoices%rowtype;

  v_previous_1 timestamptz;
  v_previous_2 timestamptz;
begin

  if auth.role() <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Alleen service-role toegestaan.';
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


  if v_delivery.status <> 'pending' then
    return jsonb_build_object(
      'eligible',
        false,
      'reason',
        'delivery_not_pending',
      'deliveryId',
        v_delivery.id
    );
  end if;


  if v_delivery.delivery_type not in (
    'reminder_1',
    'reminder_2',
    'final_notice'
  ) then
    raise exception
      'Geen betalingsherinnering.';
  end if;


  select *
  into v_invoice
  from public.sales_invoices
  where
    id = v_delivery.invoice_id
    and organization_id =
      p_organization_id
  for update;


  if not found then
    return jsonb_build_object(
      'eligible',
        false,
      'reason',
        'invoice_missing',
      'deliveryId',
        v_delivery.id
    );
  end if;


  if v_invoice.archived_at is not null then
    return jsonb_build_object(
      'eligible',
        false,
      'reason',
        'invoice_archived',
      'deliveryId',
        v_delivery.id
    );
  end if;


  if v_invoice.invoice_kind <> 'invoice' then
    return jsonb_build_object(
      'eligible',
        false,
      'reason',
        'not_invoice',
      'deliveryId',
        v_delivery.id
    );
  end if;


  if v_invoice.document_status <> 'issued' then
    return jsonb_build_object(
      'eligible',
        false,
      'reason',
        'invoice_not_issued',
      'deliveryId',
        v_delivery.id
    );
  end if;


  if v_invoice.payment_status not in (
    'unpaid',
    'partially_paid'
  ) then
    return jsonb_build_object(
      'eligible',
        false,
      'reason',
        'invoice_not_open',
      'deliveryId',
        v_delivery.id
    );
  end if;


  if
    v_invoice.paid_cents >=
    v_invoice.total_cents
  then
    return jsonb_build_object(
      'eligible',
        false,
      'reason',
        'invoice_paid',
      'deliveryId',
        v_delivery.id
    );
  end if;


  if
    current_date <=
    v_invoice.due_date
  then
    return jsonb_build_object(
      'eligible',
        false,
      'reason',
        'invoice_not_overdue',
      'deliveryId',
        v_delivery.id
    );
  end if;


  if not exists (
    select 1
    from public.sales_invoice_deliveries sd
    where
      sd.organization_id =
        p_organization_id
      and sd.invoice_id =
        v_invoice.id
      and sd.delivery_type =
        'invoice'
      and sd.status =
        'sent'
  ) then
    return jsonb_build_object(
      'eligible',
        false,
      'reason',
        'original_not_sent',
      'deliveryId',
        v_delivery.id
    );
  end if;


  select max(sent_at)
  into v_previous_1
  from public.sales_invoice_deliveries
  where
    organization_id =
      p_organization_id
    and invoice_id =
      v_invoice.id
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
      v_invoice.id
    and delivery_type =
      'reminder_2'
    and status =
      'sent';


  if v_delivery.delivery_type =
    'reminder_1'
  then

    if v_previous_1 is not null then
      return jsonb_build_object(
        'eligible',
          false,
        'reason',
          'reminder_1_already_sent',
        'deliveryId',
          v_delivery.id
      );
    end if;

  elsif v_delivery.delivery_type =
    'reminder_2'
  then

    if
      v_previous_1 is null
      or now() <
        v_previous_1 +
        interval '7 days'
    then
      return jsonb_build_object(
        'eligible',
          false,
        'reason',
          'reminder_2_not_due',
        'deliveryId',
          v_delivery.id
      );
    end if;


    if v_previous_2 is not null then
      return jsonb_build_object(
        'eligible',
          false,
        'reason',
          'reminder_2_already_sent',
        'deliveryId',
          v_delivery.id
      );
    end if;

  else

    if
      v_previous_2 is null
      or now() <
        v_previous_2 +
        interval '7 days'
    then
      return jsonb_build_object(
        'eligible',
          false,
        'reason',
          'final_notice_not_due',
        'deliveryId',
          v_delivery.id
      );
    end if;


    if exists (
      select 1
      from public.sales_invoice_deliveries sd
      where
        sd.organization_id =
          p_organization_id
        and sd.invoice_id =
          v_invoice.id
        and sd.delivery_type =
          'final_notice'
        and sd.status =
          'sent'
    ) then
      return jsonb_build_object(
        'eligible',
          false,
        'reason',
          'final_notice_already_sent',
        'deliveryId',
          v_delivery.id
      );
    end if;

  end if;


  return jsonb_build_object(
    'eligible',
      true,

    'deliveryId',
      v_delivery.id,

    'deliveryType',
      v_delivery.delivery_type,

    'invoiceId',
      v_invoice.id,

    'invoiceNumber',
      v_invoice.invoice_number,

    'invoiceDate',
      v_invoice.invoice_date,

    'dueDate',
      v_invoice.due_date,

    'totalCents',
      v_invoice.total_cents,

    'paidCents',
      v_invoice.paid_cents,

    'outstandingCents',
      greatest(
        v_invoice.total_cents -
        v_invoice.paid_cents,
        0
      ),

    'pdfStoragePath',
      v_invoice.pdf_storage_path,

    'recipientEmail',
      v_delivery.recipient_email
  );

end;
$function$;



-- ============================================================
-- VEILIG ANNULEREN ZONDER "FAILED"
-- ============================================================

create or replace function
public.system_cancel_invoice_reminder(
  p_organization_id uuid,
  p_delivery_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_delivery public.sales_invoice_deliveries%rowtype;
begin

  if auth.role() <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Alleen service-role toegestaan.';
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


  if v_delivery.status <> 'pending' then
    return jsonb_build_object(
      'deliveryId',
        v_delivery.id,
      'status',
        v_delivery.status
    );
  end if;


  update public.sales_invoice_deliveries
  set
    status =
      'cancelled',

    last_error =
      left(
        coalesce(
          p_reason,
          'Niet meer verzenden.'
        ),
        1000
      ),

    updated_at =
      now()

  where id =
    v_delivery.id

  returning *
  into v_delivery;


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
    'invoice_reminder_system_cancelled',
    'sales_invoice',
    v_delivery.invoice_id,
    'success',

    jsonb_build_object(
      'actor',
        'system',

      'delivery_id',
        v_delivery.id,

      'delivery_type',
        v_delivery.delivery_type,

      'reason',
        left(
          coalesce(
            p_reason,
            ''
          ),
          500
        )
    )
  );


  return jsonb_build_object(
    'deliveryId',
      v_delivery.id,

    'status',
      v_delivery.status
  );

end;
$function$;



revoke all
on function
public.system_validate_invoice_reminder_delivery(
  uuid,
  uuid
)
from public, anon, authenticated;


revoke all
on function
public.system_cancel_invoice_reminder(
  uuid,
  uuid,
  text
)
from public, anon, authenticated;


grant execute
on function
public.system_validate_invoice_reminder_delivery(
  uuid,
  uuid
)
to service_role;


grant execute
on function
public.system_cancel_invoice_reminder(
  uuid,
  uuid,
  text
)
to service_role;


commit;
