import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "../../../../../lib/communications/meta-webhook-security";

import { parseWhatsAppInboundEvents } from "../../../../../lib/communications/meta-event-parser";
import { parseWhatsAppStatusEvents } from "../../../../../lib/communications/meta-status-parser";
import { stageVerifiedWhatsAppEvents } from "../../../../../lib/communications/meta-event-staging";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const securityHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function reply(message: string, status: number): Response {
  return new Response(message, { status, headers: securityHeaders });
}

/**
 * Official Meta webhook subscription handshake.
 * Configure META_WHATSAPP_VERIFY_TOKEN as a server-side secret.
 */
export async function GET(request: Request): Promise<Response> {
  const configured = process.env.META_WHATSAPP_VERIFY_TOKEN;
  if (!configured) return reply("WhatsApp channel not configured", 503);
  const params = new URL(request.url).searchParams;
  const challenge = verifyMetaWebhookChallenge(
    params.get("hub.mode"),
    params.get("hub.verify_token"),
    configured,
    params.get("hub.challenge"),
  );
  return challenge === null ? reply("Forbidden", 403) : reply(challenge, 200);
}

/**
 * Do not acknowledge signed WhatsApp messages before durable processing is
 * implemented: a 200 here would silently lose messages from Meta.
 * This endpoint intentionally returns 503 for verified requests until the
 * tenant-isolated ingestion, deduplication and persistence pipeline is ready.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.META_WHATSAPP_APP_SECRET;
  if (!secret) return reply("WhatsApp channel not configured", 503);

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return reply("Unsupported media type", 415);

  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 1024 * 1024)) {
    return reply("Payload too large", 413);
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > 1024 * 1024) return reply("Payload too large", 413);

  const valid = await verifyMetaWebhookSignature(
    body,
    request.headers.get("x-hub-signature-256"),
    secret,
  );
  if (!valid) return reply("Forbidden", 403);

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return reply("Invalid JSON", 400);
  }
  const entries = (payload && typeof payload === "object" && "entry" in payload && Array.isArray(payload.entry)) ? payload.entry : [];
  const changes = entries.flatMap((entry: any) => Array.isArray(entry?.changes) ? entry.changes : []);
  // Never acknowledge unsupported provider event types or malformed message/status
  // arrays: they must not be silently discarded.
  if (changes.some((change: any) => change?.field !== "messages" ||
    (Array.isArray(change?.value?.messages) &&
      change.value.messages.length !== parseWhatsAppInboundEvents({
        object: "whatsapp_business_account",
        entry: [{ changes: [change] }],
      }).length) ||
    (Array.isArray(change?.value?.statuses) &&
      change.value.statuses.length !== parseWhatsAppStatusEvents({
        object: "whatsapp_business_account",
        entry: [{ changes: [change] }],
      }).length))) return reply("Unsupported WhatsApp event", 503);
  const events = [
    ...parseWhatsAppInboundEvents(payload),
    ...parseWhatsAppStatusEvents(payload),
  ];
  if (events.length === 0) return reply("Unsupported WhatsApp event", 503);
  try {
    const staged = await stageVerifiedWhatsAppEvents(events);
    return staged ? reply("EVENT_RECEIVED", 200) : reply("WhatsApp storage unavailable", 503);
  } catch {
    return reply("WhatsApp storage unavailable", 503);
  }
}
