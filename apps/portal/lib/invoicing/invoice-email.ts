import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  createFinalInvoiceDownloadUrl,
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


function cleanEmail(
  value: unknown,
) {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value
    .trim()
    .toLowerCase();
}


function validEmail(
  value: string,
) {
  return (
    value.length >= 5 &&
    value.length <= 254 &&
    value.includes("@")
  );
}


function dateNl(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "nl-NL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(
    new Date(
      `${value}T12:00:00Z`,
    ),
  );
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
    data: snapshotRow,
    error: snapshotError,
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

  const invoice =
    snapshot.invoice;

  const seller =
    snapshot.seller;

  const debtor =
    snapshot.debtor;


  const recipientEmail =
    cleanEmail(
      input.recipientEmail,
    );


  /*
   * BCC-kopie voor de klant.
   * Voor V1 gebruiken we het factuuradres
   * van de onderneming.
   */
  const customerCopyEmail =
    cleanEmail(
      seller.invoiceEmail,
    );


  if (
    !validEmail(
      recipientEmail,
    )
  ) {
    throw new Error(
      "Het e-mailadres van de debiteur is ongeldig.",
    );
  }


  if (
    !validEmail(
      customerCopyEmail,
    )
  ) {
    throw new Error(
      "Het factuur-e-mailadres van de klant ontbreekt of is ongeldig.",
    );
  }


  /*
   * Geen e-mailbijlage.
   *
   * De debiteur krijgt een tijdelijke,
   * beveiligde downloadlink naar de
   * immutable factuur-PDF.
   */
  const download =
    await createFinalInvoiceDownloadUrl(
      input.organizationId,
      input.invoiceId,
    );


  const subject =
    input.deliveryType ===
      "invoice"
      ? `Factuur ${invoice.invoiceNumber} van ${seller.companyName}`
      : input.deliveryType ===
          "reminder_1"
        ? `Betalingsherinnering factuur ${invoice.invoiceNumber} van ${seller.companyName}`
        : input.deliveryType ===
            "reminder_2"
          ? `Tweede betalingsherinnering factuur ${invoice.invoiceNumber} van ${seller.companyName}`
          : `Laatste betalingsherinnering factuur ${invoice.invoiceNumber} van ${seller.companyName}`;


  const message =
    input.deliveryType ===
      "invoice"
      ? `Hierbij ontvang je factuur ${invoice.invoiceNumber} van ${seller.companyName}.`
      : input.deliveryType ===
          "reminder_1"
        ? `Volgens onze administratie staat factuur ${invoice.invoiceNumber} nog open.`
        : input.deliveryType ===
            "reminder_2"
          ? `Factuur ${invoice.invoiceNumber} staat volgens onze administratie nog steeds open.`
          : `Dit is de laatste betalingsherinnering voor factuur ${invoice.invoiceNumber}.`;


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
                recipientEmail,

              to_klant_email:
                customerCopyEmail,

              reply_to:
                customerCopyEmail,

              debtor_name:
                debtor.name,

              company_name:
                seller.companyName,

              invoice_number:
                invoice.invoiceNumber,

              email_subject:
                subject,

              invoice_date:
                dateNl(
                  invoice.invoiceDate,
                ),

              due_date:
                dateNl(
                  invoice.dueDate,
                ),

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

              invoice_download_url:
                download.url,

              invoice_filename:
                download.filename,

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
      download.filename,

    recipientEmail,

    customerCopyEmail,
  };
}
