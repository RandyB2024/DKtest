import {
  AccessError,
  requireAal2,
} from "@/lib/portal-access";

import {
  requirePersonalIdentity,
} from "@/lib/personal-access";

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
        await requirePersonalIdentity(
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

      const {
        data: document,
        error: documentError,
      } =
        await client
          .from(
            "personal_documents",
          )
          .select(
            "id,user_id,storage_path,filename,mime_type,size_bytes,status,visible_to_customer",
          )
          .eq(
            "id",
            id,
          )
          .eq(
            "user_id",
            identity.profile.id,
          )
          .eq(
            "visible_to_customer",
            true,
          )
          .maybeSingle();

      if (documentError) {
        console.error(
          "personal document lookup failed",
          {
            code:
              documentError.code,
            message:
              documentError.message,
            documentId: id,
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
        data: signed,
        error: signedError,
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
          "personal document signed url failed",
          {
            message:
              signedError?.message,
            documentId: id,
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

      await client
        .from(
          "personal_document_receipts",
        )
        .upsert(
          {
            document_id: id,
            user_id:
              identity.profile.id,
            opened_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              "document_id,user_id",
          },
        );

      return Response.json({
        url: signed.signedUrl,
      });
    },
  );
}
