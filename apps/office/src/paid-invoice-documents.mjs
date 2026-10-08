import { createClient } from "@supabase/supabase-js";

const INVOICE_BUCKET = "invoice-pdfs";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invoiceDocumentId(id) {
  return `sales-invoice:${id}`;
}

function invoiceIdFromDocumentId(id) {
  const value = String(id || "");

  if (!value.startsWith("sales-invoice:")) {
    return null;
  }

  const invoiceId =
    value.slice("sales-invoice:".length);

  return uuid.test(invoiceId)
    ? invoiceId
    : null;
}

function fileName(invoiceNumber) {
  const safe =
    String(invoiceNumber || "verkoopfactuur")
      .replace(/[\\/:*?"<>|]+/g, "-");

  return `${safe}.pdf`;
}

export async function paidInvoiceDocumentsRoute(
  req,
  url,
  client,
  config,
) {
  const path = url.pathname;

  if (
    req.method === "GET"
    && path === "/api/documents/paid-sales-invoices"
  ) {
    const organizationId =
      url.searchParams.get("organizationId");

    if (!uuid.test(organizationId || "")) {
      return {
        status: 400,
        data: {
          error: "Ongeldige onderneming.",
        },
      };
    }

    const {
      data,
      error,
    } =
      await client
        .from("sales_invoices")
        .select(
          [
            "id",
            "organization_id",
            "invoice_number",
            "invoice_kind",
            "document_status",
            "payment_status",
            "invoice_date",
            "total_cents",
            "paid_cents",
            "pdf_storage_path",
            "created_at",
            "finalized_at",
            "archived_at",
          ].join(",")
        )
        .eq(
          "organization_id",
          organizationId
        )
        .eq(
          "invoice_kind",
          "invoice"
        )
        .neq(
          "document_status",
          "draft"
        )
        .neq(
          "document_status",
          "cancelled"
        )
        .is(
          "archived_at",
          null
        )
        .not(
          "pdf_storage_path",
          "is",
          null
        )
        .order(
          "invoice_date",
          {
            ascending: false,
          }
        );

    if (error) {
      console.error(
        "paid invoice documents failed",
        {
          code: error.code,
          message: error.message,
        }
      );

      return {
        status: 503,
        data: {
          error:
            "Betaalde verkoopfacturen konden niet worden geladen.",
        },
      };
    }

    const invoices =
      Array.isArray(data)
        ? data
        : [];

    const documents =
      invoices
        .filter(invoice => {
          const total =
            Number(invoice.total_cents || 0);

          const paid =
            Number(invoice.paid_cents || 0);

          return (
            invoice.payment_status === "paid"
            || (
              total > 0
              && paid >= total
            )
          );
        })
        .map(invoice => {
          const date =
            new Date(
              `${invoice.invoice_date}T12:00:00`
            );

          const valid =
            !Number.isNaN(
              date.getTime()
            );

          return {
            id:
              invoiceDocumentId(
                invoice.id
              ),

            organization_id:
              invoice.organization_id,

            filename:
              fileName(
                invoice.invoice_number
              ),

            mime_type:
              "application/pdf",

            size_bytes:
              0,

            status:
              "archived",

            source:
              "invoice",

            document_type:
              "sales_invoice",

            archive_folder_name:
              "Verkoopfacturen",

            book_year:
              valid
                ? date.getFullYear()
                : null,

            book_month:
              valid
                ? date.getMonth() + 1
                : null,

            processed_at:
              invoice.finalized_at
              || invoice.created_at,

            archived_at:
              invoice.finalized_at
              || invoice.created_at,

            created_at:
              invoice.created_at,

            invoice_date:
              invoice.invoice_date,

            invoice_number:
              invoice.invoice_number,

            pdf_storage_path:
              invoice.pdf_storage_path,
          };
        });

    return {
      status: 200,
      data: {
        documents,
      },
    };
  }

  const downloadMatch =
    path.match(
      /^\/api\/documents\/(sales-invoice%3A|sales-invoice:)([^/]+)\/download$/i
    );

  if (
    req.method === "GET"
    && downloadMatch
  ) {
    const encodedId =
      decodeURIComponent(
        path
          .split("/")[3]
          ?? ""
      );

    const invoiceId =
      invoiceIdFromDocumentId(
        encodedId
      );

    if (!invoiceId) {
      return {
        status: 400,
        data: {
          error:
            "Ongeldige verkoopfactuur.",
        },
      };
    }

    const {
      data: invoice,
      error,
    } =
      await client
        .from("sales_invoices")
        .select(
          [
            "id",
            "invoice_number",
            "invoice_kind",
            "document_status",
            "payment_status",
            "total_cents",
            "paid_cents",
            "pdf_storage_path",
          ].join(",")
        )
        .eq(
          "id",
          invoiceId
        )
        .maybeSingle();

    if (
      error
      || !invoice
    ) {
      return {
        status: 404,
        data: {
          error:
            "Verkoopfactuur niet gevonden.",
        },
      };
    }

    const total =
      Number(
        invoice.total_cents || 0
      );

    const paid =
      Number(
        invoice.paid_cents || 0
      );

    const isPaid =
      invoice.payment_status === "paid"
      || (
        total > 0
        && paid >= total
      );

    if (
      invoice.invoice_kind !== "invoice"
      || invoice.document_status === "draft"
      || invoice.document_status === "cancelled"
      || !isPaid
      || !invoice.pdf_storage_path
    ) {
      return {
        status: 404,
        data: {
          error:
            "Verkoopfactuur is niet beschikbaar in het archief.",
        },
      };
    }

    const admin =
      createClient(
        config.supabaseUrl,
        config.supabaseServiceRoleKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );

    const {
      data: signed,
      error: signedError,
    } =
      await admin.storage
        .from(INVOICE_BUCKET)
        .createSignedUrl(
          invoice.pdf_storage_path,
          60
        );

    if (
      signedError
      || !signed?.signedUrl
    ) {
      console.error(
        "invoice archive signed url failed",
        {
          code:
            signedError?.statusCode,
          message:
            signedError?.message,
        }
      );

      return {
        status: 503,
        data: {
          error:
            "De verkoopfactuur kon niet veilig worden geopend.",
        },
      };
    }

    return {
      status: 200,
      data: {
        url:
          signed.signedUrl,

        filename:
          fileName(
            invoice.invoice_number
          ),
      },
    };
  }

  return null;
}
