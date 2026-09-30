import {
  AccessError,
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";

import {
  portalApi,
} from "@/lib/portal-api";

type DocumentRow = {
  id: string;
  organization_id: string;
  folder_id: string | null;
  filename: string;
  mime_type: string;
  size_bytes: number;
  source:
    | "office"
    | "customer"
    | "email"
    | "system";
  status:
    | "new"
    | "in_review"
    | "needs_customer_action"
    | "ready"
    | "processed"
    | "archived";
  document_type:
    | "purchase_invoice"
    | "sales_invoice"
    | "bank_document"
    | "tax_document"
    | "payroll"
    | "contract"
    | "other";
  book_year: number | null;
  book_month: number | null;
  archive_folder_name: string | null;
  visible_to_customer: boolean;
  customer_action_required: boolean;
  acknowledgement_required: boolean;
  notes: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type ReceiptRow = {
  document_id: string;
  opened_at: string | null;
  acknowledged_at: string | null;
};

const allowedMimeTypes =
  new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
  ]);

const maxFileSize =
  50 * 1024 * 1024;

function safeFilename(
  filename: string,
) {
  const cleaned =
    filename
      .normalize("NFKD")
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "-",
      )
      .replace(
        /-+/g,
        "-",
      )
      .replace(
        /^[-.]+|[-.]+$/g,
        "",
      )
      .slice(0, 160);

  return (
    cleaned ||
    "document"
  );
}

function stringField(
  value: FormDataEntryValue | null,
) {
  return typeof value === "string"
    ? value
    : null;
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
        new URL(request.url);

      const organizationId =
        requireOrganization(
          identity,
          url.searchParams.get(
            "organizationId",
          ),
        );

      const scope =
        url.searchParams.get(
          "scope",
        ) ?? "inbox";

      if (
        scope !== "inbox" &&
        scope !== "archive" &&
        scope !== "all"
      ) {
        throw new AccessError(
          400,
          "Ongeldige documentenweergave.",
        );
      }

      let query =
        client
          .from("documents")
          .select(
            [
              "id",
              "organization_id",
              "folder_id",
              "filename",
              "mime_type",
              "size_bytes",
              "source",
              "status",
              "document_type",
              "book_year",
              "book_month",
              "archive_folder_name",
              "visible_to_customer",
              "customer_action_required",
              "acknowledgement_required",
              "notes",
              "processed_at",
              "created_at",
              "updated_at",
              "archived_at",
            ].join(","),
          )
          .eq(
            "organization_id",
            organizationId,
          )
          .order(
            "created_at",
            {
              ascending: false,
            },
          );

      if (scope === "inbox") {
        query =
          query.in(
            "status",
            [
              "new",
              "in_review",
              "needs_customer_action",
              "ready",
            ],
          );
      }

      if (scope === "archive") {
        query =
          query.in(
            "status",
            [
              "processed",
              "archived",
            ],
          );
      }

      const {
        data,
        error,
      } = await query;

      if (error) {
        console.error(
          "documents list failed",
          {
            code:
              error.code,
            message:
              error.message,
          },
        );

        return Response.json(
          {
            error:
              "Documenten kunnen tijdelijk niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }

      const documents =
        (data ?? []) as unknown as
          DocumentRow[];

      const documentIds =
        documents.map(
          (item) => item.id,
        );

      let receiptMap =
        new Map<
          string,
          {
            openedAt:
              string | null;
            acknowledgedAt:
              string | null;
          }
        >();

      if (
        documentIds.length > 0
      ) {
        const {
          data:
            receipts,
          error:
            receiptsError,
        } =
          await client
            .from(
              "document_receipts",
            )
            .select(
              "document_id,opened_at,acknowledged_at",
            )
            .eq(
              "user_id",
              identity.profile.id,
            )
            .in(
              "document_id",
              documentIds,
            );

        if (
          receiptsError
        ) {
          console.error(
            "document receipts list failed",
            {
              code:
                receiptsError.code,
              message:
                receiptsError.message,
            },
          );
        } else {
          receiptMap =
            new Map(
              (
                (receipts ??
                  []) as unknown as
                  ReceiptRow[]
              ).map(
                (receipt) => [
                  receipt.document_id,
                  {
                    openedAt:
                      receipt.opened_at,
                    acknowledgedAt:
                      receipt.acknowledged_at,
                  },
                ],
              ),
            );
        }
      }

      return Response.json({
        items:
          documents.map(
            (item) => {
              const receipt =
                receiptMap.get(
                  item.id,
                );

              return {
                ...item,
                customerOpenedAt:
                  receipt?.openedAt ??
                  null,
                customerAcknowledgedAt:
                  receipt
                    ?.acknowledgedAt ??
                  null,
              };
            },
          ),
      });
    },
  );
}

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

      const contentType =
        request.headers.get(
          "content-type",
        ) ?? "";

      if (
        !contentType
          .toLowerCase()
          .startsWith(
            "multipart/form-data",
          )
      ) {
        throw new AccessError(
          400,
          "Ongeldige upload.",
        );
      }

      const formData =
        await request.formData();

      const organizationId =
        requireOrganization(
          identity,
          stringField(
            formData.get(
              "organizationId",
            ),
          ),
        );

      const file =
        formData.get(
          "file",
        );

      if (
        !(file instanceof File)
      ) {
        throw new AccessError(
          400,
          "Selecteer een document.",
        );
      }

      if (
        file.size <= 0
      ) {
        throw new AccessError(
          400,
          "Het geselecteerde document is leeg.",
        );
      }

      if (
        file.size >
        maxFileSize
      ) {
        throw new AccessError(
          413,
          "Het document mag maximaal 50 MB groot zijn.",
        );
      }

      if (
        !allowedMimeTypes.has(
          file.type,
        )
      ) {
        throw new AccessError(
          415,
          "Alleen PDF-, JPG- en PNG-bestanden zijn toegestaan.",
        );
      }

      const documentId =
        crypto.randomUUID();

      const filename =
        safeFilename(
          file.name,
        );

      const storagePath =
        `${organizationId}/inbox/${documentId}/${filename}`;

      const bytes =
        await file.arrayBuffer();

      const {
        error:
          uploadError,
      } =
        await client.storage
          .from(
            "documents",
          )
          .upload(
            storagePath,
            bytes,
            {
              contentType:
                file.type,
              upsert: false,
              cacheControl:
                "3600",
            },
          );

      if (uploadError) {
        console.error(
          "document storage upload failed",
          {
            message:
              uploadError.message,
          },
        );

        return Response.json(
          {
            error:
              "Het document kon niet worden opgeslagen.",
          },
          {
            status: 503,
          },
        );
      }

      const {
        data:
          insertedDocument,
        error:
          insertError,
      } =
        await client
          .from(
            "documents",
          )
          .insert({
            id:
              documentId,
            organization_id:
              organizationId,
            storage_path:
              storagePath,
            filename:
              file.name,
            mime_type:
              file.type,
            size_bytes:
              file.size,
            source:
              "customer",
            status:
              "new",
            document_type:
              "other",
            visible_to_customer:
              true,
            customer_action_required:
              false,
            uploaded_by:
              identity.profile.id,
          })
          .select(
            [
              "id",
              "organization_id",
              "filename",
              "mime_type",
              "size_bytes",
              "source",
              "status",
              "document_type",
              "customer_action_required",
              "created_at",
            ].join(","),
          )
          .single();

      if (insertError) {
        console.error(
          "document metadata insert failed",
          {
            code:
              insertError.code,
            message:
              insertError.message,
            storagePath,
          },
        );

        /*
         * Het bestand is dan al in Storage geplaatst.
         * Door de storage-read policy kan een klant dit orphan-bestand
         * niet openen, omdat er geen geldig public.documents-record is.
         * Office kan dit later gecontroleerd opschonen.
         */
        return Response.json(
          {
            error:
              "Het document is opgeslagen, maar kon niet aan de administratie worden gekoppeld. Neem contact op met uw administrateur.",
          },
          {
            status: 503,
          },
        );
      }

      const {
        error:
          eventError,
      } =
        await client
          .from(
            "document_events",
          )
          .insert({
            organization_id:
              organizationId,
            document_id:
              documentId,
            event_type:
              "uploaded",
            new_value: {
              source:
                "customer",
              filename:
                file.name,
              mimeType:
                file.type,
              sizeBytes:
                file.size,
            },
            created_by:
              identity.profile.id,
          });

      if (eventError) {
        console.error(
          "document event insert failed",
          {
            code:
              eventError.code,
            message:
              eventError.message,
            documentId,
          },
        );
      }

      return Response.json(
        {
          item:
            insertedDocument,
        },
        {
          status: 201,
        },
      );
    },
  );
}
