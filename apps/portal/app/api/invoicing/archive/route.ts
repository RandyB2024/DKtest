import {
  AccessError,
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";

import {
  portalApi,
} from "@/lib/portal-api";


const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


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

      const debtorId =
        url.searchParams.get(
          "debtorId",
        );


      if (
        debtorId &&
        !uuidPattern.test(
          debtorId,
        )
      ) {
        throw new AccessError(
          400,
          "Ongeldige debiteur.",
        );
      }


      const {
        data,
        error,
      } =
        await client.rpc(
          "get_customer_invoice_archive",
          {
            p_organization_id:
              organizationId,

            p_debtor_id:
              debtorId || null,
          },
        );


      if (error) {
        console.error(
          "invoice archive failed",
          {
            code:
              error.code,
            message:
              error.message,
          },
        );

        throw new AccessError(
          503,
          "Het factuurarchief kan tijdelijk niet worden geladen.",
        );
      }


      return Response.json({
        items:
          data ?? [],
      });
    },
  );
}
