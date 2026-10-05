begin;

-- ============================================================
-- 6A-4 FACTUURPROFIEL + LOGO
-- ============================================================


-- ============================================================
-- 1. FACTUURPROFIEL UITBREIDEN
-- ============================================================

alter table public.invoicing_settings
  add column if not exists company_name text;

alter table public.invoicing_settings
  add column if not exists registration_number text;

alter table public.invoicing_settings
  add column if not exists vat_number text;

alter table public.invoicing_settings
  add column if not exists phone text;

alter table public.invoicing_settings
  add column if not exists website text;

alter table public.invoicing_settings
  add column if not exists business_address jsonb
    not null default '{}'::jsonb;


-- ============================================================
-- 2. FACTUURPROFIEL LEZEN
-- ============================================================

create or replace function
public.get_customer_invoice_profile(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.invoicing_settings%rowtype;
  v_org public.organizations%rowtype;
begin

  if auth.uid() is null then
    raise exception 'Niet ingelogd.';
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


  select *
  into v_org
  from public.organizations
  where
    id = p_organization_id
    and archived_at is null;


  if not found then
    raise exception
      'Onderneming bestaat niet.';
  end if;


  select *
  into v_settings
  from public.invoicing_settings
  where organization_id =
    p_organization_id;


  return jsonb_build_object(
    'organizationId',
      p_organization_id,

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
      v_settings.logo_storage_path,

    'defaultPaymentTermDays',
      coalesce(
        v_settings.default_payment_term_days,
        30
      ),

    'invoicePrefix',
      coalesce(
        v_settings.invoice_prefix,
        'F'
      ),

    'creditPrefix',
      coalesce(
        v_settings.credit_prefix,
        'C'
      ),

    'vatAccountingMethod',
      coalesce(
        v_settings.vat_accounting_method,
        'invoice'
      )
  );

end;
$$;


revoke all
on function
public.get_customer_invoice_profile(uuid)
from public, anon;

grant execute
on function
public.get_customer_invoice_profile(uuid)
to authenticated;


-- ============================================================
-- 3. FACTUURPROFIEL OPSLAAN
-- ============================================================

create or replace function
public.customer_update_invoice_profile(
  p_organization_id uuid,
  p_company_name text,
  p_registration_number text,
  p_vat_number text,
  p_phone text,
  p_website text,
  p_business_address jsonb,
  p_iban text,
  p_bic text,
  p_invoice_email text,
  p_footer_text text,
  p_default_payment_term_days integer,
  p_invoice_prefix text,
  p_credit_prefix text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_name text;
  v_email text;
  v_invoice_prefix text;
  v_credit_prefix text;
begin

  if not public.can_customer_manage_invoicing(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid om facturatie-instellingen te wijzigen.';
  end if;


  v_company_name :=
    trim(
      coalesce(
        p_company_name,
        ''
      )
    );


  if
    length(v_company_name) < 2
    or length(v_company_name) > 200
  then
    raise exception
      'Bedrijfsnaam is ongeldig.';
  end if;


  v_email :=
    lower(
      trim(
        coalesce(
          p_invoice_email,
          ''
        )
      )
    );


  if
    length(v_email) < 5
    or length(v_email) > 254
    or position('@' in v_email) < 2
  then
    raise exception
      'Factuur e-mailadres is ongeldig.';
  end if;


  if
    p_default_payment_term_days < 1
    or p_default_payment_term_days > 365
  then
    raise exception
      'Betaaltermijn is ongeldig.';
  end if;


  if
    jsonb_typeof(
      coalesce(
        p_business_address,
        '{}'::jsonb
      )
    ) <> 'object'
  then
    raise exception
      'Bedrijfsadres is ongeldig.';
  end if;


  v_invoice_prefix :=
    upper(
      trim(
        coalesce(
          p_invoice_prefix,
          ''
        )
      )
    );

  v_credit_prefix :=
    upper(
      trim(
        coalesce(
          p_credit_prefix,
          ''
        )
      )
    );


  if
    v_invoice_prefix !~ '^[A-Z0-9-]{1,10}$'
    or
    v_credit_prefix !~ '^[A-Z0-9-]{1,10}$'
  then
    raise exception
      'Factuurprefix is ongeldig.';
  end if;


  insert into public.invoicing_settings (
    organization_id,
    company_name,
    registration_number,
    vat_number,
    phone,
    website,
    business_address,
    iban,
    bic,
    invoice_email,
    footer_text,
    default_payment_term_days,
    invoice_prefix,
    credit_prefix,
    created_at,
    updated_at
  )
  values (
    p_organization_id,
    v_company_name,
    nullif(trim(coalesce(p_registration_number,'')),''),
    nullif(trim(coalesce(p_vat_number,'')),''),
    nullif(trim(coalesce(p_phone,'')),''),
    nullif(trim(coalesce(p_website,'')),''),
    coalesce(
      p_business_address,
      '{}'::jsonb
    ),
    nullif(
      upper(
        replace(
          trim(
            coalesce(
              p_iban,
              ''
            )
          ),
          ' ',
          ''
        )
      ),
      ''
    ),
    nullif(
      upper(
        trim(
          coalesce(
            p_bic,
            ''
          )
        )
      ),
      ''
    ),
    v_email,
    nullif(
      trim(
        coalesce(
          p_footer_text,
          ''
        )
      ),
      ''
    ),
    p_default_payment_term_days,
    v_invoice_prefix,
    v_credit_prefix,
    now(),
    now()
  )

  on conflict (
    organization_id
  )

  do update
  set
    company_name =
      excluded.company_name,

    registration_number =
      excluded.registration_number,

    vat_number =
      excluded.vat_number,

    phone =
      excluded.phone,

    website =
      excluded.website,

    business_address =
      excluded.business_address,

    iban =
      excluded.iban,

    bic =
      excluded.bic,

    invoice_email =
      excluded.invoice_email,

    footer_text =
      excluded.footer_text,

    default_payment_term_days =
      excluded.default_payment_term_days,

    invoice_prefix =
      excluded.invoice_prefix,

    credit_prefix =
      excluded.credit_prefix,

    updated_at =
      now();


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
    'invoicing.invoice_profile_updated',
    'invoicing_settings',
    p_organization_id,
    'success',
    jsonb_build_object(
      'company_name',
        v_company_name
    )
  );


  return public.get_customer_invoice_profile(
    p_organization_id
  );

end;
$$;


revoke all
on function
public.customer_update_invoice_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  integer,
  text,
  text
)
from public, anon;

grant execute
on function
public.customer_update_invoice_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  text,
  integer,
  text,
  text
)
to authenticated;


-- ============================================================
-- 4. LOGOPAD VASTLEGGEN
-- ============================================================

create or replace function
public.customer_set_invoice_logo(
  p_organization_id uuid,
  p_storage_path text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin

  if not public.can_customer_manage_invoicing(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid om het factuurlogo te wijzigen.';
  end if;


  v_path :=
    trim(
      coalesce(
        p_storage_path,
        ''
      )
    );


  if
    v_path = ''
    or v_path not like
      p_organization_id::text || '/%'
  then
    raise exception
      'Ongeldig logopad.';
  end if;


  insert into public.invoicing_settings (
    organization_id,
    logo_storage_path
  )
  values (
    p_organization_id,
    v_path
  )

  on conflict (
    organization_id
  )

  do update
  set
    logo_storage_path =
      excluded.logo_storage_path,

    updated_at =
      now();


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
    'invoicing.invoice_logo_updated',
    'invoicing_settings',
    p_organization_id,
    'success',
    '{}'::jsonb
  );


  return v_path;

end;
$$;


revoke all
on function
public.customer_set_invoice_logo(
  uuid,
  text
)
from public, anon;

grant execute
on function
public.customer_set_invoice_logo(
  uuid,
  text
)
to authenticated;


-- ============================================================
-- 5. CUSTOMER LOGO UPLOAD TOESTAAN
--
-- Andere beveiligde buckets blijven geblokkeerd.
-- ============================================================

drop policy if exists
portal_storage_insert_disabled
on storage.objects;


create policy
portal_storage_insert_disabled
on storage.objects
as restrictive
for insert
to authenticated
with check (

  bucket_id not in (
    'documents',
    'invoice-pdfs',
    'company-assets',
    'message-attachments'
  )

  or public.is_office_user()

  or (
    bucket_id = 'company-assets'

    and public.can_customer_manage_invoicing(
      (storage.foldername(name))[1]::uuid
    )
  )
);


commit;
