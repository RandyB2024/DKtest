begin;

-- ============================================================
-- BESTEMD - BANKBETALINGEN <-> NIEUWE FACTUURSTATUS
--
-- Zorgt dat bankmatching aansluit op:
-- document_status
-- payment_status
-- collection_status
--
-- Alleen definitieve, actieve verkoopfacturen mogen
-- aan inkomende betalingen worden gekoppeld.
-- ============================================================


create or replace function
public.allocate_payment_to_sales_invoice(
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

  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Niet ingelogd.';
  end if;


  if not public.has_aal2()
     or not public.is_office_user() then
    raise exception using
      errcode = '42501',
      message = 'Alleen een geverifieerde Office-gebruiker mag betalingen toewijzen.';
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
    raise exception
      'Betaling bestaat niet.';
  end if;


  select *
  into v_invoice
  from public.sales_invoices
  where id = p_invoice_id
  for update;


  if not found then
    raise exception
      'Verkoopfactuur bestaat niet.';
  end if;


  if
    v_payment.organization_id <>
    v_invoice.organization_id
  then
    raise exception
      'Betaling en factuur behoren niet tot dezelfde organisatie.';
  end if;


  if v_payment.amount_cents <= 0 then
    raise exception
      'Een verkoopfactuur kan alleen met een inkomende betaling worden afgeboekt.';
  end if;


  if v_invoice.invoice_kind <> 'invoice' then
    raise exception
      'Een bankbetaling kan hier alleen aan een gewone verkoopfactuur worden gekoppeld.';
  end if;


  if v_invoice.document_status <> 'issued' then
    raise exception
      'Alleen een definitieve actieve factuur kan worden betaald.';
  end if;


  if v_invoice.payment_status in (
    'paid',
    'overpaid',
    'not_applicable'
  ) then
    raise exception
      'Deze factuur heeft geen openstaand betaalbaar bedrag.';
  end if;


  select
    coalesce(
      sum(a.amount_cents),
      0
    )::bigint

  into
    v_payment_allocated

  from public.payment_allocations a

  where a.payment_id =
    p_payment_id;


  if (
    v_payment_allocated +
    p_amount_cents
  ) > abs(
    v_payment.amount_cents
  ) then
    raise exception
      'De betaling wordt voor meer toegewezen dan het beschikbare bedrag.';
  end if;


  v_invoice_outstanding :=
    greatest(
      v_invoice.total_cents -
      v_invoice.paid_cents,
      0
    );


  if v_invoice_outstanding <= 0 then
    raise exception
      'Deze factuur heeft geen openstaand bedrag.';
  end if;


  if
    p_amount_cents >
    v_invoice_outstanding
  then
    raise exception
      'Het toegewezen bedrag is groter dan het openstaande factuurbedrag.';
  end if;


  insert into
    public.payment_allocations (
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
    v_invoice.paid_cents +
    p_amount_cents;


  update public.sales_invoices
  set
    paid_cents =
      v_new_paid,

    /*
     * Legacy veld blijft voorlopig synchroon
     * voor oudere Office-onderdelen.
     */
    status =
      case
        when v_new_paid >= total_cents
          then 'paid'
        else 'partially_paid'
      end,

    payment_status =
      case
        when v_new_paid >= total_cents
          then 'paid'
        else 'partially_paid'
      end,

    /*
     * Zodra volledig betaald:
     * incassotraject direct stoppen.
     */
    collection_status =
      case
        when v_new_paid >= total_cents
          then 'none'
        else collection_status
      end,

    updated_at =
      now()

  where id =
    p_invoice_id;


  insert into
    public.audit_events (
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
      'payment_id',
        p_payment_id,

      'amount_cents',
        p_amount_cents,

      'allocation_id',
        v_allocation_id,

      'previous_paid_cents',
        v_invoice.paid_cents,

      'new_paid_cents',
        v_new_paid,

      'payment_status',
        case
          when v_new_paid >=
               v_invoice.total_cents
            then 'paid'
          else 'partially_paid'
        end
    )
  );


  return
    v_allocation_id;

end;
$$;



-- ============================================================
-- MATCHVOORSTELLEN
--
-- Verkoopzijde gebruikt nu de nieuwe factuurstatusvelden.
-- ============================================================

create or replace function
public.get_bank_match_suggestions(
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
    public.has_org_access(
      p_organization_id
    )
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
        coalesce(
          p_limit,
          100
        ),
        500
      )
    );


  with transactions as (

    select
      transaction.id,
      transaction.organization_id,
      transaction.amount_cents,
      transaction.booked_at,
      transaction.counterparty_name,
      transaction.counterparty_iban,
      transaction.description,
      transaction.reference,
      transaction.end_to_end_id,
      transaction.reconciliation_status,
      transaction.payment_id

    from public.bank_transactions
      transaction

    where
      transaction.organization_id =
        p_organization_id

      and transaction.status =
        'booked'

      and transaction.reconciliation_status
        in (
          'unmatched',
          'suggested'
        )

      and transaction.payment_id
        is null

    order by
      transaction.booked_at desc,
      transaction.id desc

    limit safe_limit
  ),


  sales_candidates as (

    select
      transaction.id
        as bank_transaction_id,

      invoice.id
        as invoice_id,

      'sales'
        as invoice_type,

      invoice.invoice_number,

      debtor.name
        as relation_name,

      invoice.total_cents,

      invoice.paid_cents,

      greatest(
        invoice.total_cents -
        invoice.paid_cents,
        0
      )
        as outstanding_cents,

      case

        when
          transaction.amount_cents > 0

          and transaction.amount_cents =
            greatest(
              invoice.total_cents -
              invoice.paid_cents,
              0
            )

          and invoice.invoice_number
            is not null

          and (
            coalesce(
              transaction.description,
              ''
            )
              ilike
                '%' ||
                invoice.invoice_number ||
                '%'

            or

            coalesce(
              transaction.reference,
              ''
            )
              ilike
                '%' ||
                invoice.invoice_number ||
                '%'

            or

            coalesce(
              transaction.end_to_end_id,
              ''
            )
              ilike
                '%' ||
                invoice.invoice_number ||
                '%'
          )

        then 100


        when
          transaction.amount_cents > 0

          and transaction.amount_cents =
            greatest(
              invoice.total_cents -
              invoice.paid_cents,
              0
            )

          and transaction.counterparty_name
            is not null

          and (
            lower(
              transaction.counterparty_name
            )
              like
                '%' ||
                lower(
                  debtor.name
                ) ||
                '%'

            or

            lower(
              debtor.name
            )
              like
                '%' ||
                lower(
                  transaction.counterparty_name
                ) ||
                '%'
          )

        then 90


        when
          transaction.amount_cents > 0

          and transaction.amount_cents =
            greatest(
              invoice.total_cents -
              invoice.paid_cents,
              0
            )

        then 75


        when
          transaction.amount_cents > 0

          and invoice.invoice_number
            is not null

          and (
            coalesce(
              transaction.description,
              ''
            )
              ilike
                '%' ||
                invoice.invoice_number ||
                '%'

            or

            coalesce(
              transaction.reference,
              ''
            )
              ilike
                '%' ||
                invoice.invoice_number ||
                '%'
          )

        then 50

        else 0

      end
        as score

    from transactions transaction

    join public.sales_invoices
      invoice
      on invoice.organization_id =
         transaction.organization_id

    join public.debtors
      debtor
      on debtor.id =
         invoice.debtor_id

      and debtor.organization_id =
          invoice.organization_id

    where
      transaction.amount_cents > 0

      and invoice.archived_at
        is null

      and invoice.invoice_kind =
        'invoice'

      and invoice.document_status =
        'issued'

      and invoice.payment_status
        in (
          'unpaid',
          'partially_paid'
        )

      and invoice.total_cents >
          invoice.paid_cents
  ),


  purchase_candidates as (

    select
      transaction.id
        as bank_transaction_id,

      invoice.id
        as invoice_id,

      'purchase'
        as invoice_type,

      invoice.invoice_number,

      creditor.name
        as relation_name,

      invoice.total_cents,

      invoice.paid_cents,

      greatest(
        invoice.total_cents -
        invoice.paid_cents,
        0
      )
        as outstanding_cents,

      case

        when
          transaction.amount_cents < 0

          and abs(
            transaction.amount_cents
          ) =
            greatest(
              invoice.total_cents -
              invoice.paid_cents,
              0
            )

          and invoice.invoice_number
            is not null

          and (
            coalesce(
              transaction.description,
              ''
            )
              ilike
                '%' ||
                invoice.invoice_number ||
                '%'

            or

            coalesce(
              transaction.reference,
              ''
            )
              ilike
                '%' ||
                invoice.invoice_number ||
                '%'

            or

            coalesce(
              transaction.end_to_end_id,
              ''
            )
              ilike
                '%' ||
                invoice.invoice_number ||
                '%'
          )

        then 100


        when
          transaction.amount_cents < 0

          and abs(
            transaction.amount_cents
          ) =
            greatest(
              invoice.total_cents -
              invoice.paid_cents,
              0
            )

          and transaction.counterparty_name
            is not null

          and (
            lower(
              transaction.counterparty_name
            )
              like
                '%' ||
                lower(
                  creditor.name
                ) ||
                '%'

            or

            lower(
              creditor.name
            )
              like
                '%' ||
                lower(
                  transaction.counterparty_name
                ) ||
                '%'
          )

        then 90


        when
          transaction.amount_cents < 0

          and abs(
            transaction.amount_cents
          ) =
            greatest(
              invoice.total_cents -
              invoice.paid_cents,
              0
            )

        then 75


        when
          transaction.amount_cents < 0

          and invoice.invoice_number
            is not null

          and (
            coalesce(
              transaction.description,
              ''
            )
              ilike
                '%' ||
                invoice.invoice_number ||
                '%'

            or

            coalesce(
              transaction.reference,
              ''
            )
              ilike
                '%' ||
                invoice.invoice_number ||
                '%'
          )

        then 50

        else 0

      end
        as score

    from transactions transaction

    join public.purchase_invoices
      invoice
      on invoice.organization_id =
         transaction.organization_id

    join public.creditors
      creditor
      on creditor.id =
         invoice.creditor_id

      and creditor.organization_id =
          invoice.organization_id

    where
      transaction.amount_cents < 0

      and invoice.archived_at
        is null

      and invoice.total_cents >
          invoice.paid_cents

      and invoice.status
        not in (
          'draft',
          'credited',
          'cancelled',
          'paid'
        )
  ),


  candidates as (

    select *
    from sales_candidates
    where score > 0

    union all

    select *
    from purchase_candidates
    where score > 0
  ),


  ranked as (

    select
      candidate.*,

      row_number()
      over (
        partition by
          candidate.bank_transaction_id

        order by
          candidate.score desc,
          candidate.outstanding_cents asc,
          candidate.invoice_id asc
      )
        as rank

    from candidates
      candidate
  )


  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'transactionId',
            transaction.id,

          'amountCents',
            transaction.amount_cents,

          'bookedAt',
            transaction.booked_at,

          'counterpartyName',
            transaction.counterparty_name,

          'description',
            transaction.description,

          'reference',
            transaction.reference,

          'suggestion',

            case
              when candidate.invoice_id
                is null
              then null

              else
                jsonb_build_object(
                  'invoiceId',
                    candidate.invoice_id,

                  'invoiceType',
                    candidate.invoice_type,

                  'invoiceNumber',
                    candidate.invoice_number,

                  'relationName',
                    candidate.relation_name,

                  'totalCents',
                    candidate.total_cents,

                  'paidCents',
                    candidate.paid_cents,

                  'outstandingCents',
                    candidate.outstanding_cents,

                  'score',
                    candidate.score,

                  'strength',
                    case
                      when candidate.score >= 90
                        then 'strong'
                      when candidate.score >= 75
                        then 'possible'
                      else 'weak'
                    end,

                  'reason',
                    case
                      when candidate.score = 100
                        then 'Bedrag en factuurnummer komen overeen.'

                      when candidate.score = 90
                        then 'Bedrag en debiteur komen overeen.'

                      when candidate.score = 75
                        then 'Het openstaande bedrag komt exact overeen.'

                      else 'Factuurnummer komt voor in de betalingsomschrijving.'
                    end
                )
            end
        )

        order by
          transaction.booked_at desc,
          transaction.id desc
      ),
      '[]'::jsonb
    )

  into result

  from transactions transaction

  left join ranked candidate
    on candidate.bank_transaction_id =
       transaction.id

   and candidate.rank = 1;


  return result;

end;
$$;


revoke all
on function
public.allocate_payment_to_sales_invoice(
  uuid,
  uuid,
  bigint
)
from public, anon;


grant execute
on function
public.allocate_payment_to_sales_invoice(
  uuid,
  uuid,
  bigint
)
to authenticated;


revoke all
on function
public.get_bank_match_suggestions(
  uuid,
  integer
)
from public, anon;


grant execute
on function
public.get_bank_match_suggestions(
  uuid,
  integer
)
to authenticated;


commit;
