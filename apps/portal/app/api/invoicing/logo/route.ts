import {
  AccessError,
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";

import {
  portalApi,
} from "@/lib/portal-api";

const allowedTypes =
  new Set([
    "image/png",
    "image/jpeg",
  ]);

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

      const form =
        await request.formData();

      const organizationId =
        requireOrganization(
          identity,
          form.get(
            "organizationId",
          ),
        );

      const file =
        form.get("file");

      if (!(file instanceof File)) {
        throw new AccessError(
          400,
          "Selecteer een logo.",
        );
      }

      if (
        !allowedTypes.has(file.type)
      ) {
        throw new AccessError(
          400,
          "Gebruik een PNG- of JPG-bestand.",
        );
      }

      if (
        file.size <= 0 ||
        file.size >
          2 * 1024 * 1024
      ) {
        throw new AccessError(
          400,
          "Het logo mag maximaal 2 MB zijn.",
        );
      }

      const extension =
        file.type === "image/png"
          ? "png"
          : "jpg";

      const path =
        `${organizationId}/invoice-logo-${crypto.randomUUID()}.${extension}`;

      const bytes =
        new Uint8Array(
          await file.arrayBuffer(),
        );

      const {
        error: uploadError,
      } =
        await client.storage
          .from("company-assets")
          .upload(
            path,
            bytes,
            {
              contentType:
                file.type,

              cacheControl:
                "3600",

              upsert:
                false,
            },
          );

      if (uploadError) {
        throw new AccessError(
          503,
          "Logo kon niet worden opgeslagen.",
        );
      }

      const {
        data,
        error,
      } =
        await client.rpc(
          "customer_set_invoice_logo",
          {
            p_organization_id:
              organizationId,

            p_storage_path:
              path,
          },
        );

      if (error) {
        throw new AccessError(
          503,
          "Logo kon niet aan het factuurprofiel worden gekoppeld.",
        );
      }

      return Response.json({
        logoStoragePath:
          data,
      });
    },
  );
}
