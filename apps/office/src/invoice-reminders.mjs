import {
  createClient,
} from '@supabase/supabase-js';


const EMAILJS_ENDPOINT =
  'https://api.emailjs.com/api/v1.0/email/send';


function euro(cents) {
  return new Intl.NumberFormat(
    'nl-NL',
    {
      style: 'currency',
      currency: 'EUR',
    }
  ).format(
    Number(cents ?? 0) / 100
  );
}


function dateNl(value) {
  return new Intl.DateTimeFormat(
    'nl-NL',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }
  ).format(
    new Date(
      `${value}T12:00:00Z`
    )
  );
}


function safeFilename(value) {
  return String(value)
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      '-'
    )
    .replace(
      /-+/g,
      '-'
    )
    .replace(
      /^-|-$|^\.+/g,
      ''
    ) || 'factuur';
}


function email(value) {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value
    .trim()
    .toLowerCase();
}


function validEmail(value) {
  return (
    value.length >= 5
    && value.length <= 254
    && value.includes('@')
  );
}


function reminderContent(
  deliveryType,
  invoiceNumber,
  companyName,
) {
  if (
    deliveryType ===
    'reminder_1'
  ) {
    return {
      title:
        'Betalingsherinnering',

      subject:
        `Betalingsherinnering factuur ${invoiceNumber} van ${companyName}`,

      message:
        `Volgens onze administratie staat factuur ${invoiceNumber} nog open. Mogelijk is de betaling aan je aandacht ontsnapt. We vragen je vriendelijk het openstaande bedrag alsnog te voldoen.`,
    };
  }


  if (
    deliveryType ===
    'reminder_2'
  ) {
    return {
      title:
        'Tweede betalingsherinnering',

      subject:
        `Tweede betalingsherinnering factuur ${invoiceNumber} van ${companyName}`,

      message:
        `Ondanks onze eerdere herinnering staat factuur ${invoiceNumber} volgens onze administratie nog open. We verzoeken je het openstaande bedrag zo spoedig mogelijk te voldoen.`,
    };
  }


  return {
    title:
      'Laatste betalingsherinnering',

    subject:
      `Laatste betalingsherinnering factuur ${invoiceNumber} van ${companyName}`,

    message:
      `Factuur ${invoiceNumber} staat volgens onze administratie nog steeds open. Dit is de laatste betalingsherinnering. We verzoeken je het openstaande bedrag zo spoedig mogelijk te voldoen.`,
  };
}


function adminClient(config) {
  if (
    !config.supabaseUrl
    || !config.supabaseServiceRoleKey
  ) {
    throw new Error(
      'Supabase service-role configuratie ontbreekt.'
    );
  }


  return createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },

      global: {
        headers: {
          'X-Client-Info':
            'bestemd-office-reminder-runner',
        },
      },
    }
  );
}


async function sendReminderEmail({
  client,
  config,
  fetchImpl,
  item,
}) {
  const settings =
    config.invoiceReminderEmailjs;


  if (
    !settings?.serviceId
    || !settings?.templateId
    || !settings?.publicKey
    || !settings?.privateKey
  ) {
    throw new Error(
      'EmailJS herinneringsconfiguratie ontbreekt.'
    );
  }


  const {
    data: snapshotRow,
    error: snapshotError,
  } =
    await client
      .from(
        'sales_invoice_snapshots'
      )
      .select(
        'snapshot'
      )
      .eq(
        'invoice_id',
        item.invoiceId
      )
      .eq(
        'organization_id',
        item.organizationId
      )
      .maybeSingle();


  if (
    snapshotError
    || !snapshotRow?.snapshot
  ) {
    throw new Error(
      'Definitieve factuurgegevens ontbreken.'
    );
  }


  const snapshot =
    snapshotRow.snapshot;

  const seller =
    snapshot.seller;

  const invoice =
    snapshot.invoice;

  const debtor =
    snapshot.debtor;


  const recipientEmail =
    email(
      item.debtorEmail
    );

  const customerCopyEmail =
    email(
      seller.invoiceEmail
    );


  if (
    !validEmail(
      recipientEmail
    )
  ) {
    throw new Error(
      'E-mailadres debiteur is ongeldig.'
    );
  }


  if (
    !validEmail(
      customerCopyEmail
    )
  ) {
    throw new Error(
      'Factuur-e-mailadres klant is ongeldig.'
    );
  }


  if (!item.pdfStoragePath) {
    throw new Error(
      'Definitieve factuur-PDF ontbreekt.'
    );
  }


  const filename =
    `${safeFilename(
      `factuur-${item.invoiceNumber}`
    )}.pdf`;


  const {
    data: signed,
    error: signedError,
  } =
    await client.storage
      .from(
        'invoice-pdfs'
      )
      .createSignedUrl(
        item.pdfStoragePath,
        60 * 60 * 24 * 30,
        {
          download:
            filename,
        }
      );


  if (
    signedError
    || !signed?.signedUrl
  ) {
    throw new Error(
      'Beveiligde factuurlink kon niet worden aangemaakt.'
    );
  }


  const content =
    reminderContent(
      item.deliveryType,
      item.invoiceNumber,
      seller.companyName
    );


  const response =
    await fetchImpl(
      EMAILJS_ENDPOINT,
      {
        method:
          'POST',

        headers: {
          'content-type':
            'application/json',
        },

        body:
          JSON.stringify({
            service_id:
              settings.serviceId,

            template_id:
              settings.templateId,

            user_id:
              settings.publicKey,

            accessToken:
              settings.privateKey,

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
                item.invoiceNumber,

              invoice_date:
                dateNl(
                  item.invoiceDate
                ),

              due_date:
                dateNl(
                  item.dueDate
                ),

              outstanding_amount:
                euro(
                  item.outstandingCents
                ),

              reminder_title:
                content.title,

              reminder_message:
                content.message,

              email_subject:
                content.subject,

              invoice_download_url:
                signed.signedUrl,

              invoice_filename:
                filename,

              delivery_type:
                item.deliveryType,
            },
          }),
      }
    );


  if (!response.ok) {
    const details =
      await response
        .text()
        .catch(
          () => ''
        );

    throw new Error(
      `EmailJS HTTP ${response.status}${
        details
          ? `: ${details.slice(
              0,
              200
            )}`
          : ''
      }`
    );
  }
}


export async function runScheduledInvoiceReminders({
  config,
  fetchImpl = fetch,
  limit = 100,
}) {
  const client =
    adminClient(
      config
    );


  const {
    data: items,
    error: listError,
  } =
    await client.rpc(
      'system_get_due_invoice_reminders',
      {
        p_limit:
          limit,
      }
    );


  if (listError) {
    throw new Error(
      'Openstaande herinneringen konden niet worden geladen.'
    );
  }


  const result = {
    checked:
      Array.isArray(items)
        ? items.length
        : 0,

    sent:
      0,

    skipped:
      0,

    failed:
      0,
  };


  for (
    const item of
    Array.isArray(items)
      ? items
      : []
  ) {
    const idempotencyKey =
      crypto.randomUUID();


    const {
      data: claim,
      error: claimError,
    } =
      await client.rpc(
        'system_claim_invoice_reminder',
        {
          p_organization_id:
            item.organizationId,

          p_invoice_id:
            item.invoiceId,

          p_delivery_type:
            item.deliveryType,

          p_recipient_email:
            item.debtorEmail,

          p_idempotency_key:
            idempotencyKey,
        }
      );


    if (
      claimError
      || !claim?.deliveryId
    ) {
      result.skipped += 1;
      continue;
    }


    if (
      claim.claimed !== true
    ) {
      result.skipped += 1;
      continue;
    }


    try {

      /*
       * De database heeft direct vóór dit punt opnieuw
       * gecontroleerd dat de factuur nog openstaat.
       */
      await sendReminderEmail({
        client,
        config,
        fetchImpl,
        item,
      });


      const {
        error: finishError,
      } =
        await client.rpc(
          'system_finish_invoice_reminder',
          {
            p_organization_id:
              item.organizationId,

            p_delivery_id:
              claim.deliveryId,

            p_status:
              'sent',

            p_error:
              null,
          }
        );


      if (finishError) {
        throw new Error(
          'Herinnering is verzonden maar kon niet worden geregistreerd.'
        );
      }


      result.sent += 1;

    } catch (error) {

      const message =
        error instanceof Error
          ? error.message
          : 'Onbekende verzendfout.';


      await client.rpc(
        'system_finish_invoice_reminder',
        {
          p_organization_id:
            item.organizationId,

          p_delivery_id:
            claim.deliveryId,

          p_status:
            'failed',

          p_error:
            message,
        }
      );


      result.failed += 1;
    }
  }


  return result;
}
