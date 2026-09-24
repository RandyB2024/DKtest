import { portalApi } from "@/lib/portal-api";
import { AccessError } from "@/lib/portal-access";
import { contextCookie } from "@/lib/supabase/server";

export async function POST(request: Request) {
  return portalApi(request, async ({ client, setCookie }) => {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw new AccessError(503, "Uitloggen is niet gelukt. Probeer het opnieuw.");
    setCookie(contextCookie, "", { maxAge: 0 });
    return Response.json({ ok: true });
  });
}