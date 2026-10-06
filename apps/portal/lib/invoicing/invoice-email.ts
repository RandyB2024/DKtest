import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  ensureFinalInvoicePdf,
} from "./final-invoice-pdf";


const EMAILJS_ENDPOINT =
  "https://api.emailjs.com/api/v1.0/email/send";


type SendInput = {
  client: SupabaseClient;
  organizationId: string;
  invoiceId: string;
  recipientEmail: string;
  deliveryType:
    | "invoice"
    | "reminder_1"
    | "reminder_2"
    | "final_notice";
};


function base64(
  bytes: Uint8Array,
) {
  let binary = "";

  const chunk =
    0x8000;

  for (
    let index = 0;
    index < bytes.length;
    index += chunk
  ) {
    binary +=
      String.fromCharCode(
        ...bytes.subarray(
          index,
          Math.min(
            index + chunk,
            bytes.length,
          ),
        ),
      );
  }

  return btoa(binary);
}


export async function
sendInvoiceEmail(
  input: SendInput,
) {
  const serviceId =
    process.env
      .EMAILJS_INVOICE_SERVICE_ID;

  const templateId =
    process.env
      .EMAILJS_INVOICE_TEMPLATE_ID;

  const publicKey =
    process.env
      .EMAILJS_INVOICE_PUBLIC_KEY;

  const privateKey =
    process.env
      .EMAILJS_INVOICE_PRIVATE_KEY;


  if (
    !serviceId ||
    !templateId ||
    !publicKey ||
    !privateKey
  ) {
    throw new Error(
      "EmailJS factuurconfiguratie ontbreekt.",
    );
  }


  const {
    data:
      snapshotRow,
    error:
      snapshotError,
  } =
    await input.client
      .from(
        "sales_invoice_snapshots",
      )
      .select(
        "snapshot",
      )
      .eq(
        "invoice_id",
        input.invoiceId,
      )
      .eq(
        "organization_id",
        input.organizationId,
      )
      .maybeSingle();


  if (
    snapshotError ||
    !snapshotRow?.snapshot
  ) {
    throw new Error(
      "Definitieve factuurgegevens ontbreken.",
    );
  }


  const snapshot =
    snapshotRow.snapshot as any;


  const finalPdf =
    await ensureFinalInvoicePdf(
      input.client,
      input.organizationId,
      input.invoiceId,
    );


  const invoice =
    snapshot.invoice;

  const seller =
    snapshot.seller;

  const debtor =
    snapshot.debtor;


  const subject =
    input.deliveryType ===
      "invoice"
      ? `Factuur ${invoice.invoiceNumber} van ${seller.companyName}`
      : input.deliveryType ===
          "reminder_1"
        ? `Betalingsherinnering factuur ${invoice.invoiceNumber}`
        : input.deliveryType ===
            "reminder_2"
          ? `Tweede betalingsherinnering factuur ${invoice.invoiceNumber}`
          : `Laatste betalingsherinnering factuur ${invoice.invoiceNumber}`;


  const message =
    input.deliveryType ===
      "invoice"
      ? `Bijgaand ontvang je factuur ${invoice.invoiceNumber} van ${seller.companyName}.`
      : input.deliveryType ===
          "reminder_1"
        ? `Volgens onze administratie staat factuur ${invoice.invoiceNumber} nog open. We vragen je vriendelijk om deze alsnog te voldoen.`
        : input.deliveryType ===
            "reminder_2"
          ? `Factuur ${invoice.invoiceNumber} staat volgens onze administratie nog steeds open. We verzoeken je deze zo spoedig mogelijk te voldoen.`
          : `Dit is de laatste betalingsherinnering voor factuur ${invoice.invoiceNumber}. We verzoeken je het openstaande bedrag zo spoedig mogelijk te voldoen.`;


  const response =
    await fetch(
      EMAILJS_ENDPOINT,
      {
        method:
          "POST",

        cache:
          "no-store",

        headers: {
          "content-type":
            "application/json",
        },

        body:
          JSON.stringify({
            service_id:
              serviceId,

            template_id:
              templateId,

            user_id:
              publicKey,

            accessToken:
              privateKey,

            template_params: {
              to_email:
                input.recipientEmail,

              debtor_name:
                debtor.name,

              company_name:
                seller.companyName,

              reply_to:
                seller.invoiceEmail,

              invoice_number:
                invoice.invoiceNumber,

              email_subject:
                subject,

              delivery_type:
                input.deliveryType,

              invoice_date:
                invoice.invoiceDate,

              due_date:
                invoice.dueDate,

              total_amount:
                new Intl.NumberFormat(
                  "nl-NL",
                  {
                    style:
                      "currency",

                    currency:
                      "EUR",
                  },
                ).format(
                  invoice.totalCents /
                    100,
                ),

              invoice_filename:
                finalPdf.filename,

              invoice_pdf:
                base64(
                  finalPdf.bytes,
                ),

              message:
                message,
            },
          }),
      },
    );


  if (!response.ok) {
    const details =
      await response
        .text()
        .catch(
          () => "",
        );

    throw new Error(
      `EmailJS HTTP ${response.status}${
        details
          ? `: ${details.slice(
              0,
              200,
            )}`
          : ""
      }`,
    );
  }


  return {
    filename:
      finalPdf.filename,
  };
}
