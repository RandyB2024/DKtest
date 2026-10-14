begin;


-- ============================================================
-- OFFICE TAX PERIOD OVERVIEW V1
-- ============================================================

create or replace function
public.office_tax_get_periods(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_items jsonb;
begin

  perform
    public.wize_require_office_admin();


  if not exists (
    select 1

    from public.organizations organization

    join public.customer_relationships relationship
      on relationship.id =
        organization.customer_relationship_id

    where
      organization.id =
        p_organization_id

      and organization.archived_at
        is null

      and relationship.archived_at
        is null

      and relationship.status =
        'active'
  ) then

    raise exception using
      errcode = 'P0002',
      message = 'Onderneming niet gevonden.';

  end if;


  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',
            period.id,

          'taxType',
            period.tax_type,

          'periodStart',
            period.period_start,

          'periodEnd',
            period.period_end,

          'dueDate',
            period.due_date,

          'paymentDueDate',
            period.payment_due_date,

          'status',
            period.status,

          'reference',
            period.reference,

          'source',
            period.source,

          'submittedAt',
            period.submitted_at,

          'acceptedAt',
            period.accepted_at,

          'paidAt',
            period.paid_at,

          'updatedAt',
            period.updated_at
        )

        order by
          period.due_date desc,
          period.period_start desc
      ),
      '[]'::jsonb
    )

  into
    v_items

  from public.tax_periods period

  where
    period.organization_id =
      p_organization_id;


  return
    jsonb_build_object(
      'organizationId',
        p_organization_id,

      'items',
        v_items
    );

end;
$$;


revoke all
on function
public.office_tax_get_periods(uuid)
from public, anon;


grant execute
on function
public.office_tax_get_periods(uuid)
to authenticated;


commit;
