/**
 * Parse official WhatsApp Cloud API webhook payloads without making tenant
 * assignments. Only call after verifying x-hub-signature-256 on the raw body.
 * Provider phone number ID must be resolved through a trusted channel registry.
 */
export type WhatsAppInboundEvent = {
  eventKey: string;
  providerPhoneNumberId: string;
  messageId: string;
  senderPhone: string;
  messageType: string;
  body: string | null;
  providerTimestamp: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function nonempty(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function providerTime(value: unknown): string | null {
  const seconds = typeof value === "string" && /^\d{1,12}$/.test(value) ? Number(value) : NaN;
  const ms = seconds * 1000;
  return Number.isSafeInteger(ms) && ms >= 0 && ms <= 8640000000000000
    ? new Date(ms).toISOString() : null;
}

export function parseWhatsAppInboundEvents(payload: unknown): WhatsAppInboundEvent[] {
  const root = record(payload);
  if (root?.object !== "whatsapp_business_account") return [];
  const events: WhatsAppInboundEvent[] = [];
  for (const entryValue of array(root.entry)) {
    const entry = record(entryValue);
    for (const changeValue of array(entry?.changes)) {
      const change = record(changeValue);
      if (change?.field !== "messages") continue;
      const value = record(change.value);
      const metadata = record(value?.metadata);
      const providerPhoneNumberId = nonempty(metadata?.phone_number_id);
      if (!providerPhoneNumberId) continue;
      for (const messageValue of array(value?.messages)) {
        const message = record(messageValue);
        const messageId = nonempty(message?.id);
        const senderPhone = nonempty(message?.from);
        const messageType = nonempty(message?.type);
        if (!messageId || !senderPhone || !messageType) continue;
        const body = messageType === "text" ? nonempty(record(message?.text)?.body) : null;
        events.push({
          eventKey: providerPhoneNumberId + ":" + messageId,
          providerPhoneNumberId,
          messageId,
          senderPhone,
          messageType,
          body,
          providerTimestamp: providerTime(message?.timestamp),
        });
      }
    }
  }
  return events;
}
