-- BESTEMD Salt Edge: least-privilege read-only display of connection status.
-- Apply only after sandbox verification; no secrets or customer data are written.
BEGIN;
ALTER TABLE public.bestemd_bank_connections ENABLE ROW LEVEL SECURITY;

-- Remove any existing table-wide permission first, otherwise column grants
-- would not limit access to internal Salt Edge identifiers.
REVOKE SELECT ON public.bestemd_bank_connections FROM PUBLIC, authenticated;
-- The customer portal needs only status metadata. Do NOT expose external IDs.
GRANT SELECT (
  id, organization_id, provider, provider_code, connection_status,
  consent_status, consent_expires_at, last_successful_sync_at,
  is_sandbox, created_at
) ON public.bestemd_bank_connections TO authenticated;

DROP POLICY IF EXISTS bestemd_bank_connections_scoped_read ON public.bestemd_bank_connections;
CREATE POLICY bestemd_bank_connections_scoped_read
ON public.bestemd_bank_connections FOR SELECT TO authenticated
USING (
  has_aal2() AND (has_org_access(organization_id) OR is_office_user())
);

-- The link and synchronization tables intentionally remain inaccessible
-- through the browser Data API; server-side integration uses privileged server keys.
COMMIT;
