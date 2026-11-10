/**
 * Meta delivery receipts are separate from inbound messages. They must be
 * staged durably before acknowledging the webhook, even when a webhook
 * contains only delivery status changes.
 */
export type WhatsAppStatusEvent = {
  eventKey: string;
  providerPhoneNumberId: string;
  messageId: string;
  status: string;
  recipientPhone: string | null;
  providerTimestamp: string | null;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function items(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{1,12}$/.test(value)) return null;
  const ms = Number(value) * 1000;
  return Number.isSafeInteger(ms) && ms <= 8640000000000000
    ? new Date(ms).toISOString() : null;
}
export function parseWhatsAppStatusEvents(payload: unknown): WhatsAppStatusEvent[] {
  const root = object(payload);
  if (root?.object !== "whatsapp_business_account") return [];
  const output: WhatsAppStatusEvent[] = [];
  for (const rawEntry of items(root.entry)) {
    for (const rawChange of items(object(rawEntry)?.changes)) {
      const change = object(rawChange);
      if (change?.field !== "messages") continue;
      const value = object(change.value);
      const phoneId = string(object(value?.metadata)?.phone_number_id);
      if (!phoneId) continue;
      for (const rawStatus of items(value?.statuses)) {
        const event = object(rawStatus);
        const id = string(event?.id);
        const state = string(event?.status);
        if (!id || !state || !["sent", "delivered", "read", "failed"].includes(state)) continue;
        const time = timestamp(event?.timestamp);
        const recipient = string(event?.recipient_id);
        output.push({
          eventKey: "status:" + JSON.stringify([phoneId, id, state, time]),
          providerPhoneNumberId: phoneId,
          messageId: id,
          status: state,
          recipientPhone: recipient,
          providerTimestamp: time,
        });
      }
    }
  }
  return output;
}
