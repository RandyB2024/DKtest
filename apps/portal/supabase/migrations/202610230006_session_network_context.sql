-- BESTEMD: vertrouwde netwerkcontext per sessie.
-- Alleen lokaal testen. Nog niet naar productie.

alter table bestemd_security.customer_sessions
  add column verified_ip inet,
  add column verified_latitude double precision,
  add column verified_longitude double precision,
  add column verified_location_at timestamptz;

alter table bestemd_security.customer_sessions
  add constraint verified_location_coordinates_check
  check (
    (verified_latitude is null and verified_longitude is null)
    or
    (
      verified_latitude between -90 and 90
      and verified_longitude between -180 and 180
    )
  );

-- De oudere herstelfunctie mag de nieuwe netwerkcontrole
-- niet omzeilen via de normale serverrol.
revoke execute on function
  bestemd_security.complete_session_reverification(
    uuid, uuid, timestamptz
  )
from service_role;

create function bestemd_security.complete_network_reverification(
  p_user_id uuid,
  p_session_id uuid,
  p_new_mfa_at timestamptz,
  p_verified_ip inet,
  p_latitude double precision,
  p_longitude double precision
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_user_id is null
     or p_session_id is null
     or p_verified_ip is null
     or p_new_mfa_at is null
     or p_new_mfa_at > now()
     or p_new_mfa_at < now() - interval '5 minutes'
     or (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and not (p_latitude between -90 and 90))
     or (p_longitude is not null and not (p_longitude between -180 and 180))
  then
    return false;
  end if;

  update bestemd_security.customer_sessions
  set risk_status = 'active',
      mfa_verified_at = p_new_mfa_at,
      verified_ip = p_verified_ip,
      verified_latitude = p_latitude,
      verified_longitude = p_longitude,
      verified_location_at =
        case when p_latitude is not null then now() else null end,
      updated_at = now()
  where user_id = p_user_id
    and session_id = p_session_id
    and risk_status = 'reverify'
    and revoked_at is null
    and p_new_mfa_at > mfa_verified_at;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function
  bestemd_security.complete_network_reverification(
    uuid, uuid, timestamptz, inet, double precision, double precision
  )
from public, anon, authenticated;

grant select (
  verified_ip, verified_latitude, verified_longitude,
  verified_location_at
) on bestemd_security.customer_sessions to service_role;

grant update (
  risk_status, mfa_verified_at, verified_ip,
  verified_latitude, verified_longitude,
  verified_location_at, updated_at
) on bestemd_security.customer_sessions to service_role;

grant execute on function
  bestemd_security.complete_network_reverification(
    uuid, uuid, timestamptz, inet, double precision, double precision
  )
to service_role;