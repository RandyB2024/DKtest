begin;

-- ============================================================
-- 6A-1 BESTEMD CUSTOMER INVOICING FOUNDATION
-- ============================================================


-- ============================================================
-- 1. FACTURATIE-INSTELLINGEN PER ONDERNEMING
-- ============================================================

create table if not exists public.invoicing_settings (
  organization_id uuid primary key
    references public.organizations(id)
    on delete cascade,

  invoice_prefix text not null default 'F',
  credit_prefix text not null default 'C',

  default_payment_term_days integer
    not null default 30
    check (
      default_payment_term_days between 1 and 365
    ),

  vat_accounting_method text
    not null default 'invoice'
    check (
      vat_accounting_method in (
        'invoice',
        'cash'
      )
    ),

  iban text,
  bic text,

  invoice_email text,

  footer_text text,

  logo_storage_path text,

  next_invoice_sequence integer
    not null default 1
    check (
      next_invoice_sequence >= 1
    ),

  next_credit_sequence integer
    not null default 1
    check (
      next_credit_sequence >= 1
    ),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);


alter table public.invoicing_settings
  enable row level security;


-- ============================================================
-- 2. DEBITEUREN UITBREIDEN
-- ============================================================

alter table public.debtors
  add column if not exists contact_name text;

alter table public.debtors
  add column if not exists kvk_number text;

alter table public.debtors
  add column if not exists vat_number text;

alter table public.debtors
  add column if not exists phone text;

alter table public.debtors
  add column if not exists reference text;

alter table public.debtors
  add column if not exists updated_at timestamptz
    not null default now();


-- ============================================================
-- 3. VERKOOPFACTUREN UITBREIDEN
--
-- status blijft voorlopig bestaan voor compatibiliteit.
-- Nieuwe code gebruikt drie afzonderlijke statussen.
-- ============================================================

alter table public.sales_invoices
  add column if not exists invoice_kind text
    not null default 'invoice';

alter table public.sales_invoices
  add column if not exists document_status text
    not null default 'draft';

alter table public.sales_invoices
  add column if not exists payment_status text
    not null default 'unpaid';

alter table public.sales_invoices
  add column if not exists collection_status text
    not null default 'none';

alter table public.sales_invoices
  add column if not exists original_invoice_id uuid
    references public.sales_invoices(id)
    on delete restrict;

alter table public.sales_invoices
  add column if not exists credit_reason text;

alter table public.sales_invoices
  add column if not exists sent_at timestamptz;

alter table public.sales_invoices
  add column if not exists last_reminder_at timestamptz;

alter table public.sales_invoices
  add column if not exists updated_at timestamptz
    not null default now();


do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'sales_invoices_invoice_kind_check'
  ) then

    alter table public.sales_invoices
      add constraint
      sales_invoices_invoice_kind_check
      check (
        invoice_kind in (
          'invoice',
          'credit'
        )
      );

  end if;


  if not exists (
    select 1
    from pg_constraint
    where conname =
      'sales_invoices_document_status_check'
  ) then

    alter table public.sales_invoices
      add constraint
      sales_invoices_document_status_check
      check (
        document_status in (
          'draft',
          'issued',
          'credited',
          'cancelled'
        )
      );

  end if;


  if not exists (
    select 1
    from pg_constraint
    where conname =
      'sales_invoices_payment_status_check'
  ) then

    alter table public.sales_invoices
      add constraint
      sales_invoices_payment_status_check
      check (
        payment_status in (
          'unpaid',
          'partially_paid',
          'paid',
          'overpaid',
          'not_applicable'
        )
      );

  end if;


  if not exists (
    select 1
    from pg_constraint
    where conname =
      'sales_invoices_collection_status_check'
  ) then

    alter table public.sales_invoices
      add constraint
      sales_invoices_collection_status_check
      check (
        collection_status in (
          'none',
          'due_soon',
          'overdue',
          'reminder_1',
          'reminder_2',
          'final_notice'
        )
      );

  end if;

end;
$$;


-- ============================================================
-- 4. BESTAANDE FACTUREN BACKFILLEN
-- ============================================================

update public.sales_invoices
set
  document_status =
    case
      when lower(status) in (
        'draft',
        'concept'
      )
        then 'draft'

      when lower(status) in (
        'credited',
        'gecrediteerd'
      )
        then 'credited'

      when lower(status) in (
        'cancelled',
        'geannuleerd'
      )
        then 'cancelled'

      else 'issued'
    end,

  payment_status =
    case
      when paid_cents >= total_cents
        and total_cents > 0
        then 'paid'

      when paid_cents > 0
        then 'partially_paid'

      else 'unpaid'
    end,

  collection_status =
    case
      when due_date < current_date
        and paid_cents < total_cents
        then 'overdue'

      else 'none'
    end;


-- ============================================================
-- 5. CREDITFACTUUR-INTEGRITEIT
-- ============================================================

create or replace function
public.validate_sales_invoice_credit_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_original public.sales_invoices%rowtype;
begin

  if new.invoice_kind = 'invoice' then

    if new.original_invoice_id is not null then
      raise exception
        'Een gewone factuur mag geen oorspronkelijke factuur hebben.';
    end if;

    return new;
  end if;


  if new.invoice_kind <> 'credit' then
    raise exception
      'Ongeldig factuurtype.';
  end if;


  if new.original_invoice_id is null then
    raise exception
      'Een creditfactuur moet aan een oorspronkelijke factuur gekoppeld zijn.';
  end if;


  select *
  into v_original
  from public.sales_invoices
  where id =
    new.original_invoice_id;


  if not found then
    raise exception
      'Oorspronkelijke factuur bestaat niet.';
  end if;


  if v_original.organization_id
     <> new.organization_id then

    raise exception
      'Creditfactuur en oorspronkelijke factuur behoren niet tot dezelfde onderneming.';

  end if;


  if v_original.invoice_kind <> 'invoice' then
    raise exception
      'Een creditfactuur kan alleen aan een gewone factuur worden gekoppeld.';
  end if;


  return new;

end;
$$;


drop trigger if exists
sales_invoice_validate_credit_link
on public.sales_invoices;


create trigger
sales_invoice_validate_credit_link
before insert or update of
  invoice_kind,
  original_invoice_id,
  organization_id
on public.sales_invoices
for each row
execute function
public.validate_sales_invoice_credit_link();


-- ============================================================
-- 6. FACTUUR- EN CREDITNUMMERING
-- ============================================================

create or replace function
public.next_sales_document_number(
  p_organization_id uuid,
  p_kind text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.invoicing_settings%rowtype;
  v_sequence integer;
  v_prefix text;
  v_year text;
begin

  if auth.uid() is null then
    raise exception 'Niet ingelogd.';
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


  if p_kind not in (
    'invoice',
    'credit'
  ) then
    raise exception
      'Ongeldig factuurtype.';
  end if;


  insert into public.invoicing_settings (
    organization_id
  )
  values (
    p_organization_id
  )
  on conflict (
    organization_id
  )
  do nothing;


  select *
  into v_settings
  from public.invoicing_settings
  where organization_id =
    p_organization_id
  for update;


  v_year :=
    to_char(
      current_date,
      'YYYY'
    );


  if p_kind = 'invoice' then

    v_sequence :=
      v_settings.next_invoice_sequence;

    v_prefix :=
      v_settings.invoice_prefix;

    update public.invoicing_settings
    set
      next_invoice_sequence =
        next_invoice_sequence + 1,

      updated_at =
        now()

    where organization_id =
      p_organization_id;

  else

    v_sequence :=
      v_settings.next_credit_sequence;

    v_prefix :=
      v_settings.credit_prefix;

    update public.invoicing_settings
    set
      next_credit_sequence =
        next_credit_sequence + 1,

      updated_at =
        now()

    where organization_id =
      p_organization_id;

  end if;


  return
    upper(
      trim(
        v_prefix
      )
    )
    || '-'
    || v_year
    || '-'
    || lpad(
      v_sequence::text,
      5,
      '0'
    );

end;
$$;


revoke all
on function
public.next_sales_document_number(
  uuid,
  text
)
from public, anon;


grant execute
on function
public.next_sales_document_number(
  uuid,
  text
)
to authenticated;


-- ============================================================
-- 7. FACTUURVERZENDING / HERINNERINGEN LOG
-- ============================================================

create table if not exists
public.sales_invoice_deliveries (

  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id),

  invoice_id uuid not null
    references public.sales_invoices(id),

  delivery_type text not null
    check (
      delivery_type in (
        'invoice',
        'reminder_1',
        'reminder_2',
        'final_notice'
      )
    ),

  recipient_email text not null,

  status text not null
    default 'pending'
    check (
      status in (
        'pending',
        'sent',
        'failed'
      )
    ),

  attempts integer
    not null default 0
    check (
      attempts >= 0
    ),

  sent_at timestamptz,

  last_error text,

  created_by uuid not null
    references public.profiles(id),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);


create index if not exists
sales_invoice_deliveries_invoice_idx
on public.sales_invoice_deliveries (
  invoice_id,
  created_at desc
);


alter table
public.sales_invoice_deliveries
enable row level security;


-- ============================================================
-- 8. UPDATED_AT
-- ============================================================

create or replace function
public.set_invoicing_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at =
    now();

  return new;
end;
$$;


drop trigger if exists
invoicing_settings_updated_at
on public.invoicing_settings;

create trigger
invoicing_settings_updated_at
before update
on public.invoicing_settings
for each row
execute function
public.set_invoicing_updated_at();


drop trigger if exists
debtors_invoicing_updated_at
on public.debtors;

create trigger
debtors_invoicing_updated_at
before update
on public.debtors
for each row
execute function
public.set_invoicing_updated_at();


drop trigger if exists
sales_invoices_invoicing_updated_at
on public.sales_invoices;

create trigger
sales_invoices_invoicing_updated_at
before update
on public.sales_invoices
for each row
execute function
public.set_invoicing_updated_at();


drop trigger if exists
sales_invoice_deliveries_updated_at
on public.sales_invoice_deliveries;

create trigger
sales_invoice_deliveries_updated_at
before update
on public.sales_invoice_deliveries
for each row
execute function
public.set_invoicing_updated_at();


-- ============================================================
-- 9. BETALINGSTATUS SYNCHRONISEREN
--
-- Bestaande allocate_payment RPC blijft compatibel.
-- ============================================================

create or replace function
public.sync_sales_invoice_payment_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  if new.invoice_kind = 'credit' then

    new.payment_status :=
      'not_applicable';

    return new;

  end if;


  new.payment_status :=
    case
      when new.paid_cents <= 0
        then 'unpaid'

      when new.paid_cents <
           new.total_cents
        then 'partially_paid'

      when new.paid_cents =
           new.total_cents
        then 'paid'

      else 'overpaid'
    end;


  if
    new.document_status = 'issued'
    and new.payment_status in (
      'unpaid',
      'partially_paid'
    )
  then

    if new.due_date <
       current_date then

      if new.collection_status =
         'none' then

        new.collection_status :=
          'overdue';

      end if;

    end if;

  end if;


  return new;

end;
$$;


drop trigger if exists
sales_invoice_sync_payment_status
on public.sales_invoices;


create trigger
sales_invoice_sync_payment_status
before insert or update of
  paid_cents,
  total_cents,
  due_date,
  document_status,
  invoice_kind
on public.sales_invoices
for each row
execute function
public.sync_sales_invoice_payment_status();


-- ============================================================
-- 10. RLS - LEZEN
-- ============================================================

drop policy if exists
invoicing_settings_read
on public.invoicing_settings;

create policy invoicing_settings_read
on public.invoicing_settings
for select
to authenticated
using (
  public.has_aal2()
  and (
    public.has_org_access(
      organization_id
    )
    or public.is_office_user()
  )
);


drop policy if exists
sales_invoice_deliveries_read
on public.sales_invoice_deliveries;

create policy sales_invoice_deliveries_read
on public.sales_invoice_deliveries
for select
to authenticated
using (
  public.has_aal2()
  and (
    public.has_org_access(
      organization_id
    )
    or public.is_office_user()
  )
);


-- ============================================================
-- 11. DIRECTE KLANTMUTATIES BLOKKEREN
--
-- Klantmutaties gaan in volgende stappen via RPC.
-- ============================================================

revoke insert, update, delete
on public.invoicing_settings
from authenticated;

revoke insert, update, delete
on public.sales_invoice_deliveries
from authenticated;


-- ============================================================
-- 12. INDEXEN
-- ============================================================

create index if not exists
sales_invoices_org_document_status_idx
on public.sales_invoices (
  organization_id,
  document_status,
  invoice_date desc
)
where archived_at is null;


create index if not exists
sales_invoices_org_payment_status_idx
on public.sales_invoices (
  organization_id,
  payment_status,
  due_date
)
where archived_at is null;


create index if not exists
sales_invoices_original_invoice_idx
on public.sales_invoices (
  original_invoice_id
)
where original_invoice_id is not null;


-- ============================================================
-- 13. AUDIT
-- ============================================================

insert into public.audit_events (
  actor_id,
  organization_id,
  action,
  object_type,
  result,
  metadata
)
select
  auth.uid(),
  null,
  'invoicing.foundation_applied',
  'system',
  'success',
  jsonb_build_object(
    'version',
    '6A-1'
  )
where auth.uid() is not null;


commit;
