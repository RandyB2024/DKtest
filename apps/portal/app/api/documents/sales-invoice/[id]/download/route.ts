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
        !uuidPattern.test(id)
      ) {
        throw new AccessError(
          400,
          "Ongeldige verkoopfactuur.",
        );
      }

      const url =
        new URL(
          request.url,
        );

      const organizationId =
        requireOrganization(
          identity,
          url.searchParams.get(
            "organizationId",
          ),
        );

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
            [
              "id",
              "organization_id",
              "invoice_number",
              "invoice_kind",
              "document_status",
              "payment_status",
              "pdf_storage_path",
            ].join(","),
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
        invoiceError
      ) {
        console.error(
          "paid invoice document lookup failed",
          {
            code:
              invoiceError.code,
            message:
              invoiceError.message,
          },
        );

        return Response.json(
          {
            error:
              "De verkoopfactuur kan tijdelijk niet worden geopend.",
          },
          {
            status: 503,
          },
        );
      }

      if (
        !invoice
        || invoice.invoice_kind !==
          "invoice"
        || invoice.payment_status !==
          "paid"
        || invoice.document_status ===
          "draft"
        || invoice.document_status ===
          "cancelled"
        || !invoice.pdf_storage_path
      ) {
        throw new AccessError(
          404,
          "Verkoopfactuur niet gevonden.",
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
            "invoice-pdfs",
          )
          .createSignedUrl(
            invoice.pdf_storage_path,
            60,
          );

      if (
        signedError
        || !signed?.signedUrl
      ) {
        console.error(
          "paid invoice pdf signed url failed",
          {
            message:
              signedError?.message,
            invoiceId:
              id,
          },
        );

        return Response.json(
          {
            error:
              "De verkoopfactuur kan tijdelijk niet worden geopend.",
          },
          {
            status: 503,
          },
        );
      }

      return Response.json(
        {
          url:
            signed.signedUrl,
          filename:
            `${invoice.invoice_number}.pdf`,
        },
        {
          headers: {
            "Cache-Control":
              "no-store, private",
          },
        },
      );
    },
  );
}
