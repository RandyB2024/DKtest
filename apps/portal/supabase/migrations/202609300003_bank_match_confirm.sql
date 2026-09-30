-- ============================================================
-- 202609300003_bank_match_confirm.sql
--
-- Definitieve verwerking van een bevestigde bankmatch.
--
-- Alles gebeurt in één database-transactie:
--
-- banktransactie
--   -> payment
--   -> payment_allocation
--   -> paid_cents factuur
--   -> factuurstatus
--   -> banktransactie matched
--   -> audit
--
-- Alleen Office + AAL2 mag bevestigen.
-- ============================================================

begin;


create or replace function public.confirm_bank_match(
  p_organization_id uuid,
  p_transaction_id uuid,
  p_invoice_id uuid,
  p_invoice_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare

  v_transaction public.bank_transactions%rowtype;

  v_payment_id uuid;

  v_allocation_id uuid;

  v_allocation_amount bigint;

  v_invoice_outstanding bigint;

  v_invoice_number text;

begin

  -- ----------------------------------------------------------
  -- 1. AUTHENTICATIE
  -- ----------------------------------------------------------

  if auth.uid() is null then
    raise exception
      'Niet ingelogd.';
  end if;


  if not public.has_aal2() then
    raise exception
      'Tweestapsverificatie is vereist.';
  end if;


  if not public.is_office_user() then
    raise exception
      'Alleen een geverifieerde Office-gebruiker mag een bankmatch bevestigen.';
  end if;


  if p_invoice_type not in (
    'sales',
    'purchase'
  ) then
    raise exception
      'Ongeldig factuurtype.';
  end if;


  -- ----------------------------------------------------------
  -- 2. BANKTRANSACTIE VERGRENDELEN
  -- ----------------------------------------------------------

  select *
  into v_transaction
  from public.bank_transactions
  where
    id = p_transaction_id
    and organization_id =
      p_organization_id
  for update;


  if not found then
    raise exception
      'Banktransactie bestaat niet.';
  end if;


  if v_transaction.status <> 'booked' then
    raise exception
      'Alleen geboekte banktransacties kunnen worden gekoppeld.';
  end if;


  if v_transaction.reconciliation_status = 'matched' then
    raise exception
      'Deze banktransactie is al gekoppeld.';
  end if;


  if v_transaction.payment_id is not null then
    raise exception
      'Deze banktransactie heeft al een betaling.';
  end if;


  v_allocation_amount :=
    abs(v_transaction.amount_cents);


  if v_allocation_amount <= 0 then
    raise exception
      'De banktransactie bevat geen geldig bedrag.';
  end if;


  -- ----------------------------------------------------------
  -- 3. VERKOOPFACTUUR CONTROLEREN
  -- ----------------------------------------------------------

  if p_invoice_type = 'sales' then

    if v_transaction.amount_cents <= 0 then
      raise exception
        'Een verkoopfactuur kan alleen aan een inkomende banktransactie worden gekoppeld.';
    end if;


    select
      greatest(
        invoice.total_cents
        - invoice.paid_cents,
        0
      ),
      invoice.invoice_number

    into
      v_invoice_outstanding,
      v_invoice_number

    from public.sales_invoices invoice

    where
      invoice.id =
        p_invoice_id

      and invoice.organization_id =
        p_organization_id

      and invoice.archived_at
        is null

    for update;


    if not found then
      raise exception
        'Verkoopfactuur bestaat niet.';
    end if;


    if v_invoice_outstanding <= 0 then
      raise exception
        'De verkoopfactuur heeft geen openstaand bedrag.';
    end if;


    if v_allocation_amount >
       v_invoice_outstanding then

      raise exception
        'Het bankbedrag is groter dan het openstaande factuurbedrag.';

    end if;

  end if;


  -- ----------------------------------------------------------
  -- 4. INKOOPFACTUUR CONTROLEREN
  -- ----------------------------------------------------------

  if p_invoice_type = 'purchase' then

    if v_transaction.amount_cents >= 0 then
      raise exception
        'Een inkoopfactuur kan alleen aan een uitgaande banktransactie worden gekoppeld.';
    end if;


    select
      greatest(
        invoice.total_cents
        - invoice.paid_cents,
        0
      ),
      invoice.invoice_number

    into
      v_invoice_outstanding,
      v_invoice_number

    from public.purchase_invoices invoice

    where
      invoice.id =
        p_invoice_id

      and invoice.organization_id =
        p_organization_id

      and invoice.archived_at
        is null

    for update;


    if not found then
      raise exception
        'Inkoopfactuur bestaat niet.';
    end if;


    if v_invoice_outstanding <= 0 then
      raise exception
        'De inkoopfactuur heeft geen openstaand bedrag.';
    end if;


    if v_allocation_amount >
       v_invoice_outstanding then

      raise exception
        'Het bankbedrag is groter dan het openstaande factuurbedrag.';

    end if;

  end if;


  -- ----------------------------------------------------------
  -- 5. PAYMENT AANMAKEN
  --
  -- Positief = ontvangen
  -- Negatief = betaald
  --
  -- invoice_id in de bestaande payments-tabel verwijst alleen
  -- naar sales_invoices.
  -- Daarom blijft deze bij purchase bewust NULL.
  -- ----------------------------------------------------------

  insert into public.payments (
    organization_id,
    invoice_id,
    amount_cents,
    paid_at,
    method,
    reference,
    status,
    created_by
  )
  values (
    p_organization_id,

    case
      when p_invoice_type = 'sales'
        then p_invoice_id
      else null
    end,

    v_transaction.amount_cents,

    v_transaction.booked_at,

    'bank',

    coalesce(
      v_transaction.reference,
      v_transaction.end_to_end_id,
      v_transaction.description
    ),

    'confirmed',

    auth.uid()
  )

  returning id
  into v_payment_id;


  -- ----------------------------------------------------------
  -- 6. BETALING TOEWIJZEN
  --
  -- Bestaande gecontroleerde RPC's worden hergebruikt.
  -- ----------------------------------------------------------

  if p_invoice_type = 'sales' then

    v_allocation_id :=
      public.allocate_payment_to_sales_invoice(
        v_payment_id,
        p_invoice_id,
        v_allocation_amount
      );

  else

    v_allocation_id :=
      public.allocate_payment_to_purchase_invoice(
        v_payment_id,
        p_invoice_id,
        v_allocation_amount
      );

  end if;


  -- ----------------------------------------------------------
  -- 7. BANKTRANSACTIE DEFINITIEF MARKEREN
  -- ----------------------------------------------------------

  update public.bank_transactions
  set
    reconciliation_status = 'matched',
    payment_id = v_payment_id,
    updated_at = now()

  where id =
    p_transaction_id;


  -- ----------------------------------------------------------
  -- 8. AUDIT
  -- ----------------------------------------------------------

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
    p_organization_id,
    'bank_match_confirmed',
    'bank_transaction',
    p_transaction_id,
    'success',

    jsonb_build_object(
      'payment_id',
      v_payment_id,

      'allocation_id',
      v_allocation_id,

      'invoice_id',
      p_invoice_id,

      'invoice_type',
      p_invoice_type,

      'invoice_number',
      v_invoice_number,

      'amount_cents',
      v_allocation_amount
    )
  );


  -- ----------------------------------------------------------
  -- 9. RESULTAAT
  -- ----------------------------------------------------------

  return jsonb_build_object(

    'transactionId',
    p_transaction_id,

    'paymentId',
    v_payment_id,

    'allocationId',
    v_allocation_id,

    'invoiceId',
    p_invoice_id,

    'invoiceType',
    p_invoice_type,

    'invoiceNumber',
    v_invoice_number,

    'amountCents',
    v_allocation_amount,

    'status',
    'matched'

  );

end;
$$;


revoke all
on function public.confirm_bank_match(
  uuid,
  uuid,
  uuid,
  text
)
from public, anon;


grant execute
on function public.confirm_bank_match(
  uuid,
  uuid,
  uuid,
  text
)
to authenticated;


commit;