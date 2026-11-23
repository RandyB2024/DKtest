-- BESTEMD Salt Edge: authenticated, organization-scoped read access.
-- Does not grant writes or expose provider credentials.
-- Apply only after testing sandbox and reviewing membership permissions.
BEGIN;
ALTER TABLE public.bestemd_bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bestemd_bank_account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bestemd_bank_sync_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.bestemd_bank_connections TO authenticated;
GRANT SELECT ON public.bestemd_bank_account_links TO authenticated;
GRANT SELECT ON public.bestemd_bank_sync_events TO authenticated;

DROP POLICY IF EXISTS bestemd_bank_connections_scoped_read ON public.bestemd_bank_connections;
CREATE POLICY bestemd_bank_connections_scoped_read ON public.bestemd_bank_connections
FOR SELECT TO authenticated USING (
  has_aal2() AND (has_org_access(organization_id) OR is_office_user())
);
DROP POLICY IF EXISTS bestemd_bank_account_links_scoped_read ON public.bestemd_bank_account_links;
CREATE POLICY bestemd_bank_account_links_scoped_read ON public.bestemd_bank_account_links
FOR SELECT TO authenticated USING (
  has_aal2() AND (has_org_access(organization_id) OR is_office_user())
);
DROP POLICY IF EXISTS bestemd_bank_sync_events_scoped_read ON public.bestemd_bank_sync_events;
CREATE POLICY bestemd_bank_sync_events_scoped_read ON public.bestemd_bank_sync_events
FOR SELECT TO authenticated USING (
  has_aal2() AND (has_org_access(organization_id) OR is_office_user())
);
COMMIT;
