import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError, requirePortalIdentity } from "@/lib/portal-access";
import { contextCookie } from "@/lib/supabase/server";

export async function POST(request: Request) {
  return portalApi(request, async ({ client, setCookie }) => {
    const body = await readBody(request);
    const denied = () => new AccessError(401, "Inloggen is niet gelukt. Controleer uw gegevens of neem contact op met uw beheerder.");
    if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email.trim() || !body.password || body.email.length > 254 || body.password.length > 1024) throw denied();
    const { error } = await client.auth.signInWithPassword({ email: body.email.trim(), password: body.password });
    if (error) throw denied();
    try { await requirePortalIdentity(client); }
    catch (error) {
      await client.auth.signOut({ scope: "local" });
      if (error instanceof AccessError && error.status === 503) throw error;
      throw denied();
    }
    setCookie(contextCookie, "", { maxAge: 0 });
    // Fixed local destination; no caller-supplied redirect.
    return Response.json({ ok: true, redirectTo: "/" });
  });
}