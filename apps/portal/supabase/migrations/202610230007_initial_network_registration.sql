-- BESTEMD: eerste MFA-registratie inclusief netwerkcontext.
-- Alleen voor lokale tests. Nog niet deployen.

revoke execute on function
  bestemd_security.register_customer_session(
    uuid, uuid, timestamptz
  )
from service_role;

create function bestemd_security.register_customer_session_with_network(
  p_user_id uuid,
  p_session_id uuid,
  p_mfa_at timestamptz,
  p_ip inet,
  p_latitude double precision,
  p_longitude double precision
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_created integer;
begin
  if p_user_id is null
     or p_session_id is null
     or p_ip is null
     or p_mfa_at is null
     or p_mfa_at > now()
     or p_mfa_at <= now() - interval '24 hours'
     or (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and not (p_latitude between -90 and 90))
     or (p_longitude is not null and not (p_longitude between -180 and 180))
  then
    return false;
  end if;

  insert into bestemd_security.customer_sessions (
    user_id,
    session_id,
    mfa_verified_at,
    verified_ip,
    verified_latitude,
    verified_longitude,
    verified_location_at,
    risk_status
  )
  values (
    p_user_id,
    p_session_id,
    p_mfa_at,
    p_ip,
    p_latitude,
    p_longitude,
    case when p_latitude is not null then now() else null end,
    'active'
  )
  on conflict (session_id) do nothing;

  get diagnostics v_created = row_count;
  return v_created = 1;
end;
$$;

revoke all on function
  bestemd_security.register_customer_session_with_network(
    uuid, uuid, timestamptz, inet,
    double precision, double precision
  )
from public, anon, authenticated;

grant insert (
  user_id, session_id, mfa_verified_at,
  verified_ip, verified_latitude, verified_longitude,
  verified_location_at, risk_status
)
on bestemd_security.customer_sessions to service_role;

grant execute on function
  bestemd_security.register_customer_session_with_network(
    uuid, uuid, timestamptz, inet,
    double precision, double precision
  )
to service_role;