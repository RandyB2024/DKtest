begin;

create or replace function public.office_create_onboarding_draft(
    p_relationship_id uuid,
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
    v_user_id uuid := auth.uid();
    v_application_id uuid;
    v_existing_id uuid;
    v_email text := lower(btrim(p_email));
    v_customer_name text := btrim(p_customer_name);
    v_company_name text := btrim(p_company_name);
begin
    if v_user_id is null
       or not public.is_office_user()
       or not public.has_aal2()
       or not exists (
           select 1
           from public.office_memberships m
           join public.roles r on r.id = m.role_id
           where m.user_id = v_user_id
             and m.status = 'active'
             and r.scope = 'office'
             and r.code in ('owner', 'admin')
       )
    then
        raise exception 'Geen toestemming.'
            using errcode = '42501';
    end if;

    if p_relationship_id is null
       or v_customer_name is null
       or length(v_customer_name) not between 1 and 200
       or v_company_name is null
       or length(v_company_name) not between 1 and 200
       or v_email is null
       or length(v_email) > 254
       or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then
        raise exception 'Ongeldige aanvraaggegevens.'
            using errcode = '22023';
    end if;

    -- Serialiseer aanvragen voor dezelfde klantrelatie.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_relationship_id::text, 0)
    );

    if not exists (
        select 1
        from public.customer_relationships
        where id = p_relationship_id
          and archived_at is null
    ) then
        raise exception 'Klantrelatie niet gevonden.'
            using errcode = 'P0002';
    end if;

    select id into v_existing_id
    from public.office_onboarding_applications
    where customer_relationship_id = p_relationship_id
      and status in ('draft', 'invited', 'in_progress',
                     'submitted', 'under_review')
    order by created_at desc
    limit 1;

    if v_existing_id is not null then
        raise exception 'Er bestaat al een lopende aanvraag.'
            using errcode = '23505';
    end if;

    insert into public.office_onboarding_applications (
        customer_relationship_id,
        status,
        applicant_data
    )
    values (
        p_relationship_id,
        'draft',
        pg_catalog.jsonb_build_object(
            'name', v_customer_name,
            'email', v_email
        )
    )
    returning id into v_application_id;

    insert into public.office_onboarding_companies (
        application_id,
        position,
        company_data
    )
    values (
        v_application_id,
        1,
        pg_catalog.jsonb_build_object(
            'name', v_company_name
        )
    );

    return pg_catalog.jsonb_build_object(
        'application_id', v_application_id,
        'status', 'draft'
    );
end;
$$;

revoke all on function public.office_create_onboarding_draft(
    uuid, text, text, text
) from public, anon, authenticated;

grant execute on function public.office_create_onboarding_draft(
    uuid, text, text, text
) to authenticated;

commit;