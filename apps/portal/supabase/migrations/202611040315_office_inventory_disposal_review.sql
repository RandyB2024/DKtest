-- BESTEMD STAP 316
-- Bestaande Supabase-functie uit stap 301 vastleggen.
-- De functie beoordeelt uitsluitend een verzoek.
-- Geen automatische boekhouding of afschrijving.

BEGIN;

CREATE OR REPLACE FUNCTION public.office_review_inventory_disposal(
  p_request_id uuid,
  p_decision text,
  p_review_note text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_request public.inventory_disposal_requests%ROWTYPE;
  v_note text := trim(coalesce(p_review_note, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_aal2() THEN
    RAISE EXCEPTION 'Geldige tweestapsverificatie vereist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.office_memberships m
    JOIN public.roles r ON r.id = m.role_id
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.user_id = auth.uid()
      AND m.status = 'active'
      AND r.scope = 'office'
      AND r.code IN ('owner', 'admin')
      AND p.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Geen bevoegdheid voor beoordeling.';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Ongeldige beslissing.';
  END IF;

  IF length(v_note) > 1500 THEN
    RAISE EXCEPTION 'Toelichting is te lang.';
  END IF;

  IF p_decision = 'rejected' AND v_note = '' THEN
    RAISE EXCEPTION 'Toelichting bij afwijzing verplicht.';
  END IF;

  SELECT *
  INTO v_request
  FROM public.inventory_disposal_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Afmeldverzoek niet gevonden.';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Dit verzoek is al beoordeeld.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = v_request.organization_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Onderneming is niet meer actief.';
  END IF;

  UPDATE public.inventory_disposal_requests
  SET
    status = p_decision,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = nullif(v_note, '')
  WHERE id = p_request_id;

  INSERT INTO public.audit_events (
    actor_id,
    organization_id,
    action,
    object_type,
    object_id,
    result,
    metadata
  ) VALUES (
    auth.uid(),
    v_request.organization_id,
    'inventory.disposal_reviewed',
    'inventory_disposal_request',
    p_request_id,
    'success',
    jsonb_build_object(
      'decision', p_decision,
      'inventoryItemId', v_request.inventory_item_id
    )
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'status', p_decision,
    'financiallyProcessed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.office_review_inventory_disposal(uuid,text,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.office_review_inventory_disposal(uuid,text,text)
  TO authenticated;

COMMIT;