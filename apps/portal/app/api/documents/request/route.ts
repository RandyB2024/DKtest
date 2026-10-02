import {
  AccessError,
  requireAal2,
  requirePortalIdentity,
} from "@/lib/portal-access";

import {
  portalApi,
  readBody,
} from "@/lib/portal-api";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(
  value: unknown,
  message: string,
) {
  if (
    typeof value !== "string" ||
    !uuid.test(value)
  ) {
    throw new AccessError(
      400,
      message,
    );
  }

  return value;
}

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
        new URL(
          request.url,
        );

      const requestId =
        requireUuid(
          url.searchParams.get(
            "requestId",
          ),
          "Ongeldig documentverzoek.",
        );

      const transactionId =
        requireUuid(
          url.searchParams.get(
            "transactionId",
          ),
          "Ongeldige bankmutatie.",
        );

      const {
        data,
        error,
      } =
        await client.rpc(
          "customer_bank_document_request",
          {
            p_request_id:
              requestId,

            p_transaction_id:
              transactionId,
          },
        );

      if (error) {
        if (
          error.code === "42501"
        ) {
          throw new AccessError(
            403,
            "Dit documentverzoek is niet beschikbaar.",
          );
        }

        if (
          error.code === "P0002"
        ) {
          throw new AccessError(
            404,
            "Dit documentverzoek is niet meer beschikbaar.",
          );
        }

        if (
          error.code === "22023"
        ) {
          throw new AccessError(
            400,
            "Dit documentverzoek is ongeldig.",
          );
        }

        console.error(
          "customer bank document request failed",
          {
            code:
              error.code,

            message:
              error.message,
          },
        );

        throw new AccessError(
          503,
          "Het documentverzoek kan tijdelijk niet worden geladen.",
        );
      }

      return Response.json({
        request:
          data,
      });
    },
  );
}

export async function PATCH(
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

      const input =
        await readBody(
          request,
        );

      const requestId =
        requireUuid(
          input.requestId,
          "Ongeldig documentverzoek.",
        );

      const transactionId =
        requireUuid(
          input.transactionId,
          "Ongeldige bankmutatie.",
        );

      const documentId =
        requireUuid(
          input.documentId,
          "Ongeldig document.",
        );

      const {
        data,
        error,
      } =
        await client.rpc(
          "customer_complete_bank_document_request",
          {
            p_request_id:
              requestId,

            p_transaction_id:
              transactionId,

            p_document_id:
              documentId,
          },
        );

      if (error) {
        if (
          error.code === "42501"
        ) {
          throw new AccessError(
            403,
            "Dit document kan niet aan het verzoek worden gekoppeld.",
          );
        }

        if (
          error.code === "P0002"
        ) {
          throw new AccessError(
            404,
            "Dit documentverzoek is niet meer beschikbaar.",
          );
        }

        if (
          error.code === "22023"
        ) {
          throw new AccessError(
            409,
            "Dit documentverzoek staat niet meer open.",
          );
        }

        console.error(
          "complete bank document request failed",
          {
            code:
              error.code,

            message:
              error.message,
          },
        );

        throw new AccessError(
          503,
          "Het document kon niet aan het verzoek worden gekoppeld.",
        );
      }

      return Response.json({
        request:
          data,
      });
    },
  );
}
