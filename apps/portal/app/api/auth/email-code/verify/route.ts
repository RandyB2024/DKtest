import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError, requirePortalIdentity } from "@/lib/portal-access";
import { requirePersonalIdentity } from "@/lib/personal-access";
import { contextCookie } from "@/lib/supabase/server";

export async function POST(request: Request) {
  return portalApi(request, async ({ client, setCookie }) => {
    const body = await readBody(request);

    const denied = () =>
      new AccessError(401, "De code is ongeldig of verlopen. Vraag een nieuwe code aan.");

    if (
      typeof body.email !== "string" ||
      !body.email.trim() ||
      body.email.length > 254 ||
      typeof body.token !== "string" ||
      !/^\d{6,8}$/.test(body.token)
    ) {
      throw denied();
    }

    const { error } = await client.auth.verifyOtp({
      email: body.email.trim(),
      token: body.token,
      type: "email",
    });

    if (error) throw denied();

    try {
      try {
        await requirePortalIdentity(client);
      } catch (businessError) {
        if (businessError instanceof AccessError && businessError.status === 503) {
          throw businessError;
        }
        await requirePersonalIdentity(client);
      }
    } catch (error) {
      await client.auth.signOut({ scope: "local" });
      if (error instanceof AccessError && error.status === 503) throw error;
      throw new AccessError(403, "Geen toegang tot een BESTEMD-omgeving.");
    }

    setCookie(contextCookie, "", { maxAge: 0 });

    return Response.json({
      ok: true,
      redirectTo: "/",
    });
  });
}