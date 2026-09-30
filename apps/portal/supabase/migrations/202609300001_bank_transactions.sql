-- ============================================================
-- 202609300001_bank_transactions.sql
--
-- Fundament voor bankintegratie:
-- - bankrekeningen per onderneming
-- - banktransacties
-- - bescherming tegen dubbele import
-- - koppeling met bestaande payments
-- - veilige uitlees-RPC
--
-- Bedragen worden opgeslagen in CENTEN.
--
-- Positief bedrag  = geld ontvangen
-- Negatief bedrag  = geld betaald
-- ============================================================

begin;


-- ============================================================
-- 1. BANKREKENINGEN
-- ============================================================

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  provider text not null default 'manual',

  provider_account_id text,

  iban text,

  account_name text not null,

  currency char(3) not null default 'EUR',

  status text not null default 'active'
    check (
      status in (
        'active',
        'disconnected',
        'archived'
      )
    ),

  last_synced_at timestamptz,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  archived_at timestamptz
);


create index bank_accounts_org_idx
  on public.bank_accounts (
    organization_id,
    archived_at
  );


create unique index bank_accounts_provider_external_unique
  on public.bank_accounts (
    organization_id,
    provider,
    provider_account_id
  )
  where provider_account_id is not null;


-- ============================================================
-- 2. BANKTRANSACTIES
-- ============================================================

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  bank_account_id uuid not null
    references public.bank_accounts(id)
    on delete restrict,

  provider text not null default 'manual',

  provider_transaction_id text,

  booked_at timestamptz not null,

  value_date date,

  amount_cents bigint not null
    check (amount_cents <> 0),

  currency char(3) not null default 'EUR',

  counterparty_name text,

  counterparty_iban text,

  description text,

  reference text,

  end_to_end_id text,

  bank_transaction_code text,

  status text not null default 'booked'
    check (
      status in (
        'pending',
        'booked',
        'cancelled'
      )
    ),

  reconciliation_status text not null default 'unmatched'
    check (
      reconciliation_status in (
        'unmatched',
        'suggested',
        'matched',
        'ignored'
      )
    ),

  payment_id uuid
    references public.payments(id)
    on delete set null,

  raw_data jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);


create index bank_transactions_org_date_idx
  on public.bank_transactions (
    organization_id,
    booked_at desc
  );


create index bank_transactions_account_date_idx
  on public.bank_transactions (
    bank_account_id,
    booked_at desc
  );


create index bank_transactions_reconciliation_idx
  on public.bank_transactions (
    organization_id,
    reconciliation_status,
    booked_at desc
  );


create index bank_transactions_payment_idx
  on public.bank_transactions (
    payment_id
  )
  where payment_id is not null;


create unique index bank_transactions_provider_external_unique
  on public.bank_transactions (
    bank_account_id,
    provider,
    provider_transaction_id
  )
  where provider_transaction_id is not null;


-- ============================================================
-- 3. ORGANISATIECONTROLE BANKREKENING
-- ============================================================

create or replace function public.validate_bank_transaction_organization()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  account_organization_id uuid;
  payment_organization_id uuid;
begin

  select organization_id
  into account_organization_id
  from public.bank_accounts
  where id = new.bank_account_id;


  if account_organization_id is null then
    raise exception
      'Bankrekening bestaat niet.';
  end if;


  if account_organization_id <> new.organization_id then
    raise exception
      'Bankrekening behoort niet tot dezelfde onderneming.';
  end if;


  if new.payment_id is not null then

    select organization_id
    into payment_organization_id
    from public.payments
    where id = new.payment_id;


    if payment_organization_id is null then
      raise exception
        'Betaling bestaat niet.';
    end if;


    if payment_organization_id <> new.organization_id then
      raise exception
        'Betaling behoort niet tot dezelfde onderneming.';
    end if;

  end if;


  return new;

end;
$$;


create trigger bank_transactions_validate_organization
before insert or update
on public.bank_transactions
for each row
execute function public.validate_bank_transaction_organization();


-- ============================================================
-- 4. UPDATED_AT
-- ============================================================

create or replace function public.bank_set_updated_at()
returns trigger
language plpgsql
as $$
begin

  new.updated_at = now();

  return new;

end;
$$;


create trigger bank_accounts_updated_at
before update
on public.bank_accounts
for each row
execute function public.bank_set_updated_at();


create trigger bank_transactions_updated_at
before update
on public.bank_transactions
for each row
execute function public.bank_set_updated_at();


-- ============================================================
-- 5. RLS
-- ============================================================

alter table public.bank_accounts
enable row level security;


alter table public.bank_transactions
enable row level security;


-- Klanten en Office mogen bankinformatie lezen
-- wanneer:
-- - AAL2 actief is
-- - toegang tot de onderneming bestaat
create policy bank_accounts_read
on public.bank_accounts
for select
to authenticated
using (
  public.has_aal2()
  and (
    public.has_org_access(organization_id)
    or public.is_office_user()
  )
);


create policy bank_transactions_read
on public.bank_transactions
for select
to authenticated
using (
  public.has_aal2()
  and (
    public.has_org_access(organization_id)
    or public.is_office_user()
  )
);


-- Bankdata wijzigen is voorlopig alleen voor Office.
-- Later kan een bankconnector dit via gecontroleerde RPC/service-role doen.

create policy bank_accounts_office_insert
on public.bank_accounts
for insert
to authenticated
with check (
  public.has_aal2()
  and public.is_office_user()
);


create policy bank_accounts_office_update
on public.bank_accounts
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


create policy bank_transactions_office_insert
on public.bank_transactions
for insert
to authenticated
with check (
  public.has_aal2()
  and public.is_office_user()
);


create policy bank_transactions_office_update
on public.bank_transactions
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


-- Geen directe deletes.
-- Financiële gegevens worden niet fysiek verwijderd.

revoke delete
on public.bank_accounts
from authenticated;


revoke delete
on public.bank_transactions
from authenticated;


-- ============================================================
-- 6. BANKTRANSACTIES UITLEZEN
-- ============================================================

create or replace function public.get_bank_transactions(
  p_organization_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  safe_limit integer;
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


  safe_limit :=
    greatest(
      1,
      least(
        coalesce(p_limit, 100),
        500
      )
    );


  select jsonb_build_object(

    'summary',
    jsonb_build_object(

      'count',
      count(*),

      'unmatchedCount',
      count(*) filter (
        where transaction.reconciliation_status = 'unmatched'
      ),

      'suggestedCount',
      count(*) filter (
        where transaction.reconciliation_status = 'suggested'
      ),

      'matchedCount',
      count(*) filter (
        where transaction.reconciliation_status = 'matched'
      )

    ),

    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(

            'id',
            item.id,

            'bankAccount',
            jsonb_build_object(
              'id',
              item.bank_account_id,
              'name',
              account.account_name,
              'iban',
              account.iban
            ),

            'bookedAt',
            item.booked_at,

            'valueDate',
            item.value_date,

            'amountCents',
            item.amount_cents,

            'currency',
            item.currency,

            'counterpartyName',
            item.counterparty_name,

            'counterpartyIban',
            item.counterparty_iban,

            'description',
            item.description,

            'reference',
            item.reference,

            'endToEndId',
            item.end_to_end_id,

            'status',
            item.status,

            'reconciliationStatus',
            item.reconciliation_status,

            'paymentId',
            item.payment_id

          )

          order by
            item.booked_at desc,
            item.id desc
        )

        from (
          select *
          from public.bank_transactions
          where organization_id =
            p_organization_id

          order by
            booked_at desc,
            id desc

          limit safe_limit
        ) item

        join public.bank_accounts account
          on account.id =
             item.bank_account_id
      ),
      '[]'::jsonb
    )

  )
  into result

  from public.bank_transactions transaction

  where transaction.organization_id =
    p_organization_id;


  return coalesce(
    result,
    jsonb_build_object(

      'summary',
      jsonb_build_object(
        'count', 0,
        'unmatchedCount', 0,
        'suggestedCount', 0,
        'matchedCount', 0
      ),

      'items',
      '[]'::jsonb

    )
  );

end;
$$;


revoke all
on function public.get_bank_transactions(
  uuid,
  integer
)
from public, anon;


grant execute
on function public.get_bank_transactions(
  uuid,
  integer
)
to authenticated;


-- ============================================================
-- 7. BANKREKENINGEN UITLEZEN
-- ============================================================

create or replace function public.get_bank_accounts(
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


  select coalesce(
    jsonb_agg(
      jsonb_build_object(

        'id',
        account.id,

        'provider',
        account.provider,

        'providerAccountId',
        account.provider_account_id,

        'iban',
        account.iban,

        'accountName',
        account.account_name,

        'currency',
        account.currency,

        'status',
        account.status,

        'lastSyncedAt',
        account.last_synced_at

      )

      order by
        account.account_name,
        account.id
    ),
    '[]'::jsonb
  )
  into result

  from public.bank_accounts account

  where
    account.organization_id =
      p_organization_id

    and account.archived_at is null;


  return result;

end;
$$;


revoke all
on function public.get_bank_accounts(uuid)
from public, anon;


grant execute
on function public.get_bank_accounts(uuid)
to authenticated;


commit;