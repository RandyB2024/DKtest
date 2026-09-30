-- ============================================================
-- 202609300004_bank_matching_test_data.sql
--
-- Tijdelijke veilige testdata voor end-to-end bankmatching.
--
-- Alleen toegestaan voor:
-- - ingelogde gebruiker
-- - AAL2
-- - Office-gebruiker
-- - organization.test_record = true
--
-- Maakt:
-- 1 verkoopfactuur van € 1.210,00
-- 1 inkomende bankmutatie van € 1.210,00
--
-- 1 inkoopfactuur van € 423,50
-- 1 uitgaande bankmutatie van € 423,50
--
-- De functie is herhaalbaar en voorkomt dubbele testrecords.
-- ============================================================

begin;


create or replace function public.create_bank_matching_test_data(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare

  v_is_test boolean;

  v_debtor_id uuid;
  v_creditor_id uuid;

  v_sales_invoice_id uuid;
  v_purchase_invoice_id uuid;

  v_bank_account_id uuid;

  v_sales_transaction_id uuid;
  v_purchase_transaction_id uuid;

begin

  -- ==========================================================
  -- 1. BEVEILIGING
  -- ==========================================================

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
      'Alleen een Office-gebruiker mag testdata aanmaken.';
  end if;


  select organization.test_record
  into v_is_test

  from public.organizations organization

  where organization.id =
    p_organization_id;


  if not found then
    raise exception
      'Onderneming bestaat niet.';
  end if;


  if coalesce(
    v_is_test,
    false
  ) = false then

    raise exception
      'Testdata mag alleen in een testonderneming worden aangemaakt.';

  end if;


  -- ==========================================================
  -- 2. TESTDEBITEUR
  -- ==========================================================

  select debtor.id
  into v_debtor_id

  from public.debtors debtor

  where
    debtor.organization_id =
      p_organization_id

    and debtor.name =
      '[TEST] Jansen Bouw B.V.'

  limit 1;


  if v_debtor_id is null then

    insert into public.debtors (
      organization_id,
      name,
      email,
      payment_term_days
    )
    values (
      p_organization_id,
      '[TEST] Jansen Bouw B.V.',
      'test-debiteur@example.invalid',
      30
    )

    returning id
    into v_debtor_id;

  end if;


  -- ==========================================================
  -- 3. TEST VERKOOPFACTUUR
  --
  -- € 1.000,00 excl.
  -- €   210,00 btw
  -- € 1.210,00 totaal
  -- ==========================================================

  select invoice.id
  into v_sales_invoice_id

  from public.sales_invoices invoice

  where
    invoice.organization_id =
      p_organization_id

    and invoice.invoice_number =
      'TEST-VERKOOP-2026-001'

  limit 1;


  if v_sales_invoice_id is null then

    insert into public.sales_invoices (
      organization_id,
      debtor_id,
      invoice_number,
      status,
      invoice_date,
      due_date,
      currency,
      subtotal_cents,
      vat_cents,
      total_cents,
      paid_cents,
      created_by,
      finalized_at
    )
    values (
      p_organization_id,
      v_debtor_id,
      'TEST-VERKOOP-2026-001',
      'open',
      current_date,
      current_date + 30,
      'EUR',
      100000,
      21000,
      121000,
      0,
      auth.uid(),
      now()
    )

    returning id
    into v_sales_invoice_id;


    insert into public.sales_invoice_lines (
      invoice_id,
      description,
      quantity,
      unit_price_cents,
      vat_rate,
      line_total_cents,
      position
    )
    values (
      v_sales_invoice_id,
      '[TEST] Administratieve dienstverlening',
      1,
      100000,
      21.00,
      100000,
      1
    );

  end if;


  -- ==========================================================
  -- 4. TESTCREDITEUR
  -- ==========================================================

  select creditor.id
  into v_creditor_id

  from public.creditors creditor

  where
    creditor.organization_id =
      p_organization_id

    and creditor.name =
      '[TEST] KPN Zakelijk B.V.'

  limit 1;


  if v_creditor_id is null then

    insert into public.creditors (
      organization_id,
      name,
      email,
      iban,
      payment_term_days,
      notes
    )
    values (
      p_organization_id,
      '[TEST] KPN Zakelijk B.V.',
      'test-crediteur@example.invalid',
      'NL00TEST0000000000',
      30,
      'Automatisch aangemaakte testcrediteur.'
    )

    returning id
    into v_creditor_id;

  end if;


  -- ==========================================================
  -- 5. TEST INKOOPFACTUUR
  --
  -- Voor deze bankmatchingtest telt vooral het totaal.
  -- ==========================================================

  select invoice.id
  into v_purchase_invoice_id

  from public.purchase_invoices invoice

  where
    invoice.organization_id =
      p_organization_id

    and invoice.creditor_id =
      v_creditor_id

    and invoice.invoice_number =
      'TEST-KPN-2026-001'

  limit 1;


  if v_purchase_invoice_id is null then

    insert into public.purchase_invoices (
      organization_id,
      creditor_id,
      invoice_number,
      status,
      invoice_date,
      due_date,
      currency,
      subtotal_cents,
      vat_cents,
      total_cents,
      paid_cents,
      reference,
      description,
      created_by,
      finalized_at
    )
    values (
      p_organization_id,
      v_creditor_id,
      'TEST-KPN-2026-001',
      'open',
      current_date,
      current_date + 30,
      'EUR',
      35000,
      7350,
      42350,
      0,
      'TEST-KPN-2026-001',
      '[TEST] Zakelijke telecomkosten',
      auth.uid(),
      now()
    )

    returning id
    into v_purchase_invoice_id;


    insert into public.purchase_invoice_lines (
      invoice_id,
      description,
      quantity,
      unit_price_cents,
      vat_rate,
      line_total_cents,
      position
    )
    values (
      v_purchase_invoice_id,
      '[TEST] Zakelijke telecomkosten',
      1,
      35000,
      21.00,
      35000,
      1
    );

  end if;


  -- ==========================================================
  -- 6. TESTBANKREKENING
  -- ==========================================================

  select account.id
  into v_bank_account_id

  from public.bank_accounts account

  where
    account.organization_id =
      p_organization_id

    and account.provider =
      'test'

    and account.provider_account_id =
      'test-bank-account-001'

  limit 1;


  if v_bank_account_id is null then

    insert into public.bank_accounts (
      organization_id,
      provider,
      provider_account_id,
      iban,
      account_name,
      currency,
      status,
      last_synced_at
    )
    values (
      p_organization_id,
      'test',
      'test-bank-account-001',
      'NL00TEST0000000001',
      '[TEST] Zakelijke rekening',
      'EUR',
      'active',
      now()
    )

    returning id
    into v_bank_account_id;

  end if;


  -- ==========================================================
  -- 7. INKOMENDE BANKMUTATIE
  --
  -- Exact bedrag + factuurnummer
  -- => verwachte score 100
  -- ==========================================================

  select transaction.id
  into v_sales_transaction_id

  from public.bank_transactions transaction

  where
    transaction.bank_account_id =
      v_bank_account_id

    and transaction.provider =
      'test'

    and transaction.provider_transaction_id =
      'test-bank-sales-001'

  limit 1;


  if v_sales_transaction_id is null then

    insert into public.bank_transactions (
      organization_id,
      bank_account_id,
      provider,
      provider_transaction_id,
      booked_at,
      value_date,
      amount_cents,
      currency,
      counterparty_name,
      counterparty_iban,
      description,
      reference,
      end_to_end_id,
      status,
      reconciliation_status,
      raw_data
    )
    values (
      p_organization_id,
      v_bank_account_id,
      'test',
      'test-bank-sales-001',
      now(),
      current_date,
      121000,
      'EUR',
      '[TEST] Jansen Bouw B.V.',
      'NL00TEST0000000002',
      'Betaling factuur TEST-VERKOOP-2026-001',
      'TEST-VERKOOP-2026-001',
      'TEST-VERKOOP-2026-001',
      'booked',
      'unmatched',
      jsonb_build_object(
        'test_record',
        true,
        'purpose',
        'bank_matching'
      )
    )

    returning id
    into v_sales_transaction_id;

  end if;


  -- ==========================================================
  -- 8. UITGAANDE BANKMUTATIE
  --
  -- Exact bedrag + factuurnummer
  -- => verwachte score 100
  -- ==========================================================

  select transaction.id
  into v_purchase_transaction_id

  from public.bank_transactions transaction

  where
    transaction.bank_account_id =
      v_bank_account_id

    and transaction.provider =
      'test'

    and transaction.provider_transaction_id =
      'test-bank-purchase-001'

  limit 1;


  if v_purchase_transaction_id is null then

    insert into public.bank_transactions (
      organization_id,
      bank_account_id,
      provider,
      provider_transaction_id,
      booked_at,
      value_date,
      amount_cents,
      currency,
      counterparty_name,
      counterparty_iban,
      description,
      reference,
      end_to_end_id,
      status,
      reconciliation_status,
      raw_data
    )
    values (
      p_organization_id,
      v_bank_account_id,
      'test',
      'test-bank-purchase-001',
      now() - interval '5 minutes',
      current_date,
      -42350,
      'EUR',
      '[TEST] KPN Zakelijk B.V.',
      'NL00TEST0000000000',
      'Betaling factuur TEST-KPN-2026-001',
      'TEST-KPN-2026-001',
      'TEST-KPN-2026-001',
      'booked',
      'unmatched',
      jsonb_build_object(
        'test_record',
        true,
        'purpose',
        'bank_matching'
      )
    )

    returning id
    into v_purchase_transaction_id;

  end if;


  -- ==========================================================
  -- 9. AUDIT
  -- ==========================================================

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
    'bank_matching_test_data_created',
    'organization',
    p_organization_id,
    'success',
    jsonb_build_object(
      'sales_invoice_id',
      v_sales_invoice_id,
      'purchase_invoice_id',
      v_purchase_invoice_id,
      'sales_transaction_id',
      v_sales_transaction_id,
      'purchase_transaction_id',
      v_purchase_transaction_id,
      'test_data',
      true
    )
  );


  -- ==========================================================
  -- 10. RESULTAAT
  -- ==========================================================

  return jsonb_build_object(

    'organizationId',
    p_organization_id,

    'salesInvoice',
    jsonb_build_object(
      'id',
      v_sales_invoice_id,

      'invoiceNumber',
      'TEST-VERKOOP-2026-001',

      'amountCents',
      121000
    ),

    'purchaseInvoice',
    jsonb_build_object(
      'id',
      v_purchase_invoice_id,

      'invoiceNumber',
      'TEST-KPN-2026-001',

      'amountCents',
      42350
    ),

    'bankAccountId',
    v_bank_account_id,

    'salesTransactionId',
    v_sales_transaction_id,

    'purchaseTransactionId',
    v_purchase_transaction_id

  );

end;
$$;


revoke all
on function public.create_bank_matching_test_data(uuid)
from public, anon;


grant execute
on function public.create_bank_matching_test_data(uuid)
to authenticated;


commit;