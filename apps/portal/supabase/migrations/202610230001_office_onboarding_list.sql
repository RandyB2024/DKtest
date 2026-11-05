begin;

-- Alleen geautoriseerde Office-beheerders met actuele MFA kunnen
-- aanvragen en de bijbehorende ondernemingen bekijken.
create function public.office_list_onboarding_applications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_actor uuid;
    v_result jsonb;
begin
    v_actor := public.office_cm_actor();

    if not public.is_office_user()
       or not public.has_aal2()
       or not exists (
           select 1
           from public.office_memberships m
           join public.roles r on r.id = m.role_id
           where m.user_id = v_actor
             and m.status = 'active'
             and r.scope = 'office'
             and r.code in ('owner', 'admin')
       )
    then
        raise exception 'Geen toestemming.'
            using errcode = '42501';
    end if;

    select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
            'application_id', x.id,
            'relationship_id', x.customer_relationship_id,
            'relationship_name', x.relationship_name,
            'status', x.status,
            'applicant_name', x.applicant_data->>'name',
            'applicant_email', x.applicant_data->>'email',
            'created_at', x.created_at,
            'updated_at', x.updated_at,
            'companies', x.companies
        ) order by x.created_at desc, x.id desc
    ), '[]'::jsonb)
    into v_result
    from (
        select a.id,
               a.customer_relationship_id,
               r.name as relationship_name,
               a.status,
               a.applicant_data,
               a.created_at,
               a.updated_at,
               (
                   select coalesce(pg_catalog.jsonb_agg(
                       pg_catalog.jsonb_build_object(
                           'id', c.id,
                           'organization_id', c.organization_id,
                           'name', c.company_data->>'name',
                           'position', c.position,
                           'documents_complete', c.documents_complete
                       ) order by c.position
                   ), '[]'::jsonb)
                   from public.office_onboarding_companies c
                   where c.application_id = a.id
               ) as companies
        from public.office_onboarding_applications a
        join public.customer_relationships r
          on r.id = a.customer_relationship_id
        where r.archived_at is null
        order by a.created_at desc, a.id desc
        limit 100
    ) x;

    return v_result;
end;
$$;

revoke all on function public.office_list_onboarding_applications()
from public, anon, authenticated;

grant execute on function public.office_list_onboarding_applications()
to authenticated;

commit;
