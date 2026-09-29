import {
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";
import { portalApi } from "@/lib/portal-api";

type ReceivablesResponse = {
  summary: {
    totalCents: number;
    overdueCents: number;
    count: number;
    overdueCount: number;
  };
  items: Array<{
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    status: string;
    debtor: {
      id: string;
      name: string;
    };
    currency: string;
    subtotalCents: number;
    vatCents: number;
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
    overdue: boolean;
  }>;
};

export async function GET(request: Request) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePortalIdentity(client);

      requireAal2(identity);

      const url = new URL(request.url);

      const organizationId =
        requireOrganization(
          identity,
          url.searchParams.get(
            "organizationId",
          ),
        );

      const { data, error } =
        await client.rpc(
          "get_receivables",
          {
            p_organization_id:
              organizationId,
          },
        );

      if (error) {
        console.error(
          "get_receivables failed",
          {
            code: error.code,
            message: error.message,
          },
        );

        return Response.json(
          {
            error:
              "Openstaande debiteuren kunnen tijdelijk niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }

      return Response.json(
        data as ReceivablesResponse,
      );
    },
  );
}