begin;

-- ============================================================
-- 6A-5B FACTUURARCHIEF + DEBITEURENDOSSIER
-- Eén bron: sales_invoices.
-- Geen duplicatie van PDF-bestanden of factuurgegevens.
-- ============================================================


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
as $$
declare
  v_result jsonb;
begin

  if auth.uid() is null then
    raise exception
      'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception
      'Tweestapsverificatie is vereist.';
  end if;

  if not (
    public.has_org_access(
      p_organization_id
    )
    or public.is_office_user()
  ) then
    raise exception
      'Geen toegang tot deze onderneming.';
  end if;


  if p_debtor_id is not null then

    perform 1
    from public.debtors
    where
      id = p_debtor_id
      and organization_id =
        p_organization_id;

    if not found then
      raise exception
        'Debiteur bestaat niet.';
    end if;

  end if;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
          i.id,

        'invoiceNumber',
          i.invoice_number,

        'invoiceKind',
          i.invoice_kind,

        'documentStatus',
          i.document_status,

        'paymentStatus',
          i.payment_status,

        'collectionStatus',
          i.collection_status,

        'invoiceDate',
          i.invoice_date,

        'dueDate',
          i.due_date,

        'currency',
          i.currency,

        'subtotalCents',
          i.subtotal_cents,

        'vatCents',
          i.vat_cents,

        'totalCents',
          i.total_cents,

        'paidCents',
          i.paid_cents,

        'outstandingCents',
          greatest(
            i.total_cents -
            i.paid_cents,
            0
          ),

        'customerReference',
          i.customer_reference,

        'pdfStoragePath',
          i.pdf_storage_path,

        'finalizedAt',
          i.finalized_at,

        'sentAt',
          i.sent_at,

        'createdAt',
          i.created_at,

        'debtor',
          jsonb_build_object(
            'id',
              d.id,

            'name',
              d.name,

            'email',
              d.email
          )
      )

      order by
        i.invoice_date desc,
        i.invoice_number desc
    ),
    '[]'::jsonb
  )
  into v_result

  from public.sales_invoices i

  join public.debtors d
    on d.id =
      i.debtor_id

   and d.organization_id =
      i.organization_id

  where
    i.organization_id =
      p_organization_id

    and i.document_status <>
      'draft'

    and i.invoice_number
      is not null

    and i.archived_at
      is null

    and (
      p_debtor_id is null
      or i.debtor_id =
         p_debtor_id
    );


  return v_result;

end;
$$;


revoke all
on function
public.get_customer_invoice_archive(
  uuid,
  uuid
)
from public, anon;

grant execute
on function
public.get_customer_invoice_archive(
  uuid,
  uuid
)
to authenticated;


commit;
