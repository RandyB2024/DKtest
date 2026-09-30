-- ============================================================
-- 202609300002_bank_matching.sql
--
-- Veilige bankmatching:
-- - banktransactie wordt vergeleken met openstaande facturen
-- - inkomend  -> verkoopfacturen
-- - uitgaand  -> inkoopfacturen
-- - geen mutatie van de administratie
-- - alleen voorstellen
--
-- Matchscore:
-- 100 = bedrag + factuurnummer/referentie
--  90 = bedrag + tegenpartij
--  75 = bedrag exact
--  50 = gedeeltelijke tekstmatch
--
-- Alleen openstaande facturen worden meegenomen.
-- ============================================================

begin;


create or replace function public.get_bank_match_suggestions(
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

    from public.bank_transactions transaction

    where
      transaction.organization_id =
        p_organization_id

      and transaction.status = 'booked'

      and transaction.reconciliation_status
        in (
          'unmatched',
          'suggested'
        )

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
        invoice.total_cents
        - invoice.paid_cents,
        0
      ) as outstanding_cents,

      case

        when
          transaction.amount_cents > 0

          and transaction.amount_cents =
            greatest(
              invoice.total_cents
              - invoice.paid_cents,
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
              invoice.total_cents
              - invoice.paid_cents,
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
              lower(debtor.name) ||
              '%'

            or

            lower(debtor.name)
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
              invoice.total_cents
              - invoice.paid_cents,
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

      end as score

    from transactions transaction

    join public.sales_invoices invoice
      on invoice.organization_id =
         transaction.organization_id

    join public.debtors debtor
      on debtor.id =
         invoice.debtor_id

     and debtor.organization_id =
         invoice.organization_id

    where
      transaction.amount_cents > 0

      and invoice.archived_at is null

      and invoice.total_cents >
          invoice.paid_cents

      and lower(invoice.status)
        not in (
          'draft',
          'concept',
          'credited',
          'gecrediteerd',
          'cancelled',
          'geannuleerd',
          'paid',
          'betaald'
        )
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
        invoice.total_cents
        - invoice.paid_cents,
        0
      ) as outstanding_cents,

      case

        when
          transaction.amount_cents < 0

          and abs(
            transaction.amount_cents
          ) =
            greatest(
              invoice.total_cents
              - invoice.paid_cents,
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
              invoice.total_cents
              - invoice.paid_cents,
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
              lower(creditor.name) ||
              '%'

            or

            lower(creditor.name)
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
              invoice.total_cents
              - invoice.paid_cents,
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

      end as score

    from transactions transaction

    join public.purchase_invoices invoice
      on invoice.organization_id =
         transaction.organization_id

    join public.creditors creditor
      on creditor.id =
         invoice.creditor_id

     and creditor.organization_id =
         invoice.organization_id

    where
      transaction.amount_cents < 0

      and invoice.archived_at is null

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
      ) as rank

    from candidates candidate
  )


  select coalesce(
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
                  then
                    'Bedrag en factuurreferentie komen overeen.'

                when candidate.score = 90
                  then
                    'Bedrag en tegenpartij komen overeen.'

                when candidate.score = 75
                  then
                    'Het openstaande bedrag komt exact overeen.'

                else
                  'Factuurreferentie komt gedeeltelijk overeen.'
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
on function public.get_bank_match_suggestions(
  uuid,
  integer
)
from public, anon;


grant execute
on function public.get_bank_match_suggestions(
  uuid,
  integer
)
to authenticated;


commit;