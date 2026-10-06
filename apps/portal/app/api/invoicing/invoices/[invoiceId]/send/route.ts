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

import {
  sendInvoiceEmail,
} from "@/lib/invoicing/invoice-email";


const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      invoiceId: string;
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
        invoiceId,
      } =
        await params;


      if (
        !uuidPattern.test(
          invoiceId,
        )
      ) {
        throw new AccessError(
          400,
          "Ongeldige factuur.",
        );
      }


      const input =
        await readBody(
          request,
        );


      const organizationId =
        requireOrganization(
          identity,
          input.organizationId,
        );


      const deliveryType =
        "invoice" as const;


      if (
        typeof input.idempotencyKey !==
          "string" ||
        !uuidPattern.test(
          input.idempotencyKey,
        )
      ) {
        throw new AccessError(
          400,
          "Ongeldige verzendaanvraag.",
        );
      }


      const {
        data:
          invoice,
        error:
          invoiceError,
      } =
        await client
          .from(
            "sales_invoices",
          )
          .select(
            "id,invoice_number,document_status,pdf_storage_path,debtor_id",
          )
          .eq(
            "id",
            invoiceId,
          )
          .eq(
            "organization_id",
            organizationId,
          )
          .maybeSingle();


      if (
        invoiceError ||
        !invoice
      ) {
        throw new AccessError(
          404,
          "Factuur niet gevonden.",
        );
      }


      if (
        invoice.document_status ===
          "draft"
      ) {
        throw new AccessError(
          409,
          "Maak de factuur eerst definitief.",
        );
      }


      const {
        data:
          debtor,
        error:
          debtorError,
      } =
        await client
          .from(
            "debtors",
          )
          .select(
            "id,email,name",
          )
          .eq(
            "id",
            invoice.debtor_id,
          )
          .eq(
            "organization_id",
            organizationId,
          )
          .maybeSingle();


      if (
        debtorError ||
        !debtor?.email
      ) {
        throw new AccessError(
          409,
          "Bij deze debiteur ontbreekt een geldig e-mailadres.",
        );
      }


      const recipientEmail =
        debtor.email
          .trim()
          .toLowerCase();


      const {
        data:
          claim,
        error:
          claimError,
      } =
        await client.rpc(
          "customer_claim_invoice_delivery",
          {
            p_organization_id:
              organizationId,

            p_invoice_id:
              invoiceId,

            p_delivery_type:
              deliveryType,

            p_recipient_email:
              recipientEmail,

            p_idempotency_key:
              input.idempotencyKey,
          },
        );


      if (claimError) {
        throw new AccessError(
          409,
          "De verzending kon niet worden gestart.",
        );
      }


      const deliveryId =
        claim?.deliveryId;


      if (!deliveryId) {
        throw new AccessError(
          500,
          "Verzendregistratie ontbreekt.",
        );
      }


      if (
        claim.claimed === false &&
        claim.status === "sent"
      ) {
        return Response.json({
          sent:
            true,

          alreadySent:
            true,

          deliveryId,
        });
      }


      if (
        claim.claimed === false
      ) {
        throw new AccessError(
          409,
          "Deze verzending wordt al verwerkt.",
        );
      }


      try {
        await sendInvoiceEmail({
          client,
          organizationId,
          invoiceId,
          recipientEmail,
          deliveryType,
        });


        const {
          data:
            delivery,
          error:
            finishError,
        } =
          await client.rpc(
            "customer_finish_invoice_delivery",
            {
              p_organization_id:
                organizationId,

              p_delivery_id:
                deliveryId,

              p_status:
                "sent",

              p_error:
                null,
            },
          );


        if (finishError) {
          console.error(
            "invoice delivery sent but logging failed",
            {
              invoiceId,
              deliveryId,
              message:
                finishError.message,
            },
          );
        }


        return Response.json({
          sent:
            true,

          deliveryId,

          delivery:
            delivery ?? null,
        });

      } catch (error) {

        const message =
          error instanceof Error
            ? error.message
            : "Onbekende verzendfout.";


        await client.rpc(
          "customer_finish_invoice_delivery",
          {
            p_organization_id:
              organizationId,

            p_delivery_id:
              deliveryId,

            p_status:
              "failed",

            p_error:
              message,
          },
        );


        console.error(
          "invoice email failed",
          {
            invoiceId,
            deliveryId,
            message,
          },
        );


        throw new AccessError(
          503,
          "De factuur is opgeslagen, maar de e-mail kon niet worden verzonden. Je kunt het later opnieuw proberen.",
        );
      }
    },
  );
}
