begin;

-- ============================================================
-- Klant kan een openstaand factuurverzoek veilig uitlezen.
-- Alleen het profiel waarvoor het verzoek is aangemaakt.
-- ============================================================

create or replace function public.customer_bank_document_request(
  p_request_id uuid,
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.bank_document_requests%rowtype;
  v_transaction public.bank_transactions%rowtype;
  v_organization_name text;
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


  select request.*
  into v_request
  from public.bank_document_requests request
  where request.id = p_request_id
  limit 1;


  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Documentverzoek niet beschikbaar.';
  end if;


  if v_request.recipient_user_id <> auth.uid() then
    raise exception using
      errcode = '42501',
      message = 'Geen toegang tot dit documentverzoek.';
  end if;


  if v_request.bank_transaction_id <> p_transaction_id then
    raise exception using
      errcode = '22023',
      message = 'Documentverzoek en bankmutatie komen niet overeen.';
  end if;


  if not public.has_org_access(
    v_request.organization_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Geen toegang tot deze onderneming.';
  end if;


  select organization.name
  into v_organization_name
  from public.organizations organization
  where organization.id =
      v_request.organization_id
    and organization.archived_at is null;


  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Onderneming niet beschikbaar.';
  end if;


  select transaction.*
  into v_transaction
  from public.bank_transactions transaction
  where transaction.id =
      p_transaction_id
    and transaction.organization_id =
      v_request.organization_id
  limit 1;


  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Bankmutatie niet beschikbaar.';
  end if;


  return jsonb_build_object(
    'requestId',
      v_request.id,

    'transactionId',
      v_transaction.id,

    'organizationId',
      v_request.organization_id,

    'organizationName',
      v_organization_name,

    'counterpartyName',
      coalesce(
        v_request.counterparty_name,
        v_transaction.counterparty_name
      ),

    'amountCents',
      v_request.amount_cents,

    'transactionDate',
      v_request.transaction_date,

    'description',
      v_transaction.description,

    'status',
      v_request.status,

    'documentId',
      v_request.document_id,

    'requestedAt',
      v_request.requested_at,

    'receivedAt',
      v_request.received_at
  );

end;
$$;


-- ============================================================
-- Klant koppelt een zojuist geupload document aan het verzoek.
-- Dit matcht de bankmutatie NIET.
-- ============================================================

create or replace function public.customer_complete_bank_document_request(
  p_request_id uuid,
  p_transaction_id uuid,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.bank_document_requests%rowtype;
  v_document public.documents%rowtype;
  v_actor uuid;
begin

  v_actor := auth.uid();


  if v_actor is null then
    raise exception using
      errcode = '42501',
      message = 'Niet ingelogd.';
  end if;


  if not public.has_aal2() then
    raise exception using
      errcode = '42501',
      message = 'Tweestapsverificatie is vereist.';
  end if;


  select request.*
  into v_request
  from public.bank_document_requests request
  where request.id = p_request_id
  for update;


  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Documentverzoek niet beschikbaar.';
  end if;


  if v_request.recipient_user_id <> v_actor then
    raise exception using
      errcode = '42501',
      message = 'Geen toegang tot dit documentverzoek.';
  end if;


  if not public.has_org_access(
    v_request.organization_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Geen toegang tot deze onderneming.';
  end if;


  if v_request.bank_transaction_id <> p_transaction_id then
    raise exception using
      errcode = '22023',
      message = 'Documentverzoek en bankmutatie komen niet overeen.';
  end if;


  -- Idempotent: exact hetzelfde document was al gekoppeld.
  if v_request.status = 'received'
     and v_request.document_id = p_document_id then

    return jsonb_build_object(
      'requestId',
        v_request.id,

      'documentId',
        v_request.document_id,

      'status',
        v_request.status,

      'receivedAt',
        v_request.received_at
    );

  end if;


  if v_request.status <> 'requested' then
    raise exception using
      errcode = '22023',
      message = 'Dit documentverzoek staat niet meer open.';
  end if;


  select document.*
  into v_document
  from public.documents document
  where document.id =
      p_document_id
    and document.organization_id =
      v_request.organization_id
    and document.source =
      'customer'
    and document.uploaded_by =
      v_actor
    and document.archived_at is null
  limit 1;


  if not found then
    raise exception using
      errcode = '42501',
      message = 'Dit document kan niet aan het verzoek worden gekoppeld.';
  end if;


  update public.bank_document_requests
  set
    document_id =
      p_document_id,

    status =
      'received',

    received_at =
      now(),

    updated_at =
      now()

  where id =
      p_request_id

  returning *
  into v_request;


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
    v_request.organization_id,
    'bank_document_request.received',
    'bank_document_request',
    v_request.id,
    'success',
    jsonb_build_object(
      'bank_transaction_id',
        p_transaction_id,

      'document_id',
        p_document_id
    )
  );


  return jsonb_build_object(
    'requestId',
      v_request.id,

    'documentId',
      v_request.document_id,

    'status',
      v_request.status,

    'receivedAt',
      v_request.received_at
  );

end;
$$;


revoke all
on function public.customer_bank_document_request(
  uuid,
  uuid
)
from public, anon;


revoke all
on function public.customer_complete_bank_document_request(
  uuid,
  uuid,
  uuid
)
from public, anon;


grant execute
on function public.customer_bank_document_request(
  uuid,
  uuid
)
to authenticated;


grant execute
on function public.customer_complete_bank_document_request(
  uuid,
  uuid,
  uuid
)
to authenticated;


commit;
