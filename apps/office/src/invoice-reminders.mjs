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


async function prepareReminderEmail({
  client,
  config,
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

  const debtor =
    snapshot.debtor;


  if (
    !seller
    || !debtor
  ) {
    throw new Error(
      'Factuursnapshot is onvolledig.'
    );
  }


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


  return {
    settings,
    seller,
    debtor,
    recipientEmail,
    customerCopyEmail,
    filename,
    signedUrl:
      signed.signedUrl,
  };
}


async function sendPreparedReminder({
  fetchImpl,
  prepared,
  validated,
}) {
  const content =
    reminderContent(
      validated.deliveryType,
      validated.invoiceNumber,
      prepared.seller.companyName
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
              prepared.settings.serviceId,

            template_id:
              prepared.settings.templateId,

            user_id:
              prepared.settings.publicKey,

            accessToken:
              prepared.settings.privateKey,

            template_params: {
              to_email:
                validated.recipientEmail,

              to_klant_email:
                prepared.customerCopyEmail,

              reply_to:
                prepared.customerCopyEmail,

              debtor_name:
                prepared.debtor.name,

              company_name:
                prepared.seller.companyName,

              invoice_number:
                validated.invoiceNumber,

              invoice_date:
                dateNl(
                  validated.invoiceDate
                ),

              due_date:
                dateNl(
                  validated.dueDate
                ),

              outstanding_amount:
                euro(
                  validated.outstandingCents
                ),

              reminder_title:
                content.title,

              reminder_message:
                content.message,

              email_subject:
                content.subject,

              invoice_download_url:
                prepared.signedUrl,

              invoice_filename:
                prepared.filename,

              delivery_type:
                validated.deliveryType,
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

    const error =
      new Error(
        `EmailJS HTTP ${response.status}${
          details
            ? `: ${details.slice(
                0,
                200
              )}`
            : ''
        }`
      );

    error.providerRejected =
      true;

    throw error;
  }
}


async function markFailed(
  client,
  item,
  deliveryId,
  message,
) {
  await client.rpc(
    'system_finish_invoice_reminder',
    {
      p_organization_id:
        item.organizationId,

      p_delivery_id:
        deliveryId,

      p_status:
        'failed',

      p_error:
        message,
    }
  );
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

    unconfirmed:
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
      || claim.claimed !== true
    ) {
      result.skipped += 1;
      continue;
    }


    let prepared;


    /*
     * Alles wat vóór de provider-call fout gaat,
     * kan veilig als failed worden gemarkeerd:
     * er is dan absoluut geen e-mail verzonden.
     */
    try {
      prepared =
        await prepareReminderEmail({
          client,
          config,
          item,
        });

    } catch(error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Voorbereiding herinnering mislukt.';

      await markFailed(
        client,
        item,
        claim.deliveryId,
        message
      );

      result.failed += 1;
      continue;
    }


    /*
     * CRUCIAAL:
     * dit is de laatste databasecontrole NA het
     * maken van snapshot/downloadlink en DIRECT
     * vóór de EmailJS-call.
     */
    const {
      data: validated,
      error: validationError,
    } =
      await client.rpc(
        'system_validate_invoice_reminder_delivery',
        {
          p_organization_id:
            item.organizationId,

          p_delivery_id:
            claim.deliveryId,
        }
      );


    if (
      validationError
      || !validated
    ) {
      /*
       * Er is nog niets naar EmailJS gestuurd.
       * Technische validatiefout is dus veilig
       * als failed te registreren.
       */
      await markFailed(
        client,
        item,
        claim.deliveryId,
        'Laatste factuurcontrole kon niet worden uitgevoerd.'
      );

      result.failed += 1;
      continue;
    }


    if (
      validated.eligible !== true
    ) {
      await client.rpc(
        'system_cancel_invoice_reminder',
        {
          p_organization_id:
            item.organizationId,

          p_delivery_id:
            claim.deliveryId,

          p_reason:
            String(
              validated.reason
              || 'Niet meer verzenden.'
            ),
        }
      );

      result.skipped += 1;
      continue;
    }


    /*
     * Vanaf dit moment bestaat een externe side-effect.
     *
     * Wanneer de provider mogelijk heeft verzonden,
     * schrijven we NOOIT automatisch "failed" terug.
     * Anders kan een volgende cron dezelfde mail dubbel
     * versturen.
     */
    try {
      await sendPreparedReminder({
        fetchImpl,
        prepared,
        validated,
      });

    } catch(error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Onbekende EmailJS-fout.';


      if (
        error?.providerRejected ===
        true
      ) {
        /*
         * EmailJS heeft expliciet een niet-2xx antwoord
         * gegeven. Deze poging is als mislukt bevestigd.
         */
        await markFailed(
          client,
          item,
          claim.deliveryId,
          message
        );

        result.failed += 1;

      } else {
        /*
         * Netwerk/timeout = verzendresultaat onbekend.
         * Pending laten staan voorkomt automatisch
         * dubbel verzenden.
         */
        console.error(
          'invoice reminder provider result uncertain',
          {
            organizationId:
              item.organizationId,

            invoiceId:
              item.invoiceId,

            deliveryId:
              claim.deliveryId,

            error:
              message,
          }
        );

        result.unconfirmed += 1;
      }

      continue;
    }


    /*
     * EmailJS gaf succes terug.
     *
     * Als registratie hierna faalt:
     * NIET omzetten naar failed.
     * De pending delivery blokkeert een tweede verzending.
     */
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
      console.error(
        'invoice reminder sent but registration failed',
        {
          organizationId:
            item.organizationId,

          invoiceId:
            item.invoiceId,

          deliveryId:
            claim.deliveryId,
        }
      );

      result.unconfirmed += 1;
      continue;
    }


    result.sent += 1;
  }


  return result;
}
