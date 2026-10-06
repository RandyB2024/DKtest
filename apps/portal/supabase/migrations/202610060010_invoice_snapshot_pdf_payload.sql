begin;

-- ============================================================
-- BESTEMD 6A-10
-- IMMUTABLE SNAPSHOTS + PDF PAYLOAD VOOR VERKOOPFACTUREN
-- ============================================================


-- ============================================================
-- 1. SNAPSHOT-TABEL
-- ============================================================

create table if not exists
public.sales_invoice_snapshots (
  invoice_id uuid primary key
    references public.sales_invoices(id)
    on delete restrict,

  organization_id uuid not null
    references public.organizations(id),

  snapshot jsonb not null,

  created_at timestamptz not null
    default now(),

  constraint sales_invoice_snapshots_snapshot_object
    check (jsonb_typeof(snapshot) = 'object')
);


create index if not exists
sales_invoice_snapshots_org_idx
on public.sales_invoice_snapshots (
  organization_id,
  created_at desc
);


alter table
public.sales_invoice_snapshots
enable row level security;


drop policy if exists
sales_invoice_snapshots_read
on public.sales_invoice_snapshots;


create policy
sales_invoice_snapshots_read
on public.sales_invoice_snapshots
for select
to authenticated
using (
  public.has_aal2()
  and (
    public.has_org_access(
      organization_id
    )
    or public.is_office_user()
  )
);


revoke insert, update, delete, truncate
on public.sales_invoice_snapshots
from anon, authenticated;

grant select
on public.sales_invoice_snapshots
to authenticated;



-- ============================================================
-- 2. SNAPSHOT MAG NOOIT WORDEN GEWIJZIGD
-- ============================================================

create or replace function
public.prevent_sales_invoice_snapshot_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  raise exception
    'Een definitieve factuursnapshot is immutable.';
end;
$function$;


drop trigger if exists
sales_invoice_snapshot_immutable
on public.sales_invoice_snapshots;


create trigger
sales_invoice_snapshot_immutable
before update or delete
on public.sales_invoice_snapshots
for each row
execute function
public.prevent_sales_invoice_snapshot_mutation();



-- ============================================================
-- 3. SNAPSHOT VAN GEWONE VERKOOPFACTUUR MAKEN
-- ============================================================

create or replace function
public.create_sales_invoice_snapshot(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_invoice public.sales_invoices%rowtype;
  v_debtor public.debtors%rowtype;
  v_org public.organizations%rowtype;
  v_settings public.invoicing_settings%rowtype;

  v_lines jsonb;
  v_snapshot jsonb;
begin

  /*
   * Bestaat al een snapshot?
   * Dan exact die teruggeven.
   * Nooit opnieuw opbouwen.
   */
  select s.snapshot
  into v_snapshot
  from public.sales_invoice_snapshots s
  where
    s.invoice_id = p_invoice_id
    and s.organization_id =
      p_organization_id;

  if found then
    return v_snapshot;
  end if;


  select *
  into v_invoice
  from public.sales_invoices
  where
    id = p_invoice_id
    and organization_id =
      p_organization_id;

  if not found then
    raise exception
      'Factuur bestaat niet.';
  end if;


  if v_invoice.invoice_kind <> 'invoice' then
    raise exception
      'Document is geen verkoopfactuur.';
  end if;


  /*
   * issued = normale definitieve factuur.
   * credited wordt ondersteund voor legacy backfill:
   * de oorspronkelijke factuur kan inmiddels gecrediteerd zijn.
   */
  if
    v_invoice.document_status not in (
      'issued',
      'credited'
    )
    or v_invoice.invoice_number is null
    or v_invoice.finalized_at is null
  then
    raise exception
      'Factuur is nog niet definitief.';
  end if;


  select *
  into v_debtor
  from public.debtors
  where
    id = v_invoice.debtor_id
    and organization_id =
      p_organization_id;

  if not found then
    raise exception
      'Debiteur ontbreekt.';
  end if;


  select *
  into v_org
  from public.organizations
  where id = p_organization_id;

  if not found then
    raise exception
      'Onderneming ontbreekt.';
  end if;


  /*
   * Instellingen mogen ontbreken.
   * In dat geval worden beschikbare
   * organisatiegegevens gebruikt.
   */
  select *
  into v_settings
  from public.invoicing_settings
  where organization_id =
    p_organization_id;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'description',
          l.description,

        'quantity',
          l.quantity,

        'unitPriceCents',
          l.unit_price_cents,

        'vatRate',
          l.vat_rate,

        'vatCode',
          l.vat_code,

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
    ),
    '[]'::jsonb
  )
  into v_lines
  from public.sales_invoice_lines l
  where l.invoice_id =
    p_invoice_id;


  if jsonb_array_length(v_lines) < 1 then
    raise exception
      'Factuur bevat geen factuurregels.';
  end if;


  v_snapshot :=
    jsonb_build_object(

      'schemaVersion',
        1,

      'invoice',
        jsonb_build_object(
          'id',
            v_invoice.id,

          'invoiceNumber',
            v_invoice.invoice_number,

          'invoiceKind',
            v_invoice.invoice_kind,

          'invoiceDate',
            v_invoice.invoice_date,

          'dueDate',
            v_invoice.due_date,

          'currency',
            v_invoice.currency,

          'customerReference',
            v_invoice.customer_reference,

          'notes',
            v_invoice.notes,

          'subtotalCents',
            v_invoice.subtotal_cents,

          'vatCents',
            v_invoice.vat_cents,

          'totalCents',
            v_invoice.total_cents
        ),

      'seller',
        jsonb_build_object(
          'companyName',
            coalesce(
              v_settings.company_name,
              v_org.legal_name,
              v_org.name
            ),

          'registrationNumber',
            coalesce(
              v_settings.registration_number,
              v_org.registration_number
            ),

          'vatNumber',
            v_settings.vat_number,

          'phone',
            v_settings.phone,

          'website',
            v_settings.website,

          'businessAddress',
            coalesce(
              v_settings.business_address,
              '{}'::jsonb
            ),

          'iban',
            v_settings.iban,

          'bic',
            v_settings.bic,

          'invoiceEmail',
            v_settings.invoice_email,

          'footerText',
            v_settings.footer_text,

          'logoStoragePath',
            v_settings.logo_storage_path
        ),

      'debtor',
        jsonb_build_object(
          'name',
            v_debtor.name,

          'email',
            v_debtor.email,

          'address',
            coalesce(
              v_debtor.address,
              '{}'::jsonb
            )
        ),

      'lines',
        v_lines,

      'finalizedAt',
        v_invoice.finalized_at
    );


  insert into
  public.sales_invoice_snapshots (
    invoice_id,
    organization_id,
    snapshot
  )
  values (
    p_invoice_id,
    p_organization_id,
    v_snapshot
  )
  on conflict (invoice_id)
  do nothing;


  /*
   * Bij een theoretische race altijd
   * het opgeslagen immutable exemplaar teruggeven.
   */
  select s.snapshot
  into v_snapshot
  from public.sales_invoice_snapshots s
  where
    s.invoice_id = p_invoice_id
    and s.organization_id =
      p_organization_id;


  if v_snapshot is null then
    raise exception
      'Factuursnapshot kon niet worden opgeslagen.';
  end if;


  return v_snapshot;

end;
$function$;



-- ============================================================
-- 4. AUTOMATISCH SNAPSHOT BIJ FINALISEREN
-- ============================================================

create or replace function
public.snapshot_sales_invoice_after_finalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin

  if
    new.invoice_kind = 'invoice'
    and new.document_status = 'issued'
    and new.invoice_number is not null
    and new.finalized_at is not null
  then

    if
      tg_op = 'INSERT'
    then

      perform
        public.create_sales_invoice_snapshot(
          new.organization_id,
          new.id
        );

    elsif
      old.document_status is distinct
        from new.document_status
      or old.finalized_at is null
    then

      perform
        public.create_sales_invoice_snapshot(
          new.organization_id,
          new.id
        );

    end if;

  end if;


  return new;

end;
$function$;


drop trigger if exists
sales_invoice_snapshot_after_finalize
on public.sales_invoices;


create trigger
sales_invoice_snapshot_after_finalize
after insert or update of
  document_status,
  finalized_at,
  invoice_number
on public.sales_invoices
for each row
execute function
public.snapshot_sales_invoice_after_finalize();



-- ============================================================
-- 5. PDF PAYLOAD UITSLUITEND UIT IMMUTABLE SNAPSHOT
-- ============================================================

create or replace function
public.get_customer_invoice_pdf_payload(
  p_organization_id uuid,
  p_invoice_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_snapshot jsonb;
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


  select s.snapshot
  into v_snapshot
  from public.sales_invoice_snapshots s
  join public.sales_invoices i
    on i.id = s.invoice_id
   and i.organization_id =
       s.organization_id
  where
    s.invoice_id = p_invoice_id
    and s.organization_id =
      p_organization_id
    and i.invoice_number is not null
    and i.finalized_at is not null;


  if v_snapshot is null then
    return null;
  end if;


  return v_snapshot;

end;
$function$;



-- ============================================================
-- 6. LEGACY BACKFILL
--
-- Bestaande definitieve facturen bestonden vóór deze snapshot-
-- architectuur. Dit is de enige beschikbare baseline.
-- Na deze migration worden snapshots nooit meer gewijzigd.
-- ============================================================

do $block$
declare
  r record;
begin

  for r in
    select
      i.id,
      i.organization_id
    from public.sales_invoices i
    where
      i.invoice_kind = 'invoice'
      and i.document_status in (
        'issued',
        'credited'
      )
      and i.invoice_number is not null
      and i.finalized_at is not null
      and not exists (
        select 1
        from public.sales_invoice_snapshots s
        where s.invoice_id = i.id
      )
    order by i.finalized_at
  loop

    begin

      perform
        public.create_sales_invoice_snapshot(
          r.organization_id,
          r.id
        );

    exception
      when others then

        raise warning
          'Legacy snapshot overgeslagen voor factuur %: %',
          r.id,
          sqlerrm;

    end;

  end loop;

end;
$block$;



-- ============================================================
-- 7. RECHTEN
-- ============================================================

revoke all
on function
public.create_sales_invoice_snapshot(
  uuid,
  uuid
)
from public, anon, authenticated;


revoke all
on function
public.prevent_sales_invoice_snapshot_mutation()
from public, anon, authenticated;


revoke all
on function
public.snapshot_sales_invoice_after_finalize()
from public, anon, authenticated;


revoke all
on function
public.get_customer_invoice_pdf_payload(
  uuid,
  uuid
)
from public, anon;


grant execute
on function
public.get_customer_invoice_pdf_payload(
  uuid,
  uuid
)
to authenticated;


commit;

