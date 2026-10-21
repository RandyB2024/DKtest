begin;

-- Een aanvraag hoort bij een bestaande klantrelatie.
create table public.office_onboarding_applications (
    id uuid primary key default gen_random_uuid(),
    customer_relationship_id uuid not null
        references public.customer_relationships(id),
    status text not null default 'draft'
        check (status in (
            'draft',
            'invited',
            'in_progress',
            'submitted',
            'under_review',
            'approved',
            'rejected'
        )),
    applicant_data jsonb not null default '{}'::jsonb
        check (jsonb_typeof(applicant_data) = 'object'),
    submitted_at timestamptz,
    reviewed_at timestamptz,
    reviewed_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Meerdere ondernemingen binnen dezelfde aanvraag.
create table public.office_onboarding_companies (
    id uuid primary key default gen_random_uuid(),
    application_id uuid not null
        references public.office_onboarding_applications(id)
        on delete cascade,
    organization_id uuid
        references public.organizations(id),
    position integer not null check (position > 0),
    company_data jsonb not null default '{}'::jsonb
        check (jsonb_typeof(company_data) = 'object'),
    documents_complete boolean not null default false,
    created_at timestamptz not null default now(),
    unique (application_id, position)
);

-- Persoonlijke uitnodigingen.
-- Alleen de hash van het uitnodigingstoken wordt opgeslagen.
create table public.office_onboarding_invites (
    id uuid primary key default gen_random_uuid(),
    application_id uuid not null
        references public.office_onboarding_applications(id)
        on delete cascade,
    email text not null,
    token_hash text not null unique
        check (token_hash ~ '^[a-f0-9]{64}$'),
    expires_at timestamptz not null,
    used_at timestamptz,
    revoked_at timestamptz,
    created_by uuid not null
        references public.profiles(id),
    created_at timestamptz not null default now()
);

create index office_onboarding_applications_relationship_idx
    on public.office_onboarding_applications(customer_relationship_id);

create index office_onboarding_companies_application_idx
    on public.office_onboarding_companies(application_id);

create index office_onboarding_invites_application_idx
    on public.office_onboarding_invites(application_id);

-- Geen directe toegang vanuit browseraccounts.
alter table public.office_onboarding_applications
    enable row level security;

alter table public.office_onboarding_companies
    enable row level security;

alter table public.office_onboarding_invites
    enable row level security;

revoke all on public.office_onboarding_applications
    from public, anon, authenticated;

revoke all on public.office_onboarding_companies
    from public, anon, authenticated;

revoke all on public.office_onboarding_invites
    from public, anon, authenticated;

-- Servertoegang blijft mogelijk via een beveiligde backend.
grant select, insert, update, delete
    on public.office_onboarding_applications,
       public.office_onboarding_companies,
       public.office_onboarding_invites
    to service_role;

-- Controleer dat een gekoppelde onderneming bij dezelfde klantrelatie hoort.
create function public.office_onboarding_validate_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    expected_relationship uuid;
begin
    if new.organization_id is null then
        return new;
    end if;

    select customer_relationship_id
    into expected_relationship
    from public.office_onboarding_applications
    where id = new.application_id;

    if not exists (
        select 1
        from public.organizations o
        where o.id = new.organization_id
          and o.customer_relationship_id = expected_relationship
          and o.archived_at is null
    ) then
        raise exception
            'Onderneming behoort niet tot deze klantrelatie.'
            using errcode = '23514';
    end if;

    return new;
end;
$$;

create trigger office_onboarding_company_relationship_check
before insert or update of application_id, organization_id
on public.office_onboarding_companies
for each row
execute function public.office_onboarding_validate_company();
commit;
