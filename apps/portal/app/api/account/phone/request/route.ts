import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError } from "@/lib/portal-access";
import { requireCustomerSettingsIdentity } from "@/lib/security/customer-settings-access";
import { normalizeWhatsappPhone } from "@/lib/security/whatsapp-login";

export async function POST(request: Request) {
  return portalApi(request, async ({ client }) => {
    const identity = await requireCustomerSettingsIdentity(client);
    if (process.env.WHATSAPP_PHONE_ENROLLMENT_ENABLED !== "true") {
      throw new AccessError(503, "WhatsApp-verificatie wordt voorbereid. Je gegevens zijn niet gewijzigd.");
    }
    const body = await readBody(request);
    const phone = normalizeWhatsappPhone(body.phone);
    if (!phone) throw new AccessError(400, "Vul een geldig mobiel nummer in.");
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user || auth.user.id !== identity.id) throw new AccessError(401, "Log opnieuw in.");
    if (auth.user.phone_confirmed_at && auth.user.phone === phone) {
      throw new AccessError(409, "Dit nummer is al geverifieerd.");
    }
    const { error } = await client.auth.updateUser({ phone });
    if (error) throw new AccessError(400, "Het nummer kon niet worden aangeboden. Probeer het later opnieuw.");
    return Response.json({ ok: true, message: "Als WhatsApp het nummer kan bereiken, ontvang je een verificatiecode." });
  });
}
