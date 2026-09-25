import { portalApi, readBody } from "@/lib/portal-api";
import { requireAal2, requireOrganization, requirePortalIdentity, resolvePortalContext } from "@/lib/portal-access";
import { contextCookie } from "@/lib/supabase/server";

export async function GET(request: Request) {
  return portalApi(request, async ({ client, getCookie }) => {
    const identity = await requirePortalIdentity(client);
    if (!identity.aal2) return Response.json({ mfaRequired: true, code: "MFA_REQUIRED" });
    return Response.json({ ...identity, organizationId: resolvePortalContext(identity, getCookie(contextCookie)) });
  });
}
export async function POST(request: Request) {
  return portalApi(request, async ({ client, setCookie }) => {
    const identity = await requirePortalIdentity(client);
    requireAal2(identity);
    const body = await readBody(request);
    const organizationId = requireOrganization(identity, body.organizationId, true);
    setCookie(contextCookie, organizationId);
    return Response.json({ ...identity, organizationId });
  });
}