import { guardedPasswordLogin, LoginSecurityUnavailableError } from "@/lib/security/guarded-password-login";
import { requireLoginTurnstile } from "@/lib/security/turnstile-siteverify";
import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError, requirePortalIdentity } from "@/lib/portal-access";
import { requirePersonalIdentity } from "@/lib/personal-access";
import { contextCookie } from "@/lib/supabase/server";

const denied = () =>
  new AccessError(401, "Inloggen is niet gelukt. Controleer uw gegevens of neem contact op met uw beheerder.");

export async function POST(request: Request) {
  return portalApi(request, async ({ client, setCookie }) => {
    const body = await readBody(request);

    try {
      await requireLoginTurnstile(body.turnstileToken);
    } catch {
      throw new AccessError(403, "De beveiligingscontrole is niet gelukt. Probeer opnieuw.");
    }

    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      !body.email.trim() ||
      !body.password ||
      body.email.length > 254 ||
      body.password.length > 1024
    ) {
      throw denied();
    }

    let authenticated: boolean;
    try {
      authenticated = await guardedPasswordLogin(client, body.email, body.password);
    } catch (error) {
      if (error instanceof LoginSecurityUnavailableError) {
        throw new AccessError(503, "Inloggen is tijdelijk niet beschikbaar.");
      }
      throw error;
    }
    if (!authenticated) throw denied();

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
      throw denied();
    }

    setCookie(contextCookie, "", { maxAge: 0 });
    return Response.json({ ok: true, redirectTo: "/" });
  });
}
