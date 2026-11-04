-- BESTEMD login attempt reservation.
-- Prevent concurrent password checks from bypassing the lockout.

create table if not exists bestemd_security.login_attempt_reservations (
    reservation_id uuid primary key default gen_random_uuid(),
    account_key text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '30 seconds'),
    completed_at timestamptz,
    success boolean
);

create index if not exists login_attempt_reservations_account_idx
on bestemd_security.login_attempt_reservations(account_key, expires_at);

revoke all on bestemd_security.login_attempt_reservations
from public, anon, authenticated;

create or replace function public.bestemd_login_reserve_v1(
    p_account_key text
)
returns table (
    reservation_id uuid,
    allowed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_key text;
    v_locked boolean;
    v_pending integer;
    v_id uuid;
begin
    if auth.role() is distinct from 'service_role' then
        raise exception 'Not authorized';
    end if;

    if p_account_key is null
       or length(btrim(p_account_key)) < 1
       or length(p_account_key) > 254 then
        raise exception 'Invalid account key';
    end if;

    v_key := lower(btrim(p_account_key));

    perform pg_advisory_xact_lock(
        hashtextextended(v_key, 918274)
    );

    select public.bestemd_login_lockout_check_v1(v_key)
    into v_locked;

    if v_locked then
        return query select null::uuid, false;
        return;
    end if;

    select count(*)
    into v_pending
    from bestemd_security.login_attempt_reservations r
    where r.account_key = v_key
      and r.completed_at is null
      and r.expires_at > clock_timestamp();

    if v_pending >= 1 then
        return query select null::uuid, false;
        return;
    end if;

    insert into bestemd_security.login_attempt_reservations (
        account_key
    )
    values (v_key)
    returning login_attempt_reservations.reservation_id
    into v_id;

    return query select v_id, true;
end;
$$;

revoke all on function public.bestemd_login_reserve_v1(text)
from public, anon, authenticated;

grant execute on function public.bestemd_login_reserve_v1(text)
to service_role;