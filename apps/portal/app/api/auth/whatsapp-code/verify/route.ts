import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError, requirePortalIdentity } from "@/lib/portal-access";
import { requirePersonalIdentity } from "@/lib/personal-access";
import { contextCookie } from "@/lib/supabase/server";
import { normalizeWhatsappPhone, whatsappLoginEnabled } from "@/lib/security/whatsapp-login";

export async function POST(request: Request) {
  return portalApi(request, async ({ client, setCookie }) => {
    if (!whatsappLoginEnabled()) {
      throw new AccessError(503, "WhatsApp-inloggen is nog niet beschikbaar.");
    }
    const body = await readBody(request);
    const phone = normalizeWhatsappPhone(body.phone);
    const token = body.token;
    const denied = () => new AccessError(401, "Code ongeldig of verlopen. Vraag een nieuwe code aan.");
    if (!phone || typeof token !== "string" || !/^\d{6}$/.test(token)) throw denied();

    const { data, error } = await client.auth.verifyOtp({ phone, token, type: "sms" });
    if (error || !data.user || data.user.phone !== phone || !data.user.phone_confirmed_at) {
      if (!error) await client.auth.signOut({ scope: "local" });
      throw denied();
    }

    try {
      try {
        await requirePortalIdentity(client);
      } catch (businessError) {
        if (businessError instanceof AccessError && businessError.status === 503) throw businessError;
        await requirePersonalIdentity(client);
      }
    } catch (error) {
      await client.auth.signOut({ scope: "local" });
      if (error instanceof AccessError && error.status === 503) throw error;
      throw new AccessError(403, "Geen toegang tot een BESTEMD-omgeving.");
    }
    setCookie(contextCookie, "", { maxAge: 0 });
    return Response.json({ ok: true, redirectTo: "/" });
  });
}
