import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError } from "@/lib/portal-access";
import {
  normalizeWhatsappPhone,
  whatsappLoginEnabled,
  WHATSAPP_LOGIN_GENERIC,
} from "@/lib/security/whatsapp-login";

export async function POST(request: Request) {
  return portalApi(request, async ({ client }) => {
    if (!whatsappLoginEnabled()) {
      throw new AccessError(503, "WhatsApp-inloggen is nog niet beschikbaar.");
    }
    const body = await readBody(request);
    const phone = normalizeWhatsappPhone(body.phone);
    if (!phone) throw new AccessError(400, "Vul een geldig mobiel nummer in.");

    // Supabase owns the OTP, expiry, resend throttling and session. No new users.
    try {
      await client.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: false },
      });
    } catch {
      // No account enumeration through response differences.
    }
    return Response.json({ ok: true, message: WHATSAPP_LOGIN_GENERIC });
  });
}
