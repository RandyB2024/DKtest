import { portalApi, readBody } from "@/lib/portal-api";
import { AccessError, requireAal2, requireOrganization, requirePortalIdentity } from "@/lib/portal-access";

type SaltEdgeResult = { data?: { customer_id?: string; connect_url?: string } };

const API = "https://www.saltedge.com/api/v6";
const CONNECT_ORIGIN = "https://www.saltedge.com";

async function saltEdgePost(
  path: "/customers" | "/connections/connect",
  body: Record<string, unknown>,
  appId: string,
  secret: string,
): Promise<SaltEdgeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(API + path, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "App-id": appId,
        Secret: secret,
      },
      body: JSON.stringify({ data: body }),
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual",
    });
    if (!response.ok) throw new AccessError(502, "De bankverbinding kon niet worden gestart.");
    return (await response.json()) as SaltEdgeResult;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  return portalApi(request, async ({ client }) => {
    const identity = await requirePortalIdentity(client);
    requireAal2(identity);
    const body = await readBody(request);
    const organizationId = requireOrganization(identity, body.organizationId);

    const membership = identity.memberships.find(
      (m) => m.organization_id === organizationId,
    );
    if (!membership) throw new AccessError(403, "Geen toegang tot deze onderneming.");

    const { data: role, error: roleError } = await client.from("roles")
      .select("code,scope").eq("id", membership.role_id).maybeSingle();
    if (roleError || !role || role.scope !== "customer"
      || !["owner", "admin"].includes(role.code)) {
      throw new AccessError(403, "Alleen de eigenaar of beheerder kan een bank koppelen.");
    }

    if (process.env.BANK_CONNECT_ENABLED !== "true") {
      throw new AccessError(503, "Banken koppelen is nog niet geactiveerd.");
    }
    const appId = process.env.SALT_EDGE_APP_ID;
    const secret = process.env.SALT_EDGE_SECRET;
    if (!appId || !secret) {
      throw new AccessError(503, "De bankkoppeling is nog niet geconfigureerd.");
    }

    // Each request is authorized against the actual organization membership.
    // No fixed sandbox organization, payment initiation, or service-role key.
    const customer = await saltEdgePost(
      "/customers",
      { identifier: "bestemd-org-" + organizationId + "-" + crypto.randomUUID() },
      appId,
      secret,
    );
    const customerId = customer.data?.customer_id;
    if (!customerId || !/^\d{1,32}$/.test(customerId)) {
      throw new AccessError(502, "De bankaanbieder gaf geen geldige klantreferentie.");
    }

    const session = await saltEdgePost(
      "/connections/connect",
      {
        customer_id: customerId,
        consent: { scopes: ["accounts", "transactions"] },
        attempt: {
          fetch_scopes: ["accounts", "transactions"],
          locale: "nl",
          return_to: "https://app.mijnbestemd.nl/mijn-onderneming?view=banking",
        },
        widget: { show_account_overview: true },
        return_connection_id: true,
        automatic_refresh: false,
      },
      appId,
      secret,
    );
    const connectUrl = session.data?.connect_url;
    let parsed: URL;
    try {
      parsed = new URL(connectUrl ?? "");
    } catch {
      throw new AccessError(502, "De bankaanbieder gaf geen geldige koppelpagina.");
    }
    if (parsed.protocol !== "https:" || parsed.origin !== CONNECT_ORIGIN
      || parsed.pathname !== "/connect") {
      throw new AccessError(502, "De bankaanbieder gaf geen vertrouwde koppelpagina.");
    }

    // Invoker has no direct INSERT grant; restricted DB RPC validates MFA,
    // active membership, customer scope and owner/admin again.
    const { error } = await client.rpc("start_customer_bank_connection", {
      p_organization_id: organizationId,
      p_external_customer_id: customerId,
    });
    if (error) throw new AccessError(503, "De bankkoppeling kon niet veilig worden geregistreerd.");
    return Response.json(
      { connectUrl },
      { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } },
    );
  });
}
