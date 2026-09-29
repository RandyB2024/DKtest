begin;

create or replace function public.get_payables(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
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

  if not (
    public.has_org_access(p_organization_id)
    or public.is_office_user()
  ) then
    raise exception using
      errcode = '42501',
      message = 'Geen toegang tot deze onderneming.';
  end if;

  select jsonb_build_object(
    'summary',
    jsonb_build_object(
      'totalCents',
      coalesce(sum(
        greatest(
          invoice.total_cents - invoice.paid_cents,
          0
        )
      ), 0),

      'overdueCents',
      coalesce(sum(
        case
          when invoice.due_date < current_date
          then greatest(
            invoice.total_cents - invoice.paid_cents,
            0
          )
          else 0
        end
      ), 0),

      'count',
      count(*),

      'overdueCount',
      count(*) filter (
        where invoice.due_date < current_date
      )
    ),

    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',
          invoice.id,

          'invoiceNumber',
          invoice.invoice_number,

          'invoiceDate',
          invoice.invoice_date,

          'dueDate',
          invoice.due_date,

          'status',
          invoice.status,

          'creditor',
          jsonb_build_object(
            'id',
            creditor.id,
            'name',
            creditor.name
          ),

          'currency',
          invoice.currency,

          'subtotalCents',
          invoice.subtotal_cents,

          'vatCents',
          invoice.vat_cents,

          'totalCents',
          invoice.total_cents,

          'paidCents',
          invoice.paid_cents,

          'outstandingCents',
          greatest(
            invoice.total_cents - invoice.paid_cents,
            0
          ),

          'overdue',
          invoice.due_date < current_date,

          'documentId',
          invoice.document_id,

          'reference',
          invoice.reference,

          'description',
          invoice.description
        )

        order by
          (
            invoice.due_date < current_date
          ) desc,
          invoice.due_date asc,
          invoice.id asc
      ),
      '[]'::jsonb
    )
  )
  into result

  from public.purchase_invoices invoice

  join public.creditors creditor
    on creditor.id = invoice.creditor_id
   and creditor.organization_id =
       invoice.organization_id

  where
    invoice.organization_id =
      p_organization_id

    and invoice.archived_at is null

    and invoice.total_cents >
        invoice.paid_cents

    and invoice.status not in (
      'draft',
      'credited',
      'cancelled'
    );

  return coalesce(
    result,
    jsonb_build_object(
      'summary',
      jsonb_build_object(
        'totalCents', 0,
        'overdueCents', 0,
        'count', 0,
        'overdueCount', 0
      ),
      'items',
      '[]'::jsonb
    )
  );

end;
$$;

revoke all
on function public.get_payables(uuid)
from public, anon;

grant execute
on function public.get_payables(uuid)
to authenticated;

commit;