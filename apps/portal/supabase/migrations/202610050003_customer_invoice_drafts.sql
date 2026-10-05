begin;

-- ============================================================
-- 6A-3 CUSTOMER SALES INVOICE DRAFTS
-- ============================================================


-- ============================================================
-- 1. FACTUURVELDEN
-- ============================================================

alter table public.sales_invoices
  add column if not exists customer_reference text;

alter table public.sales_invoices
  add column if not exists notes text;


alter table public.sales_invoice_lines
  add column if not exists vat_code text
    not null default '21';

alter table public.sales_invoice_lines
  add column if not exists vat_cents bigint
    not null default 0;

alter table public.sales_invoice_lines
  add column if not exists total_incl_vat_cents bigint
    not null default 0;


do $$
begin

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'sales_invoice_lines_vat_code_check'
  ) then

    alter table public.sales_invoice_lines
      add constraint
      sales_invoice_lines_vat_code_check
      check (
        vat_code in (
          '21',
          '9',
          '0',
          'exempt'
        )
      );

  end if;

end;
$$;


-- ============================================================
-- 2. CONCEPTFACTUUR AANMAKEN
-- ============================================================

create or replace function
public.customer_create_invoice_draft(
  p_organization_id uuid,
  p_debtor_id uuid,
  p_invoice_date date,
  p_customer_reference text,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare

  v_invoice_id uuid;

  v_debtor public.debtors%rowtype;

  v_line jsonb;

  v_description text;

  v_quantity numeric(14,4);

  v_unit_price_cents bigint;

  v_vat_code text;

  v_vat_rate numeric(5,2);

  v_line_net bigint;

  v_line_vat bigint;

  v_line_total bigint;

  v_subtotal bigint := 0;

  v_vat_total bigint := 0;

  v_total bigint := 0;

  v_position integer := 0;

begin

  if not public.can_customer_manage_invoicing(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid om facturen te beheren.';
  end if;


  if p_invoice_date is null then
    raise exception
      'Factuurdatum ontbreekt.';
  end if;


  select *
  into v_debtor
  from public.debtors
  where
    id = p_debtor_id
    and organization_id =
      p_organization_id
    and archived_at is null;


  if not found then
    raise exception
      'Debiteur bestaat niet.';
  end if;


  if
    p_lines is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) < 1
    or jsonb_array_length(p_lines) > 100
  then
    raise exception
      'Voeg minimaal één en maximaal honderd factuurregels toe.';
  end if;


  insert into public.sales_invoices (
    organization_id,
    debtor_id,

    invoice_number,

    status,
    document_status,
    payment_status,
    collection_status,
    invoice_kind,

    invoice_date,
    due_date,

    currency,

    subtotal_cents,
    vat_cents,
    total_cents,
    paid_cents,

    customer_reference,
    notes,

    created_by,
    created_at,
    updated_at
  )
  values (
    p_organization_id,
    p_debtor_id,

    null,

    'draft',
    'draft',
    'unpaid',
    'none',
    'invoice',

    p_invoice_date,

    p_invoice_date
      + v_debtor.payment_term_days,

    'EUR',

    0,
    0,
    0,
    0,

    nullif(
      trim(
        coalesce(
          p_customer_reference,
          ''
        )
      ),
      ''
    ),

    nullif(
      trim(
        coalesce(
          p_notes,
          ''
        )
      ),
      ''
    ),

    auth.uid(),
    now(),
    now()
  )

  returning id
  into v_invoice_id;


  for v_line in
    select *
    from jsonb_array_elements(
      p_lines
    )
  loop

    v_position :=
      v_position + 1;


    v_description :=
      trim(
        coalesce(
          v_line ->> 'description',
          ''
        )
      );


    if
      length(v_description) < 1
      or length(v_description) > 500
    then
      raise exception
        'Omschrijving van factuurregel % is ongeldig.',
        v_position;
    end if;


    begin

      v_quantity :=
        (v_line ->> 'quantity')
          ::numeric(14,4);

    exception
      when others then
        raise exception
          'Aantal van factuurregel % is ongeldig.',
          v_position;
    end;


    if
      v_quantity <= 0
      or v_quantity > 1000000
    then
      raise exception
        'Aantal van factuurregel % is ongeldig.',
        v_position;
    end if;


    begin

      v_unit_price_cents :=
        (v_line ->> 'unitPriceCents')
          ::bigint;

    exception
      when others then
        raise exception
          'Prijs van factuurregel % is ongeldig.',
          v_position;
    end;


    if
      v_unit_price_cents < 0
      or v_unit_price_cents >
        100000000000
    then
      raise exception
        'Prijs van factuurregel % is ongeldig.',
        v_position;
    end if;


    v_vat_code :=
      coalesce(
        v_line ->> 'vatCode',
        ''
      );


    v_vat_rate :=
      case v_vat_code
        when '21'
          then 21.00

        when '9'
          then 9.00

        when '0'
          then 0.00

        when 'exempt'
          then 0.00

        else null
      end;


    if v_vat_rate is null then
      raise exception
        'Btw-code van factuurregel % is ongeldig.',
        v_position;
    end if;


    v_line_net :=
      round(
        v_quantity *
        v_unit_price_cents
      )::bigint;


    v_line_vat :=
      round(
        v_line_net *
        v_vat_rate /
        100
      )::bigint;


    v_line_total :=
      v_line_net +
      v_line_vat;


    insert into public.sales_invoice_lines (
      invoice_id,
      description,
      quantity,
      unit_price_cents,
      vat_rate,
      vat_code,
      line_total_cents,
      vat_cents,
      total_incl_vat_cents,
      position
    )
    values (
      v_invoice_id,
      v_description,
      v_quantity,
      v_unit_price_cents,
      v_vat_rate,
      v_vat_code,
      v_line_net,
      v_line_vat,
      v_line_total,
      v_position
    );


    v_subtotal :=
      v_subtotal +
      v_line_net;

    v_vat_total :=
      v_vat_total +
      v_line_vat;

    v_total :=
      v_total +
      v_line_total;

  end loop;


  update public.sales_invoices
  set
    subtotal_cents =
      v_subtotal,

    vat_cents =
      v_vat_total,

    total_cents =
      v_total,

    updated_at =
      now()

  where id =
    v_invoice_id;


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
    'invoicing.invoice_draft_created',
    'sales_invoice',
    v_invoice_id,
    'success',
    jsonb_build_object(
      'debtor_id',
        p_debtor_id,

      'subtotal_cents',
        v_subtotal,

      'vat_cents',
        v_vat_total,

      'total_cents',
        v_total,

      'line_count',
        v_position
    )
  );


  return v_invoice_id;

end;
$$;


revoke all
on function
public.customer_create_invoice_draft(
  uuid,
  uuid,
  date,
  text,
  text,
  jsonb
)
from public, anon;

grant execute
on function
public.customer_create_invoice_draft(
  uuid,
  uuid,
  date,
  text,
  text,
  jsonb
)
to authenticated;



-- ============================================================
-- 3. CONCEPTFACTUUR BIJWERKEN
-- ============================================================

create or replace function
public.customer_update_invoice_draft(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_debtor_id uuid,
  p_invoice_date date,
  p_customer_reference text,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare

  v_invoice public.sales_invoices%rowtype;

  v_debtor public.debtors%rowtype;

  v_line jsonb;

  v_description text;

  v_quantity numeric(14,4);

  v_unit_price_cents bigint;

  v_vat_code text;

  v_vat_rate numeric(5,2);

  v_line_net bigint;

  v_line_vat bigint;

  v_line_total bigint;

  v_subtotal bigint := 0;

  v_vat_total bigint := 0;

  v_total bigint := 0;

  v_position integer := 0;

begin

  if not public.can_customer_manage_invoicing(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid om facturen te beheren.';
  end if;


  select *
  into v_invoice
  from public.sales_invoices
  where
    id = p_invoice_id
    and organization_id =
      p_organization_id
  for update;


  if not found then
    raise exception
      'Factuur bestaat niet.';
  end if;


  if
    v_invoice.document_status <>
      'draft'
    or v_invoice.finalized_at
      is not null
  then
    raise exception
      'Alleen een conceptfactuur mag worden aangepast.';
  end if;


  select *
  into v_debtor
  from public.debtors
  where
    id = p_debtor_id
    and organization_id =
      p_organization_id
    and archived_at is null;


  if not found then
    raise exception
      'Debiteur bestaat niet.';
  end if;


  if
    p_lines is null
    or jsonb_typeof(p_lines) <> 'array'
    or jsonb_array_length(p_lines) < 1
    or jsonb_array_length(p_lines) > 100
  then
    raise exception
      'Voeg minimaal één en maximaal honderd factuurregels toe.';
  end if;


  delete from
    public.sales_invoice_lines
  where invoice_id =
    p_invoice_id;


  for v_line in
    select *
    from jsonb_array_elements(
      p_lines
    )
  loop

    v_position :=
      v_position + 1;


    v_description :=
      trim(
        coalesce(
          v_line ->> 'description',
          ''
        )
      );


    if
      length(v_description) < 1
      or length(v_description) > 500
    then
      raise exception
        'Omschrijving van factuurregel % is ongeldig.',
        v_position;
    end if;


    begin
      v_quantity :=
        (v_line ->> 'quantity')
        ::numeric(14,4);
    exception
      when others then
        raise exception
          'Aantal van factuurregel % is ongeldig.',
          v_position;
    end;


    if
      v_quantity <= 0
      or v_quantity > 1000000
    then
      raise exception
        'Aantal van factuurregel % is ongeldig.',
        v_position;
    end if;


    begin
      v_unit_price_cents :=
        (v_line ->> 'unitPriceCents')
        ::bigint;
    exception
      when others then
        raise exception
          'Prijs van factuurregel % is ongeldig.',
          v_position;
    end;


    if
      v_unit_price_cents < 0
      or v_unit_price_cents >
        100000000000
    then
      raise exception
        'Prijs van factuurregel % is ongeldig.',
        v_position;
    end if;


    v_vat_code :=
      coalesce(
        v_line ->> 'vatCode',
        ''
      );


    v_vat_rate :=
      case v_vat_code
        when '21'
          then 21.00

        when '9'
          then 9.00

        when '0'
          then 0.00

        when 'exempt'
          then 0.00

        else null
      end;


    if v_vat_rate is null then
      raise exception
        'Btw-code van factuurregel % is ongeldig.',
        v_position;
    end if;


    v_line_net :=
      round(
        v_quantity *
        v_unit_price_cents
      )::bigint;


    v_line_vat :=
      round(
        v_line_net *
        v_vat_rate /
        100
      )::bigint;


    v_line_total :=
      v_line_net +
      v_line_vat;


    insert into public.sales_invoice_lines (
      invoice_id,
      description,
      quantity,
      unit_price_cents,
      vat_rate,
      vat_code,
      line_total_cents,
      vat_cents,
      total_incl_vat_cents,
      position
    )
    values (
      p_invoice_id,
      v_description,
      v_quantity,
      v_unit_price_cents,
      v_vat_rate,
      v_vat_code,
      v_line_net,
      v_line_vat,
      v_line_total,
      v_position
    );


    v_subtotal :=
      v_subtotal +
      v_line_net;

    v_vat_total :=
      v_vat_total +
      v_line_vat;

    v_total :=
      v_total +
      v_line_total;

  end loop;


  update public.sales_invoices
  set
    debtor_id =
      p_debtor_id,

    invoice_date =
      p_invoice_date,

    due_date =
      p_invoice_date
      + v_debtor.payment_term_days,

    customer_reference =
      nullif(
        trim(
          coalesce(
            p_customer_reference,
            ''
          )
        ),
        ''
      ),

    notes =
      nullif(
        trim(
          coalesce(
            p_notes,
            ''
          )
        ),
        ''
      ),

    subtotal_cents =
      v_subtotal,

    vat_cents =
      v_vat_total,

    total_cents =
      v_total,

    updated_at =
      now()

  where id =
    p_invoice_id;


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
    'invoicing.invoice_draft_updated',
    'sales_invoice',
    p_invoice_id,
    'success',
    jsonb_build_object(
      'subtotal_cents',
        v_subtotal,

      'vat_cents',
        v_vat_total,

      'total_cents',
        v_total,

      'line_count',
        v_position
    )
  );


  return p_invoice_id;

end;
$$;


revoke all
on function
public.customer_update_invoice_draft(
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  jsonb
)
from public, anon;

grant execute
on function
public.customer_update_invoice_draft(
  uuid,
  uuid,
  uuid,
  date,
  text,
  text,
  jsonb
)
to authenticated;



-- ============================================================
-- 4. CONCEPT VERWIJDEREN
-- Alleen concepten. Definitieve facturen nooit verwijderen.
-- ============================================================

create or replace function
public.customer_delete_invoice_draft(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare

  v_invoice public.sales_invoices%rowtype;

begin

  if not public.can_customer_manage_invoicing(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid om facturen te beheren.';
  end if;


  select *
  into v_invoice
  from public.sales_invoices
  where
    id = p_invoice_id
    and organization_id =
      p_organization_id
  for update;


  if not found then
    raise exception
      'Factuur bestaat niet.';
  end if;


  if
    v_invoice.document_status <>
      'draft'
    or v_invoice.finalized_at
      is not null
  then
    raise exception
      'Alleen een conceptfactuur mag worden verwijderd.';
  end if;


  delete from
    public.sales_invoices
  where id =
    p_invoice_id;


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
    'invoicing.invoice_draft_deleted',
    'sales_invoice',
    p_invoice_id,
    'success',
    '{}'::jsonb
  );


  return p_invoice_id;

end;
$$;


revoke all
on function
public.customer_delete_invoice_draft(
  uuid,
  uuid
)
from public, anon;

grant execute
on function
public.customer_delete_invoice_draft(
  uuid,
  uuid
)
to authenticated;



-- ============================================================
-- 5. CONCEPTEN LEZEN
-- ============================================================

create or replace function
public.get_customer_invoice_drafts(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare

  v_result jsonb;

begin

  if auth.uid() is null then
    raise exception
      'Niet ingelogd.';
  end if;


  if not public.has_aal2() then
    raise exception
      'Tweestapsverificatie is vereist.';
  end if;


  if not (
    public.has_org_access(
      p_organization_id
    )
    or public.is_office_user()
  ) then
    raise exception
      'Geen toegang tot deze onderneming.';
  end if;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
          i.id,

        'invoiceDate',
          i.invoice_date,

        'dueDate',
          i.due_date,

        'customerReference',
          i.customer_reference,

        'notes',
          i.notes,

        'subtotalCents',
          i.subtotal_cents,

        'vatCents',
          i.vat_cents,

        'totalCents',
          i.total_cents,

        'debtor',
          jsonb_build_object(
            'id',
              d.id,

            'name',
              d.name,

            'email',
              d.email
          ),

        'lines',
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id',
                    l.id,

                  'description',
                    l.description,

                  'quantity',
                    l.quantity,

                  'unitPriceCents',
                    l.unit_price_cents,

                  'vatCode',
                    l.vat_code,

                  'vatRate',
                    l.vat_rate,

                  'lineTotalCents',
                    l.line_total_cents,

                  'vatCents',
                    l.vat_cents,

                  'totalInclVatCents',
                    l.total_incl_vat_cents,

                  'position',
                    l.position
                )
                order by l.position
              )

              from public.sales_invoice_lines l

              where l.invoice_id =
                i.id
            ),
            '[]'::jsonb
          ),

        'createdAt',
          i.created_at,

        'updatedAt',
          i.updated_at
      )

      order by
        i.updated_at desc,
        i.created_at desc
    ),
    '[]'::jsonb
  )

  into v_result

  from public.sales_invoices i

  join public.debtors d
    on d.id = i.debtor_id
   and d.organization_id =
       i.organization_id

  where
    i.organization_id =
      p_organization_id

    and i.document_status =
      'draft'

    and i.invoice_kind =
      'invoice'

    and i.archived_at is null;


  return v_result;

end;
$$;


revoke all
on function
public.get_customer_invoice_drafts(uuid)
from public, anon;

grant execute
on function
public.get_customer_invoice_drafts(uuid)
to authenticated;


commit;
