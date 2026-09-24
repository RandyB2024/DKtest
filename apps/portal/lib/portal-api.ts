import { AccessError, requireAal2, requireOrganization, requirePortalIdentity } from "./portal-access";
import { ConfigurationError } from "./supabase/config";
import { createRequestSupabase, type RequestSupabase } from "./supabase/server";

export function requireSameOrigin(request: Request) {
  if (!["GET", "HEAD"].includes(request.method)) {
    // Do not trust Host/X-Forwarded-* overrides or permit missing Origin.
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new AccessError(403, "Ongeldige herkomst van het verzoek.");
    }
  }
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AccessError(400, "Ongeldig verzoek.");
  const text = await request.text();
  if (text.length > 16384) throw new AccessError(413, "Verzoek te groot.");
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new AccessError(400, "Ongeldig verzoek."); }
}
export function apiError(error: unknown) {
  const status = error instanceof AccessError ? error.status : 503;
  const message = error instanceof AccessError || error instanceof ConfigurationError ? error.message : "De dienst is tijdelijk niet beschikbaar. Probeer het opnieuw.";
  return Response.json({ error: message }, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
export async function portalApi(request: Request, action: (session: RequestSupabase) => Promise<Response>, factory = createRequestSupabase) {
  let session: RequestSupabase | undefined;
  try {
    requireSameOrigin(request);
    session = factory(request);
    return session.finish(await action(session));
  } catch (error) {
    const response = apiError(error);
    return session ? session.finish(response) : response;
  }
}

// Retired demo endpoints fail closed, including direct requests outside the UI.
export async function unavailableModule(request: Request, financial = false, pathOrganizationId?: string) {
  return portalApi(request, async ({ client }) => {
    const identity = await requirePortalIdentity(client);
    if (financial || identity.profile.mfa_required) requireAal2(identity);
    if (pathOrganizationId) requireOrganization(identity, pathOrganizationId);
    if (request.method !== "GET") {
      const body = await readBody(request);
      if (body.organizationId !== undefined) requireOrganization(identity, body.organizationId);
    }
    return Response.json({ error: "Deze module is nog niet gemigreerd. Lezen en wijzigen zijn tijdelijk uitgeschakeld." }, { status: 503 });
  });
}
