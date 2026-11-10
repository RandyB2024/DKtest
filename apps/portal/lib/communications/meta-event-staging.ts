import { createClient } from "@supabase/supabase-js";
import type { WhatsAppInboundEvent } from "./meta-event-parser";

/**
 * Store verified provider events in the private inbox queue.
 * Does not infer organization membership from sender phone numbers.
 * The downstream worker must resolve contact + organization and keep unknown
 * or ambiguous senders in a staff-only queue.
 */
export async function stageVerifiedWhatsAppEvents(events: WhatsAppInboundEvent[]): Promise<boolean> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  if (events.length === 0) return false;
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const providerIds = [...new Set(events.map(e => e.providerPhoneNumberId))];
  const { data: channels, error: channelError } = await db
    .from("bestemd_wa_channel_accounts")
    .select("provider_phone_number_id,status")
    .in("provider_phone_number_id", providerIds);
  if (channelError || !channels || providerIds.some(id =>
    !channels.some(c => c.provider_phone_number_id === id && c.status === "active")
  )) return false;

  const rows = events.map(event => ({
    provider_event_key: event.eventKey,
    provider_phone_number_id: event.providerPhoneNumberId,
    payload: event,
    processing_status: "pending",
  }));
  // Unique provider_event_key prevents duplicate inserts on webhook retries.
  const { error } = await db.from("bestemd_wa_inbound_events")
    .upsert(rows, { onConflict: "provider_event_key", ignoreDuplicates: true });
  return !error;
}
