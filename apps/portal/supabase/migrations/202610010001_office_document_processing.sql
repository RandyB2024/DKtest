-- ============================================================
-- Office documenten stap 3A
-- Gecontroleerde verwerking van klantdocumenten.
-- ============================================================

begin;

create or replace function public.office_process_customer_document(
  p_organization_id uuid,
  p_document_id uuid,
  p_status text,
  p_document_type text,
  p_book_year integer default null,
  p_book_month integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_old public.documents%rowtype;
  v_new public.documents%rowtype;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception 'Tweestapsverificatie is vereist.';
  end if;

  if not public.is_office_user() then
    raise exception 'Geen Office-toegang.';
  end if;

  if p_status not in (
    'new',
    'in_review',
    'needs_customer_action',
    'ready',
    'processed'
  ) then
    raise exception 'Ongeldige documentstatus.';
  end if;

  if p_document_type not in (
    'purchase_invoice',
    'sales_invoice',
    'bank_document',
    'tax_document',
    'payroll',
    'contract',
    'other'
  ) then
    raise exception 'Ongeldig documenttype.';
  end if;

  if p_book_year is not null
     and (p_book_year < 2000 or p_book_year > 2100) then
    raise exception 'Ongeldig boekjaar.';
  end if;

  if p_book_month is not null
     and (p_book_month < 1 or p_book_month > 12) then
    raise exception 'Ongeldige maand.';
  end if;

  select *
  into v_old
  from public.documents
  where id = p_document_id
    and organization_id = p_organization_id
    and archived_at is null
  for update;

  if not found then
    raise exception 'Document niet gevonden.';
  end if;

  if v_old.source <> 'customer' then
    raise exception 'Alleen klantdocumenten kunnen hier worden verwerkt.';
  end if;

  update public.documents
  set
    status = p_status,
    document_type = p_document_type,
    book_year = p_book_year,
    book_month = p_book_month,
    customer_action_required =
      (p_status = 'needs_customer_action'),
    processed_at =
      case
        when p_status = 'processed'
          then coalesce(processed_at, now())
        else null
      end
  where id = p_document_id
  returning *
  into v_new;

  insert into public.document_events (
    organization_id,
    document_id,
    event_type,
    old_value,
    new_value,
    created_by
  )
  values (
    p_organization_id,
    p_document_id,
    'status_changed',
    jsonb_build_object(
      'status', v_old.status,
      'documentType', v_old.document_type,
      'bookYear', v_old.book_year,
      'bookMonth', v_old.book_month
    ),
    jsonb_build_object(
      'status', v_new.status,
      'documentType', v_new.document_type,
      'bookYear', v_new.book_year,
      'bookMonth', v_new.book_month
    ),
    v_user_id
  );

  return jsonb_build_object(
    'id', v_new.id,
    'organizationId', v_new.organization_id,
    'status', v_new.status,
    'documentType', v_new.document_type,
    'bookYear', v_new.book_year,
    'bookMonth', v_new.book_month,
    'processedAt', v_new.processed_at
  );
end;
$$;

revoke all
on function public.office_process_customer_document(
  uuid,
  uuid,
  text,
  text,
  integer,
  integer
)
from public, anon;

grant execute
on function public.office_process_customer_document(
  uuid,
  uuid,
  text,
  text,
  integer,
  integer
)
to authenticated;

commit;
