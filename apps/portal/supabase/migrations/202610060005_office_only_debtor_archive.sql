begin;

-- ============================================================
-- BESTEMD - DEBITEUR ARCHIVEREN ALLEEN VANUIT OFFICE
-- ============================================================

-- Klanten mogen de oude customer-RPC niet meer uitvoeren.
revoke all
on function public.customer_archive_debtor(
  uuid,
  uuid
)
from authenticated;


-- ============================================================
-- OFFICE ARCHIVE RPC
-- ============================================================

create or replace function
public.office_archive_debtor(
  p_organization_id uuid,
  p_debtor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_code text;
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
      message = 'Alleen Bestemd Office mag debiteuren archiveren.';
  end if;


  select r.code
  into v_role_code

  from public.office_memberships m

  join public.roles r
    on r.id = m.role_id
   and r.scope = 'office'

  where
    m.user_id = auth.uid()
    and m.status = 'active'

  limit 1;


  if coalesce(
    v_role_code,
    ''
  ) not in (
    'owner',
    'admin',
    'accountant',
    'handler'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Uw Office-rol mag geen debiteuren archiveren.';
  end if;


  if not exists (
    select 1

    from public.debtors d

    where
      d.id = p_debtor_id

      and d.organization_id =
        p_organization_id

      and d.archived_at is null
  ) then
    raise exception
      'Debiteur bestaat niet.';
  end if;


  /*
   * Niet archiveren zolang er nog
   * openstaande definitieve facturen zijn.
   */
  if exists (
    select 1

    from public.sales_invoices i

    where
      i.organization_id =
        p_organization_id

      and i.debtor_id =
        p_debtor_id

      and i.archived_at is null

      and i.document_status =
        'issued'

      and i.payment_status in (
        'unpaid',
        'partially_paid'
      )
  ) then
    raise exception
      'Deze debiteur heeft nog openstaande facturen.';
  end if;


  update public.debtors
  set
    archived_at = now(),
    updated_at = now()

  where
    id = p_debtor_id
    and organization_id =
      p_organization_id;


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
    'invoicing.debtor_archived_by_office',
    'debtor',
    p_debtor_id,
    'success',
    jsonb_build_object(
      'source',
      'office'
    )
  );


  return p_debtor_id;

end;
$$;


revoke all
on function public.office_archive_debtor(
  uuid,
  uuid
)
from public, anon;


grant execute
on function public.office_archive_debtor(
  uuid,
  uuid
)
to authenticated;


commit;
