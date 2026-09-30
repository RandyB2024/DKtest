-- ============================================================
-- 202609300005_financial_period_summary.sql
--
-- Financiële periodecijfers voor klantdashboard.
--
-- Omzet  = verkoopfacturen excl. btw
-- Kosten = inkoopfacturen excl. btw
-- Resultaat = omzet - kosten
--
-- Betaalstatus heeft GEEN invloed op omzet/kosten.
-- ============================================================

begin;


create or replace function public.get_financial_period_summary(
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

  v_revenue_cents bigint;
  v_costs_cents bigint;

  v_sales_count bigint;
  v_purchase_count bigint;

begin

  -- ==========================================================
  -- 1. BEVEILIGING
  -- ==========================================================

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


  v_period :=
    lower(
      trim(
        coalesce(
          p_period,
          ''
        )
      )
    );


  -- ==========================================================
  -- 2. PERIODE BEPALEN
  -- ==========================================================

  if v_period = 'day' then

    v_start_date := current_date;
    v_end_date := current_date + 1;


  elsif v_period = 'week' then

    v_start_date :=
      date_trunc(
        'week',
        current_date
      )::date;

    v_end_date :=
      v_start_date + 7;


  elsif v_period = 'month' then

    v_start_date :=
      date_trunc(
        'month',
        current_date
      )::date;

    v_end_date :=
      (
        v_start_date
        + interval '1 month'
      )::date;


  elsif v_period = 'quarter' then

    v_start_date :=
      date_trunc(
        'quarter',
        current_date
      )::date;

    v_end_date :=
      (
        v_start_date
        + interval '3 months'
      )::date;


  elsif v_period = 'halfyear' then

    if extract(
      month from current_date
    ) <= 6 then

      v_start_date :=
        make_date(
          extract(
            year from current_date
          )::integer,
          1,
          1
        );

    else

      v_start_date :=
        make_date(
          extract(
            year from current_date
          )::integer,
          7,
          1
        );

    end if;

    v_end_date :=
      (
        v_start_date
        + interval '6 months'
      )::date;


  elsif v_period = 'year' then

    v_start_date :=
      date_trunc(
        'year',
        current_date
      )::date;

    v_end_date :=
      (
        v_start_date
        + interval '1 year'
      )::date;


  else

    raise exception using
      errcode = '22023',
      message = 'Ongeldige financiële periode.';

  end if;


  -- ==========================================================
  -- 3. OMZET
  --
  -- Omzet excl. btw.
  -- Betaald/onbetaald maakt niet uit.
  -- ==========================================================

  select
    coalesce(
      sum(
        invoice.subtotal_cents
      ),
      0
    )::bigint,

    count(*)::bigint

  into
    v_revenue_cents,
    v_sales_count

  from public.sales_invoices invoice

  where
    invoice.organization_id =
      p_organization_id

    and invoice.archived_at is null

    and invoice.invoice_date >=
      v_start_date

    and invoice.invoice_date <
      v_end_date

    and lower(
      invoice.status
    ) not in (
      'draft',
      'concept',
      'credited',
      'gecrediteerd',
      'cancelled',
      'geannuleerd'
    );


  -- ==========================================================
  -- 4. KOSTEN
  --
  -- Voorlopig alle definitieve inkoopfacturen excl. btw.
  --
  -- Later wordt dit verfijnd met grootboekrekeningen:
  -- investering / kosten / balans / privé etc.
  -- ==========================================================

  select
    coalesce(
      sum(
        invoice.subtotal_cents
      ),
      0
    )::bigint,

    count(*)::bigint

  into
    v_costs_cents,
    v_purchase_count

  from public.purchase_invoices invoice

  where
    invoice.organization_id =
      p_organization_id

    and invoice.archived_at is null

    and invoice.invoice_date >=
      v_start_date

    and invoice.invoice_date <
      v_end_date

    and lower(
      invoice.status
    ) not in (
      'draft',
      'credited',
      'gecrediteerd',
      'cancelled',
      'geannuleerd'
    );


  -- ==========================================================
  -- 5. RESULTAAT
  -- ==========================================================

  return jsonb_build_object(

    'period',
    v_period,

    'startDate',
    v_start_date,

    'endDate',
    v_end_date - 1,

    'revenueCents',
    v_revenue_cents,

    'costsCents',
    v_costs_cents,

    'resultCents',
    v_revenue_cents
      - v_costs_cents,

    'salesInvoiceCount',
    v_sales_count,

    'purchaseInvoiceCount',
    v_purchase_count

  );

end;
$$;


revoke all
on function public.get_financial_period_summary(
  uuid,
  text
)
from public, anon;


grant execute
on function public.get_financial_period_summary(
  uuid,
  text
)
to authenticated;


commit;