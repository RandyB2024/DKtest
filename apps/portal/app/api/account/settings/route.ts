import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError } from "@/lib/portal-access";
import { requireCustomerSettingsIdentity } from "@/lib/security/customer-settings-access";

export async function GET(request: Request) {
  return portalApi(request, async ({ client }) => {
    const profile = await requireCustomerSettingsIdentity(client);
    const { data: auth, error } = await client.auth.getUser();
    if (error || !auth.user) throw new AccessError(401, "Log opnieuw in.");
    const user = auth.user;
    return Response.json({
      displayName: profile.display_name ?? "",
      email: user.email ?? profile.email,
      phone: user.phone_confirmed_at ? (user.phone ?? "") : "",
      phoneVerified: Boolean(user.phone && user.phone_confirmed_at),
      phonePending: Boolean(user.phone_change),
      chatConsent: user.user_metadata?.bestemd_whatsapp_chat_consent === true,
      otpLoginReady: process.env.WHATSAPP_LOGIN_ENABLED === "true",
      enrollmentReady: process.env.WHATSAPP_PHONE_ENROLLMENT_ENABLED === "true",
    });
  });
}

export async function PATCH(request: Request) {
  return portalApi(request, async ({ client }) => {
    const profile = await requireCustomerSettingsIdentity(client);
    const body = await readBody(request);
    if (typeof body.displayName !== "string") throw new AccessError(400, "Vul een naam in.");
    const displayName = body.displayName.trim();
    if (displayName.length < 2 || displayName.length > 100 || /[\x00-\x1f]/.test(displayName)) {
      throw new AccessError(400, "De naam moet tussen 2 en 100 tekens bevatten.");
    }
    if (typeof body.chatConsent !== "boolean") throw new AccessError(400, "Ongeldige WhatsApp-voorkeur.");
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user || auth.user.id !== profile.id) throw new AccessError(401, "Log opnieuw in.");
    const previous = auth.user.user_metadata?.bestemd_whatsapp_chat_consent === true;
    // Consent is a preference; it does not provision a WhatsApp channel or expose other tenants' chats.
    if (previous !== body.chatConsent) {
      const { error } = await client.auth.updateUser({
        data: { bestemd_whatsapp_chat_consent: body.chatConsent },
      });
      if (error) throw new AccessError(503, "WhatsApp-voorkeur kon niet worden opgeslagen.");
    }
    const { data, error } = await client.from("profiles")
      .update({ display_name: displayName }).eq("id", profile.id).select("id,display_name").maybeSingle();
    if (error || !data || data.id !== profile.id) throw new AccessError(503, "Naam kon niet worden opgeslagen. Controleer de profielrechten.");
    return Response.json({ ok: true, displayName: data.display_name, chatConsent: body.chatConsent });
  });
}
