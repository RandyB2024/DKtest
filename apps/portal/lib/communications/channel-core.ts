/**
 * BESTEMD unified communications: provider-neutral message envelope.
 * WhatsApp delivery stays disabled until an approved provider is configured.
 * Do not trust organization or actor IDs supplied by clients: resolve them from
 * authenticated server context before calling normalizeInboundMessage.
 */
export const CHANNELS = Object.freeze({ PORTAL: "portal", WHATSAPP: "whatsapp" });
export const CHANNEL_STATUS = Object.freeze({ ACTIVE: "active", PENDING: "pending", DISABLED: "disabled" });

export const DEFAULT_CHANNELS = Object.freeze([
  { key: "whatsapp-randy", type: CHANNELS.WHATSAPP, label: "WhatsApp Randy", status: CHANNEL_STATUS.PENDING },
  { key: "whatsapp-ed", type: CHANNELS.WHATSAPP, label: "WhatsApp Ed", status: CHANNEL_STATUS.DISABLED }
]);

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(name + " is required");
  return value.trim();
}

/** Only call after authentication and organization membership authorization. */
export function normalizeInboundMessage(input, context) {
  const organizationId = required(context?.organizationId, "organizationId");
  const conversationId = required(input?.conversationId, "conversationId");
  const channel = required(input?.channel, "channel");
  if (!Object.values(CHANNELS).includes(channel)) throw new TypeError("Unsupported channel");
  const externalMessageId = input?.externalMessageId == null ? null : required(input.externalMessageId, "externalMessageId");
  if (channel === CHANNELS.WHATSAPP && !externalMessageId) throw new TypeError("WhatsApp messages need provider message IDs for deduplication");
  const body = required(input?.body, "body");
  if (body.length > 16000) throw new RangeError("Message too long");
  return {
    organizationId,
    conversationId,
    channel,
    channelAccountKey: required(input?.channelAccountKey, "channelAccountKey"),
    externalMessageId,
    direction: "inbound",
    body,
    receivedAt: new Date().toISOString(),
    status: "received"
  };
}

export function whatsappDeliveryAvailable(channel, provider) {
  return channel?.type === CHANNELS.WHATSAPP &&
    channel.status === CHANNEL_STATUS.ACTIVE &&
    provider?.approved === true &&
    typeof provider.send === "function";
}

export function deduplicationKey(message) {
  return [required(message.organizationId, "organizationId"), required(message.channelAccountKey, "channelAccountKey"), required(message.externalMessageId, "externalMessageId")].join(":");
}
