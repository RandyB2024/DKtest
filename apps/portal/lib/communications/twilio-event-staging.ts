import { createClient } from "@supabase/supabase-js";

export async function stageTwilioWhatsAppMessage(form: URLSearchParams): Promise<boolean> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sid = form.get("MessageSid");
  const from = form.get("From");
  const to = form.get("To");
  const accountSid = form.get("AccountSid");
  if (!url || !key || !sid || !/^SM[a-f0-9]{32}$/i.test(sid) ||
      !from || !/^whatsapp:\+[1-9]\d{6,14}$/.test(from) ||
      !to || !/^whatsapp:\+[1-9]\d{6,14}$/.test(to) ||
      !accountSid || !/^AC[a-f0-9]{32}$/i.test(accountSid) ||
      accountSid !== process.env.TWILIO_ACCOUNT_SID) return false;
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  // Register the Twilio sandbox number explicitly in the trusted channel
  // registry before enabling this endpoint. No tenant is inferred from sender.
  const { data: channels, error: channelError } = await db
    .from("bestemd_wa_channel_accounts")
    .select("id,phone_e164,status")
    .eq("phone_e164", to.slice("whatsapp:".length))
    .eq("status", "active");
  if (channelError || !channels || channels.length !== 1) return false;
  const payload = {
    provider: "twilio",
    messageId: sid,
    senderPhone: from.slice("whatsapp:".length),
    receiverPhone: to.slice("whatsapp:".length),
    body: form.get("Body") ?? "",
    numMedia: form.get("NumMedia") ?? "0",
    // Attachments are not downloaded until a separate authenticated
    // media-ingestion flow exists.
  };
  const { error } = await db.from("bestemd_wa_inbound_events").upsert({
    provider_event_key: "twilio:" + sid,
    provider_phone_number_id: "twilio:" + channels[0].id,
    payload,
    processing_status: "pending",
  }, { onConflict: "provider_event_key", ignoreDuplicates: true });
  return !error;
}
