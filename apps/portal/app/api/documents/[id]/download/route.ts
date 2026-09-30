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

      const url =
        new URL(request.url);

      const organizationId =
        requireOrganization(
          identity,
          url.searchParams.get(
            "organizationId",
          ),
        );

      const {
        data:
          document,
        error:
          documentError,
      } =
        await client
          .from(
            "documents",
          )
          .select(
            "id,organization_id,storage_path,filename,mime_type,size_bytes,status,visible_to_customer",
          )
          .eq(
            "id",
            id,
          )
          .eq(
            "organization_id",
            organizationId,
          )
          .maybeSingle();

      if (
        documentError
      ) {
        console.error(
          "document lookup failed",
          {
            code:
              documentError.code,
            message:
              documentError.message,
          },
        );

        return Response.json(
          {
            error:
              "Het document kan tijdelijk niet worden geopend.",
          },
          {
            status: 503,
          },
        );
      }

      if (!document) {
        throw new AccessError(
          404,
          "Document niet gevonden.",
        );
      }

      const {
        data:
          signed,
        error:
          signedError,
      } =
        await client.storage
          .from(
            "documents",
          )
          .createSignedUrl(
            document.storage_path,
            60,
          );

      if (
        signedError ||
        !signed?.signedUrl
      ) {
        console.error(
          "document signed url failed",
          {
            message:
              signedError?.message,
            documentId:
              id,
          },
        );

        return Response.json(
          {
            error:
              "Het document kan tijdelijk niet worden geopend.",
          },
          {
            status: 503,
          },
        );
      }

      const {
        error:
          openedError,
      } =
        await client.rpc(
          "mark_document_opened",
          {
            p_organization_id:
              organizationId,
            p_document_id:
              id,
          },
        );

      if (
        openedError
      ) {
        console.error(
          "mark_document_opened failed",
          {
            code:
              openedError.code,
            message:
              openedError.message,
            documentId:
              id,
          },
        );
      }

      return Response.json({
        url:
          signed.signedUrl,
        filename:
          document.filename,
        mimeType:
          document.mime_type,
        sizeBytes:
          document.size_bytes,
      });
    },
  );
}
