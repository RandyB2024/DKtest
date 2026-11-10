import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "../../../../../lib/communications/meta-webhook-security";

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

  return reply("WhatsApp ingestion not yet enabled", 503);
}
