begin;

create table if not exists public.bank_document_requests (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  bank_transaction_id uuid not null
    references public.bank_transactions(id)
    on delete restrict,

  requested_by uuid not null
    references public.profiles(id)
    on delete restrict,

  recipient_user_id uuid not null
    references public.profiles(id)
    on delete restrict,

  recipient_email text not null,

  counterparty_name text,
  amount_cents bigint not null,
  transaction_date date not null,

  status text not null
    default 'requested'
    check (
      status in (
        'requested',
        'received',
        'cancelled'
      )
    ),

  requested_at timestamptz not null
    default now(),

  email_sent_at timestamptz,

  document_id uuid
    references public.documents(id)
    on delete set null,

  received_at timestamptz,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now()
);


create unique index if not exists
bank_document_requests_open_unique
on public.bank_document_requests (
  bank_transaction_id
)
where status = 'requested';


create index if not exists
bank_document_requests_org_status
on public.bank_document_requests (
  organization_id,
  status,
  requested_at desc
);


alter table public.bank_document_requests
enable row level security;


create policy bank_document_requests_office_read
on public.bank_document_requests
for select
to authenticated
using (
  public.is_office_user()
  and public.has_aal2()
);


create policy bank_document_requests_customer_read
on public.bank_document_requests
for select
to authenticated
using (
  recipient_user_id = auth.uid()
  and public.has_org_access(
    organization_id
  )
  and public.has_aal2()
);


create or replace function public.office_create_bank_document_request(
  p_organization_id uuid,
  p_bank_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_transaction public.bank_transactions%rowtype;
  v_recipient_user_id uuid;
  v_recipient_email text;
  v_recipient_name text;
  v_request_id uuid;
  v_existing_id uuid;
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

  if not public.is_office_user() then
    raise exception using
      errcode = '42501',
      message = 'Alleen Office mag een factuur opvragen.';
  end if;

  v_actor := auth.uid();


  select *
  into v_transaction
  from public.bank_transactions
  where
    id = p_bank_transaction_id
    and organization_id = p_organization_id
  for update;


  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Bankmutatie bestaat niet.';
  end if;


  if v_transaction.reconciliation_status = 'matched'
     or v_transaction.payment_id is not null then
    raise exception using
      errcode = '22023',
      message = 'Deze bankmutatie is al gekoppeld.';
  end if;


  if v_transaction.amount_cents >= 0 then
    raise exception using
      errcode = '22023',
      message = 'Een factuurverzoek is alleen bedoeld voor uitgaande betalingen.';
  end if;


  select request.id
  into v_existing_id
  from public.bank_document_requests request
  where
    request.bank_transaction_id =
      p_bank_transaction_id
    and request.status =
      'requested'
  limit 1;


  if v_existing_id is not null then
    raise exception using
      errcode = '23505',
      message = 'Voor deze bankmutatie staat al een factuurverzoek open.';
  end if;


  select
    profile.id,
    profile.email,
    profile.display_name
  into
    v_recipient_user_id,
    v_recipient_email,
    v_recipient_name
  from public.organization_memberships membership

  join public.profiles profile
    on profile.id =
       membership.user_id

  join public.roles role
    on role.id =
       membership.role_id

  where
    membership.organization_id =
      p_organization_id

    and membership.status =
      'active'

    and membership.valid_from <= now()

    and (
      membership.valid_until is null
      or membership.valid_until > now()
    )

    and role.scope =
      'customer'

    and profile.account_status =
      'active'

    and profile.email is not null

    and btrim(profile.email) <> ''

  order by
    membership.valid_from asc,
    profile.id asc

  limit 1;


  if v_recipient_user_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Er is geen actieve klantgebruiker met e-mailadres gevonden.';
  end if;


  insert into public.bank_document_requests (
    organization_id,
    bank_transaction_id,
    requested_by,
    recipient_user_id,
    recipient_email,
    counterparty_name,
    amount_cents,
    transaction_date
  )
  values (
    p_organization_id,
    p_bank_transaction_id,
    v_actor,
    v_recipient_user_id,
    v_recipient_email,
    v_transaction.counterparty_name,
    abs(v_transaction.amount_cents),
    v_transaction.booked_at::date
  )
  returning id
  into v_request_id;


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
    v_actor,
    p_organization_id,
    'bank_document_requested',
    'bank_transaction',
    p_bank_transaction_id,
    'success',
    jsonb_build_object(
      'request_id',
      v_request_id,
      'recipient_user_id',
      v_recipient_user_id,
      'amount_cents',
      abs(v_transaction.amount_cents)
    )
  );


  return jsonb_build_object(
    'requestId',
    v_request_id,

    'organizationId',
    p_organization_id,

    'transactionId',
    p_bank_transaction_id,

    'recipientUserId',
    v_recipient_user_id,

    'recipientEmail',
    v_recipient_email,

    'recipientName',
    v_recipient_name,

    'counterpartyName',
    v_transaction.counterparty_name,

    'amountCents',
    abs(v_transaction.amount_cents),

    'transactionDate',
    v_transaction.booked_at::date,

    'status',
    'requested'
  );

end;
$$;


revoke all
on function public.office_create_bank_document_request(
  uuid,
  uuid
)
from public, anon;


grant execute
on function public.office_create_bank_document_request(
  uuid,
  uuid
)
to authenticated;


commit;