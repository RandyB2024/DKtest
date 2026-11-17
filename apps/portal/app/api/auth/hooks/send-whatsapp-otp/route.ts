/**
 * Supabase Auth "Send SMS" HTTP Hook -> Meta WhatsApp Cloud API.
 * This is NOT the Meta inbound messages webhook. Never log OTPs.
 */
import { whatsappLoginEnabled, normalizeWhatsappPhone } from "@/lib/security/whatsapp-login";

function phoneEnrollmentEnabled() {
  return process.env.WHATSAPP_PHONE_ENROLLMENT_ENABLED === "true"
    && Boolean(process.env.WHATSAPP_ACCESS_TOKEN)
    && /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "")
    && Boolean(process.env.SUPABASE_SEND_SMS_HOOK_SECRET);
}

function decodeSecret(value: string): Uint8Array {
  const encoded = value.replace(/^v1,whsec_/, "").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

function decodeBase64(value: string): Uint8Array {
  const raw = atob(value);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function signedBySupabase(request: Request, payload: string) {
  const secret = process.env.SUPABASE_SEND_SMS_HOOK_SECRET;
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");
  if (!secret || !id || !timestamp || !/^\d{10}$/.test(timestamp) || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = await crypto.subtle.importKey("raw", Uint8Array.from(decodeSecret(secret)).buffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = new Uint8Array(await crypto.subtle.sign(
      "HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`),
    ));
    return signature.split(" ").some(part => {
      if (!part.startsWith("v1,")) return false;
      try { return equalBytes(decodeBase64(part.slice(3)), digest); } catch { return false; }
    });
  } catch { return false; }
}

export async function POST(request: Request) {
  if (!whatsappLoginEnabled() && !phoneEnrollmentEnabled()) return new Response(null, { status: 503 });
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return new Response(null, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > 16384 || !(await signedBySupabase(request, raw))) {
    return new Response(null, { status: 401 });
  }

  let event: { new_phone?: unknown; user?: { phone?: unknown; phone_change?: unknown; phone_confirmed_at?: unknown }; sms?: { otp?: unknown } };
  try { event = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  const existingPhone = normalizeWhatsappPhone(event.user?.phone);
  const pendingPhone = normalizeWhatsappPhone(event.new_phone) ?? normalizeWhatsappPhone(event.user?.phone_change);
  const enrollment = phoneEnrollmentEnabled() && Boolean(pendingPhone) && pendingPhone !== existingPhone;
  const phone = enrollment ? pendingPhone : existingPhone;
  const authorizedLogin = whatsappLoginEnabled() && Boolean(event.user?.phone_confirmed_at) && Boolean(existingPhone);
  const otp = event.sms?.otp;
  if ((!enrollment && !authorizedLogin) || !phone || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    return new Response(null, { status: 403 });
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId || !/^\d+$/.test(phoneId)) return new Response(null, { status: 503 });

  const response = await fetch(`https://graph.facebook.com/v27.0/${phoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.slice(1),
      type: "template",
      template: {
        name: "bestemd_login_verificatie",
        language: { code: "nl" },
        components: [
          { type: "body", parameters: [{ type: "text", text: otp }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: otp }] },
        ],
      },
    }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return new Response(null, { status: 502 });
  return new Response(null, { status: 200 });
}
