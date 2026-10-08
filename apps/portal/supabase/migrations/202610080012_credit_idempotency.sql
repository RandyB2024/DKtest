begin;

create table if not exists
public.sales_credit_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id),
  original_invoice_id uuid not null
    references public.sales_invoices(id),
  idempotency_key uuid not null,
  credit_invoice_id uuid
    references public.sales_invoices(id),
  created_by uuid not null,
  created_at timestamptz not null default now(),

  constraint sales_credit_requests_unique_key
    unique (
      organization_id,
      idempotency_key
    )
);

alter table public.sales_credit_requests
  enable row level security;

revoke all
on table public.sales_credit_requests
from public, anon, authenticated;


create or replace function
public.office_create_credit_invoice(
  p_organization_id uuid,
  p_original_invoice_id uuid,
  p_reason text,
  p_amount_cents bigint default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_existing_credit_id uuid;
  v_result jsonb;
begin

  if p_idempotency_key is null then
    raise exception
      'Idempotency-key ontbreekt.';
  end if;


  perform pg_advisory_xact_lock(
    hashtext(
      p_organization_id::text
      || ':'
      || p_idempotency_key::text
    )
  );


  select r.credit_invoice_id
  into v_existing_credit_id
  from public.sales_credit_requests r
  where
    r.organization_id = p_organization_id
    and r.idempotency_key = p_idempotency_key
  limit 1;


  if v_existing_credit_id is not null then

    select jsonb_build_object(
      'creditInvoiceId',
        i.id,

      'creditInvoiceNumber',
        i.invoice_number,

      'originalInvoiceId',
        i.original_invoice_id,

      'originalInvoiceNumber',
        o.invoice_number,

      'invoiceKind',
        i.invoice_kind,

      'documentStatus',
        i.document_status,

      'totalCents',
        i.total_cents,

      'creditReason',
        i.credit_reason,

      'remainingCents',
        greatest(
          abs(o.total_cents)
          -
          coalesce(
            (
              select abs(sum(c.total_cents))
              from public.sales_invoices c
              where
                c.organization_id = p_organization_id
                and c.original_invoice_id = o.id
                and c.invoice_kind = 'credit'
                and c.document_status <> 'cancelled'
                and c.archived_at is null
            ),
            0
          ),
          0
        ),

      'fullyCredited',
        (
          greatest(
            abs(o.total_cents)
            -
            coalesce(
              (
                select abs(sum(c.total_cents))
                from public.sales_invoices c
                where
                  c.organization_id = p_organization_id
                  and c.original_invoice_id = o.id
                  and c.invoice_kind = 'credit'
                  and c.document_status <> 'cancelled'
                  and c.archived_at is null
              ),
              0
            ),
            0
          ) = 0
        ),

      'alreadyCreated',
        true
    )
    into v_result
    from public.sales_invoices i
    join public.sales_invoices o
      on o.id = i.original_invoice_id
    where
      i.id = v_existing_credit_id
      and i.organization_id = p_organization_id;

    if v_result is not null then
      return v_result;
    end if;

  end if;


  insert into public.sales_credit_requests (
    organization_id,
    original_invoice_id,
    idempotency_key,
    created_by
  )
  values (
    p_organization_id,
    p_original_invoice_id,
    p_idempotency_key,
    auth.uid()
  )
  on conflict (
    organization_id,
    idempotency_key
  )
  do nothing;


  v_result :=
    public.office_create_credit_invoice(
      p_organization_id,
      p_original_invoice_id,
      p_reason,
      p_amount_cents
    );


  update public.sales_credit_requests
  set credit_invoice_id =
    (
      v_result ->> 'creditInvoiceId'
    )::uuid
  where
    organization_id = p_organization_id
    and idempotency_key = p_idempotency_key;


  return
    v_result
    || jsonb_build_object(
      'alreadyCreated',
      false
    );

end;
$function$;


revoke all
on function public.office_create_credit_invoice(
  uuid,
  uuid,
  text,
  bigint,
  uuid
)
from public, anon;

grant execute
on function public.office_create_credit_invoice(
  uuid,
  uuid,
  text,
  bigint,
  uuid
)
to authenticated;

commit;
