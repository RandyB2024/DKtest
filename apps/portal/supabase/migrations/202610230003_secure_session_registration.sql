-- BESTEMD: private, eenmalige sessieregistratie.
-- Niet uitrollen voordat de vertrouwde backend is aangesloten.
--
-- Alleen een geprivilegieerde serverrol kan deze functie uitvoeren.
-- Gebruik nooit klantinput als geverifieerde identiteit of MFA-tijd.

create or replace function bestemd_security.register_customer_session(
  p_user_id uuid,
  p_session_id uuid,
  p_mfa_verified_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_user_id is null
     or p_session_id is null
     or p_mfa_verified_at is null
     or p_mfa_verified_at > now()
     or p_mfa_verified_at <= now() - interval '24 hours'
  then
    return false;
  end if;

  insert into bestemd_security.customer_sessions (
    user_id,
    session_id,
    mfa_verified_at,
    risk_status
  )
  values (
    p_user_id,
    p_session_id,
    p_mfa_verified_at,
    'active'
  )
  on conflict (session_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- Alleen een werkelijk nieuwe sessie is geregistreerd.
  -- Bestaande rijen worden nooit aangepast.
  return v_inserted = 1;
end;
$$;

revoke all on function bestemd_security.register_customer_session(
  uuid, uuid, timestamptz
) from public, anon, authenticated;

grant usage on schema bestemd_security to service_role;

-- Alleen de vertrouwde serverrol mag nieuwe sessies registreren.
-- Geen UPDATE of DELETE via deze registratiefunctie.
grant select, insert
on bestemd_security.customer_sessions
to service_role;

grant execute on function bestemd_security.register_customer_session(
  uuid, uuid, timestamptz
) to service_role;