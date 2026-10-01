import { OfficeError } from './auth/supabase.mjs';

function requireEmailJsConfig(config) {
  const emailjs = config?.emailjs;

  if (
    !emailjs?.serviceId ||
    !emailjs?.templateId ||
    !emailjs?.publicKey ||
    !emailjs?.privateKey ||
    !emailjs?.portalBaseUrl
  ) {
    throw new OfficeError(
      503,
      'EMAILJS_NOT_CONFIGURED',
      'E-mailverzending is nog niet geconfigureerd.'
    );
  }

  let portalUrl;

  try {
    portalUrl = new URL(emailjs.portalBaseUrl);
  } catch {
    throw new OfficeError(
      503,
      'EMAILJS_NOT_CONFIGURED',
      'De portal-URL is ongeldig geconfigureerd.'
    );
  }

  if (portalUrl.protocol !== 'https:') {
    throw new OfficeError(
      503,
      'EMAILJS_NOT_CONFIGURED',
      'De portal-URL moet HTTPS gebruiken.'
    );
  }

  return emailjs;
}

function formatEuro(cents) {
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

function formatDate(value) {
  return new Intl.DateTimeFormat(
    'nl-NL',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }
  ).format(
    new Date(value)
  );
}

export async function sendMissingInvoiceEmail({
  config,
  fetchImpl = fetch,
  request,
  organizationName,
}) {
  const emailjs =
    requireEmailJsConfig(config);

  const uploadUrl =
    new URL(
      '/documents',
      emailjs.portalBaseUrl
    );

  uploadUrl.searchParams.set(
    'action',
    'upload-document'
  );

  uploadUrl.searchParams.set(
    'request',
    request.requestId
  );

  uploadUrl.searchParams.set(
    'transaction',
    request.transactionId
  );

  const payload = {
    service_id:
      emailjs.serviceId,

    template_id:
      emailjs.templateId,

    user_id:
      emailjs.publicKey,

    accessToken:
      emailjs.privateKey,

    template_params: {
      to_email:
        request.recipientEmail,

      customer_name:
        request.recipientName || 'klant',

      company_name:
        organizationName,

      counterparty_name:
        request.counterpartyName || 'onbekende leverancier',

      amount:
        formatEuro(
          request.amountCents
        ),

      transaction_date:
        formatDate(
          request.transactionDate
        ),

      description:
        request.description || '',

      upload_url:
        uploadUrl.toString(),

      request_id:
        request.requestId,
    },
  };

  let response;

  try {
    response =
      await fetchImpl(
        'https://api.emailjs.com/api/v1.0/email/send',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify(
              payload
            ),
        }
      );
  } catch {
    throw new OfficeError(
      503,
      'EMAIL_SEND_FAILED',
      'De e-mail kon niet worden verzonden.'
    );
  }

  if (!response.ok) {
    let detail = '';

    try {
      detail = await response.text();
    } catch {}

    throw new OfficeError(
      503,
      'EMAIL_SEND_FAILED',
      `De e-mail kon niet worden verzonden. EmailJS ${response.status}: ${
        detail || 'Geen foutdetails ontvangen.'
      }`
    );
  }

  return {
    sent: true,
    recipient:
      request.recipientEmail,
    uploadUrl:
      uploadUrl.toString(),
  };
}
