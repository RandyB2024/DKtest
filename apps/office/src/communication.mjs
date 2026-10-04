import {
  checkQuery,
  OfficeError,
} from './auth/supabase.mjs';

import {
  notifyCustomerOfOfficeMessage,
} from './communication-email.mjs';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const writableRoles =
  new Set([
    'owner',
    'admin',
    'accountant',
    'handler',
  ]);

function requireUuid(value, label = 'ID') {
  if (
    typeof value !== 'string' ||
    !uuid.test(value)
  ) {
    throw new OfficeError(
      400,
      'INVALID_ID',
      `${label} is ongeldig.`
    );
  }

  return value;
}

function requireText(
  value,
  label,
  maxLength
) {
  const result =
    typeof value === 'string'
      ? value.trim()
      : '';

  if (
    !result ||
    result.length > maxLength
  ) {
    throw new OfficeError(
      400,
      'INVALID_INPUT',
      `${label} is ongeldig.`
    );
  }

  return result;
}

function canWrite(user) {
  return writableRoles.has(
    user?.roleCode
  );
}

async function getOrganization(
  client,
  id
) {
  const organization =
    checkQuery(
      await client
        .from('organizations')
        .select(
          'id,name,customer_relationship_id'
        )
        .eq('id', id)
        .is('archived_at', null)
        .maybeSingle()
    );

  if (!organization) {
    throw new OfficeError(
      404,
      'ORGANIZATION_NOT_FOUND',
      'Onderneming niet gevonden.'
    );
  }

  return organization;
}

async function threadDetail(
  client,
  threadId
) {
  const conversation =
    checkQuery(
      await client
        .from('conversations')
        .select(
          [
            'id',
            'organization_id',
            'subject',
            'status',
            'created_by',
            'created_at',
            'updated_at',
            'last_message_at',
            'closed_at',
            'closed_by',
          ].join(',')
        )
        .eq('id', threadId)
        .is('archived_at', null)
        .maybeSingle()
    );

  if (!conversation) {
    throw new OfficeError(
      404,
      'THREAD_NOT_FOUND',
      'Gesprek niet gevonden.'
    );
  }

  const organization =
    await getOrganization(
      client,
      conversation.organization_id
    );

  const messages =
    checkQuery(
      await client
        .from('messages')
        .select(
          [
            'id',
            'conversation_id',
            'sender_id',
            'sender_side',
            'body',
            'created_at',
          ].join(',')
        )
        .eq(
          'conversation_id',
          threadId
        )
        .eq(
          'visibility',
          'customer'
        )
        .order(
          'created_at',
          {
            ascending: true,
          }
        )
        .limit(1000)
    );

  const senderIds =
    [
      ...new Set(
        messages.map(
          item => item.sender_id
        )
      ),
    ];

  let profiles = [];

  if (senderIds.length) {
    profiles =
      checkQuery(
        await client
          .from('profiles')
          .select(
            'id,display_name'
          )
          .in(
            'id',
            senderIds
          )
      );
  }

  const profileMap =
    new Map(
      profiles.map(
        profile => [
          profile.id,
          profile.display_name,
        ]
      )
    );

  return {
    conversation: {
      ...conversation,
      organization_name:
        organization.name,
    },

    messages:
      messages.map(
        message => ({
          ...message,

          sender_name:
            profileMap.get(
              message.sender_id
            ) ??
            (
              message.sender_side ===
              'office'
                ? 'Bestemd'
                : 'Klant'
            ),
        })
      ),
  };
}

export async function communicationRoute(
  req,
  url,
  client,
  user,
  readBody,
  config,
  fetchImpl = fetch
) {
  if (
    !url.pathname.startsWith(
      '/api/communication'
    )
  ) {
    return null;
  }

  const path =
    url.pathname;

  if (
    path !== '/api/communication'
  ) {
    return null;
  }


  // ========================================================
  // READ
  // ========================================================

  if (req.method === 'GET') {
    const threadId =
      url.searchParams.get(
        'threadId'
      );

    if (threadId) {
      requireUuid(
        threadId,
        'Gesprek'
      );

      const detail =
        await threadDetail(
          client,
          threadId
        );

      return {
        status: 200,

        data: {
          ...detail,

          currentUserId:
            user.id,

          canWrite:
            canWrite(user),
        },
      };
    }


    const scope =
      url.searchParams.get(
        'scope'
      ) ?? 'active';

    if (
      ![
        'active',
        'archive',
        'all',
      ].includes(scope)
    ) {
      throw new OfficeError(
        400,
        'INVALID_SCOPE',
        'Ongeldige communicatie-weergave.'
      );
    }


    let query =
      client
        .from('conversations')
        .select(
          [
            'id',
            'organization_id',
            'subject',
            'status',
            'created_by',
            'created_at',
            'updated_at',
            'last_message_at',
            'closed_at',
            'closed_by',
          ].join(',')
        )
        .is(
          'archived_at',
          null
        );


    if (scope === 'active') {
      query =
        query.eq(
          'status',
          'open'
        );
    }

    if (scope === 'archive') {
      query =
        query.eq(
          'status',
          'closed'
        );
    }


    const conversations =
      checkQuery(
        await query
          .order(
            'last_message_at',
            {
              ascending: false,
              nullsFirst: false,
            }
          )
          .order(
            'created_at',
            {
              ascending: false,
            }
          )
          .limit(500)
      );


    const organizationIds =
      [
        ...new Set(
          conversations.map(
            item =>
              item.organization_id
          )
        ),
      ];


    let organizations = [];

    if (organizationIds.length) {
      organizations =
        checkQuery(
          await client
            .from('organizations')
            .select('id,name')
            .in(
              'id',
              organizationIds
            )
        );
    }


    const organizationMap =
      new Map(
        organizations.map(
          organization => [
            organization.id,
            organization.name,
          ]
        )
      );


    const conversationIds =
      conversations.map(
        item => item.id
      );


    let recentMessages = [];

    if (conversationIds.length) {
      recentMessages =
        checkQuery(
          await client
            .from('messages')
            .select(
              [
                'conversation_id',
                'sender_side',
                'body',
                'created_at',
              ].join(',')
            )
            .in(
              'conversation_id',
              conversationIds
            )
            .eq(
              'visibility',
              'customer'
            )
            .order(
              'created_at',
              {
                ascending: false,
              }
            )
            .limit(1000)
        );
    }


    const latest =
      new Map();

    for (
      const message of
        recentMessages
    ) {
      if (
        !latest.has(
          message.conversation_id
        )
      ) {
        latest.set(
          message.conversation_id,
          message
        );
      }
    }


    return {
      status: 200,

      data: {
        conversations:
          conversations.map(
            conversation => ({
              ...conversation,

              organization_name:
                organizationMap.get(
                  conversation.organization_id
                ) ??
                'Onderneming',

              latest_message:
                latest.get(
                  conversation.id
                ) ?? null,
            })
          ),

        canWrite:
          canWrite(user),
      },
    };
  }


  // ========================================================
  // WRITE
  // ========================================================

  if (req.method !== 'POST') {
    throw new OfficeError(
      405,
      'METHOD_NOT_ALLOWED',
      'Actie niet toegestaan.'
    );
  }


  const input =
    await readBody(req);

  const action =
    requireText(
      input.action,
      'Actie',
      30
    );


  if (
    action === 'read' &&
    !canWrite(user)
  ) {
    return {
      status: 200,

      data: {
        readOnly: true,
      },
    };
  }


  if (!canWrite(user)) {
    throw new OfficeError(
      403,
      'COMMUNICATION_WRITE_DENIED',
      'Uw Office-rol heeft alleen leesrechten.'
    );
  }


  // ========================================================
  // NIEUW GESPREK VANUIT OFFICE
  // ========================================================

  if (action === 'create') {
    const organizationId =
      requireUuid(
        input.organizationId,
        'Onderneming'
      );

    await getOrganization(
      client,
      organizationId
    );

    const subject =
      requireText(
        input.subject,
        'Onderwerp',
        160
      );

    const message =
      requireText(
        input.body,
        'Bericht',
        5000
      );

    const idempotencyKey =
      requireUuid(
        input.idempotencyKey,
        'Bericht-ID'
      );


    const result =
      checkQuery(
        await client.rpc(
          'communication_create_thread',
          {
            p_organization_id:
              organizationId,

            p_subject:
              subject,

            p_body:
              message,

            p_idempotency_key:
              idempotencyKey,
          }
        )
      );


    try {
      const stored =
        checkQuery(
          await client
            .from('messages')
            .select(
              'id,conversation_id'
            )
            .eq(
              'idempotency_key',
              idempotencyKey
            )
            .maybeSingle()
        );

      if (stored?.id) {
        await notifyCustomerOfOfficeMessage({
          client,

          messageId:
            stored.id,

          threadId:
            stored.conversation_id,

          organizationId,

          companyName:
            (
              await getOrganization(
                client,
                organizationId
              )
            ).name,

          subject,

          message,

          privateKey:
            config?.communicationEmailjs
              ?.privateKey,

          fetchImpl,
        });
      }
    } catch {
      // Chatbericht is al opgeslagen.
      // E-mailnotificatie is best-effort.
    }

    return {
      status: 201,
      data: result,
    };
  }


  const threadId =
    requireUuid(
      input.threadId,
      'Gesprek'
    );


  // Eerst afdwingen dat het gesprek
  // voor Office leesbaar bestaat.
  await threadDetail(
    client,
    threadId
  );


  // ========================================================
  // BERICHT
  // ========================================================

  if (action === 'message') {
    const message =
      requireText(
        input.body,
        'Bericht',
        5000
      );

    const idempotencyKey =
      requireUuid(
        input.idempotencyKey,
        'Bericht-ID'
      );


    const result =
      checkQuery(
        await client.rpc(
          'communication_send_message',
          {
            p_conversation_id:
              threadId,

            p_body:
              message,

            p_idempotency_key:
              idempotencyKey,
          }
        )
      );


    try {
      const stored =
        checkQuery(
          await client
            .from('messages')
            .select('id')
            .eq(
              'idempotency_key',
              idempotencyKey
            )
            .maybeSingle()
        );

      if (stored?.id) {
        const detail =
          await threadDetail(
            client,
            threadId
          );

        await notifyCustomerOfOfficeMessage({
          client,

          messageId:
            stored.id,

          threadId,

          organizationId:
            detail.conversation
              .organization_id,

          companyName:
            detail.conversation
              .organization_name,

          subject:
            detail.conversation
              .subject,

          message,

          privateKey:
            config?.communicationEmailjs
              ?.privateKey,

          fetchImpl,
        });
      }
    } catch {
      // Chatbericht is al opgeslagen.
      // E-mailnotificatie is best-effort.
    }

    return {
      status: 200,
      data: result,
    };
  }


  // ========================================================
  // GELEZEN
  // ========================================================

  if (action === 'read') {
    const result =
      checkQuery(
        await client.rpc(
          'communication_mark_read',
          {
            p_conversation_id:
              threadId,
          }
        )
      );

    return {
      status: 200,
      data: result,
    };
  }


  // ========================================================
  // AFRONDEN
  // ========================================================

  if (action === 'close') {
    const result =
      checkQuery(
        await client.rpc(
          'communication_close_thread',
          {
            p_conversation_id:
              threadId,
          }
        )
      );

    return {
      status: 200,
      data: result,
    };
  }


  // ========================================================
  // HEROPENEN
  // ========================================================

  if (action === 'reopen') {
    const result =
      checkQuery(
        await client.rpc(
          'communication_reopen_thread',
          {
            p_conversation_id:
              threadId,
          }
        )
      );

    return {
      status: 200,
      data: result,
    };
  }


  throw new OfficeError(
    400,
    'INVALID_COMMUNICATION_ACTION',
    'Ongeldige communicatieactie.'
  );
}
