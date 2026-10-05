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
  ensureFinalInvoicePdf,
} from "@/lib/invoicing/final-invoice-pdf";


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


      const {
        data,
        error,
      } =
        await client.rpc(
          "customer_finalize_sales_invoice",
          {
            p_organization_id:
              organizationId,

            p_invoice_id:
              invoiceId,
          },
        );


      if (error) {
        console.error(
          "invoice finalization failed",
          {
            code:
              error.code,

            message:
              error.message,

            invoiceId,
          },
        );

        throw new AccessError(
          409,
          "De factuur kon niet definitief worden gemaakt. Controleer de factuurgegevens en probeer opnieuw.",
        );
      }


      let pdfReady =
        false;

      try {
        await ensureFinalInvoicePdf(
          client,
          organizationId,
          invoiceId,
        );

        pdfReady =
          true;
      } catch (pdfError) {
        console.error(
          "final invoice pdf generation failed",
          {
            invoiceId,
            pdfError,
          },
        );
      }


      return Response.json({
        invoice:
          data,

        pdfReady,
      });
    },
  );
}
