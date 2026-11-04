-- BESTEMD: proef-RLS voor debiteuren.
-- Niet toepassen op productie voordat registratie, herstel en
-- alle overige beschermde gegevens zijn gevalideerd.

create policy debtors_customer_session_guard
on public.debtors
as restrictive
for all
to authenticated
using (
  public.is_office_user()
  or public.customer_session_allowed()
)
with check (
  public.is_office_user()
  or public.customer_session_allowed()
);