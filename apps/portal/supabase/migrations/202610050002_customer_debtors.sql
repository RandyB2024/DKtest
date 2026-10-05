begin;

-- ============================================================
-- 6A-2 CUSTOMER DEBTOR MANAGEMENT
-- ============================================================


-- ============================================================
-- 1. BEVOEGDHEID
-- owner / admin / finance
-- ============================================================

create or replace function
public.can_customer_manage_invoicing(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null

    and public.has_aal2()

    and exists (
      select 1

      from public.organization_memberships m

      join public.roles r
        on r.id = m.role_id
       and r.scope = 'customer'

      join public.profiles p
        on p.id = m.user_id

      join public.organizations o
        on o.id = m.organization_id

      where
        m.user_id = auth.uid()

        and m.organization_id =
          p_organization_id

        and m.status = 'active'

        and m.valid_from <= now()

        and (
          m.valid_until is null
          or m.valid_until > now()
        )

        and p.account_status = 'active'

        and o.archived_at is null

        and r.code in (
          'owner',
          'admin',
          'finance'
        )
    );
$$;


revoke all
on function
public.can_customer_manage_invoicing(uuid)
from public, anon;

grant execute
on function
public.can_customer_manage_invoicing(uuid)
to authenticated;



-- ============================================================
-- 2. DEBITEUR AANMAKEN
-- ============================================================

create or replace function
public.customer_create_debtor(
  p_organization_id uuid,
  p_name text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_kvk_number text,
  p_vat_number text,
  p_reference text,
  p_payment_term_days integer,
  p_address jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
  v_name text;
begin

  if not public.can_customer_manage_invoicing(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid om debiteuren te beheren.';
  end if;


  v_name :=
    trim(
      coalesce(
        p_name,
        ''
      )
    );

  if
    length(v_name) < 2
    or length(v_name) > 160
  then
    raise exception
      'Naam is ongeldig.';
  end if;


  v_email :=
    lower(
      trim(
        coalesce(
          p_email,
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
      'E-mailadres is ongeldig.';
  end if;


  if
    p_payment_term_days < 1
    or p_payment_term_days > 365
  then
    raise exception
      'Betaaltermijn is ongeldig.';
  end if;


  if
    jsonb_typeof(
      coalesce(
        p_address,
        '{}'::jsonb
      )
    ) <> 'object'
  then
    raise exception
      'Adres is ongeldig.';
  end if;


  insert into public.debtors (
    organization_id,
    name,
    contact_name,
    email,
    phone,
    kvk_number,
    vat_number,
    reference,
    payment_term_days,
    address,
    created_at,
    updated_at
  )
  values (
    p_organization_id,
    v_name,
    nullif(
      trim(
        coalesce(
          p_contact_name,
          ''
        )
      ),
      ''
    ),
    v_email,
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
          p_kvk_number,
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
          p_reference,
          ''
        )
      ),
      ''
    ),
    p_payment_term_days,
    coalesce(
      p_address,
      '{}'::jsonb
    ),
    now(),
    now()
  )
  returning id
  into v_id;


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
    'invoicing.debtor_created',
    'debtor',
    v_id,
    'success',
    jsonb_build_object(
      'name',
      v_name
    )
  );


  return v_id;

end;
$$;


revoke all
on function
public.customer_create_debtor(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  jsonb
)
from public, anon;

grant execute
on function
public.customer_create_debtor(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  jsonb
)
to authenticated;



-- ============================================================
-- 3. DEBITEUR BIJWERKEN
-- ============================================================

create or replace function
public.customer_update_debtor(
  p_organization_id uuid,
  p_debtor_id uuid,
  p_name text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_kvk_number text,
  p_vat_number text,
  p_reference text,
  p_payment_term_days integer,
  p_address jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
begin

  if not public.can_customer_manage_invoicing(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid om debiteuren te beheren.';
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


  v_name :=
    trim(
      coalesce(
        p_name,
        ''
      )
    );

  if
    length(v_name) < 2
    or length(v_name) > 160
  then
    raise exception
      'Naam is ongeldig.';
  end if;


  v_email :=
    lower(
      trim(
        coalesce(
          p_email,
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
      'E-mailadres is ongeldig.';
  end if;


  if
    p_payment_term_days < 1
    or p_payment_term_days > 365
  then
    raise exception
      'Betaaltermijn is ongeldig.';
  end if;


  if
    jsonb_typeof(
      coalesce(
        p_address,
        '{}'::jsonb
      )
    ) <> 'object'
  then
    raise exception
      'Adres is ongeldig.';
  end if;


  update public.debtors
  set
    name =
      v_name,

    contact_name =
      nullif(
        trim(
          coalesce(
            p_contact_name,
            ''
          )
        ),
        ''
      ),

    email =
      v_email,

    phone =
      nullif(
        trim(
          coalesce(
            p_phone,
            ''
          )
        ),
        ''
      ),

    kvk_number =
      nullif(
        trim(
          coalesce(
            p_kvk_number,
            ''
          )
        ),
        ''
      ),

    vat_number =
      nullif(
        trim(
          coalesce(
            p_vat_number,
            ''
          )
        ),
        ''
      ),

    reference =
      nullif(
        trim(
          coalesce(
            p_reference,
            ''
          )
        ),
        ''
      ),

    payment_term_days =
      p_payment_term_days,

    address =
      coalesce(
        p_address,
        '{}'::jsonb
      ),

    updated_at =
      now()

  where
    id = p_debtor_id
    and organization_id =
      p_organization_id
    and archived_at is null;


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
    'invoicing.debtor_updated',
    'debtor',
    p_debtor_id,
    'success',
    jsonb_build_object(
      'name',
      v_name
    )
  );


  return p_debtor_id;

end;
$$;


revoke all
on function
public.customer_update_debtor(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  jsonb
)
from public, anon;

grant execute
on function
public.customer_update_debtor(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  jsonb
)
to authenticated;



-- ============================================================
-- 4. DEBITEUR ARCHIVEREN
-- ============================================================

create or replace function
public.customer_archive_debtor(
  p_organization_id uuid,
  p_debtor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin

  if not public.can_customer_manage_invoicing(
    p_organization_id
  ) then
    raise exception
      'Geen bevoegdheid om debiteuren te beheren.';
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
    archived_at =
      now(),

    updated_at =
      now()

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
    'invoicing.debtor_archived',
    'debtor',
    p_debtor_id,
    'success',
    '{}'::jsonb
  );


  return p_debtor_id;

end;
$$;


revoke all
on function
public.customer_archive_debtor(
  uuid,
  uuid
)
from public, anon;

grant execute
on function
public.customer_archive_debtor(
  uuid,
  uuid
)
to authenticated;



-- ============================================================
-- 5. VEILIGE LEESFUNCTIE
-- ============================================================

create or replace function
public.get_customer_debtors(
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


  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',
            d.id,

          'name',
            d.name,

          'contactName',
            d.contact_name,

          'email',
            d.email,

          'phone',
            d.phone,

          'kvkNumber',
            d.kvk_number,

          'vatNumber',
            d.vat_number,

          'reference',
            d.reference,

          'paymentTermDays',
            d.payment_term_days,

          'address',
            d.address,

          'createdAt',
            d.created_at,

          'updatedAt',
            d.updated_at
        )
        order by
          lower(d.name),
          d.id
      ),
      '[]'::jsonb
    )

  into v_result

  from public.debtors d

  where
    d.organization_id =
      p_organization_id

    and d.archived_at is null;


  return v_result;

end;
$$;


revoke all
on function
public.get_customer_debtors(uuid)
from public, anon;

grant execute
on function
public.get_customer_debtors(uuid)
to authenticated;


commit;
