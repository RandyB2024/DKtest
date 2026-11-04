-- BESTEMD account lockout
-- Three failed passwords within fifteen minutes.
-- Fifteen-minute lockout after the third failure.
--
-- This migration is not applied automatically.
-- Only a trusted server-side database role may execute these functions.

create schema if not exists bestemd_security;

create table if not exists bestemd_security.login_account_lockouts (
    account_key text primary key,
    failed_attempts integer not null default 0,
    first_failed_at timestamptz,
    locked_until timestamptz,
    updated_at timestamptz not null default now(),

    constraint login_failed_attempts_valid
        check (failed_attempts between 0 and 3)
);

revoke all on bestemd_security.login_account_lockouts
from public, anon, authenticated;

grant usage on schema bestemd_security to service_role;

create or replace function public.bestemd_login_lockout_check_v1(
    p_account_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_locked_until timestamptz;
begin
    if auth.role() is distinct from 'service_role' then
        raise exception 'Not authorized';
    end if;

    if p_account_key is null
       or length(p_account_key) < 1
       or length(p_account_key) > 254 then
        raise exception 'Invalid account key';
    end if;

    select locked_until
    into v_locked_until
    from bestemd_security.login_account_lockouts
    where account_key = lower(btrim(p_account_key));

    return v_locked_until is not null
       and v_locked_until > clock_timestamp();
end;
$$;

revoke all on function public.bestemd_login_lockout_check_v1(text)
from public, anon, authenticated;

grant execute on function public.bestemd_login_lockout_check_v1(text)
to service_role;

create or replace function public.bestemd_login_lockout_record_v1(
    p_account_key text,
    p_success boolean
)
returns table (
    is_locked boolean,
    attempts integer,
    lock_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_key text;
    v_now timestamptz;
    v_row bestemd_security.login_account_lockouts%rowtype;
begin
    if auth.role() is distinct from 'service_role' then
        raise exception 'Not authorized';
    end if;

    if p_account_key is null
       or length(p_account_key) < 1
       or length(p_account_key) > 254
       or p_success is null then
        raise exception 'Invalid lockout request';
    end if;

    v_key := lower(btrim(p_account_key));

    -- Serialize updates for the same account, including first insert.
    perform pg_advisory_xact_lock(
        hashtextextended(v_key, 918274)
    );

    v_now := clock_timestamp();

    insert into bestemd_security.login_account_lockouts (
        account_key
    )
    values (v_key)
    on conflict (account_key) do nothing;

    select *
    into v_row
    from bestemd_security.login_account_lockouts
    where account_key = v_key
    for update;

    -- A successful password check must not override an active lock.
    if v_row.locked_until is not null
       and v_row.locked_until > v_now then
        return query select
            true,
            v_row.failed_attempts,
            v_row.locked_until;
        return;
    end if;

    if p_success then
        update bestemd_security.login_account_lockouts
        set failed_attempts = 0,
            first_failed_at = null,
            locked_until = null,
            updated_at = v_now
        where account_key = v_key;

        return query select false, 0, null::timestamptz;
        return;
    end if;

    if v_row.first_failed_at is null
       or v_row.first_failed_at <= v_now - interval '15 minutes'
       or v_row.locked_until is not null then

        v_row.failed_attempts := 1;
        v_row.first_failed_at := v_now;
        v_row.locked_until := null;
    else
        v_row.failed_attempts := v_row.failed_attempts + 1;
    end if;

    if v_row.failed_attempts >= 3 then
        v_row.failed_attempts := 3;
        v_row.locked_until := v_now + interval '15 minutes';
    end if;

    update bestemd_security.login_account_lockouts
    set failed_attempts = v_row.failed_attempts,
        first_failed_at = v_row.first_failed_at,
        locked_until = v_row.locked_until,
        updated_at = v_now
    where account_key = v_key;

    return query select
        v_row.locked_until is not null,
        v_row.failed_attempts,
        v_row.locked_until;
end;
$$;

revoke all on function public.bestemd_login_lockout_record_v1(text, boolean)
from public, anon, authenticated;

grant execute on function public.bestemd_login_lockout_record_v1(text, boolean)
to service_role;