begin;

-- ============================================================
-- OFFICE FACTUURINSTELLINGEN
-- Zelfde invoicing_settings-record als Mijn Bestemming.
-- ============================================================


create or replace function
public.office_update_invoice_profile(
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
  v_role_code text;
  v_company_name text;
  v_email text;
  v_invoice_prefix text;
  v_credit_prefix text;
begin

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
      'Geen Office-toegang.';
  end if;


  select r.code
  into v_role_code
  from public.office_memberships om
  join public.roles r
    on r.id = om.role_id
  where
    om.user_id = auth.uid()
    and om.status = 'active'
    and r.scope = 'office'
  limit 1;


  if v_role_code not in (
    'owner',
    'admin',
    'accountant',
    'handler'
  ) then
    raise exception
      'Uw Office-rol heeft alleen leesrechten.';
  end if;


  perform 1
  from public.organizations
  where
    id = p_organization_id
    and archived_at is null;


  if not found then
    raise exception
      'Onderneming bestaat niet.';
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
    or position(
      '@' in v_email
    ) < 2
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
    v_invoice_prefix !~
      '^[A-Z0-9-]{1,10}$'
    or
    v_credit_prefix !~
      '^[A-Z0-9-]{1,10}$'
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
    nullif(
      trim(
        coalesce(
          p_registration_number,
          ''
        )
      ),
      ''
    ),
    nullif(
      trim(
        coalesce(
          p_vat_number,
          ''
        )
      ),
      ''
    ),
    nullif(
      trim(
        coalesce(
          p_phone,
          ''
        )
      ),
      ''
    ),
    nullif(
      trim(
        coalesce(
          p_website,
          ''
        )
      ),
      ''
    ),
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
    'office.invoicing.profile_updated',
    'invoicing_settings',
    p_organization_id,
    'success',
    jsonb_build_object(
      'company_name',
        v_company_name,

      'role',
        v_role_code
    )
  );


  return public.get_customer_invoice_profile(
    p_organization_id
  );

end;
$$;


revoke all
on function
public.office_update_invoice_profile(
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
public.office_update_invoice_profile(
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


commit;
