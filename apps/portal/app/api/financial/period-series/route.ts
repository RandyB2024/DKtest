import {
  AccessError,
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";

import { portalApi } from "@/lib/portal-api";

type Period =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "halfyear"
  | "year";

type PeriodSeriesResponse = {
  period: Period;
  startDate: string;
  endDate: string;
  buckets: Array<{
    index: number;
    startDate: string;
    endDate: string;
    revenueCents: number;
    costsCents: number;
    resultCents: number;
  }>;
};

const periods = new Set<Period>([
  "day",
  "week",
  "month",
  "quarter",
  "halfyear",
  "year",
]);

export async function GET(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePortalIdentity(
          client,
        );

      requireAal2(identity);

      const url =
        new URL(request.url);

      const organizationId =
        requireOrganization(
          identity,
          url.searchParams.get(
            "organizationId",
          ),
        );

      const period =
        url.searchParams.get(
          "period",
        ) as Period | null;

      if (
        !period ||
        !periods.has(period)
      ) {
        throw new AccessError(
          400,
          "Ongeldige financiële periode.",
        );
      }

      const {
        data,
        error,
      } = await client.rpc(
        "get_financial_period_series",
        {
          p_organization_id:
            organizationId,
          p_period: period,
        },
      );

      if (error) {
        console.error(
          "get_financial_period_series failed",
          {
            code: error.code,
            message: error.message,
          },
        );

        return Response.json(
          {
            error:
              "Grafiekgegevens kunnen tijdelijk niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }

      return Response.json(
        data as PeriodSeriesResponse,
      );
    },
  );
}