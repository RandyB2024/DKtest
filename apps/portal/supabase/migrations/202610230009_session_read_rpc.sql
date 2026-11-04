-- BESTEMD: interne sessieleesfunctie.
-- Nog NIET uitvoeren op productie.
-- Alleen de vertrouwde serverrol mag deze RPC aanroepen.

begin;

create function public.bestemd_read_session_v1(
  p_user_id uuid,
  p_session_id uuid
)
returns table (
  user_id uuid,
  session_id uuid,
  mfa_verified_at timestamptz,
  risk_status text,
  revoked_at timestamptz,
  verified_ip inet,
  verified_latitude double precision,
  verified_longitude double precision,
  verified_location_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.user_id,
    s.session_id,
    s.mfa_verified_at,
    s.risk_status,
    s.revoked_at,
    s.verified_ip,
    s.verified_latitude,
    s.verified_longitude,
    s.verified_location_at
  from bestemd_security.customer_sessions s
  where s.user_id = p_user_id
    and s.session_id = p_session_id;
$$;

revoke all on function public.bestemd_read_session_v1(
  uuid, uuid
) from public, anon, authenticated;

grant execute on function public.bestemd_read_session_v1(
  uuid, uuid
) to service_role;

commit;