begin;

-- ============================================================
-- 6A-5 DEFINITIEF MAKEN VERKOOPFACTUUR
--
-- Nummering + statuswijziging gebeuren transactioneel in DB.
-- Een definitieve factuur kan daarna niet meer via de
-- customer draft-RPC's worden gewijzigd/verwijderd.
-- ============================================================

create or replace function
public.customer_finalize_sales_invoice(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare

  v_invoice public.sales_invoices%rowtype;

  v_number text;

  v_line_count integer;

begin

  -- Alleen customer owner/admin/finance met verse AAL2.
  if not public.can_customer_manage_invoicing(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid om facturen definitief te maken.';
  end if;


  -- Lock voorkomt dubbel finaliseren / dubbele nummering.
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
    v_invoice.document_status <> 'draft'
    or v_invoice.finalized_at is not null
    or v_invoice.invoice_number is not null
  then
    raise exception
      'Deze factuur is al definitief gemaakt.';
  end if;


  if v_invoice.invoice_kind <> 'invoice' then
    raise exception
      'Alleen een verkoopfactuur kan via deze actie definitief worden gemaakt.';
  end if;


  select count(*)
  into v_line_count
  from public.sales_invoice_lines
  where invoice_id =
    p_invoice_id;


  if v_line_count < 1 then
    raise exception
      'De factuur bevat geen factuurregels.';
  end if;


  if
    v_invoice.total_cents is null
    or v_invoice.total_cents <= 0
  then
    raise exception
      'Het factuurbedrag moet groter zijn dan nul.';
  end if;


  -- Bestaande beveiligde nummerfunctie gebruiken.
  v_number :=
    public.next_sales_document_number(
      p_organization_id,
      'invoice'
    );


  if
    v_number is null
    or trim(v_number) = ''
  then
    raise exception
      'Factuurnummer kon niet worden aangemaakt.';
  end if;


  update public.sales_invoices
  set
    invoice_number =
      v_number,

    status =
      'issued',

    document_status =
      'issued',

    payment_status =
      case
        when paid_cents >= total_cents
          then 'paid'

        when paid_cents > 0
          then 'partially_paid'

        else 'unpaid'
      end,

    collection_status =
      'none',

    finalized_at =
      now(),

    updated_at =
      now()

  where
    id =
      p_invoice_id

  returning *
  into v_invoice;


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
    'invoicing.invoice_finalized',
    'sales_invoice',
    p_invoice_id,
    'success',

    jsonb_build_object(
      'invoice_number',
        v_number,

      'total_cents',
        v_invoice.total_cents,

      'vat_cents',
        v_invoice.vat_cents
    )
  );


  return jsonb_build_object(
    'invoiceId',
      v_invoice.id,

    'invoiceNumber',
      v_invoice.invoice_number,

    'documentStatus',
      v_invoice.document_status,

    'paymentStatus',
      v_invoice.payment_status,

    'finalizedAt',
      v_invoice.finalized_at,

    'totalCents',
      v_invoice.total_cents
  );

end;
$$;


revoke all
on function
public.customer_finalize_sales_invoice(
  uuid,
  uuid
)
from public, anon;


grant execute
on function
public.customer_finalize_sales_invoice(
  uuid,
  uuid
)
to authenticated;


commit;
