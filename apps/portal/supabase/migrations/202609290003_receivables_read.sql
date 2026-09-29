begin;

create or replace function public.get_receivables(
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
          coalesce(
            invoice.invoice_number,
            'Geen factuurnummer'
          ),

          'invoiceDate',
          invoice.invoice_date,

          'dueDate',
          invoice.due_date,

          'status',
          invoice.status,

          'debtor',
          jsonb_build_object(
            'id',
            debtor.id,
            'name',
            debtor.name
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
          invoice.due_date < current_date
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

  from public.sales_invoices invoice

  join public.debtors debtor
    on debtor.id = invoice.debtor_id
   and debtor.organization_id =
       invoice.organization_id

  where
    invoice.organization_id =
      p_organization_id

    and invoice.archived_at is null

    and invoice.total_cents >
        invoice.paid_cents

    and lower(invoice.status) not in (
      'draft',
      'concept',
      'credited',
      'gecrediteerd',
      'cancelled',
      'geannuleerd'
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
on function public.get_receivables(uuid)
from public, anon;

grant execute
on function public.get_receivables(uuid)
to authenticated;

commit;