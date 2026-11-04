-- BESTEMD - monotonische sessierisico-status
-- Niet toepassen op productie zonder backendintegratie.
--
-- De functie mag alleen de beveiliging aanscherpen:
-- active -> reverify -> blocked
-- active -> blocked
-- blocked blijft blocked
-- revoked blijft revoked

create or replace function bestemd_security.apply_session_risk(
  p_user_id uuid,
  p_session_id uuid,
  p_decision text
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
     or p_decision not in ('reauthenticate', 'block')
  then
    return false;
  end if;

  update bestemd_security.customer_sessions
  set risk_status =
    case
      when p_decision = 'block' then 'blocked'
      else 'reverify'
    end,
    updated_at = now()
  where session_id = p_session_id
    and user_id = p_user_id
    and revoked_at is null
    and (
      (p_decision = 'reauthenticate' and risk_status = 'active')
      or
      (p_decision = 'block' and risk_status in ('active', 'reverify'))
    );

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function bestemd_security.apply_session_risk(
  uuid, uuid, text
) from public, anon, authenticated;

grant usage on schema bestemd_security to service_role;

grant update (risk_status, updated_at)
on bestemd_security.customer_sessions
to service_role;

grant execute on function bestemd_security.apply_session_risk(
  uuid, uuid, text
) to service_role;