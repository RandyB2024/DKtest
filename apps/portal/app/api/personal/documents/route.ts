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

type DocumentRow = {
  id: string;
  user_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  source: "customer" | "office" | "email" | "system";
  status:
    | "new"
    | "in_review"
    | "needs_customer_action"
    | "ready"
    | "processed"
    | "archived";
  document_type:
    | "tax_document"
    | "insurance"
    | "identity"
    | "lifeplan"
    | "coaching"
    | "wealth"
    | "other";
  book_year: number | null;
  book_month: number | null;
  archive_folder_name: string | null;
  visible_to_customer: boolean;
  customer_action_required: boolean;
  acknowledgement_required: boolean;
  notes: string | null;
  processed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReceiptRow = {
  document_id: string;
  opened_at: string | null;
  acknowledged_at: string | null;
};

export async function GET(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePersonalIdentity(
          client,
        );

      requireAal2(identity);

      const url =
        new URL(request.url);

      const scope =
        url.searchParams.get("scope") ?? "inbox";

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
          .from("personal_documents")
          .select(
            [
              "id",
              "user_id",
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
              "archived_at",
              "created_at",
              "updated_at",
            ].join(","),
          )
          .eq(
            "user_id",
            identity.profile.id,
          )
          .eq(
            "visible_to_customer",
            true,
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
          "personal documents list failed",
          {
            code: error.code,
            message: error.message,
          },
        );

        return Response.json(
          {
            error:
              "Persoonlijke documenten kunnen tijdelijk niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }

      const documents =
        (data ?? []) as unknown as DocumentRow[];

      const documentIds =
        documents.map(
          (item) => item.id,
        );

      let receiptMap =
        new Map<
          string,
          {
            openedAt: string | null;
            acknowledgedAt: string | null;
          }
        >();

      if (
        documentIds.length > 0
      ) {
        const {
          data: receipts,
          error: receiptsError,
        } =
          await client
            .from(
              "personal_document_receipts",
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

        if (receiptsError) {
          console.error(
            "personal document receipts failed",
            {
              code: receiptsError.code,
              message:
                receiptsError.message,
            },
          );
        } else {
          receiptMap =
            new Map(
              (
                (receipts ??
                  []) as unknown as ReceiptRow[]
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
                  receipt?.acknowledgedAt ??
                  null,
              };
            },
          ),
      });
    },
  );
}
