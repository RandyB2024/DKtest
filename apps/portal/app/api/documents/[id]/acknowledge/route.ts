import {
  AccessError,
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";

import {
  portalApi,
  readBody,
} from "@/lib/portal-api";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePortalIdentity(
          client,
        );

      requireAal2(identity);

      const {
        id,
      } =
        await params;

      if (
        !uuidPattern.test(
          id,
        )
      ) {
        throw new AccessError(
          400,
          "Ongeldig document.",
        );
      }

      const body =
        await readBody(
          request,
        );

      const organizationId =
        requireOrganization(
          identity,
          body.organizationId,
        );

      const {
        data,
        error,
      } =
        await client.rpc(
          "acknowledge_document",
          {
            p_organization_id:
              organizationId,
            p_document_id:
              id,
          },
        );

      if (error) {
        console.error(
          "acknowledge_document failed",
          {
            code:
              error.code,
            message:
              error.message,
            documentId:
              id,
          },
        );

        if (
          error.message.includes(
            "inkomend",
          ) ||
          error.message.includes(
            "zichtbaar",
          )
        ) {
          throw new AccessError(
            409,
            "Dit document kan niet als gelezen worden bevestigd.",
          );
        }

        return Response.json(
          {
            error:
              "De leesbevestiging kon niet worden opgeslagen.",
          },
          {
            status: 503,
          },
        );
      }

      return Response.json({
        result:
          data,
      });
    },
  );
}
