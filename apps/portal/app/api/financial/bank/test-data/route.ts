import {
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";

import {
  portalApi,
  readBody,
} from "@/lib/portal-api";

export async function POST(
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

      const body =
        await readBody(request);

      const organizationId =
        requireOrganization(
          identity,
          body.organizationId,
        );

      const {
        data,
        error,
      } = await client.rpc(
        "create_bank_matching_test_data",
        {
          p_organization_id:
            organizationId,
        },
      );

      if (error) {
        console.error(
          "create_bank_matching_test_data failed",
          {
            code: error.code,
            message: error.message,
          },
        );

        if (
          error.message.includes(
            "testonderneming",
          )
        ) {
          return Response.json(
            {
              error:
                "Testdata mag alleen in een testonderneming worden aangemaakt.",
            },
            {
              status: 403,
            },
          );
        }

        if (
          error.message.includes(
            "Office-gebruiker",
          )
        ) {
          return Response.json(
            {
              error:
                "Alleen een bevoegde Office-gebruiker mag testdata aanmaken.",
            },
            {
              status: 403,
            },
          );
        }

        return Response.json(
          {
            error:
              "De testgegevens konden niet worden aangemaakt.",
          },
          {
            status: 503,
          },
        );
      }

      return Response.json({
        result: data,
      });
    },
  );
}