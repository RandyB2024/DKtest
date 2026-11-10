import { verifyTwilioSignature } from "../../../../../../lib/communications/twilio-signature";
import { stageTwilioWhatsAppMessage } from "../../../../../../lib/communications/twilio-event-staging";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function reply(status: number, body: string): Response {
  return new Response(body, { status, headers });
}
export async function POST(request: Request): Promise<Response> {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const expectedUrl = process.env.TWILIO_WHATSAPP_WEBHOOK_URL;
  if (!token || !expectedUrl || !process.env.TWILIO_ACCOUNT_SID) {
    return reply(503, "Twilio not configured");
  }
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(type)) {
    return reply(415, "Unsupported media type");
  }
  const size = request.headers.get("content-length");
  if (size && (!/^\d+$/.test(size) || Number(size) > 65536)) {
    return reply(413, "Payload too large");
  }
  const raw = await request.arrayBuffer();
  if (raw.byteLength > 65536) return reply(413, "Payload too large");
  // Exact configured URL is used for signature validation, including any
  // intentional query string. Do not trust proxy-supplied Host headers.
  if (request.url !== expectedUrl) return reply(403, "Forbidden");
  const form = new URLSearchParams(new TextDecoder().decode(raw));
  const valid = await verifyTwilioSignature(
    expectedUrl, form, request.headers.get("x-twilio-signature"), token,
  );
  if (!valid) return reply(403, "Forbidden");
  if (form.get("NumMedia") !== null && form.get("NumMedia") !== "0") {
    // Media requires a separate secure download + retention implementation.
    return reply(503, "Media ingestion not configured");
  }
  try {
    if (!await stageTwilioWhatsAppMessage(form)) return reply(503, "Storage unavailable");
  } catch {
    return reply(503, "Storage unavailable");
  }
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { ...headers, "Content-Type": "text/xml; charset=utf-8" },
  });
}
