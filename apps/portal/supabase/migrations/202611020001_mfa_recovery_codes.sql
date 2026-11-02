-- BESTEMD: MFA-herstelcodes
-- Deze migratie verleent geen toegang tot financiÃƒÂ«le gegevens.

create table if not exists public.mfa_recovery_codes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    code_hash text not null,
    created_at timestamptz not null default now(),
    used_at timestamptz,
    revoked_at timestamptz
);

create index if not exists mfa_recovery_codes_user_idx
    on public.mfa_recovery_codes(user_id);

create unique index if not exists mfa_recovery_codes_hash_idx
    on public.mfa_recovery_codes(code_hash);

alter table public.mfa_recovery_codes
    enable row level security;

-- Geen directe toegang voor gewone gebruikers.
-- Herstelcodes worden uitsluitend via gecontroleerde
-- serverfuncties beheerd.

revoke all on public.mfa_recovery_codes
    from anon, authenticated;

comment on table public.mfa_recovery_codes is
    'Eenmalige MFA-herstelcodes. Alleen hashes opslaan; geen directe klanttoegang.';
-- Opslaan van acht herstelcode-hashes.
-- Alleen aanroepbaar via een vertrouwde server.

create or replace function public.store_mfa_recovery_codes(
    p_user_id uuid,
    p_hashes text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_count integer;
begin
    if auth.role() is distinct from 'service_role' then
        raise exception 'Niet toegestaan.';
    end if;

    if p_user_id is null
       or p_hashes is null
       or array_length(p_hashes, 1) is distinct from 8 then
        raise exception 'Ongeldige herstelcodes.';
    end if;

    if exists (
        select 1
        from unnest(p_hashes) as h
        where h is null or h !~ '^[a-f0-9]{64}$'
    ) then
        raise exception 'Ongeldige hash.';
    end if;

    select count(distinct h)
    into v_count
    from unnest(p_hashes) as h;

    if v_count <> 8 then
        raise exception 'Herstelcodes moeten uniek zijn.';
    end if;

    -- Voorkom gelijktijdige uitgifte voor dezelfde gebruiker.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );

    -- Een eerste set mag slechts eenmaal worden uitgegeven.
    -- Nieuwe sets vereisen later een afzonderlijke,
    -- expliciet beveiligde rotatieprocedure.
    if exists (
        select 1
        from public.mfa_recovery_codes
        where user_id = p_user_id
    ) then
        raise exception 'Herstelcodes zijn al eerder uitgegeven.';
    end if;

    insert into public.mfa_recovery_codes (
        user_id,
        code_hash
    )
    select p_user_id, h
    from unnest(p_hashes) as h;
end;
$$;

revoke all on function public.store_mfa_recovery_codes(uuid, text[])
from public, anon, authenticated;

grant execute on function public.store_mfa_recovery_codes(uuid, text[])
to service_role;