import { portalApi } from "@/lib/portal-api";
import { AccessError, requireAal2, requireOrganization, requirePortalIdentity } from "@/lib/portal-access";

// Only return documents from the authenticated customer's explicitly selected organization.
export async function GET(request: Request) {
  return portalApi(request, async ({ client }) => {
    const identity = await requirePortalIdentity(client);
    requireAal2(identity);
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    requireOrganization(identity, organizationId);
    const { data, error } = await client.rpc("portal_insurance_overview", {
      p_organization_id: organizationId,
    });
    if (error) throw new AccessError(503, "Verzekeringsgegevens zijn tijdelijk niet beschikbaar.");
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  });
}
