-- ============================================================
-- 202609290002_receivables_payables.sql
--
-- Doel:
-- - bestaande debiteuren/verkoopfacturen behouden
-- - crediteuren + inkoopfacturen toevoegen
-- - openstaande posten veilig uitleesbaar maken
-- - betalingen kunnen verdelen over facturen
-- - dashboardtotalen beschikbaar maken
--
-- Bestaande tabellen die bewust worden hergebruikt:
--   public.debtors
--   public.sales_invoices
--   public.sales_invoice_lines
--   public.payments
--
-- Alle geldbedragen worden opgeslagen in CENTEN (bigint).
-- ============================================================

begin;


-- ============================================================
-- 1. CREDITEUREN
-- ============================================================

create table public.creditors (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  name text not null,

  email text,

  address jsonb not null default '{}'::jsonb,

  chamber_of_commerce text,
  vat_id text,
  iban text,

  payment_term_days integer not null default 30
    check (
      payment_term_days >= 0
      and payment_term_days <= 365
    ),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  archived_at timestamptz
);


create index creditors_organization_idx
  on public.creditors (
    organization_id,
    archived_at
  );


create index creditors_name_idx
  on public.creditors (
    organization_id,
    name
  );


-- ============================================================
-- 2. INKOOPFACTUREN
-- ============================================================

create table public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  creditor_id uuid not null
    references public.creditors(id)
    on delete restrict,

  invoice_number text not null,

  status text not null default 'open'
    check (
      status in (
        'draft',
        'open',
        'partially_paid',
        'paid',
        'overdue',
        'credited',
        'cancelled'
      )
    ),

  invoice_date date not null,
  due_date date not null,

  currency char(3) not null default 'EUR',

  subtotal_cents bigint not null default 0
    check (subtotal_cents >= 0),

  vat_cents bigint not null default 0
    check (vat_cents >= 0),

  total_cents bigint not null default 0
    check (total_cents >= 0),

  paid_cents bigint not null default 0
    check (paid_cents >= 0),

  document_id uuid
    references public.documents(id)
    on delete set null,

  reference text,
  description text,

  created_by uuid not null
    references public.profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  finalized_at timestamptz,
  archived_at timestamptz,

  constraint purchase_invoice_dates_valid
    check (
      due_date >= invoice_date
    ),

  constraint purchase_invoice_paid_not_above_total
    check (
      paid_cents <= total_cents
    ),

  unique (
    organization_id,
    creditor_id,
    invoice_number
  )
);


create index purchase_invoices_org_status_due_idx
  on public.purchase_invoices (
    organization_id,
    status,
    due_date
  );


create index purchase_invoices_creditor_idx
  on public.purchase_invoices (
    creditor_id
  );


create index purchase_invoices_document_idx
  on public.purchase_invoices (
    document_id
  )
  where document_id is not null;


-- ============================================================
-- 3. INKOOPFACTUURREGELS
-- ============================================================

create table public.purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(),

  invoice_id uuid not null
    references public.purchase_invoices(id)
    on delete cascade,

  description text not null,

  quantity numeric(14,4) not null
    check (quantity > 0),

  unit_price_cents bigint not null
    check (unit_price_cents >= 0),

  vat_rate numeric(5,2) not null
    check (
      vat_rate >= 0
      and vat_rate <= 100
    ),

  line_total_cents bigint not null
    check (line_total_cents >= 0),

  position integer not null
    check (position > 0),

  unique (
    invoice_id,
    position
  )
);


create index purchase_invoice_lines_invoice_idx
  on public.purchase_invoice_lines (
    invoice_id,
    position
  );


-- ============================================================
-- 4. BETALINGEN VERDELEN OVER FACTUREN
--
-- De bestaande public.payments tabel blijft behouden.
--
-- Een betaling kan bijvoorbeeld:
-- - 1 factuur volledig betalen
-- - een factuur gedeeltelijk betalen
-- - meerdere facturen tegelijk betalen
--
-- Er mag per allocatie precies één factuurtype gekozen worden:
-- verkoop OF inkoop.
-- ============================================================

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  payment_id uuid not null
    references public.payments(id)
    on delete cascade,

  sales_invoice_id uuid
    references public.sales_invoices(id)
    on delete restrict,

  purchase_invoice_id uuid
    references public.purchase_invoices(id)
    on delete restrict,

  amount_cents bigint not null
    check (amount_cents > 0),

  created_by uuid
    references public.profiles(id),

  created_at timestamptz not null default now(),

  constraint payment_allocation_exactly_one_invoice
    check (
      (
        sales_invoice_id is not null
        and purchase_invoice_id is null
      )
      or
      (
        sales_invoice_id is null
        and purchase_invoice_id is not null
      )
    )
);


create index payment_allocations_payment_idx
  on public.payment_allocations (
    payment_id
  );


create index payment_allocations_sales_invoice_idx
  on public.payment_allocations (
    sales_invoice_id
  )
  where sales_invoice_id is not null;


create index payment_allocations_purchase_invoice_idx
  on public.payment_allocations (
    purchase_invoice_id
  )
  where purchase_invoice_id is not null;


create unique index payment_allocations_payment_sales_unique
  on public.payment_allocations (
    payment_id,
    sales_invoice_id
  )
  where sales_invoice_id is not null;


create unique index payment_allocations_payment_purchase_unique
  on public.payment_allocations (
    payment_id,
    purchase_invoice_id
  )
  where purchase_invoice_id is not null;


-- ============================================================
-- 5. UPDATED_AT HELPER
-- ============================================================

create or replace function public.set_financial_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


create trigger creditors_set_updated_at
before update on public.creditors
for each row
execute function public.set_financial_updated_at();


create trigger purchase_invoices_set_updated_at
before update on public.purchase_invoices
for each row
execute function public.set_financial_updated_at();


-- ============================================================
-- 6. ORGANISATIE-INTEGRITEIT VERKOOPFACTUUR
--
-- sales_invoices bestond al.
-- Voeg nu bescherming toe tegen:
--
-- organisatie A
-- +
-- debiteur van organisatie B
-- ============================================================

create or replace function public.validate_sales_invoice_debtor()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  debtor_organization_id uuid;
begin

  select d.organization_id
  into debtor_organization_id
  from public.debtors d
  where d.id = new.debtor_id;

  if debtor_organization_id is null then
    raise exception 'Debiteur bestaat niet.';
  end if;

  if debtor_organization_id <> new.organization_id then
    raise exception
      'Debiteur behoort niet tot dezelfde organisatie als de verkoopfactuur.';
  end if;

  return new;

end;
$$;


create trigger sales_invoice_validate_debtor
before insert or update of organization_id, debtor_id
on public.sales_invoices
for each row
execute function public.validate_sales_invoice_debtor();


-- ============================================================
-- 7. ORGANISATIE-INTEGRITEIT INKOOPFACTUUR
-- ============================================================

create or replace function public.validate_purchase_invoice_creditor()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  creditor_organization_id uuid;
  document_organization_id uuid;
begin

  select c.organization_id
  into creditor_organization_id
  from public.creditors c
  where c.id = new.creditor_id;

  if creditor_organization_id is null then
    raise exception 'Crediteur bestaat niet.';
  end if;

  if creditor_organization_id <> new.organization_id then
    raise exception
      'Crediteur behoort niet tot dezelfde organisatie als de inkoopfactuur.';
  end if;


  if new.document_id is not null then

    select d.organization_id
    into document_organization_id
    from public.documents d
    where d.id = new.document_id;

    if document_organization_id is null then
      raise exception 'Document bestaat niet.';
    end if;

    if document_organization_id <> new.organization_id then
      raise exception
        'Document behoort niet tot dezelfde organisatie als de inkoopfactuur.';
    end if;

  end if;

  return new;

end;
$$;


create trigger purchase_invoice_validate_creditor
before insert or update of
  organization_id,
  creditor_id,
  document_id
on public.purchase_invoices
for each row
execute function public.validate_purchase_invoice_creditor();


-- ============================================================
-- 8. RLS
-- ============================================================

alter table public.creditors
  enable row level security;

alter table public.purchase_invoices
  enable row level security;

alter table public.purchase_invoice_lines
  enable row level security;

alter table public.payment_allocations
  enable row level security;


-- ============================================================
-- 9. LEZEN
--
-- Financiële gegevens:
-- - geldige organisatiekoppeling OF Office
-- - altijd AAL2
-- ============================================================

create policy creditors_read
on public.creditors
for select
to authenticated
using (
  public.has_aal2()
  and (
    public.has_org_access(organization_id)
    or public.is_office_user()
  )
);


create policy purchase_invoices_read
on public.purchase_invoices
for select
to authenticated
using (
  public.has_aal2()
  and (
    public.has_org_access(organization_id)
    or public.is_office_user()
  )
);


create policy purchase_invoice_lines_read
on public.purchase_invoice_lines
for select
to authenticated
using (
  public.has_aal2()
  and exists (
    select 1
    from public.purchase_invoices invoice
    where invoice.id = purchase_invoice_lines.invoice_id
      and (
        public.has_org_access(invoice.organization_id)
        or public.is_office_user()
      )
  )
);


create policy payment_allocations_read
on public.payment_allocations
for select
to authenticated
using (
  public.has_aal2()
  and (
    public.has_org_access(organization_id)
    or public.is_office_user()
  )
);


-- ============================================================
-- 10. SCHRIJVEN
--
-- Voor V1:
-- financiële stam- en boekingsgegevens alleen via Office.
--
-- Klanten krijgen dus GEEN directe insert/update/delete
-- op deze tabellen.
-- ============================================================

create policy creditors_office_insert
on public.creditors
for insert
to authenticated
with check (
  public.has_aal2()
  and public.is_office_user()
);


create policy creditors_office_update
on public.creditors
for update
to authenticated
using (
  public.has_aal2()
  and public.is_office_user()
)
with check (
  public.has_aal2()
  and public.is_office_user()
);


create policy creditors_office_delete
on public.creditors
for delete
to authenticated
using (
  public.has_aal2()
  and public.is_office_user()
);


create policy purchase_invoices_office_insert
on public.purchase_invoices
for insert
to authenticated
with check (
  public.has_aal2()
  and public.is_office_user()
);


create policy purchase_invoices_office_update
on public.purchase_invoices
for update
to authenticated
using (
  public.has_aal2()
  and public.is_office_user()
)
with check (
  public.has_aal2()
  and public.is_office_user()
);


create policy purchase_invoices_office_delete
on public.purchase_invoices
for delete
to authenticated
using (
  public.has_aal2()
  and public.is_office_user()
);


create policy purchase_invoice_lines_office_insert
on public.purchase_invoice_lines
for insert
to authenticated
with check (
  public.has_aal2()
  and public.is_office_user()
  and exists (
    select 1
    from public.purchase_invoices invoice
    where invoice.id = purchase_invoice_lines.invoice_id
  )
);


create policy purchase_invoice_lines_office_update
on public.purchase_invoice_lines
for update
to authenticated
using (
  public.has_aal2()
  and public.is_office_user()
)
with check (
  public.has_aal2()
  and public.is_office_user()
);


create policy purchase_invoice_lines_office_delete
on public.purchase_invoice_lines
for delete
to authenticated
using (
  public.has_aal2()
  and public.is_office_user()
);


-- payment_allocations worden bewust NIET direct schrijfbaar
-- gemaakt.
--
-- Nieuwe allocaties moeten via onderstaande RPC's lopen zodat:
-- - organisaties worden gecontroleerd
-- - overbetalingen worden voorkomen
-- - betaalstatus wordt bijgewerkt
-- - audit wordt vastgelegd


-- ============================================================
-- 11. DEBITEURENOVERZICHT
--
-- Bestaande sales_invoices gebruiken:
-- total_cents
-- paid_cents
-- ============================================================

create view public.receivables_overview
with (security_invoker = true)
as

select

  invoice.organization_id,

  invoice.id as invoice_id,

  invoice.invoice_number,

  invoice.invoice_date,

  invoice.due_date,

  invoice.status,

  debtor.id as debtor_id,

  debtor.name as debtor_name,

  invoice.currency,

  invoice.subtotal_cents,

  invoice.vat_cents,

  invoice.total_cents,

  invoice.paid_cents,

  greatest(
    invoice.total_cents - invoice.paid_cents,
    0
  ) as outstanding_cents,

  (
    invoice.due_date < current_date
    and invoice.total_cents > invoice.paid_cents
  ) as overdue

from public.sales_invoices invoice

join public.debtors debtor
  on debtor.id = invoice.debtor_id
  and debtor.organization_id = invoice.organization_id

where invoice.archived_at is null

  and invoice.total_cents > invoice.paid_cents

  and lower(invoice.status) not in (
    'draft',
    'concept',
    'credited',
    'gecrediteerd',
    'cancelled',
    'geannuleerd'
  );


-- ============================================================
-- 12. CREDITEURENOVERZICHT
-- ============================================================

create view public.payables_overview
with (security_invoker = true)
as

select

  invoice.organization_id,

  invoice.id as invoice_id,

  invoice.invoice_number,

  invoice.invoice_date,

  invoice.due_date,

  invoice.status,

  creditor.id as creditor_id,

  creditor.name as creditor_name,

  invoice.currency,

  invoice.subtotal_cents,

  invoice.vat_cents,

  invoice.total_cents,

  invoice.paid_cents,

  greatest(
    invoice.total_cents - invoice.paid_cents,
    0
  ) as outstanding_cents,

  (
    invoice.due_date < current_date
    and invoice.total_cents > invoice.paid_cents
  ) as overdue

from public.purchase_invoices invoice

join public.creditors creditor
  on creditor.id = invoice.creditor_id
  and creditor.organization_id = invoice.organization_id

where invoice.archived_at is null

  and invoice.total_cents > invoice.paid_cents

  and invoice.status not in (
    'draft',
    'credited',
    'cancelled'
  );


-- ============================================================
-- 13. DASHBOARDTOTALEN
-- ============================================================

create or replace function public.get_open_positions(
  p_organization_id uuid
)
returns table (

  receivables_total_cents bigint,

  receivables_overdue_cents bigint,

  receivables_count bigint,

  payables_total_cents bigint,

  payables_overdue_cents bigint,

  payables_count bigint

)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin

  if not public.has_aal2() then
    raise exception 'AAL2 is vereist.';
  end if;


  if not (
    public.has_org_access(p_organization_id)
    or public.is_office_user()
  ) then
    raise exception 'Geen toegang tot deze organisatie.';
  end if;


  return query

  select

    coalesce(
      (
        select sum(r.outstanding_cents)::bigint
        from public.receivables_overview r
        where r.organization_id = p_organization_id
      ),
      0::bigint
    ),

    coalesce(
      (
        select sum(r.outstanding_cents)::bigint
        from public.receivables_overview r
        where r.organization_id = p_organization_id
          and r.overdue = true
      ),
      0::bigint
    ),

    (
      select count(*)::bigint
      from public.receivables_overview r
      where r.organization_id = p_organization_id
    ),

    coalesce(
      (
        select sum(p.outstanding_cents)::bigint
        from public.payables_overview p
        where p.organization_id = p_organization_id
      ),
      0::bigint
    ),

    coalesce(
      (
        select sum(p.outstanding_cents)::bigint
        from public.payables_overview p
        where p.organization_id = p_organization_id
          and p.overdue = true
      ),
      0::bigint
    ),

    (
      select count(*)::bigint
      from public.payables_overview p
      where p.organization_id = p_organization_id
    );

end;
$$;


revoke all
on function public.get_open_positions(uuid)
from public, anon;


grant execute
on function public.get_open_positions(uuid)
to authenticated;


-- ============================================================
-- 14. BETALING TOEWIJZEN AAN VERKOOPFACTUUR
-- ============================================================

create or replace function public.allocate_payment_to_sales_invoice(
  p_payment_id uuid,
  p_invoice_id uuid,
  p_amount_cents bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare

  v_payment public.payments%rowtype;

  v_invoice public.sales_invoices%rowtype;

  v_payment_allocated bigint;

  v_invoice_outstanding bigint;

  v_allocation_id uuid;

  v_new_paid bigint;

begin

  if not public.has_aal2()
     or not public.is_office_user() then
    raise exception
      'Alleen een geverifieerde Office-gebruiker mag betalingen toewijzen.';
  end if;


  if p_amount_cents <= 0 then
    raise exception
      'Toegewezen bedrag moet groter zijn dan nul.';
  end if;


  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;


  if not found then
    raise exception 'Betaling bestaat niet.';
  end if;


  select *
  into v_invoice
  from public.sales_invoices
  where id = p_invoice_id
  for update;


  if not found then
    raise exception 'Verkoopfactuur bestaat niet.';
  end if;


  if v_payment.organization_id
     <> v_invoice.organization_id then

    raise exception
      'Betaling en factuur behoren niet tot dezelfde organisatie.';

  end if;


  if v_payment.amount_cents <= 0 then
    raise exception
      'Een verkoopfactuur kan alleen met een inkomende betaling worden afgeboekt.';
  end if;


  select coalesce(
    sum(a.amount_cents),
    0
  )::bigint
  into v_payment_allocated
  from public.payment_allocations a
  where a.payment_id = p_payment_id;


  if (
    v_payment_allocated + p_amount_cents
  ) > abs(v_payment.amount_cents) then

    raise exception
      'De betaling wordt voor meer toegewezen dan het beschikbare bedrag.';

  end if;


  v_invoice_outstanding :=
    greatest(
      v_invoice.total_cents
      - v_invoice.paid_cents,
      0
    );


  if p_amount_cents > v_invoice_outstanding then
    raise exception
      'Het toegewezen bedrag is groter dan het openstaande factuurbedrag.';
  end if;


  insert into public.payment_allocations (
    organization_id,
    payment_id,
    sales_invoice_id,
    amount_cents,
    created_by
  )
  values (
    v_invoice.organization_id,
    p_payment_id,
    p_invoice_id,
    p_amount_cents,
    auth.uid()
  )
  returning id
  into v_allocation_id;


  v_new_paid :=
    v_invoice.paid_cents
    + p_amount_cents;


  update public.sales_invoices
  set

    paid_cents = v_new_paid,

    status = case
      when v_new_paid >= total_cents
        then 'paid'
      else 'partially_paid'
    end

  where id = p_invoice_id;


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
    v_invoice.organization_id,
    'payment_allocated',
    'sales_invoice',
    p_invoice_id,
    'success',
    jsonb_build_object(
      'payment_id', p_payment_id,
      'amount_cents', p_amount_cents,
      'allocation_id', v_allocation_id
    )
  );


  return v_allocation_id;

end;
$$;


revoke all
on function public.allocate_payment_to_sales_invoice(
  uuid,
  uuid,
  bigint
)
from public, anon;


grant execute
on function public.allocate_payment_to_sales_invoice(
  uuid,
  uuid,
  bigint
)
to authenticated;


-- ============================================================
-- 15. BETALING TOEWIJZEN AAN INKOOPFACTUUR
-- ============================================================

create or replace function public.allocate_payment_to_purchase_invoice(
  p_payment_id uuid,
  p_invoice_id uuid,
  p_amount_cents bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare

  v_payment public.payments%rowtype;

  v_invoice public.purchase_invoices%rowtype;

  v_payment_allocated bigint;

  v_invoice_outstanding bigint;

  v_allocation_id uuid;

  v_new_paid bigint;

begin

  if not public.has_aal2()
     or not public.is_office_user() then
    raise exception
      'Alleen een geverifieerde Office-gebruiker mag betalingen toewijzen.';
  end if;


  if p_amount_cents <= 0 then
    raise exception
      'Toegewezen bedrag moet groter zijn dan nul.';
  end if;


  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;


  if not found then
    raise exception 'Betaling bestaat niet.';
  end if;


  select *
  into v_invoice
  from public.purchase_invoices
  where id = p_invoice_id
  for update;


  if not found then
    raise exception 'Inkoopfactuur bestaat niet.';
  end if;


  if v_payment.organization_id
     <> v_invoice.organization_id then

    raise exception
      'Betaling en factuur behoren niet tot dezelfde organisatie.';

  end if;


  if v_payment.amount_cents >= 0 then
    raise exception
      'Een inkoopfactuur kan alleen met een uitgaande betaling worden afgeboekt.';
  end if;


  select coalesce(
    sum(a.amount_cents),
    0
  )::bigint
  into v_payment_allocated
  from public.payment_allocations a
  where a.payment_id = p_payment_id;


  if (
    v_payment_allocated + p_amount_cents
  ) > abs(v_payment.amount_cents) then

    raise exception
      'De betaling wordt voor meer toegewezen dan het beschikbare bedrag.';

  end if;


  v_invoice_outstanding :=
    greatest(
      v_invoice.total_cents
      - v_invoice.paid_cents,
      0
    );


  if p_amount_cents > v_invoice_outstanding then
    raise exception
      'Het toegewezen bedrag is groter dan het openstaande factuurbedrag.';
  end if;


  insert into public.payment_allocations (
    organization_id,
    payment_id,
    purchase_invoice_id,
    amount_cents,
    created_by
  )
  values (
    v_invoice.organization_id,
    p_payment_id,
    p_invoice_id,
    p_amount_cents,
    auth.uid()
  )
  returning id
  into v_allocation_id;


  v_new_paid :=
    v_invoice.paid_cents
    + p_amount_cents;


  update public.purchase_invoices
  set

    paid_cents = v_new_paid,

    status = case
      when v_new_paid >= total_cents
        then 'paid'
      else 'partially_paid'
    end

  where id = p_invoice_id;


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
    v_invoice.organization_id,
    'payment_allocated',
    'purchase_invoice',
    p_invoice_id,
    'success',
    jsonb_build_object(
      'payment_id', p_payment_id,
      'amount_cents', p_amount_cents,
      'allocation_id', v_allocation_id
    )
  );


  return v_allocation_id;

end;
$$;


revoke all
on function public.allocate_payment_to_purchase_invoice(
  uuid,
  uuid,
  bigint
)
from public, anon;


grant execute
on function public.allocate_payment_to_purchase_invoice(
  uuid,
  uuid,
  bigint
)
to authenticated;


-- ============================================================
-- 16. DIRECTE MUTATIES OP ALLOCATIES BLOKKEREN
--
-- Lezen mag volgens RLS.
-- Schrijven gebeurt uitsluitend via de RPC's.
-- ============================================================

revoke insert, update, delete
on public.payment_allocations
from authenticated;


-- ============================================================
-- 17. BASIS GRANTS VOOR VIEWS
-- ============================================================

grant select
on public.receivables_overview
to authenticated;


grant select
on public.payables_overview
to authenticated;


commit;