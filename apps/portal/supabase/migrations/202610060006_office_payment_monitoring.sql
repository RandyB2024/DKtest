begin;

-- ============================================================
-- BESTEMD OFFICE - BETALINGSBEWAKING
-- Alleen ingelogde Office-gebruikers met AAL2.
-- ============================================================

create or replace function public.office_get_payment_monitoring(
  p_organization_id uuid default null,
  p_limit integer default 250
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_limit integer;
  v_result jsonb;
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
      message = 'Alleen Bestemd Office heeft toegang tot betalingsbewaking.';
  end if;

  if p_organization_id is not null then
    if not exists (
      select 1
      from public.organizations o
      where
        o.id = p_organization_id
        and o.archived_at is null
    ) then
      raise exception
        'Onderneming bestaat niet.';
    end if;
  end if;

  v_limit :=
    greatest(
      1,
      least(
        coalesce(p_limit, 250),
        500
      )
    );

  with invoice_base as (
    select
      i.id as invoice_id,
      i.organization_id,
      o.name as organization_name,
      o.customer_relationship_id,

      d.id as debtor_id,
      d.name as debtor_name,
      d.email as debtor_email,

      i.invoice_number,
      i.invoice_date,
      i.due_date,

      i.total_cents,
      i.paid_cents,

      greatest(
        i.total_cents - i.paid_cents,
        0
      ) as outstanding_cents,

      i.payment_status,
      i.collection_status,
      i.sent_at,
      i.last_reminder_at,

      case
        when
          i.total_cents > i.paid_cents
          and i.due_date < current_date
        then current_date - i.due_date
        else 0
      end as days_overdue,

      (
        select sd.status
        from public.sales_invoice_deliveries sd
        where
          sd.organization_id = i.organization_id
          and sd.invoice_id = i.id
          and sd.delivery_type in (
            'reminder_1',
            'reminder_2',
            'final_notice'
          )
        order by sd.created_at desc
        limit 1
      ) as latest_reminder_status,

      (
        select sd.delivery_type
        from public.sales_invoice_deliveries sd
        where
          sd.organization_id = i.organization_id
          and sd.invoice_id = i.id
          and sd.delivery_type in (
            'reminder_1',
            'reminder_2',
            'final_notice'
          )
        order by sd.created_at desc
        limit 1
      ) as latest_reminder_type

    from public.sales_invoices i

    join public.debtors d
      on d.id = i.debtor_id
      and d.organization_id = i.organization_id

    join public.organizations o
      on o.id = i.organization_id

    where
      i.invoice_kind = 'invoice'
      and i.document_status = 'issued'
      and i.invoice_number is not null
      and i.archived_at is null
      and o.archived_at is null
      and (
        p_organization_id is null
        or i.organization_id = p_organization_id
      )
  ),

  summary_data as (
    select
      count(*) filter (
        where
          payment_status in (
            'unpaid',
            'partially_paid'
          )
          and outstanding_cents > 0
      ) as open_count,

      coalesce(
        sum(outstanding_cents) filter (
          where
            payment_status in (
              'unpaid',
              'partially_paid'
            )
            and outstanding_cents > 0
        ),
        0
      ) as open_cents,

      count(*) filter (
        where
          outstanding_cents > 0
          and due_date < current_date
      ) as overdue_count,

      coalesce(
        sum(outstanding_cents) filter (
          where
            outstanding_cents > 0
            and due_date < current_date
        ),
        0
      ) as overdue_cents,

      count(*) filter (
        where collection_status = 'reminder_1'
      ) as reminder_1_count,

      count(*) filter (
        where collection_status = 'reminder_2'
      ) as reminder_2_count,

      count(*) filter (
        where collection_status = 'final_notice'
      ) as final_notice_count,

      count(*) filter (
        where latest_reminder_status = 'failed'
      ) as failed_count,

      count(*) filter (
        where payment_status = 'paid'
      ) as paid_count

    from invoice_base
  ),

  limited_invoices as (
    select *
    from invoice_base
    order by
      case
        when latest_reminder_status = 'failed'
          then 0

        when
          outstanding_cents > 0
          and due_date < current_date
          then 1

        when outstanding_cents > 0
          then 2

        else 3
      end,
      due_date asc,
      invoice_number asc
    limit v_limit
  )

  select jsonb_build_object(
    'summary',
      jsonb_build_object(
        'openCount',
          s.open_count,

        'openCents',
          s.open_cents,

        'overdueCount',
          s.overdue_count,

        'overdueCents',
          s.overdue_cents,

        'reminder1Count',
          s.reminder_1_count,

        'reminder2Count',
          s.reminder_2_count,

        'finalNoticeCount',
          s.final_notice_count,

        'failedCount',
          s.failed_count,

        'paidCount',
          s.paid_count
      ),

    'items',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'invoiceId',
                b.invoice_id,

              'organizationId',
                b.organization_id,

              'organizationName',
                b.organization_name,

              'customerRelationshipId',
                b.customer_relationship_id,

              'debtorId',
                b.debtor_id,

              'debtorName',
                b.debtor_name,

              'debtorEmail',
                b.debtor_email,

              'invoiceNumber',
                b.invoice_number,

              'invoiceDate',
                b.invoice_date,

              'dueDate',
                b.due_date,

              'totalCents',
                b.total_cents,

              'paidCents',
                b.paid_cents,

              'outstandingCents',
                b.outstanding_cents,

              'paymentStatus',
                b.payment_status,

              'collectionStatus',
                b.collection_status,

              'daysOverdue',
                b.days_overdue,

              'sentAt',
                b.sent_at,

              'lastReminderAt',
                b.last_reminder_at,

              'latestReminderStatus',
                b.latest_reminder_status,

              'latestReminderType',
                b.latest_reminder_type,

              'monitoringStatus',
                case
                  when b.latest_reminder_status = 'failed'
                    then 'failed'

                  when b.payment_status = 'paid'
                    then 'paid'

                  when b.collection_status = 'final_notice'
                    then 'final_notice'

                  when b.collection_status = 'reminder_2'
                    then 'reminder_2'

                  when b.collection_status = 'reminder_1'
                    then 'reminder_1'

                  when
                    b.outstanding_cents > 0
                    and b.due_date < current_date
                    then 'overdue'

                  else 'open'
                end,

              'deliveries',
                coalesce(
                  (
                    select jsonb_agg(
                      jsonb_build_object(
                        'id',
                          sd.id,

                        'type',
                          sd.delivery_type,

                        'status',
                          sd.status,

                        'recipientEmail',
                          sd.recipient_email,

                        'sentAt',
                          sd.sent_at,

                        'createdAt',
                          sd.created_at,

                        'lastError',
                          sd.last_error
                      )
                      order by sd.created_at asc
                    )

                    from public.sales_invoice_deliveries sd

                    where
                      sd.organization_id = b.organization_id
                      and sd.invoice_id = b.invoice_id
                  ),
                  '[]'::jsonb
                )
            )
            order by
              case
                when b.latest_reminder_status = 'failed'
                  then 0

                when
                  b.outstanding_cents > 0
                  and b.due_date < current_date
                  then 1

                when b.outstanding_cents > 0
                  then 2

                else 3
              end,
              b.due_date asc,
              b.invoice_number asc
          )

          from limited_invoices b
        ),
        '[]'::jsonb
      )
  )
  into v_result
  from summary_data s;

  return v_result;

end;
$function$;


revoke all
on function public.office_get_payment_monitoring(
  uuid,
  integer
)
from public, anon;


grant execute
on function public.office_get_payment_monitoring(
  uuid,
  integer
)
to authenticated;


commit;
