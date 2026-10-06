begin;

alter table
public.sales_invoice_deliveries
add column if not exists
idempotency_key uuid;

create unique index if not exists
sales_invoice_delivery_idempotency_idx
on public.sales_invoice_deliveries (
  invoice_id,
  delivery_type,
  idempotency_key
)
where idempotency_key is not null;


create or replace function
public.customer_claim_invoice_delivery(
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
begin

  if not public.can_customer_manage_invoicing(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid om deze factuur te verzenden.';
  end if;

  if p_delivery_type not in (
    'invoice',
    'reminder_1',
    'reminder_2',
    'final_notice'
  ) then
    raise exception
      'Ongeldig verzendingstype.';
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
    id = p_invoice_id
    and organization_id =
      p_organization_id
  for update;

  if not found then
    raise exception
      'Factuur bestaat niet.';
  end if;

  if
    v_invoice.document_status = 'draft'
    or v_invoice.invoice_number is null
    or v_invoice.finalized_at is null
  then
    raise exception
      'Alleen definitieve facturen kunnen worden verzonden.';
  end if;

  if
    v_invoice.pdf_storage_path is null
  then
    raise exception
      'De definitieve PDF ontbreekt.';
  end if;


  select *
  into v_delivery
  from public.sales_invoice_deliveries
  where
    invoice_id =
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
    lower(trim(p_recipient_email)),
    'pending',
    1,
    auth.uid(),
    p_idempotency_key
  )
  returning *
  into v_delivery;


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
public.customer_finish_invoice_delivery(
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

  if not public.can_customer_manage_invoicing(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid.';
  end if;

  if p_status not in (
    'sent',
    'failed'
  ) then
    raise exception
      'Ongeldige verzendstatus.';
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

  where
    id = p_delivery_id
    and organization_id =
      p_organization_id

  returning *
  into v_delivery;


  if not found then
    raise exception
      'Verzendpoging bestaat niet.';
  end if;


  if p_status = 'sent' then

    update public.sales_invoices
    set
      sent_at =
        coalesce(
          sent_at,
          now()
        ),

      updated_at =
        now()

    where
      id =
        v_delivery.invoice_id
      and organization_id =
        p_organization_id;

  end if;


  return jsonb_build_object(
    'deliveryId',
      v_delivery.id,

    'status',
      v_delivery.status,

    'sentAt',
      v_delivery.sent_at
  );

end;
$$;


revoke all
on function
public.customer_claim_invoice_delivery(
  uuid,
  uuid,
  text,
  text,
  uuid
)
from public, anon;

grant execute
on function
public.customer_claim_invoice_delivery(
  uuid,
  uuid,
  text,
  text,
  uuid
)
to authenticated;


revoke all
on function
public.customer_finish_invoice_delivery(
  uuid,
  uuid,
  text,
  text
)
from public, anon;

grant execute
on function
public.customer_finish_invoice_delivery(
  uuid,
  uuid,
  text,
  text
)
to authenticated;


commit;
