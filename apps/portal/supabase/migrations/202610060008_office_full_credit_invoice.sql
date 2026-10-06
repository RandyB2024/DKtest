begin;

-- ============================================================
-- BESTEMD 6A-9A
-- VOLLEDIGE CREDITFACTUUR - ALLEEN OFFICE
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
begin

  -- Alleen ingelogde Office-gebruiker met verse MFA.
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

  if coalesce(v_role_code, '') not in (
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

  -- Originele factuur locken.
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

  -- Geen dubbele volledige creditnota.
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

  if not exists (
    select 1
    from public.sales_invoice_lines l
    where l.invoice_id = p_original_invoice_id
  ) then
    raise exception
      'De oorspronkelijke factuur bevat geen factuurregels.';
  end if;

  v_credit_number :=
    public.next_sales_document_number(
      p_organization_id,
      'credit'
    );

  if
    v_credit_number is null
    or trim(v_credit_number) = ''
  then
    raise exception
      'Creditfactuurnummer kon niet worden aangemaakt.';
  end if;

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
    sent_at,
    last_reminder_at,
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
    null,
    null,
    auth.uid(),
    now(),
    now()
  )
  returning *
  into v_credit;

  -- Originele regels 1-op-1 spiegelen.
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
  where
    l.invoice_id = p_original_invoice_id
  order by l.position;

  -- Originele factuur afsluiten voor incasso/herinneringen.
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
      'subtotal_cents',
        v_credit.subtotal_cents,
      'vat_cents',
        v_credit.vat_cents,
      'total_cents',
        v_credit.total_cents
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
      v_credit.credit_reason
  );

end;
$function$;

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
