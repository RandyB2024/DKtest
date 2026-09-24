import { portalApi, unavailableModule } from "@/lib/portal-api";
import { requireAal2, requireOrganization, requirePortalIdentity } from "@/lib/portal-access";
type Context = { params: Promise<{ organizationId: string }> };
export async function GET(request: Request, context: Context) {
  return portalApi(request, async ({ client }) => {
    const identity = await requirePortalIdentity(client);
    if (identity.profile.mfa_required) requireAal2(identity);
    const id = requireOrganization(identity, (await context.params).organizationId);
    return Response.json({ organization: identity.organizations.find(o => o.id === id) });
  });
}
export async function POST(request: Request, context: Context) {
  return unavailableModule(request, false, (await context.params).organizationId);
}