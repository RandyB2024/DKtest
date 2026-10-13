-- ============================================================
-- WIZE APPOINTMENT SEQUENCE FIX
--
-- Een geannuleerde/no-show afspraak mag het gespreknummer
-- niet blijvend blokkeren.
--
-- Alleen planned/completed reserveren een sequence_number.
-- ============================================================

begin;


alter table
public.wize_appointments
drop constraint if exists
wize_appointments_organization_id_calendar_year_sequence_number_key;


create unique index if not exists
wize_appointments_active_sequence_unique
on public.wize_appointments (
  organization_id,
  calendar_year,
  sequence_number
)
where
  status in (
    'planned',
    'completed'
  );


commit;
