-- BESTEMD: beperkte herverificatie van klantensessies.
-- Alleen aanroepen vanuit een vertrouwde backend na
-- onafhankelijk geverifieerde, nieuwe TOTP-challenge.
-- NIET rechtstreeks als klant-RPC aanbieden.
-- NIET uitrollen voordat de volledige flow is getest.

create or replace function bestemd_security.complete_session_reverification(
  p_user_id uuid,
  p_session_id uuid,
  p_new_mfa_verified_at timestamptz
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
     or p_new_mfa_verified_at is null
     or p_new_mfa_verified_at > now()
     or p_new_mfa_verified_at < now() - interval '5 minutes'
  then
    return false;
  end if;

  update bestemd_security.customer_sessions
  set risk_status = 'active',
      mfa_verified_at = p_new_mfa_verified_at,
      updated_at = now()
  where user_id = p_user_id
    and session_id = p_session_id
    and risk_status = 'reverify'
    and revoked_at is null
    and p_new_mfa_verified_at > mfa_verified_at;

  get diagnostics v_updated = row_count;

  return v_updated = 1;
end;
$$;

revoke all on function
  bestemd_security.complete_session_reverification(
    uuid, uuid, timestamptz
  )
from public, anon, authenticated;

grant usage on schema bestemd_security to service_role;

grant update (risk_status, mfa_verified_at, updated_at)
on bestemd_security.customer_sessions
to service_role;

grant execute on function
  bestemd_security.complete_session_reverification(
    uuid, uuid, timestamptz
  )
to service_role;