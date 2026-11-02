import { portalApi } from "@/lib/portal-api";
import { AccessError, requirePortalIdentity } from "@/lib/portal-access";
import { requirePersonalIdentity } from "@/lib/personal-access";

export async function GET(request: Request) {
  return portalApi(request, async ({ client }) => {
    const { data, error } = await client.auth.getUser();

    if (error || !data.user) {
      throw new AccessError(401, "Log opnieuw in.");
    }

    let business = false;
    let personal = false;
    let mfaRequired = false;

    try {
      const identity = await requirePortalIdentity(client);
      business = true;
      if (!identity.aal2) mfaRequired = true;
    } catch (error) {
      if (!(error instanceof AccessError)) throw error;
      if (error.status === 503) throw error;
      if (error.status !== 403) throw error;
    }

    try {
      const identity = await requirePersonalIdentity(client);
      personal = true;
      if (!identity.aal2) mfaRequired = true;
    } catch (error) {
      if (!(error instanceof AccessError)) throw error;
      if (error.status === 503) throw error;
      if (error.status !== 403) throw error;
    }

    if (!business && !personal) {
      throw new AccessError(403, "Geen toegang tot een klantomgeving.");
    }

    if (mfaRequired) {
      return Response.json({ mfaRequired: true });
    }

    return Response.json({
      business,
      personal,
      mfaRequired,
    });
  });
}