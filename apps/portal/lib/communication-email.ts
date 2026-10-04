import type {
  SupabaseClient,
} from "@supabase/supabase-js";


const EMAILJS_ENDPOINT =
  "https://api.emailjs.com/api/v1.0/email/send";

const OFFICE_RECIPIENT =
  "buijsr@icloud.com";

const OFFICE_BASE_URL =
  "https://office.testadmin.nl";

const SERVICE_ID =
  "service_qrpo8pn";

const TEMPLATE_ID =
  "template_kkkz2oc";

const PUBLIC_KEY =
  "8yZUtw-_MZSctALUr";


type NotificationInput = {
  client: SupabaseClient;
  messageId: string;
  threadId: string;
  customerName: string;
  companyName: string;
  subject: string;
  message: string;
};


async function recordDelivery(
  client: SupabaseClient,
  input: {
    messageId: string;
    status: "sent" | "failed";
    error?: string;
  },
) {
  try {
    await client.rpc(
      "communication_record_email_delivery",
      {
        p_message_id:
          input.messageId,

        p_recipient_email:
          OFFICE_RECIPIENT,

        p_direction:
          "customer_to_office",

        p_status:
          input.status,

        p_error:
          input.error ?? null,
      },
    );
  } catch {
    // Delivery logging may never make
    // the actual chat message fail.
  }
}


export async function
notifyOfficeOfCustomerMessage(
  input: NotificationInput,
) {
  const privateKey =
    process.env
      .EMAILJS_COMM_OFFICE_PRIVATE_KEY;

  if (!privateKey) {
    await recordDelivery(
      input.client,
      {
        messageId:
          input.messageId,

        status:
          "failed",

        error:
          "EmailJS secret ontbreekt.",
      },
    );

    return;
  }


  const conversationUrl =
    new URL(
      "/communication",
      OFFICE_BASE_URL,
    );

  conversationUrl.searchParams.set(
    "thread",
    input.threadId,
  );


  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      5000,
    );


  try {
    const response =
      await fetch(
        EMAILJS_ENDPOINT,
        {
          method: "POST",

          cache: "no-store",

          signal:
            controller.signal,

          headers: {
            "content-type":
              "application/json",
          },

          body:
            JSON.stringify({
              service_id:
                SERVICE_ID,

              template_id:
                TEMPLATE_ID,

              user_id:
                PUBLIC_KEY,

              accessToken:
                privateKey,

              template_params: {
                to_email:
                  OFFICE_RECIPIENT,

                customer_name:
                  input.customerName,

                sender_name:
                  input.customerName,

                company_name:
                  input.companyName,

                subject:
                  input.subject,

                message:
                  input.message,

                message_preview:
                  input.message,

                conversation_url:
                  conversationUrl.toString(),

                office_url:
                  conversationUrl.toString(),

                portal_name:
                  "Mijn Bestemming",
              },
            }),
        },
      );


    if (!response.ok) {
      await recordDelivery(
        input.client,
        {
          messageId:
            input.messageId,

          status:
            "failed",

          error:
            `EmailJS HTTP ${response.status}`,
        },
      );

      return;
    }


    await recordDelivery(
      input.client,
      {
        messageId:
          input.messageId,

        status:
          "sent",
      },
    );

  } catch {
    await recordDelivery(
      input.client,
      {
        messageId:
          input.messageId,

        status:
          "failed",

        error:
          "EmailJS niet bereikbaar.",
      },
    );
  } finally {
    clearTimeout(timer);
  }
}
