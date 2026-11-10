-- BESTEMD central communications: initial private WhatsApp inbox storage.
-- This migration only creates tables. It does not activate a provider or expose data.
-- Service-role processing must authenticate Meta signatures and resolve tenant ownership
-- from a trusted channel-account mapping before inserting conversations/messages.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bestemd_wa_channel_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_key text NOT NULL UNIQUE,
  label text NOT NULL,
  phone_e164 text,
  provider_phone_number_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bestemd_wa_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_key text NOT NULL UNIQUE,
  provider_phone_number_id text NOT NULL,
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processed','failed','ignored')),
  failure_reason text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.bestemd_wa_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  channel_account_id uuid NOT NULL REFERENCES public.bestemd_wa_channel_accounts(id),
  contact_phone_e164 text NOT NULL,
  contact_id uuid,
  assignment_status text NOT NULL DEFAULT 'unassigned'
    CHECK (assignment_status IN ('unassigned','assigned','closed')),
  assigned_staff_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel_account_id, contact_phone_e164)
);

CREATE TABLE IF NOT EXISTS public.bestemd_wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.bestemd_wa_conversations(id),
  channel_account_id uuid NOT NULL REFERENCES public.bestemd_wa_channel_accounts(id),
  provider_message_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender_phone_e164 text,
  body text,
  delivery_status text NOT NULL DEFAULT 'received',
  provider_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_account_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS bestemd_wa_conversations_org_idx
  ON public.bestemd_wa_conversations (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS bestemd_wa_messages_conversation_idx
  ON public.bestemd_wa_messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bestemd_wa_events_pending_idx
  ON public.bestemd_wa_inbound_events (received_at)
  WHERE processing_status = 'pending';

ALTER TABLE public.bestemd_wa_channel_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bestemd_wa_inbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bestemd_wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bestemd_wa_messages ENABLE ROW LEVEL SECURITY;

-- Defense in depth: do not grant direct client access or create permissive
-- policies. Only trusted server-side service-role code may read/write these
-- tables until tenant membership checks are implemented in dedicated APIs.
REVOKE ALL ON public.bestemd_wa_channel_accounts FROM anon, authenticated;
REVOKE ALL ON public.bestemd_wa_inbound_events FROM anon, authenticated;
REVOKE ALL ON public.bestemd_wa_conversations FROM anon, authenticated;
REVOKE ALL ON public.bestemd_wa_messages FROM anon, authenticated;

COMMIT;
