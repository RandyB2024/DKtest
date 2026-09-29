import {
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";
import { portalApi } from "@/lib/portal-api";

type OpenPositionsRow = {
  receivables_total_cents: number | string | null;
  receivables_overdue_cents: number | string | null;
  receivables_count: number | string | null;
  payables_total_cents: number | string | null;
  payables_overdue_cents: number | string | null;
  payables_count: number | string | null;
};

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  return portalApi(request, async ({ client }) => {
    const identity = await requirePortalIdentity(client);

    requireAal2(identity);

    const url = new URL(request.url);
    const organizationId = requireOrganization(
      identity,
      url.searchParams.get("organizationId"),
    );

    const { data, error } = await client.rpc(
      "get_open_positions",
      {
        p_organization_id: organizationId,
      },
    );

    if (error) {
      console.error("get_open_positions failed", {
        code: error.code,
        message: error.message,
      });

      return Response.json(
        {
          error:
            "Openstaande posten kunnen tijdelijk niet worden geladen.",
        },
        { status: 503 },
      );
    }

    const row = Array.isArray(data)
      ? (data[0] as OpenPositionsRow | undefined)
      : (data as OpenPositionsRow | null);

    return Response.json({
      receivables: {
        totalCents: numberValue(
          row?.receivables_total_cents,
        ),
        overdueCents: numberValue(
          row?.receivables_overdue_cents,
        ),
        count: numberValue(
          row?.receivables_count,
        ),
      },

      payables: {
        totalCents: numberValue(
          row?.payables_total_cents,
        ),
        overdueCents: numberValue(
          row?.payables_overdue_cents,
        ),
        count: numberValue(
          row?.payables_count,
        ),
      },
    });
  });
}