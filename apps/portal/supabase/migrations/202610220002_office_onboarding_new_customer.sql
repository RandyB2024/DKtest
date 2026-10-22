begin;

create function public.office_create_onboarding_new_customer(
    p_customer_name text,
    p_company_name text,
    p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor uuid;
    v_customer_name text := pg_catalog.btrim(p_customer_name);
    v_company_name text := pg_catalog.btrim(p_company_name);
    v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
    v_relationship jsonb;
    v_draft jsonb;
begin
    -- Gebruik de bestaande beveiligde Office-autorisatie.
    v_actor := public.office_cm_actor();

    if v_customer_name is null
       or pg_catalog.length(v_customer_name) not between 1 and 200
       or v_company_name is null
       or pg_catalog.length(v_company_name) not between 1 and 200
       or v_email is null
       or pg_catalog.length(v_email) > 254
       or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then
        raise exception 'Ongeldige aanvraaggegevens.'
            using errcode = '22023';
    end if;

    -- Voorkom gelijktijdige concepten voor hetzelfde e-mailadres.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_email, 0)
    );

    if exists (
        select 1
        from public.office_onboarding_applications a
        join public.customer_relationships r
          on r.id = a.customer_relationship_id
        where r.archived_at is null
          and a.status in (
              'draft',
              'invited',
              'in_progress',
              'submitted',
              'under_review'
          )
          and a.applicant_data->>'email' = v_email
    ) then
        raise exception 'Er bestaat al een lopende aanvraag.'
            using errcode = '23505';
    end if;

    -- Maak de klantrelatie voorlopig inactief.
    -- Deze bestaande functie schrijft ook de vereiste auditregistratie.
    v_relationship := public.office_create_relationship(
        pg_catalog.jsonb_build_object(
            'name', v_customer_name,
            'status', 'inactive'
        )
    );

    -- Leg de onderneming uitsluitend vast als onboardingconcept.
    v_draft := public.office_create_onboarding_draft(
        (v_relationship->>'relationship_id')::uuid,
        v_customer_name,
        v_company_name,
        v_email
    );

    return pg_catalog.jsonb_build_object(
        'relationship_id', v_relationship->>'relationship_id',
        'application_id', v_draft->>'application_id',
        'status', 'draft',
        'email_sent', false
    );
end;
$$;

revoke all on function
    public.office_create_onboarding_new_customer(text, text, text)
from public, anon, authenticated;

grant execute on function
    public.office_create_onboarding_new_customer(text, text, text)
to authenticated;

commit;