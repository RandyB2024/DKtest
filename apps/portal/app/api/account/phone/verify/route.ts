import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError } from "@/lib/portal-access";
import { requireCustomerSettingsIdentity } from "@/lib/security/customer-settings-access";
import { normalizeWhatsappPhone } from "@/lib/security/whatsapp-login";

export async function POST(request: Request) {
  return portalApi(request, async ({ client }) => {
    const identity = await requireCustomerSettingsIdentity(client);
    if (process.env.WHATSAPP_PHONE_ENROLLMENT_ENABLED !== "true") {
      throw new AccessError(503, "Telefoonverificatie is nog niet beschikbaar.");
    }
    const body = await readBody(request);
    const phone = normalizeWhatsappPhone(body.phone);
    if (!phone || typeof body.token !== "string" || !/^\d{6}$/.test(body.token)) {
      throw new AccessError(400, "Vul de zescijferige code in.");
    }
    const { data: before } = await client.auth.getUser();
    if (!before.user || before.user.id !== identity.id || (before.user as typeof before.user & { phone_change?: string }).phone_change !== phone) {
      throw new AccessError(403, "Dit nummer is niet voor jouw account aangevraagd.");
    }
    const { error } = await client.auth.verifyOtp({ phone, token: body.token, type: "phone_change" });
    if (error) throw new AccessError(400, "De code is ongeldig of verlopen.");
    const { data: after, error: authError } = await client.auth.getUser();
    if (authError || !after.user || after.user.id !== identity.id ||
      after.user.phone !== phone || !after.user.phone_confirmed_at) {
      throw new AccessError(403, "Telefoonverificatie kon niet veilig worden bevestigd.");
    }
    return Response.json({ ok: true, phone, verified: true });
  });
}
