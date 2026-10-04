const EMAILJS_ENDPOINT =
  'https://api.emailjs.com/api/v1.0/email/send';

const SERVICE_ID =
  'service_2cm5lhf';

const TEMPLATE_ID =
  'template_ausnss1';

const PUBLIC_KEY =
  '7g_wmXwISP-XOUsUq';

const PORTAL_BASE_URL =
  'https://mijn.testadmin.nl';


async function recordDelivery(
  client,
  messageId,
  recipientEmail,
  status,
  error = null
) {
  try {
    await client.rpc(
      'communication_record_email_delivery',
      {
        p_message_id:
          messageId,

        p_recipient_email:
          recipientEmail,

        p_direction:
          'office_to_customer',

        p_status:
          status,

        p_error:
          error,
      }
    );
  } catch {
    // Logging may never make
    // the chat message fail.
  }
}


async function customerRecipients(
  client,
  organizationId
) {
  const membershipsResult =
    await client
      .from('organization_memberships')
      .select(
        'user_id,status,valid_from,valid_until'
      )
      .eq(
        'organization_id',
        organizationId
      )
      .eq(
        'status',
        'active'
      );

  if (membershipsResult.error) {
    return [];
  }

  const now =
    Date.now();

  const userIds =
    [
      ...new Set(
        (membershipsResult.data ?? [])
          .filter(
            membership =>
              Date.parse(
                membership.valid_from
              ) <= now &&
              (
                !membership.valid_until ||
                Date.parse(
                  membership.valid_until
                ) > now
              )
          )
          .map(
            membership =>
              membership.user_id
          )
      ),
    ];

  if (!userIds.length) {
    return [];
  }


  const profilesResult =
    await client
      .from('profiles')
      .select(
        'id,email,display_name,account_status'
      )
      .in(
        'id',
        userIds
      )
      .eq(
        'account_status',
        'active'
      );

  if (profilesResult.error) {
    return [];
  }


  return (
    profilesResult.data ?? []
  )
    .filter(
      profile =>
        typeof profile.email ===
          'string' &&
        profile.email.includes('@')
    )
    .map(
      profile => ({
        email:
          profile.email
            .trim()
            .toLowerCase(),

        name:
          profile.display_name ||
          'klant',
      })
    );
}


export async function
notifyCustomerOfOfficeMessage({
  client,
  messageId,
  threadId,
  organizationId,
  companyName,
  subject,
  message,
  privateKey,
  fetchImpl = fetch,
}) {
  if (!privateKey) {
    return;
  }


  let recipients = [];

  try {
    recipients =
      await customerRecipients(
        client,
        organizationId
      );
  } catch {
    return;
  }


  const conversationUrl =
    new URL(
      '/',
      PORTAL_BASE_URL
    );

  conversationUrl.searchParams.set(
    'view',
    'communication'
  );

  conversationUrl.searchParams.set(
    'thread',
    threadId
  );


  for (
    const recipient of
      recipients
  ) {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () =>
          controller.abort(),
        5000
      );


    try {
      const response =
        await fetchImpl(
          EMAILJS_ENDPOINT,
          {
            method: 'POST',

            signal:
              controller.signal,

            headers: {
              'Content-Type':
                'application/json',
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
                    recipient.email,

                  customer_name:
                    recipient.name,

                  recipient_name:
                    recipient.name,

                  sender_name:
                    'Bestemd',

                  company_name:
                    companyName,

                  subject,

                  message,

                  message_preview:
                    message,

                  conversation_url:
                    conversationUrl
                      .toString(),

                  portal_url:
                    conversationUrl
                      .toString(),

                  portal_name:
                    'Mijn Bestemming',
                },
              }),
          }
        );


      await recordDelivery(
        client,
        messageId,
        recipient.email,
        response.ok
          ? 'sent'
          : 'failed',
        response.ok
          ? null
          : `EmailJS HTTP ${response.status}`
      );

    } catch {
      await recordDelivery(
        client,
        messageId,
        recipient.email,
        'failed',
        'EmailJS niet bereikbaar.'
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
