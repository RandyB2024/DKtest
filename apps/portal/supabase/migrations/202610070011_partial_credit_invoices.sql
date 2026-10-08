begin;

-- ============================================================
-- BESTEMD
-- GEDEELTELIJKE CREDITFACTUREN
--
-- Doel:
-- - meerdere creditnota's op één verkoopfactuur;
-- - nooit meer crediteren dan de originele factuur;
-- - volledige credit blijft ondersteund;
-- - oorspronkelijke factuur blijft immutable;
-- - alleen Office + AAL2;
-- - iedere credit krijgt eigen C-nummer + snapshot.
-- ============================================================


create or replace function
public.office_create_credit_invoice(
  p_organization_id uuid,
  p_original_invoice_id uuid,
  p_reason text,
  p_amount_cents bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_original public.sales_invoices%rowtype;
  v_credit public.sales_invoices%rowtype;

  v_credit_id uuid;
  v_credit_number text;
  v_role_code text;
  v_reason text;

  v_requested_cents bigint;
  v_already_credited_cents bigint;
  v_remaining_before_cents bigint;
  v_remaining_after_cents bigint;

  v_ratio numeric;

  v_credit_subtotal bigint;
  v_credit_vat bigint;
  v_credit_total bigint;

  v_snapshot jsonb;

  v_line_count integer;
  v_position integer := 0;

  v_running_subtotal bigint := 0;
  v_running_vat bigint := 0;
  v_running_total bigint := 0;

  v_last_line_id uuid;

  rec record;
  v_line_subtotal bigint;
  v_line_vat bigint;
  v_line_total bigint;
begin

  -- ==========================================================
  -- BEVEILIGING
  -- ==========================================================

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
      message = 'Alleen Bestemd Office mag creditfacturen maken.';
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

  if coalesce(v_role_code, '') not in (
    'owner',
    'admin',
    'accountant',
    'handler'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Uw Office-rol mag geen creditfacturen maken.';
  end if;


  -- ==========================================================
  -- REDEN
  -- ==========================================================

  v_reason :=
    nullif(
      trim(
        coalesce(
          p_reason,
          ''
        )
      ),
      ''
    );

  if v_reason is null then
    raise exception
      'Geef een reden voor de creditfactuur op.';
  end if;

  if length(v_reason) > 500 then
    raise exception
      'De reden voor de creditfactuur is te lang.';
  end if;


  -- ==========================================================
  -- ORIGINELE FACTUUR LOCKEN
  -- ==========================================================

  select *
  into v_original
  from public.sales_invoices
  where
    id = p_original_invoice_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception
      'De oorspronkelijke factuur bestaat niet.';
  end if;

  if v_original.archived_at is not null then
    raise exception
      'Een gearchiveerde factuur kan niet worden gecrediteerd.';
  end if;

  if v_original.invoice_kind <> 'invoice' then
    raise exception
      'Alleen een gewone verkoopfactuur kan worden gecrediteerd.';
  end if;

  if v_original.invoice_number is null
     or v_original.finalized_at is null
  then
    raise exception
      'De oorspronkelijke factuur is niet definitief.';
  end if;

  if abs(v_original.total_cents) <= 0 then
    raise exception
      'Deze factuur heeft geen crediteerbaar bedrag.';
  end if;


  -- ==========================================================
  -- REEDS GECREDITEERD
  --
  -- Creditnota's zijn negatief.
  -- abs(sum(total_cents)) geeft reeds gecrediteerd bedrag.
  -- ==========================================================

  select
    coalesce(
      abs(
        sum(i.total_cents)
      ),
      0
    )::bigint
  into v_already_credited_cents
  from public.sales_invoices i
  where
    i.organization_id = p_organization_id
    and i.original_invoice_id = p_original_invoice_id
    and i.invoice_kind = 'credit'
    and i.document_status <> 'cancelled'
    and i.archived_at is null;

  v_remaining_before_cents :=
    abs(v_original.total_cents)
    - v_already_credited_cents;

  if v_remaining_before_cents <= 0 then
    raise exception
      'Deze factuur is al volledig gecrediteerd.';
  end if;


  -- NULL betekent: volledig resterend bedrag crediteren.
  v_requested_cents :=
    coalesce(
      p_amount_cents,
      v_remaining_before_cents
    );

  if v_requested_cents <= 0 then
    raise exception
      'Het creditbedrag moet groter zijn dan nul.';
  end if;

  if v_requested_cents > v_remaining_before_cents then
    raise exception
      'Het creditbedrag is hoger dan het nog crediteerbare bedrag.';
  end if;


  -- ==========================================================
  -- CREDITBEDRAG PROPORTIONEEL VERDELEN
  --
  -- Hierdoor blijft de btw-verhouding van de oorspronkelijke
  -- factuur behouden, ook bij meerdere btw-tarieven.
  -- ==========================================================

  v_ratio :=
    v_requested_cents::numeric
    / abs(v_original.total_cents)::numeric;


  -- Factuurniveau.
  v_credit_subtotal :=
    round(
      abs(v_original.subtotal_cents)::numeric
      * v_ratio
    )::bigint;

  v_credit_vat :=
    v_requested_cents
    - v_credit_subtotal;

  v_credit_total :=
    v_requested_cents;


  -- ==========================================================
  -- CREDITFACTUUR AANMAKEN
  -- ==========================================================

  v_credit_number :=
    public.next_sales_document_number(
      p_organization_id,
      'credit'
    );

  if
    v_credit_number is null
    or trim(v_credit_number) = ''
  then
    raise exception
      'Creditfactuurnummer kon niet worden aangemaakt.';
  end if;

  v_credit_id :=
    gen_random_uuid();

  insert into public.sales_invoices (
    id,
    organization_id,
    debtor_id,
    invoice_number,
    status,
    document_status,
    payment_status,
    collection_status,
    invoice_kind,
    original_invoice_id,
    credit_reason,
    invoice_date,
    due_date,
    currency,
    subtotal_cents,
    vat_cents,
    total_cents,
    paid_cents,
    customer_reference,
    notes,
    finalized_at,
    sent_at,
    last_reminder_at,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_credit_id,
    p_organization_id,
    v_original.debtor_id,
    v_credit_number,
    'issued',
    'issued',
    'not_applicable',
    'none',
    'credit',
    v_original.id,
    v_reason,
    current_date,
    current_date,
    v_original.currency,
    -v_credit_subtotal,
    -v_credit_vat,
    -v_credit_total,
    0,
    v_original.customer_reference,
    concat(
      case
        when v_requested_cents = abs(v_original.total_cents)
          then 'Volledige credit op factuur '
        else 'Gedeeltelijke credit op factuur '
      end,
      v_original.invoice_number,
      '. Reden: ',
      v_reason
    ),
    now(),
    null,
    null,
    auth.uid(),
    now(),
    now()
  )
  returning *
  into v_credit;


  -- ==========================================================
  -- CREDITREGELS
  --
  -- Regels worden naar rato van het gekozen bedrag gespiegeld.
  -- De laatste regel vangt eventuele centafronding op.
  -- ==========================================================

  select count(*)
  into v_line_count
  from public.sales_invoice_lines
  where invoice_id = p_original_invoice_id;

  if v_line_count <= 0 then
    raise exception
      'De oorspronkelijke factuur bevat geen factuurregels.';
  end if;


  for rec in
    select
      l.*,
      row_number() over (
        order by l.position, l.id
      ) as rn
    from public.sales_invoice_lines l
    where l.invoice_id = p_original_invoice_id
    order by l.position, l.id
  loop

    v_position :=
      v_position + 1;

    if rec.rn = v_line_count then

      -- Laatste regel vangt alle resterende afrondingscenten op.
      v_line_subtotal :=
        v_credit_subtotal
        - v_running_subtotal;

      v_line_vat :=
        v_credit_vat
        - v_running_vat;

      v_line_total :=
        v_credit_total
        - v_running_total;

    else

      v_line_total :=
        round(
          abs(rec.total_incl_vat_cents)::numeric
          * v_ratio
        )::bigint;

      v_line_subtotal :=
        round(
          abs(rec.line_total_cents)::numeric
          * v_ratio
        )::bigint;

      v_line_vat :=
        v_line_total
        - v_line_subtotal;

    end if;


    insert into public.sales_invoice_lines (
      invoice_id,
      description,
      quantity,
      unit_price_cents,
      vat_rate,
      line_total_cents,
      position,
      vat_code,
      vat_cents,
      total_incl_vat_cents
    )
    values (
      v_credit_id,

      concat(
        rec.description,
        case
          when v_requested_cents < abs(v_original.total_cents)
            then ' — gedeeltelijke credit'
          else ''
        end
      ),

      1,

      -v_line_subtotal,

      rec.vat_rate,

      -v_line_subtotal,

      v_position,

      rec.vat_code,

      -v_line_vat,

      -v_line_total
    )
    returning id
    into v_last_line_id;


    v_running_subtotal :=
      v_running_subtotal
      + v_line_subtotal;

    v_running_vat :=
      v_running_vat
      + v_line_vat;

    v_running_total :=
      v_running_total
      + v_line_total;

  end loop;


  -- ==========================================================
  -- IMMUTABLE SNAPSHOT
  -- ==========================================================

  v_snapshot :=
    public.create_credit_invoice_snapshot(
      p_organization_id,
      v_credit_id
    );


  -- ==========================================================
  -- STATUS ORIGINELE FACTUUR
  -- ==========================================================

  v_remaining_after_cents :=
    v_remaining_before_cents
    - v_requested_cents;

  if v_remaining_after_cents <= 0 then

    update public.sales_invoices
    set
      document_status = 'credited',
      collection_status = 'none',
      updated_at = now()
    where
      id = p_original_invoice_id
      and organization_id = p_organization_id;

  else

    -- Factuur blijft actief zolang er nog een bedrag resteert.
    -- Geen nieuwe niet-bestaande enumstatus introduceren.
    update public.sales_invoices
    set
      updated_at = now()
    where
      id = p_original_invoice_id
      and organization_id = p_organization_id;

  end if;


  -- ==========================================================
  -- AUDIT
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
    case
      when v_remaining_after_cents <= 0
        then 'invoicing.full_credit_created'
      else 'invoicing.partial_credit_created'
    end,
    'sales_invoice',
    v_credit_id,
    'success',
    jsonb_build_object(
      'credit_invoice_number',
        v_credit_number,

      'original_invoice_id',
        p_original_invoice_id,

      'original_invoice_number',
        v_original.invoice_number,

      'reason',
        v_reason,

      'credit_amount_cents',
        v_requested_cents,

      'credited_before_cents',
        v_already_credited_cents,

      'remaining_after_cents',
        greatest(
          v_remaining_after_cents,
          0
        ),

      'snapshot_created',
        v_snapshot is not null
    )
  );


  return jsonb_build_object(
    'creditInvoiceId',
      v_credit.id,

    'creditInvoiceNumber',
      v_credit.invoice_number,

    'originalInvoiceId',
      v_original.id,

    'originalInvoiceNumber',
      v_original.invoice_number,

    'invoiceKind',
      v_credit.invoice_kind,

    'documentStatus',
      v_credit.document_status,

    'totalCents',
      v_credit.total_cents,

    'creditReason',
      v_credit.credit_reason,

    'creditAmountCents',
      v_requested_cents,

    'creditedBeforeCents',
      v_already_credited_cents,

    'creditedTotalCents',
      v_already_credited_cents
      + v_requested_cents,

    'remainingCents',
      greatest(
        v_remaining_after_cents,
        0
      ),

    'fullyCredited',
      v_remaining_after_cents <= 0,

    'snapshotReady',
      v_snapshot is not null
  );

end;
$function$;


revoke all
on function public.office_create_credit_invoice(
  uuid,
  uuid,
  text,
  bigint
)
from public, anon;

grant execute
on function public.office_create_credit_invoice(
  uuid,
  uuid,
  text,
  bigint
)
to authenticated;


commit;
