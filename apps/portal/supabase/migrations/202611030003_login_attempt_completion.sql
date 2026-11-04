-- BESTEMD: complete a reserved login attempt exactly once.

create or replace function public.bestemd_login_complete_v1(
    p_reservation_id uuid,
    p_success boolean
)
returns table (
    accepted boolean,
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
    v_row bestemd_security.login_attempt_reservations%rowtype;
    v_result record;
begin
    if auth.role() is distinct from 'service_role' then
        raise exception 'Not authorized';
    end if;

    if p_reservation_id is null or p_success is null then
        raise exception 'Invalid completion request';
    end if;

    select r.account_key
    into v_key
    from bestemd_security.login_attempt_reservations r
    where r.reservation_id = p_reservation_id;

    if v_key is null then
        return query select
            false, false, 0, null::timestamptz;
        return;
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(v_key, 918274)
    );

    select *
    into v_row
    from bestemd_security.login_attempt_reservations r
    where r.reservation_id = p_reservation_id
    for update;

    if not found
       or v_row.completed_at is not null
       or v_row.expires_at <= clock_timestamp() then
        return query select
            false, false, 0, null::timestamptz;
        return;
    end if;

    update bestemd_security.login_attempt_reservations r
    set completed_at = clock_timestamp(),
        success = p_success
    where r.reservation_id = p_reservation_id;

    select *
    into v_result
    from public.bestemd_login_lockout_record_v1(
        v_row.account_key,
        p_success
    );

    return query select
        true,
        v_result.is_locked,
        v_result.attempts,
        v_result.lock_expires_at;
end;
$$;

revoke all on function public.bestemd_login_complete_v1(uuid, boolean)
from public, anon, authenticated;

grant execute on function public.bestemd_login_complete_v1(uuid, boolean)
to service_role;