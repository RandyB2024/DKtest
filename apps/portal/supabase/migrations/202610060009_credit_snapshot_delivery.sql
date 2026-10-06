begin;

-- ============================================================
-- BESTEMD 6A-9B
-- CREDIT SNAPSHOT + VEILIGE VERZENDREGISTRATIE
-- ============================================================


-- ============================================================
-- 1. CREDIT ALS VERZENDTYPE
-- ============================================================

alter table public.sales_invoice_deliveries
  drop constraint if exists
  sales_invoice_deliveries_delivery_type_check;


alter table public.sales_invoice_deliveries
  add constraint
  sales_invoice_deliveries_delivery_type_check
  check (
    delivery_type in (
      'invoice',
      'credit',
      'reminder_1',
      'reminder_2',
      'final_notice'
    )
  );


-- ============================================================
-- 2. IMMUTABLE SNAPSHOT VOOR CREDITFACTUUR
-- ============================================================

create or replace function
public.create_credit_invoice_snapshot(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_invoice public.sales_invoices%rowtype;
  v_debtor public.debtors%rowtype;
  v_org public.organizations%rowtype;
  v_settings public.invoicing_settings%rowtype;

  v_lines jsonb;
  v_snapshot jsonb;
begin

  select *
  into v_invoice
  from public.sales_invoices
  where
    id = p_invoice_id
    and organization_id = p_organization_id;

  if not found then
    raise exception
      'Creditfactuur bestaat niet.';
  end if;


  if v_invoice.invoice_kind <> 'credit' then
    raise exception
      'Document is geen creditfactuur.';
  end if;


  if
    v_invoice.document_status <> 'issued'
    or v_invoice.invoice_number is null
    or v_invoice.finalized_at is null
  then
    raise exception
      'Creditfactuur is nog niet definitief.';
  end if;


  select *
  into v_debtor
  from public.debtors
  where
    id = v_invoice.debtor_id
    and organization_id = p_organization_id;


  if not found then
    raise exception
      'Debiteur ontbreekt.';
  end if;


  select *
  into v_org
  from public.organizations
  where id = p_organization_id;


  if not found then
    raise exception
      'Onderneming ontbreekt.';
  end if;


  select *
  into v_settings
  from public.invoicing_settings
  where organization_id = p_organization_id;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'description',
          l.description,

        'quantity',
          l.quantity,

        'unitPriceCents',
          l.unit_price_cents,

        'vatRate',
          l.vat_rate,

        'vatCode',
          l.vat_code,

        'lineTotalCents',
          l.line_total_cents,

        'vatCents',
          l.vat_cents,

        'totalInclVatCents',
          l.total_incl_vat_cents,

        'position',
          l.position
      )
      order by l.position
    ),
    '[]'::jsonb
  )
  into v_lines
  from public.sales_invoice_lines l
  where l.invoice_id = p_invoice_id;


  if jsonb_array_length(v_lines) < 1 then
    raise exception
      'Creditfactuur bevat geen regels.';
  end if;


  v_snapshot :=
    jsonb_build_object(

      'schemaVersion',
        1,

      'invoice',
        jsonb_build_object(
          'id',
            v_invoice.id,

          'invoiceNumber',
            v_invoice.invoice_number,

          'invoiceKind',
            v_invoice.invoice_kind,

          'originalInvoiceId',
            v_invoice.original_invoice_id,

          'creditReason',
            v_invoice.credit_reason,

          'invoiceDate',
            v_invoice.invoice_date,

          'dueDate',
            v_invoice.due_date,

          'currency',
            v_invoice.currency,

          'customerReference',
            v_invoice.customer_reference,

          'notes',
            v_invoice.notes,

          'subtotalCents',
            v_invoice.subtotal_cents,

          'vatCents',
            v_invoice.vat_cents,

          'totalCents',
            v_invoice.total_cents
        ),

      'seller',
        jsonb_build_object(
          'companyName',
            coalesce(
              v_settings.company_name,
              v_org.legal_name,
              v_org.name
            ),

          'registrationNumber',
            coalesce(
              v_settings.registration_number,
              v_org.registration_number
            ),

          'vatNumber',
            v_settings.vat_number,

          'phone',
            v_settings.phone,

          'website',
            v_settings.website,

          'businessAddress',
            coalesce(
              v_settings.business_address,
              '{}'::jsonb
            ),

          'iban',
            v_settings.iban,

          'bic',
            v_settings.bic,

          'invoiceEmail',
            v_settings.invoice_email,

          'footerText',
            v_settings.footer_text,

          'logoStoragePath',
            v_settings.logo_storage_path
        ),

      'debtor',
        jsonb_build_object(
          'name',
            v_debtor.name,

          'email',
            v_debtor.email,

          'address',
            coalesce(
              v_debtor.address,
              '{}'::jsonb
            )
        ),

      'lines',
        v_lines,

      'finalizedAt',
        v_invoice.finalized_at
    );


  /*
   * Snapshot is immutable.
   * Als er al één bestaat, nooit overschrijven.
   */
  if not exists (
    select 1
    from public.sales_invoice_snapshots s
    where
      s.invoice_id = p_invoice_id
      and s.organization_id = p_organization_id
  ) then

    insert into public.sales_invoice_snapshots (
      invoice_id,
      organization_id,
      snapshot
    )
    values (
      p_invoice_id,
      p_organization_id,
      v_snapshot
    );

  else

    select s.snapshot
    into v_snapshot
    from public.sales_invoice_snapshots s
    where
      s.invoice_id = p_invoice_id
      and s.organization_id = p_organization_id;

  end if;


  return v_snapshot;

end;
$function$;



-- ============================================================
-- 3. CREDIT VERZENDING CLAIMEN
-- ============================================================

create or replace function
public.office_claim_credit_delivery(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_recipient_email text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_invoice public.sales_invoices%rowtype;
  v_delivery public.sales_invoice_deliveries%rowtype;
  v_role_code text;
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
      message = 'Alleen Bestemd Office mag creditfacturen verzenden.';
  end if;


  select r.code
  into v_role_code
  from public.office_memberships m
  join public.roles r
    on r.id = m.role_id
   and r.scope = 'office'
  where
    m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;


  if coalesce(v_role_code,'') not in (
    'owner',
    'admin',
    'accountant',
    'handler'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Uw Office-rol mag geen creditfacturen verzenden.';
  end if;


  if
    p_recipient_email is null
    or position('@' in p_recipient_email) < 2
  then
    raise exception
      'Ongeldig e-mailadres.';
  end if;


  select *
  into v_invoice
  from public.sales_invoices
  where
    id = p_invoice_id
    and organization_id = p_organization_id
  for update;


  if not found then
    raise exception
      'Creditfactuur bestaat niet.';
  end if;


  if
    v_invoice.invoice_kind <> 'credit'
    or v_invoice.document_status <> 'issued'
    or v_invoice.invoice_number is null
    or v_invoice.finalized_at is null
  then
    raise exception
      'Alleen een definitieve creditfactuur kan worden verzonden.';
  end if;


  if v_invoice.pdf_storage_path is null then
    raise exception
      'De definitieve creditfactuur-PDF ontbreekt.';
  end if;


  select *
  into v_delivery
  from public.sales_invoice_deliveries
  where
    invoice_id = p_invoice_id
    and delivery_type = 'credit'
    and idempotency_key = p_idempotency_key
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


  insert into public.sales_invoice_deliveries (
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
    'credit',
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
$function$;



-- ============================================================
-- 4. CREDIT VERZENDING AFRONDEN
-- ============================================================

create or replace function
public.office_finish_credit_delivery(
  p_organization_id uuid,
  p_delivery_id uuid,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_delivery public.sales_invoice_deliveries%rowtype;
begin

  if auth.uid() is null
     or not public.has_aal2()
     or not public.is_office_user()
  then
    raise exception using
      errcode = '42501',
      message = 'Geen bevoegdheid.';
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
    status = p_status,

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

    updated_at = now()

  where
    id = p_delivery_id
    and organization_id = p_organization_id
    and delivery_type = 'credit'

  returning *
  into v_delivery;


  if not found then
    raise exception
      'Creditverzending bestaat niet.';
  end if;


  if p_status = 'sent' then

    update public.sales_invoices
    set
      sent_at =
        coalesce(
          sent_at,
          now()
        ),

      updated_at = now()

    where
      id = v_delivery.invoice_id
      and organization_id = p_organization_id;

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
$function$;



-- ============================================================
-- 5. NIEUWE CREDITFACTUUR-RPC UITBREIDEN MET SNAPSHOT
-- ============================================================

create or replace function
public.office_create_full_credit_invoice(
  p_organization_id uuid,
  p_original_invoice_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_original public.sales_invoices%rowtype;
  v_credit public.sales_invoices%rowtype;

  v_credit_id uuid;
  v_credit_number text;
  v_role_code text;
  v_reason text;
  v_snapshot jsonb;
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
      message = 'Alleen Bestemd Office mag creditfacturen maken.';
  end if;


  select r.code
  into v_role_code
  from public.office_memberships m
  join public.roles r
    on r.id = m.role_id
   and r.scope = 'office'
  where
    m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;


  if coalesce(v_role_code,'') not in (
    'owner',
    'admin',
    'accountant',
    'handler'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Uw Office-rol mag geen creditfacturen maken.';
  end if;


  v_reason :=
    nullif(
      trim(
        coalesce(
          p_reason,
          ''
        )
      ),
      ''
    );


  if v_reason is null then
    raise exception
      'Geef een reden voor de creditfactuur op.';
  end if;


  if length(v_reason) > 500 then
    raise exception
      'De reden voor de creditfactuur is te lang.';
  end if;


  select *
  into v_original
  from public.sales_invoices
  where
    id = p_original_invoice_id
    and organization_id = p_organization_id
  for update;


  if not found then
    raise exception
      'De oorspronkelijke factuur bestaat niet.';
  end if;


  if v_original.archived_at is not null then
    raise exception
      'Een gearchiveerde factuur kan niet worden gecrediteerd.';
  end if;


  if v_original.invoice_kind <> 'invoice' then
    raise exception
      'Alleen een gewone verkoopfactuur kan worden gecrediteerd.';
  end if;


  if v_original.document_status <> 'issued' then
    raise exception
      'Alleen een definitieve actieve factuur kan worden gecrediteerd.';
  end if;


  if
    v_original.invoice_number is null
    or v_original.finalized_at is null
  then
    raise exception
      'De oorspronkelijke factuur is niet definitief.';
  end if;


  if exists (
    select 1
    from public.sales_invoices i
    where
      i.organization_id = p_organization_id
      and i.original_invoice_id = p_original_invoice_id
      and i.invoice_kind = 'credit'
      and i.document_status <> 'cancelled'
      and i.archived_at is null
  ) then
    raise exception
      'Voor deze factuur bestaat al een creditfactuur.';
  end if;


  v_credit_number :=
    public.next_sales_document_number(
      p_organization_id,
      'credit'
    );


  v_credit_id :=
    gen_random_uuid();


  insert into public.sales_invoices (
    id,
    organization_id,
    debtor_id,
    invoice_number,
    status,
    document_status,
    payment_status,
    collection_status,
    invoice_kind,
    original_invoice_id,
    credit_reason,
    invoice_date,
    due_date,
    currency,
    subtotal_cents,
    vat_cents,
    total_cents,
    paid_cents,
    customer_reference,
    notes,
    finalized_at,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_credit_id,
    p_organization_id,
    v_original.debtor_id,
    v_credit_number,
    'issued',
    'issued',
    'not_applicable',
    'none',
    'credit',
    v_original.id,
    v_reason,
    current_date,
    current_date,
    v_original.currency,
    -abs(v_original.subtotal_cents),
    -abs(v_original.vat_cents),
    -abs(v_original.total_cents),
    0,
    v_original.customer_reference,
    concat(
      'Credit op factuur ',
      v_original.invoice_number,
      '. Reden: ',
      v_reason
    ),
    now(),
    auth.uid(),
    now(),
    now()
  )
  returning *
  into v_credit;


  insert into public.sales_invoice_lines (
    invoice_id,
    description,
    quantity,
    unit_price_cents,
    vat_rate,
    line_total_cents,
    position,
    vat_code,
    vat_cents,
    total_incl_vat_cents
  )
  select
    v_credit_id,
    l.description,
    l.quantity,
    -abs(l.unit_price_cents),
    l.vat_rate,
    -abs(l.line_total_cents),
    l.position,
    l.vat_code,
    -abs(l.vat_cents),
    -abs(l.total_incl_vat_cents)
  from public.sales_invoice_lines l
  where l.invoice_id = p_original_invoice_id
  order by l.position;


  /*
   * Snapshot maken VOORDAT de originele factuurstatus
   * wordt gewijzigd.
   */
  v_snapshot :=
    public.create_credit_invoice_snapshot(
      p_organization_id,
      v_credit_id
    );


  update public.sales_invoices
  set
    document_status = 'credited',
    collection_status = 'none',
    updated_at = now()
  where
    id = p_original_invoice_id
    and organization_id = p_organization_id;


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
    auth.uid(),
    p_organization_id,
    'invoicing.full_credit_created',
    'sales_invoice',
    v_credit_id,
    'success',
    jsonb_build_object(
      'credit_invoice_number',
        v_credit_number,

      'original_invoice_id',
        p_original_invoice_id,

      'original_invoice_number',
        v_original.invoice_number,

      'reason',
        v_reason,

      'total_cents',
        v_credit.total_cents,

      'snapshot_created',
        v_snapshot is not null
    )
  );


  return jsonb_build_object(
    'creditInvoiceId',
      v_credit.id,

    'creditInvoiceNumber',
      v_credit.invoice_number,

    'originalInvoiceId',
      v_original.id,

    'originalInvoiceNumber',
      v_original.invoice_number,

    'invoiceKind',
      v_credit.invoice_kind,

    'documentStatus',
      v_credit.document_status,

    'totalCents',
      v_credit.total_cents,

    'creditReason',
      v_credit.credit_reason,

    'snapshotReady',
      v_snapshot is not null
  );

end;
$function$;



revoke all
on function public.create_credit_invoice_snapshot(
  uuid,
  uuid
)
from public, anon;


revoke all
on function public.office_claim_credit_delivery(
  uuid,
  uuid,
  text,
  uuid
)
from public, anon;


revoke all
on function public.office_finish_credit_delivery(
  uuid,
  uuid,
  text,
  text
)
from public, anon;


grant execute
on function public.office_claim_credit_delivery(
  uuid,
  uuid,
  text,
  uuid
)
to authenticated;


grant execute
on function public.office_finish_credit_delivery(
  uuid,
  uuid,
  text,
  text
)
to authenticated;


revoke all
on function public.office_create_full_credit_invoice(
  uuid,
  uuid,
  text
)
from public, anon;


grant execute
on function public.office_create_full_credit_invoice(
  uuid,
  uuid,
  text
)
to authenticated;


commit;
