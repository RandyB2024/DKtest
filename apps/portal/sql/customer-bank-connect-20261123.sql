-- Bank Connect: customer-owner/admin-only registration under an authorized organization.
-- Run in Supabase SQL editor before enabling BANK_CONNECT_ENABLED.
-- SECURITY DEFINER required to insert provider identifiers without exposing table INSERT.
CREATE OR REPLACE FUNCTION public.start_customer_bank_connection(
  p_organization_id uuid,
  p_external_customer_id text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_aal2() THEN
    RAISE EXCEPTION 'MFA_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_external_customer_id IS NULL
    OR p_external_customer_id !~ '^[0-9]{1,32}$' THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_ID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.organization_memberships m
      JOIN public.roles r ON r.id = m.role_id
      JOIN public.organizations o ON o.id = m.organization_id
     WHERE m.user_id = auth.uid()
       AND m.organization_id = p_organization_id
       AND m.status = 'active'
       AND m.valid_from <= now()
       AND (m.valid_until IS NULL OR m.valid_until > now())
       AND r.scope = 'customer'
       AND r.code IN ('owner','admin')
       AND o.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'BANK_CONNECTION_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.bestemd_bank_connections (
    organization_id, provider, external_customer_id, provider_code,
    connection_status, consent_status, is_sandbox
  ) VALUES (
    p_organization_id, 'saltedge', p_external_customer_id, 'pending',
    'pending', 'pending', false
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_customer_bank_connection(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_customer_bank_connection(uuid,text) TO authenticated;
