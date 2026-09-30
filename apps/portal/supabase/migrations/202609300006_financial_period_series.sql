-- ============================================================
-- 202609300006_financial_period_series.sql
--
-- Levert grafiekdata voor klantdashboard:
-- omzet / kosten / resultaat per subperiode.
--
-- Perioden:
-- day       -> 1 bucket
-- week      -> per dag
-- month     -> per 7 dagen
-- quarter   -> per maand
-- halfyear  -> per maand
-- year      -> per maand
-- ============================================================

begin;

create or replace function public.get_financial_period_series(
  p_organization_id uuid,
  p_period text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period text;
  v_start_date date;
  v_end_date date;
  v_step interval;
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

  v_period := lower(trim(coalesce(p_period, '')));

  if v_period = 'day' then
    v_start_date := current_date;
    v_end_date := current_date + 1;
    v_step := interval '1 day';

  elsif v_period = 'week' then
    v_start_date := date_trunc('week', current_date)::date;
    v_end_date := v_start_date + 7;
    v_step := interval '1 day';

  elsif v_period = 'month' then
    v_start_date := date_trunc('month', current_date)::date;
    v_end_date := (v_start_date + interval '1 month')::date;
    v_step := interval '7 days';

  elsif v_period = 'quarter' then
    v_start_date := date_trunc('quarter', current_date)::date;
    v_end_date := (v_start_date + interval '3 months')::date;
    v_step := interval '1 month';

  elsif v_period = 'halfyear' then
    if extract(month from current_date) <= 6 then
      v_start_date := make_date(extract(year from current_date)::integer, 1, 1);
    else
      v_start_date := make_date(extract(year from current_date)::integer, 7, 1);
    end if;

    v_end_date := (v_start_date + interval '6 months')::date;
    v_step := interval '1 month';

  elsif v_period = 'year' then
    v_start_date := date_trunc('year', current_date)::date;
    v_end_date := (v_start_date + interval '1 year')::date;
    v_step := interval '1 month';

  else
    raise exception using
      errcode = '22023',
      message = 'Ongeldige financiële periode.';
  end if;

  return (
    with buckets as (
      select
        row_number() over (order by gs) as bucket_index,
        gs::date as bucket_start,
        least((gs + v_step)::date, v_end_date) as bucket_end
      from generate_series(
        v_start_date::timestamp,
        (v_end_date - interval '1 day')::timestamp,
        v_step
      ) gs
    ),

    sales as (
      select
        b.bucket_index,
        coalesce(sum(i.subtotal_cents), 0)::bigint as revenue_cents
      from buckets b
      left join public.sales_invoices i
        on i.organization_id = p_organization_id
        and i.archived_at is null
        and i.invoice_date >= b.bucket_start
        and i.invoice_date < b.bucket_end
        and lower(i.status) not in (
          'draft',
          'concept',
          'credited',
          'gecrediteerd',
          'cancelled',
          'geannuleerd'
        )
      group by b.bucket_index
    ),

    purchases as (
      select
        b.bucket_index,
        coalesce(sum(i.subtotal_cents), 0)::bigint as costs_cents
      from buckets b
      left join public.purchase_invoices i
        on i.organization_id = p_organization_id
        and i.archived_at is null
        and i.invoice_date >= b.bucket_start
        and i.invoice_date < b.bucket_end
        and lower(i.status) not in (
          'draft',
          'credited',
          'gecrediteerd',
          'cancelled',
          'geannuleerd'
        )
      group by b.bucket_index
    )

    select jsonb_build_object(
      'period', v_period,
      'startDate', v_start_date,
      'endDate', v_end_date - 1,
      'buckets',
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'index', b.bucket_index,
            'startDate', b.bucket_start,
            'endDate', b.bucket_end - 1,
            'revenueCents', coalesce(s.revenue_cents, 0),
            'costsCents', coalesce(p.costs_cents, 0),
            'resultCents', coalesce(s.revenue_cents, 0) - coalesce(p.costs_cents, 0)
          )
          order by b.bucket_index
        ),
        '[]'::jsonb
      )
    )
    from buckets b
    left join sales s
      on s.bucket_index = b.bucket_index
    left join purchases p
      on p.bucket_index = b.bucket_index
  );
end;
$$;

revoke all
on function public.get_financial_period_series(uuid, text)
from public, anon;

grant execute
on function public.get_financial_period_series(uuid, text)
to authenticated;

commit;