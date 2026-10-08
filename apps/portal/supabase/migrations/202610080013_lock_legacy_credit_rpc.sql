begin;

-- ============================================================
-- BESTEMD
-- Oude niet-idempotente credit-RPC afsluiten
--
-- De 4-parameterfunctie blijft intern bestaan omdat de nieuwe
-- 5-parameter idempotente wrapper deze gebruikt.
-- Externe authenticated clients mogen hem niet rechtstreeks
-- uitvoeren.
-- ============================================================

revoke all
on function public.office_create_credit_invoice(
  uuid,
  uuid,
  text,
  bigint
)
from public, anon, authenticated;

-- Alleen de idempotente 5-parameterfunctie blijft beschikbaar
-- voor ingelogde Office-gebruikers.

revoke all
on function public.office_create_credit_invoice(
  uuid,
  uuid,
  text,
  bigint,
  uuid
)
from public, anon;

grant execute
on function public.office_create_credit_invoice(
  uuid,
  uuid,
  text,
  bigint,
  uuid
)
to authenticated;

commit;
