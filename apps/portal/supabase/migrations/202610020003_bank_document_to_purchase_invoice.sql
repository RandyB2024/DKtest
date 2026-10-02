begin;

create or replace function public.office_create_purchase_invoice_from_bank_document(
  p_organization_id uuid,
  p_request_id uuid,
  p_creditor_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_due_date date,
  p_subtotal_cents bigint,
  p_vat_cents bigint,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.bank_document_requests%rowtype;
  v_transaction public.bank_transactions%rowtype;
  v_document public.documents%rowtype;
  v_creditor public.creditors%rowtype;

  v_invoice_id uuid;
  v_total_cents bigint;
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
      message = 'Alleen Office mag een inkoopfactuur verwerken.';
  end if;

  if p_invoice_number is null
     or length(trim(p_invoice_number)) = 0 then
    raise exception using
      errcode = '22023',
      message = 'Vul een factuurnummer in.';
  end if;

  if p_invoice_date is null
     or p_due_date is null
     or p_due_date < p_invoice_date then
    raise exception using
      errcode = '22023',
      message = 'Controleer factuurdatum en vervaldatum.';
  end if;

  if p_subtotal_cents < 0
     or p_vat_cents < 0 then
    raise exception using
      errcode = '22023',
      message = 'Factuurbedragen zijn ongeldig.';
  end if;

  v_total_cents :=
    p_subtotal_cents +
    p_vat_cents;

  if v_total_cents <= 0 then
    raise exception using
      errcode = '22023',
      message = 'Het factuurtotaal moet groter zijn dan nul.';
  end if;


  select *
  into v_request
  from public.bank_document_requests
  where id = p_request_id
    and organization_id =
      p_organization_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Factuurverzoek niet gevonden.';
  end if;

  if v_request.status <> 'received'
     or v_request.document_id is null then
    raise exception using
      errcode = '22023',
      message = 'Er is nog geen ontvangen document om te verwerken.';
  end if;


  select *
  into v_document
  from public.documents
  where id =
      v_request.document_id
    and organization_id =
      p_organization_id
    and archived_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Document niet gevonden.';
  end if;


  select *
  into v_transaction
  from public.bank_transactions
  where id =
      v_request.bank_transaction_id
    and organization_id =
      p_organization_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Bankmutatie niet gevonden.';
  end if;

  if v_transaction.amount_cents >= 0 then
    raise exception using
      errcode = '22023',
      message = 'Alleen een uitgaande betaling kan als inkoopfactuur worden verwerkt.';
  end if;


  select *
  into v_creditor
  from public.creditors
  where id =
      p_creditor_id
    and organization_id =
      p_organization_id
    and archived_at is null;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Crediteur niet gevonden.';
  end if;


  if exists (
    select 1
    from public.purchase_invoices invoice
    where invoice.organization_id =
        p_organization_id
      and invoice.creditor_id =
        p_creditor_id
      and invoice.invoice_number =
        trim(p_invoice_number)
      and invoice.archived_at is null
  ) then
    raise exception using
      errcode = '23505',
      message = 'Deze inkoopfactuur bestaat al.';
  end if;


  insert into public.purchase_invoices (
    organization_id,
    creditor_id,
    invoice_number,
    status,
    invoice_date,
    due_date,
    currency,
    subtotal_cents,
    vat_cents,
    total_cents,
    paid_cents,
    document_id,
    reference,
    description,
    created_by,
    finalized_at
  )
  values (
    p_organization_id,
    p_creditor_id,
    trim(p_invoice_number),
    'open',
    p_invoice_date,
    p_due_date,
    'EUR',
    p_subtotal_cents,
    p_vat_cents,
    v_total_cents,
    0,
    v_document.id,
    coalesce(
      v_transaction.reference,
      trim(p_invoice_number)
    ),
    nullif(
      trim(
        coalesce(
          p_description,
          ''
        )
      ),
      ''
    ),
    auth.uid(),
    now()
  )
  returning id
  into v_invoice_id;


  insert into public.purchase_invoice_lines (
    invoice_id,
    description,
    quantity,
    unit_price_cents,
    vat_rate,
    line_total_cents,
    position
  )
  values (
    v_invoice_id,
    coalesce(
      nullif(
        trim(
          coalesce(
            p_description,
            ''
          )
        ),
        ''
      ),
      v_creditor.name
    ),
    1,
    p_subtotal_cents,
    case
      when p_subtotal_cents > 0
      then round(
        (
          p_vat_cents::numeric /
          p_subtotal_cents::numeric
        ) * 100,
        2
      )
      else 0
    end,
    p_subtotal_cents,
    1
  );


  update public.documents
  set
    document_type =
      'purchase_invoice',
    status =
      'ready',
    updated_at =
      now()
  where id =
      v_document.id;


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
    'purchase_invoice_created_from_bank_document',
    'purchase_invoice',
    v_invoice_id,
    'success',
    jsonb_build_object(
      'request_id',
        p_request_id,
      'document_id',
        v_document.id,
      'bank_transaction_id',
        v_transaction.id,
      'creditor_id',
        p_creditor_id,
      'invoice_number',
        trim(p_invoice_number),
      'total_cents',
        v_total_cents
    )
  );


  return jsonb_build_object(
    'invoiceId',
      v_invoice_id,

    'documentId',
      v_document.id,

    'transactionId',
      v_transaction.id,

    'creditorId',
      p_creditor_id,

    'invoiceNumber',
      trim(p_invoice_number),

    'totalCents',
      v_total_cents,

    'status',
      'open'
  );

end;
$$;


revoke all
on function public.office_create_purchase_invoice_from_bank_document(
  uuid,
  uuid,
  uuid,
  text,
  date,
  date,
  bigint,
  bigint,
  text
)
from public, anon;


grant execute
on function public.office_create_purchase_invoice_from_bank_document(
  uuid,
  uuid,
  uuid,
  text,
  date,
  date,
  bigint,
  bigint,
  text
)
to authenticated;


commit;
