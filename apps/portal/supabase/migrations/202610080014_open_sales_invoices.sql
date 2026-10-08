begin;

create or replace function
public.get_customer_invoice_archive(
  p_organization_id uuid,
  p_debtor_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception 'Tweestapsverificatie is vereist.';
  end if;

  if not (
    public.has_org_access(p_organization_id)
    or public.is_office_user()
  ) then
    raise exception 'Geen toegang tot deze onderneming.';
  end if;

  if p_debtor_id is not null then
    perform 1
    from public.debtors
    where id = p_debtor_id
      and organization_id = p_organization_id;

    if not found then
      raise exception 'Debiteur bestaat niet.';
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'invoiceNumber', q.invoice_number,
        'invoiceKind', q.invoice_kind,
        'documentStatus', q.document_status,
        'paymentStatus',
          case
            when q.outstanding_cents <= 0 then 'paid'
            when q.paid_cents > 0
              or q.credited_cents > 0
              then 'partial'
            else q.payment_status
          end,
        'collectionStatus', q.collection_status,
        'invoiceDate', q.invoice_date,
        'dueDate', q.due_date,
        'currency', q.currency,
        'subtotalCents', q.subtotal_cents,
        'vatCents', q.vat_cents,
        'totalCents', q.total_cents,
        'paidCents', q.paid_cents,
        'creditedCents', q.credited_cents,
        'outstandingCents', q.outstanding_cents,
        'customerReference', q.customer_reference,
        'pdfStoragePath', q.pdf_storage_path,
        'finalizedAt', q.finalized_at,
        'sentAt', q.sent_at,
        'createdAt', q.created_at,
        'debtor',
          jsonb_build_object(
            'id', q.debtor_id,
            'name', q.debtor_name,
            'email', q.debtor_email
          ),
        'deliveries', q.deliveries
      )
      order by
        q.invoice_date desc,
        q.invoice_number desc
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      i.*,
      d.name as debtor_name,
      d.email as debtor_email,

      coalesce(
        (
          select abs(sum(c.total_cents))
          from public.sales_invoices c
          where c.organization_id = i.organization_id
            and c.original_invoice_id = i.id
            and c.invoice_kind = 'credit'
            and c.document_status <> 'cancelled'
            and c.archived_at is null
        ),
        0
      )::bigint as credited_cents,

      greatest(
        i.total_cents
        - i.paid_cents
        - coalesce(
            (
              select abs(sum(c.total_cents))
              from public.sales_invoices c
              where c.organization_id = i.organization_id
                and c.original_invoice_id = i.id
                and c.invoice_kind = 'credit'
                and c.document_status <> 'cancelled'
                and c.archived_at is null
            ),
            0
          ),
        0
      )::bigint as outstanding_cents,

      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', sd.id,
              'type', sd.delivery_type,
              'status', sd.status,
              'recipientEmail', sd.recipient_email,
              'sentAt', sd.sent_at,
              'createdAt', sd.created_at
            )
            order by sd.created_at asc
          )
          from public.sales_invoice_deliveries sd
          where sd.invoice_id = i.id
            and sd.organization_id = i.organization_id
        ),
        '[]'::jsonb
      ) as deliveries

    from public.sales_invoices i

    join public.debtors d
      on d.id = i.debtor_id
     and d.organization_id = i.organization_id

    where i.organization_id = p_organization_id
      and i.invoice_kind = 'invoice'
      and i.document_status <> 'draft'
      and i.document_status <> 'cancelled'
      and i.invoice_number is not null
      and i.archived_at is null
      and (
        p_debtor_id is null
        or i.debtor_id = p_debtor_id
      )
  ) q

  where q.outstanding_cents > 0;

  return v_result;
end;
$function$;

revoke all
on function public.get_customer_invoice_archive(uuid, uuid)
from public, anon;

grant execute
on function public.get_customer_invoice_archive(uuid, uuid)
to authenticated;

commit;
