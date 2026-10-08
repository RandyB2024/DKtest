begin;

-- ============================================================
-- 1. VERWACHTE / PERIODIEKE KOSTEN
-- ============================================================

create table if not exists public.creditor_expected_costs (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  creditor_id uuid
    references public.creditors(id)
    on delete restrict,

  name text not null,

  description text,

  frequency text not null
    check (
      frequency in (
        'monthly',
        'quarterly',
        'half_yearly',
        'yearly',
        'one_off'
      )
    ),

  expected_amount_cents bigint not null
    check (expected_amount_cents >= 0),

  tolerance_percent numeric(5,2) not null default 10
    check (
      tolerance_percent >= 0
      and tolerance_percent <= 100
    ),

  next_expected_date date not null,

  automatic_debit boolean not null default false,

  ledger_account text,

  vat_code text,

  cost_center text,

  contract_end_date date,

  notice_date date,

  active boolean not null default true,

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  archived_at timestamptz
);

create index if not exists
  creditor_expected_costs_org_idx
on public.creditor_expected_costs (
  organization_id,
  active,
  archived_at,
  next_expected_date
);

create index if not exists
  creditor_expected_costs_creditor_idx
on public.creditor_expected_costs (
  creditor_id
);


-- ============================================================
-- 2. BANKUITGAVEN WAARVOOR DOCUMENT ONTBREEKT
--
-- Dit is bewust een aparte administratieve statuslaag.
-- De bankintegratie kan hier later automatisch records aanmaken.
-- ============================================================

create table if not exists public.creditor_missing_documents (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  creditor_id uuid
    references public.creditors(id)
    on delete restrict,

  transaction_reference text,

  transaction_date date not null,

  counterparty text,

  description text,

  amount_cents bigint not null
    check (amount_cents > 0),

  status text not null default 'missing'
    check (
      status in (
        'missing',
        'requested',
        'received',
        'matched',
        'ignored'
      )
    ),

  document_id uuid,

  purchase_invoice_id uuid
    references public.purchase_invoices(id)
    on delete set null,

  requested_at timestamptz,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists
  creditor_missing_documents_org_idx
on public.creditor_missing_documents (
  organization_id,
  status,
  transaction_date desc
);


-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.creditor_expected_costs
  enable row level security;

alter table public.creditor_missing_documents
  enable row level security;


drop policy if exists
  creditor_expected_costs_read
on public.creditor_expected_costs;

create policy creditor_expected_costs_read
on public.creditor_expected_costs
for select
to authenticated
using (
  public.has_org_access(organization_id)
  or public.is_office_user()
);


drop policy if exists
  creditor_expected_costs_office_write
on public.creditor_expected_costs;

create policy creditor_expected_costs_office_write
on public.creditor_expected_costs
for all
to authenticated
using (
  public.is_office_user()
  and public.has_aal2()
)
with check (
  public.is_office_user()
  and public.has_aal2()
);


drop policy if exists
  creditor_missing_documents_read
on public.creditor_missing_documents;

create policy creditor_missing_documents_read
on public.creditor_missing_documents
for select
to authenticated
using (
  public.has_org_access(organization_id)
  or public.is_office_user()
);


drop policy if exists
  creditor_missing_documents_office_write
on public.creditor_missing_documents;

create policy creditor_missing_documents_office_write
on public.creditor_missing_documents
for all
to authenticated
using (
  public.is_office_user()
  and public.has_aal2()
)
with check (
  public.is_office_user()
  and public.has_aal2()
);


-- ============================================================
-- 4. COMPLETE CREDITEUREN-RPC
-- ============================================================

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


  with open_invoices as (
    select
      invoice.id,
      invoice.organization_id,
      invoice.creditor_id,
      invoice.invoice_number,
      invoice.invoice_date,
      invoice.due_date,
      invoice.status,
      invoice.currency,
      invoice.subtotal_cents,
      invoice.vat_cents,
      invoice.total_cents,
      invoice.paid_cents,
      greatest(
        invoice.total_cents
        - invoice.paid_cents,
        0
      )::bigint as outstanding_cents,
      invoice.document_id,
      invoice.reference,
      invoice.description,
      creditor.name as creditor_name
    from public.purchase_invoices invoice
    join public.creditors creditor
      on creditor.id = invoice.creditor_id
     and creditor.organization_id =
       invoice.organization_id
    where invoice.organization_id =
      p_organization_id
      and invoice.status not in (
        'paid',
        'credited',
        'cancelled'
      )
      and greatest(
        invoice.total_cents
        - invoice.paid_cents,
        0
      ) > 0
  ),

  summary as (
    select
      coalesce(
        sum(outstanding_cents),
        0
      )::bigint as total_cents,

      coalesce(
        sum(
          outstanding_cents
        ) filter (
          where due_date < current_date
        ),
        0
      )::bigint as overdue_cents,

      coalesce(
        sum(
          outstanding_cents
        ) filter (
          where due_date >= current_date
            and due_date <=
              current_date + 7
        ),
        0
      )::bigint as due_7_cents,

      coalesce(
        sum(
          outstanding_cents
        ) filter (
          where due_date >= current_date
            and due_date <=
              current_date + 30
        ),
        0
      )::bigint as due_30_cents,

      count(*)::bigint as invoice_count,

      count(*) filter (
        where due_date < current_date
      )::bigint as overdue_count,

      count(*) filter (
        where
          paid_cents > 0
          and outstanding_cents > 0
      )::bigint as partial_count

    from open_invoices
  ),

  expected as (
    select
      coalesce(
        sum(expected_amount_cents),
        0
      )::bigint as total_cents,

      coalesce(
        sum(expected_amount_cents)
        filter (
          where next_expected_date
            <= current_date + 30
        ),
        0
      )::bigint as next_30_cents,

      count(*)::bigint as count

    from public.creditor_expected_costs

    where organization_id =
      p_organization_id

      and active = true

      and archived_at is null
  ),

  missing as (
    select
      coalesce(
        sum(amount_cents),
        0
      )::bigint as total_cents,

      count(*)::bigint as count

    from public.creditor_missing_documents

    where organization_id =
      p_organization_id

      and status in (
        'missing',
        'requested'
      )
  ),

  suppliers as (
    select
      creditor.id,
      creditor.name,
      creditor.email,
      creditor.iban,
      creditor.vat_id,
      creditor.chamber_of_commerce,
      creditor.payment_term_days,

      coalesce(
        sum(
          invoice.outstanding_cents
        ),
        0
      )::bigint as outstanding_cents,

      count(
        invoice.id
      )::bigint as open_count,

      min(
        invoice.due_date
      ) as oldest_due_date

    from public.creditors creditor

    left join open_invoices invoice
      on invoice.creditor_id =
        creditor.id

    where creditor.organization_id =
      p_organization_id

      and creditor.archived_at is null

    group by
      creditor.id,
      creditor.name,
      creditor.email,
      creditor.iban,
      creditor.vat_id,
      creditor.chamber_of_commerce,
      creditor.payment_term_days
  )

  select jsonb_build_object(

    'summary',
    jsonb_build_object(
      'totalCents',
      s.total_cents,

      'overdueCents',
      s.overdue_cents,

      'due7Cents',
      s.due_7_cents,

      'due30Cents',
      s.due_30_cents,

      'count',
      s.invoice_count,

      'overdueCount',
      s.overdue_count,

      'partialCount',
      s.partial_count,

      'expectedCents',
      e.total_cents,

      'expected30Cents',
      e.next_30_cents,

      'expectedCount',
      e.count,

      'missingDocumentCents',
      m.total_cents,

      'missingDocumentCount',
      m.count
    ),

    'aging',
    jsonb_build_object(

      'notDueCents',
      coalesce(
        (
          select sum(
            outstanding_cents
          )
          from open_invoices
          where due_date >= current_date
        ),
        0
      ),

      'days1to30Cents',
      coalesce(
        (
          select sum(
            outstanding_cents
          )
          from open_invoices
          where due_date <
            current_date
          and due_date >=
            current_date - 30
        ),
        0
      ),

      'days31to60Cents',
      coalesce(
        (
          select sum(
            outstanding_cents
          )
          from open_invoices
          where due_date <
            current_date - 30
          and due_date >=
            current_date - 60
        ),
        0
      ),

      'days61to90Cents',
      coalesce(
        (
          select sum(
            outstanding_cents
          )
          from open_invoices
          where due_date <
            current_date - 60
          and due_date >=
            current_date - 90
        ),
        0
      ),

      'over90Cents',
      coalesce(
        (
          select sum(
            outstanding_cents
          )
          from open_invoices
          where due_date <
            current_date - 90
        ),
        0
      )
    ),

    'items',
    coalesce(
      (
        select jsonb_agg(
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
              invoice.creditor_id,
              'name',
              invoice.creditor_name
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
            invoice.outstanding_cents,

            'overdue',
            invoice.due_date <
              current_date,

            'dueSoon',
            invoice.due_date >=
              current_date
              and invoice.due_date <=
                current_date + 7,

            'documentId',
            invoice.document_id,

            'reference',
            invoice.reference,

            'description',
            invoice.description
          )
          order by
            invoice.due_date asc,
            invoice.invoice_date asc
        )
        from open_invoices invoice
      ),
      '[]'::jsonb
    ),

    'suppliers',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            supplier.id,

            'name',
            supplier.name,

            'email',
            supplier.email,

            'iban',
            supplier.iban,

            'vatId',
            supplier.vat_id,

            'chamberOfCommerce',
            supplier.chamber_of_commerce,

            'paymentTermDays',
            supplier.payment_term_days,

            'outstandingCents',
            supplier.outstanding_cents,

            'openCount',
            supplier.open_count,

            'oldestDueDate',
            supplier.oldest_due_date
          )
          order by
            supplier.outstanding_cents desc,
            supplier.name asc
        )
        from suppliers supplier
      ),
      '[]'::jsonb
    ),

    'expectedCosts',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            cost.id,

            'creditorId',
            cost.creditor_id,

            'name',
            cost.name,

            'description',
            cost.description,

            'frequency',
            cost.frequency,

            'expectedAmountCents',
            cost.expected_amount_cents,

            'tolerancePercent',
            cost.tolerance_percent,

            'nextExpectedDate',
            cost.next_expected_date,

            'automaticDebit',
            cost.automatic_debit,

            'ledgerAccount',
            cost.ledger_account,

            'vatCode',
            cost.vat_code,

            'costCenter',
            cost.cost_center,

            'contractEndDate',
            cost.contract_end_date,

            'noticeDate',
            cost.notice_date,

            'notes',
            cost.notes
          )
          order by
            cost.next_expected_date asc
        )

        from public.creditor_expected_costs cost

        where cost.organization_id =
          p_organization_id

          and cost.active = true

          and cost.archived_at is null
      ),
      '[]'::jsonb
    ),

    'missingDocuments',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            missing_document.id,

            'creditorId',
            missing_document.creditor_id,

            'transactionReference',
            missing_document.transaction_reference,

            'transactionDate',
            missing_document.transaction_date,

            'counterparty',
            missing_document.counterparty,

            'description',
            missing_document.description,

            'amountCents',
            missing_document.amount_cents,

            'status',
            missing_document.status,

            'documentId',
            missing_document.document_id,

            'purchaseInvoiceId',
            missing_document.purchase_invoice_id,

            'requestedAt',
            missing_document.requested_at
          )
          order by
            missing_document.transaction_date desc
        )

        from public.creditor_missing_documents
          missing_document

        where
          missing_document.organization_id =
            p_organization_id

          and missing_document.status in (
            'missing',
            'requested'
          )
      ),
      '[]'::jsonb
    )
  )
  into result
  from summary s
  cross join expected e
  cross join missing m;

  return result;

end;
$$;


revoke all
on function public.get_payables(uuid)
from public, anon;

grant execute
on function public.get_payables(uuid)
to authenticated;


-- ============================================================
-- 5. GRANTS
-- ============================================================

grant select
on public.creditor_expected_costs
to authenticated;

grant select
on public.creditor_missing_documents
to authenticated;

grant insert, update
on public.creditor_expected_costs
to authenticated;

grant insert, update
on public.creditor_missing_documents
to authenticated;


commit;
