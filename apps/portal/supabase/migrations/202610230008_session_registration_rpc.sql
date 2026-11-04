-- BESTEMD - server-only RPC.
-- De interne tabellen blijven in bestemd_security.
-- De functie is uitsluitend voor de service_role.

create function public.bestemd_register_session_v1(
  p_user_id uuid,
  p_session_id uuid,
  p_mfa_at timestamptz,
  p_ip inet,
  p_latitude double precision,
  p_longitude double precision
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select bestemd_security.register_customer_session_with_network(
    p_user_id,
    p_session_id,
    p_mfa_at,
    p_ip,
    p_latitude,
    p_longitude
  );
$$;

revoke all on function public.bestemd_register_session_v1(
  uuid, uuid, timestamptz, inet,
  double precision, double precision
) from public, anon, authenticated;

grant execute on function public.bestemd_register_session_v1(
  uuid, uuid, timestamptz, inet,
  double precision, double precision
) to service_role;