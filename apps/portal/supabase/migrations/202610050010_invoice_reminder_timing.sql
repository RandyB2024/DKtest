begin;

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

  v_invoice_sent_at timestamptz;
  v_reminder_1_sent_at timestamptz;
  v_reminder_2_sent_at timestamptz;

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
    v_invoice.document_status in (
      'credited',
      'cancelled'
    )
  then
    raise exception
      'Deze factuur kan niet meer worden verzonden.';
  end if;


  if
    p_delivery_type <> 'invoice'
    and v_invoice.payment_status = 'paid'
  then
    raise exception
      'Deze factuur is al betaald.';
  end if;


  if
    v_invoice.pdf_storage_path is null
  then
    raise exception
      'De definitieve PDF ontbreekt.';
  end if;


  -- =========================================================
  -- Bestaande verzendmomenten ophalen
  -- =========================================================

  select max(sent_at)
  into v_invoice_sent_at
  from public.sales_invoice_deliveries
  where
    invoice_id =
      p_invoice_id
    and organization_id =
      p_organization_id
    and delivery_type =
      'invoice'
    and status =
      'sent';


  select max(sent_at)
  into v_reminder_1_sent_at
  from public.sales_invoice_deliveries
  where
    invoice_id =
      p_invoice_id
    and organization_id =
      p_organization_id
    and delivery_type =
      'reminder_1'
    and status =
      'sent';


  select max(sent_at)
  into v_reminder_2_sent_at
  from public.sales_invoice_deliveries
  where
    invoice_id =
      p_invoice_id
    and organization_id =
      p_organization_id
    and delivery_type =
      'reminder_2'
    and status =
      'sent';


  -- =========================================================
  -- HERINNERING 1
  -- Pas toegestaan NA vervaldatum
  -- =========================================================

  if p_delivery_type = 'reminder_1' then

    if v_invoice_sent_at is null then
      raise exception
        'De factuur moet eerst worden verzonden.';
    end if;


    if current_date <= v_invoice.due_date then
      raise exception
        'De betaaltermijn is nog niet verstreken.';
    end if;


    if v_reminder_1_sent_at is not null then
      raise exception
        'De eerste betalingsherinnering is al verzonden.';
    end if;

  end if;


  -- =========================================================
  -- HERINNERING 2
  -- Minimaal 7 dagen na herinnering 1
  -- =========================================================

  if p_delivery_type = 'reminder_2' then

    if v_reminder_1_sent_at is null then
      raise exception
        'De eerste betalingsherinnering moet eerst worden verzonden.';
    end if;


    if now() <
      v_reminder_1_sent_at +
      interval '7 days'
    then
      raise exception
        'De tweede betalingsherinnering mag pas 7 dagen na de eerste worden verzonden.';
    end if;


    if v_reminder_2_sent_at is not null then
      raise exception
        'De tweede betalingsherinnering is al verzonden.';
    end if;

  end if;


  -- =========================================================
  -- LAATSTE HERINNERING
  -- Minimaal 7 dagen na herinnering 2
  -- =========================================================

  if p_delivery_type = 'final_notice' then

    if v_reminder_2_sent_at is null then
      raise exception
        'De tweede betalingsherinnering moet eerst worden verzonden.';
    end if;


    if now() <
      v_reminder_2_sent_at +
      interval '7 days'
    then
      raise exception
        'De laatste betalingsherinnering mag pas 7 dagen na de tweede worden verzonden.';
    end if;


    if exists (
      select 1
      from public.sales_invoice_deliveries
      where
        invoice_id =
          p_invoice_id
        and organization_id =
          p_organization_id
        and delivery_type =
          'final_notice'
        and status =
          'sent'
    ) then
      raise exception
        'De laatste betalingsherinnering is al verzonden.';
    end if;

  end if;


  -- =========================================================
  -- IDEMPOTENCY
  -- =========================================================

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
-- Verzending afronden + collection_status bijwerken
-- ============================================================

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
    id =
      p_delivery_id
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
        case
          when v_delivery.delivery_type =
            'invoice'
          then coalesce(
            sent_at,
            now()
          )
          else sent_at
        end,

      last_reminder_at =
        case
          when v_delivery.delivery_type in (
            'reminder_1',
            'reminder_2',
            'final_notice'
          )
          then now()
          else last_reminder_at
        end,

      collection_status =
        case
          when v_delivery.delivery_type =
            'reminder_1'
          then 'reminder_1'

          when v_delivery.delivery_type =
            'reminder_2'
          then 'reminder_2'

          when v_delivery.delivery_type =
            'final_notice'
          then 'final_notice'

          else collection_status
        end,

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
      v_delivery.sent_at,

    'deliveryType',
      v_delivery.delivery_type
  );

end;
$$;


commit;
