-- ============================================================
-- WIZE GOVERNANCE V1
--
-- Doel:
-- - algemene Wize-regels
-- - ondernemingsspecifieke regels
-- - bevoegdheden per onderneming
-- - harde tenant-isolatie
-- - Office-beheer via gecontroleerde RPC's
-- - audit logging
--
-- BELANGRIJK:
-- - klantbrowser schrijft nooit rechtstreeks naar deze tabellen
-- - Wize kiest nooit zelf een organization_id
-- - klanttoegang wordt server-side opnieuw gecontroleerd
-- ============================================================

begin;


-- ============================================================
-- 1. ALGEMENE WIZE-REGELS
-- ============================================================

create table if not exists
public.wize_global_rules (
  id uuid primary key
    default gen_random_uuid(),

  rule_key text not null
    unique,

  category text not null,

  title text not null,

  instruction text not null,

  priority integer not null
    default 100,

  enabled boolean not null
    default true,

  created_by uuid
    references public.profiles(id),

  updated_by uuid
    references public.profiles(id),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  check (
    length(btrim(rule_key))
      between 1 and 120
  ),

  check (
    length(btrim(category))
      between 1 and 80
  ),

  check (
    length(btrim(title))
      between 1 and 200
  ),

  check (
    length(btrim(instruction))
      between 1 and 10000
  ),

  check (
    priority between 1 and 10000
  )
);


-- ============================================================
-- 2. REGELS PER ONDERNEMING
-- ============================================================

create table if not exists
public.wize_organization_rules (
  id uuid primary key
    default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  rule_key text not null,

  category text not null,

  title text not null,

  instruction text not null,

  mode text not null
    default 'add'
    check (
      mode in (
        'add',
        'override',
        'deny'
      )
    ),

  priority integer not null
    default 100,

  enabled boolean not null
    default true,

  created_by uuid
    references public.profiles(id),

  updated_by uuid
    references public.profiles(id),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  unique (
    organization_id,
    rule_key
  ),

  check (
    length(btrim(rule_key))
      between 1 and 120
  ),

  check (
    length(btrim(category))
      between 1 and 80
  ),

  check (
    length(btrim(title))
      between 1 and 200
  ),

  check (
    length(btrim(instruction))
      between 1 and 10000
  ),

  check (
    priority between 1 and 10000
  )
);


-- ============================================================
-- 3. BEVOEGDHEDEN PER ONDERNEMING
--
-- Dit zijn functionele rechten van Wize.
--
-- Geen enkele instelling hier mag ooit:
-- - tenant-isolatie uitschakelen
-- - persoonlijke data ontsluiten
-- - RLS omzeilen
-- ============================================================

create table if not exists
public.wize_organization_capabilities (
  organization_id uuid primary key
    references public.organizations(id)
    on delete cascade,

  proactive_contact boolean
    not null default true,

  request_documents boolean
    not null default true,

  suggest_appointments boolean
    not null default true,

  explain_financials boolean
    not null default true,

  signal_overdue_invoices boolean
    not null default true,

  debtor_reminders boolean
    not null default false,

  suggest_bookings boolean
    not null default false,

  finalize_bookings boolean
    not null default false,

  submit_tax_returns boolean
    not null default false,

  initiate_payments boolean
    not null default false,

  updated_by uuid
    references public.profiles(id),

  updated_at timestamptz
    not null default now()
);


-- ============================================================
-- 4. INDEXEN
-- ============================================================

create index if not exists
wize_org_rules_org_priority_idx
on public.wize_organization_rules (
  organization_id,
  enabled,
  priority,
  rule_key
);


create index if not exists
wize_global_rules_priority_idx
on public.wize_global_rules (
  enabled,
  priority,
  rule_key
);


-- ============================================================
-- 5. RLS
-- ============================================================

alter table
public.wize_global_rules
enable row level security;

alter table
public.wize_organization_rules
enable row level security;

alter table
public.wize_organization_capabilities
enable row level security;


-- ============================================================
-- 6. DIRECTE TOEGANG HARDENEN
--
-- Portaal en Office gebruiken RPC's.
-- Geen directe browser writes.
-- ============================================================

revoke all
on public.wize_global_rules
from public, anon, authenticated;

revoke all
on public.wize_organization_rules
from public, anon, authenticated;

revoke all
on public.wize_organization_capabilities
from public, anon, authenticated;


-- ============================================================
-- 7. OFFICE-CONTROLE
-- ============================================================

create or replace function
public.wize_require_office_admin()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin

  v_user_id :=
    auth.uid();

  if v_user_id is null then
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
      message = 'Alleen Bestemd Office heeft toegang tot Wize-beheer.';
  end if;

  if not exists (
    select 1
    from public.office_memberships m

    join public.roles r
      on r.id = m.role_id

    join public.profiles p
      on p.id = m.user_id

    where
      m.user_id = v_user_id

      and m.status = 'active'

      and p.account_status = 'active'

      and r.scope = 'office'

      and r.code in (
        'owner',
        'admin',
        'accountant',
        'handler'
      )
  ) then

    raise exception using
      errcode = '42501',
      message = 'Geen rechten voor Wize-beheer.';

  end if;

  return v_user_id;

end;
$$;


revoke all
on function
public.wize_require_office_admin()
from public, anon;

grant execute
on function
public.wize_require_office_admin()
to authenticated;


-- ============================================================
-- 8. EFFECTIEF WIZE-BELEID OPHALEN
--
-- ZEER BELANGRIJK:
-- organisatie wordt opnieuw gecontroleerd.
--
-- Een klant kan dus niet:
-- wize_get_effective_policy(ANDERE_ORG)
--
-- uitvoeren.
-- ============================================================

create or replace function
public.wize_get_effective_policy(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_global_rules jsonb;

  v_org_rules jsonb;

  v_capabilities jsonb;
begin

  v_user_id :=
    auth.uid();

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Niet ingelogd.';
  end if;

  if not public.has_aal2() then
    raise exception using
      errcode = '42501',
      message = 'Tweestapsverificatie is vereist.';
  end if;


  -- ----------------------------------------------------------
  -- TENANT CHECK
  -- ----------------------------------------------------------

  if public.is_office_user() then

    perform
      public.wize_require_office_admin();

    if not exists (
      select 1
      from public.organizations o

      join public.customer_relationships c
        on c.id =
          o.customer_relationship_id

      where
        o.id =
          p_organization_id

        and o.archived_at is null

        and c.archived_at is null

        and c.status = 'active'
    ) then

      raise exception using
        errcode = '42501',
        message = 'Onderneming niet gevonden.';

    end if;

  else

    if not public.has_org_access(
      p_organization_id
    ) then

      raise exception using
        errcode = '42501',
        message = 'Geen toegang tot deze onderneming.';

    end if;

  end if;


  -- ----------------------------------------------------------
  -- ALGEMENE REGELS
  -- ----------------------------------------------------------

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key',
            r.rule_key,

          'category',
            r.category,

          'title',
            r.title,

          'instruction',
            r.instruction,

          'priority',
            r.priority
        )
        order by
          r.priority asc,
          r.rule_key asc
      ),
      '[]'::jsonb
    )
  into
    v_global_rules
  from
    public.wize_global_rules r
  where
    r.enabled = true;


  -- ----------------------------------------------------------
  -- ONDERNEMINGSREGELS
  -- ----------------------------------------------------------

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key',
            r.rule_key,

          'category',
            r.category,

          'title',
            r.title,

          'instruction',
            r.instruction,

          'mode',
            r.mode,

          'priority',
            r.priority
        )
        order by
          r.priority asc,
          r.rule_key asc
      ),
      '[]'::jsonb
    )
  into
    v_org_rules
  from
    public.wize_organization_rules r
  where
    r.organization_id =
      p_organization_id

    and r.enabled = true;


  -- ----------------------------------------------------------
  -- CAPABILITIES
  --
  -- Als nog niets is ingesteld gelden veilige defaults.
  -- ----------------------------------------------------------

  select
    jsonb_build_object(
      'proactiveContact',
        coalesce(
          c.proactive_contact,
          true
        ),

      'requestDocuments',
        coalesce(
          c.request_documents,
          true
        ),

      'suggestAppointments',
        coalesce(
          c.suggest_appointments,
          true
        ),

      'explainFinancials',
        coalesce(
          c.explain_financials,
          true
        ),

      'signalOverdueInvoices',
        coalesce(
          c.signal_overdue_invoices,
          true
        ),

      'debtorReminders',
        coalesce(
          c.debtor_reminders,
          false
        ),

      'suggestBookings',
        coalesce(
          c.suggest_bookings,
          false
        ),

      'finalizeBookings',
        coalesce(
          c.finalize_bookings,
          false
        ),

      'submitTaxReturns',
        coalesce(
          c.submit_tax_returns,
          false
        ),

      'initiatePayments',
        coalesce(
          c.initiate_payments,
          false
        )
    )
  into
    v_capabilities
  from (
    select
      p_organization_id
        as organization_id
  ) base

  left join
    public.wize_organization_capabilities c
      on c.organization_id =
        base.organization_id;


  -- ----------------------------------------------------------
  -- HARD SECURITY RULES
  --
  -- NIET AANPASBAAR VANUIT OFFICE.
  -- ----------------------------------------------------------

  return
    jsonb_build_object(
      'organizationId',
        p_organization_id,

      'hardSecurity',
        jsonb_build_object(
          'crossOrganizationAccess',
            false,

          'personalDataInBusinessScope',
            false,

          'databaseDirectAccessByModel',
            false,

          'serviceRoleForCustomerWize',
            false,

          'modelChoosesOrganization',
            false
        ),

      'globalRules',
        v_global_rules,

      'organizationRules',
        v_org_rules,

      'capabilities',
        v_capabilities
    );

end;
$$;


revoke all
on function
public.wize_get_effective_policy(uuid)
from public, anon;

grant execute
on function
public.wize_get_effective_policy(uuid)
to authenticated;


-- ============================================================
-- 9. ALGEMENE REGEL OPSLAAN
-- ============================================================

create or replace function
public.office_wize_upsert_global_rule(
  p_rule_key text,
  p_category text,
  p_title text,
  p_instruction text,
  p_priority integer default 100,
  p_enabled boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;

  v_id uuid;
begin

  v_actor :=
    public.wize_require_office_admin();


  if
    length(btrim(coalesce(p_rule_key, '')))
      not between 1 and 120

    or length(btrim(coalesce(p_category, '')))
      not between 1 and 80

    or length(btrim(coalesce(p_title, '')))
      not between 1 and 200

    or length(btrim(coalesce(p_instruction, '')))
      not between 1 and 10000

    or p_priority not between 1 and 10000
  then

    raise exception using
      errcode = '22023',
      message = 'Ongeldige Wize-regel.';

  end if;


  insert into
    public.wize_global_rules (
      rule_key,
      category,
      title,
      instruction,
      priority,
      enabled,
      created_by,
      updated_by
    )
  values (
    btrim(p_rule_key),
    btrim(p_category),
    btrim(p_title),
    btrim(p_instruction),
    p_priority,
    p_enabled,
    v_actor,
    v_actor
  )

  on conflict (
    rule_key
  )

  do update
  set
    category =
      excluded.category,

    title =
      excluded.title,

    instruction =
      excluded.instruction,

    priority =
      excluded.priority,

    enabled =
      excluded.enabled,

    updated_by =
      v_actor,

    updated_at =
      now()

  returning id
  into v_id;


  insert into
    public.audit_events (
      actor_id,
      action,
      object_type,
      object_id,
      result,
      metadata
    )
  values (
    v_actor,
    'wize.global_rule_saved',
    'wize_global_rule',
    v_id,
    'success',
    jsonb_build_object(
      'ruleKey',
        btrim(p_rule_key),

      'enabled',
        p_enabled
    )
  );


  return
    v_id;

end;
$$;


revoke all
on function
public.office_wize_upsert_global_rule(
  text,
  text,
  text,
  text,
  integer,
  boolean
)
from public, anon;

grant execute
on function
public.office_wize_upsert_global_rule(
  text,
  text,
  text,
  text,
  integer,
  boolean
)
to authenticated;


-- ============================================================
-- 10. ONDERNEMINGSREGEL OPSLAAN
-- ============================================================

create or replace function
public.office_wize_upsert_organization_rule(
  p_organization_id uuid,
  p_rule_key text,
  p_category text,
  p_title text,
  p_instruction text,
  p_mode text default 'add',
  p_priority integer default 100,
  p_enabled boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;

  v_id uuid;
begin

  v_actor :=
    public.wize_require_office_admin();


  if not exists (
    select 1
    from public.organizations o

    join public.customer_relationships c
      on c.id =
        o.customer_relationship_id

    where
      o.id =
        p_organization_id

      and o.archived_at is null

      and c.archived_at is null

      and c.status = 'active'
  ) then

    raise exception using
      errcode = '22023',
      message = 'Onderneming niet gevonden.';

  end if;


  if
    length(btrim(coalesce(p_rule_key, '')))
      not between 1 and 120

    or length(btrim(coalesce(p_category, '')))
      not between 1 and 80

    or length(btrim(coalesce(p_title, '')))
      not between 1 and 200

    or length(btrim(coalesce(p_instruction, '')))
      not between 1 and 10000

    or p_mode not in (
      'add',
      'override',
      'deny'
    )

    or p_priority not between 1 and 10000
  then

    raise exception using
      errcode = '22023',
      message = 'Ongeldige Wize-regel.';

  end if;


  insert into
    public.wize_organization_rules (
      organization_id,
      rule_key,
      category,
      title,
      instruction,
      mode,
      priority,
      enabled,
      created_by,
      updated_by
    )
  values (
    p_organization_id,
    btrim(p_rule_key),
    btrim(p_category),
    btrim(p_title),
    btrim(p_instruction),
    p_mode,
    p_priority,
    p_enabled,
    v_actor,
    v_actor
  )

  on conflict (
    organization_id,
    rule_key
  )

  do update
  set
    category =
      excluded.category,

    title =
      excluded.title,

    instruction =
      excluded.instruction,

    mode =
      excluded.mode,

    priority =
      excluded.priority,

    enabled =
      excluded.enabled,

    updated_by =
      v_actor,

    updated_at =
      now()

  returning id
  into v_id;


  insert into
    public.audit_events (
      actor_id,
      organization_id,
      action,
      object_type,
      object_id,
      result,
      metadata
    )
  values (
    v_actor,
    p_organization_id,
    'wize.organization_rule_saved',
    'wize_organization_rule',
    v_id,
    'success',
    jsonb_build_object(
      'ruleKey',
        btrim(p_rule_key),

      'mode',
        p_mode,

      'enabled',
        p_enabled
    )
  );


  return
    v_id;

end;
$$;


revoke all
on function
public.office_wize_upsert_organization_rule(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  boolean
)
from public, anon;

grant execute
on function
public.office_wize_upsert_organization_rule(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  boolean
)
to authenticated;


-- ============================================================
-- 11. CAPABILITIES INSTELLEN
-- ============================================================

create or replace function
public.office_wize_set_capabilities(
  p_organization_id uuid,
  p_proactive_contact boolean,
  p_request_documents boolean,
  p_suggest_appointments boolean,
  p_explain_financials boolean,
  p_signal_overdue_invoices boolean,
  p_debtor_reminders boolean,
  p_suggest_bookings boolean,
  p_finalize_bookings boolean,
  p_submit_tax_returns boolean,
  p_initiate_payments boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin

  v_actor :=
    public.wize_require_office_admin();


  if not exists (
    select 1
    from public.organizations o

    join public.customer_relationships c
      on c.id =
        o.customer_relationship_id

    where
      o.id =
        p_organization_id

      and o.archived_at is null

      and c.archived_at is null

      and c.status = 'active'
  ) then

    raise exception using
      errcode = '22023',
      message = 'Onderneming niet gevonden.';

  end if;


  insert into
    public.wize_organization_capabilities (
      organization_id,
      proactive_contact,
      request_documents,
      suggest_appointments,
      explain_financials,
      signal_overdue_invoices,
      debtor_reminders,
      suggest_bookings,
      finalize_bookings,
      submit_tax_returns,
      initiate_payments,
      updated_by,
      updated_at
    )
  values (
    p_organization_id,
    p_proactive_contact,
    p_request_documents,
    p_suggest_appointments,
    p_explain_financials,
    p_signal_overdue_invoices,
    p_debtor_reminders,
    p_suggest_bookings,
    p_finalize_bookings,
    p_submit_tax_returns,
    p_initiate_payments,
    v_actor,
    now()
  )

  on conflict (
    organization_id
  )

  do update
  set
    proactive_contact =
      excluded.proactive_contact,

    request_documents =
      excluded.request_documents,

    suggest_appointments =
      excluded.suggest_appointments,

    explain_financials =
      excluded.explain_financials,

    signal_overdue_invoices =
      excluded.signal_overdue_invoices,

    debtor_reminders =
      excluded.debtor_reminders,

    suggest_bookings =
      excluded.suggest_bookings,

    finalize_bookings =
      excluded.finalize_bookings,

    submit_tax_returns =
      excluded.submit_tax_returns,

    initiate_payments =
      excluded.initiate_payments,

    updated_by =
      v_actor,

    updated_at =
      now();


  insert into
    public.audit_events (
      actor_id,
      organization_id,
      action,
      object_type,
      object_id,
      result,
      metadata
    )
  values (
    v_actor,
    p_organization_id,
    'wize.capabilities_updated',
    'organization',
    p_organization_id,
    'success',
    jsonb_build_object(
      'proactiveContact',
        p_proactive_contact,

      'requestDocuments',
        p_request_documents,

      'suggestAppointments',
        p_suggest_appointments,

      'explainFinancials',
        p_explain_financials,

      'signalOverdueInvoices',
        p_signal_overdue_invoices,

      'debtorReminders',
        p_debtor_reminders,

      'suggestBookings',
        p_suggest_bookings,

      'finalizeBookings',
        p_finalize_bookings,

      'submitTaxReturns',
        p_submit_tax_returns,

      'initiatePayments',
        p_initiate_payments
    )
  );


  return
    public.wize_get_effective_policy(
      p_organization_id
    );

end;
$$;


revoke all
on function
public.office_wize_set_capabilities(
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
)
from public, anon;

grant execute
on function
public.office_wize_set_capabilities(
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
)
to authenticated;


-- ============================================================
-- 12. STARTREGELS BESTEMD
--
-- Dit is Wize-brede kennis/gedrag.
-- Kan later vanuit Office worden aangepast.
-- ============================================================

insert into
public.wize_global_rules (
  rule_key,
  category,
  title,
  instruction,
  priority,
  enabled
)
values

(
  'tone.human',
  'tone',
  'Menselijke toon',
  'Praat als een behulpzame en rustige collega. Schrijf warm, kort en duidelijk. Vermijd robotachtige systeemtaal.',
  10,
  true
),

(
  'tone.jij',
  'tone',
  'Jij-vorm',
  'Gebruik jij en jouw. Gebruik geen u of uw in communicatie met klanten.',
  11,
  true
),

(
  'tone.no_jargon',
  'tone',
  'Vermijd jargon',
  'Gebruik gewone taal wanneer dat kan. Als een vakterm nodig is, leg hem direct kort en begrijpelijk uit.',
  12,
  true
),

(
  'safety.no_guessing',
  'safety',
  'Niet gokken',
  'Als informatie onvoldoende betrouwbaar is, zeg dat duidelijk en laat Bestemd meekijken in plaats van een antwoord te verzinnen.',
  20,
  true
),

(
  'safety.tax_current',
  'safety',
  'Actuele fiscale kennis vereist',
  'Geef geen definitieve fiscale of wettelijke conclusie zonder gecontroleerde actuele kennis en geldigheidsdatum.',
  21,
  true
),

(
  'communication.human_handoff',
  'communication',
  'Menselijke overdracht',
  'Als een vraag onzeker, gevoelig of complex is, bied aan om Randy of Ed van Bestemd in hetzelfde gesprek te laten meekijken.',
  30,
  true
),

(
  'admin.documents',
  'administration',
  'Ontbrekende documenten',
  'Wanneer een zakelijke uitgaande bankbetaling niet voldoende kan worden gekoppeld en een document ontbreekt, mag Wize vriendelijk om de factuur of bon vragen.',
  40,
  true
),

(
  'appointments.yearly',
  'appointments',
  'Vier gesprekken per jaar',
  'Bestemd werkt met vier periodieke gesprekken per jaar: drie gesprekken van ongeveer 30 minuten en één uitgebreid gesprek van ongeveer 60 minuten waarin het gehele plaatje opnieuw wordt doorgenomen.',
  50,
  true
)

on conflict (
  rule_key
)

do nothing;


commit;
