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


const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CommunicationConversationRow = {
  id: string;
  organization_id: string;
  subject: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
};

type CommunicationMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_side: "customer" | "office";
  body: string;
  created_at: string;
};

type CommunicationRecentMessageRow = {
  conversation_id: string;
  body: string;
  created_at: string;
  sender_side: "customer" | "office";
};



function requiredString(
  value: unknown,
  label: string,
  maxLength: number,
) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maxLength
  ) {
    throw new AccessError(
      400,
      `${label} is ongeldig.`,
    );
  }

  return value.trim();
}


function requiredUuid(
  value: unknown,
  label: string,
) {
  if (
    typeof value !== "string" ||
    !uuidPattern.test(value)
  ) {
    throw new AccessError(
      400,
      `${label} is ongeldig.`,
    );
  }

  return value;
}


export async function GET(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePortalIdentity(
          client,
        );

      requireAal2(identity);

      const url =
        new URL(request.url);

      const rawOrganizationId =
        url.searchParams.get(
          "organizationId",
        );

      const organizationId =
        requireOrganization(
          identity,
          rawOrganizationId,
          true,
        );

      const threadId =
        url.searchParams.get(
          "threadId",
        );

      const scope =
        url.searchParams.get(
          "scope",
        ) ?? "active";

      if (
        scope !== "active" &&
        scope !== "archive" &&
        scope !== "all"
      ) {
        throw new AccessError(
          400,
          "Ongeldige communicatie-weergave.",
        );
      }


      // =====================================================
      // ÉÉN GESPREK + BERICHTEN
      // =====================================================

      if (threadId) {
        requiredUuid(
          threadId,
          "Gesprek",
        );

        const {
          data: conversation,
          error: conversationError,
        } =
          await client
            .from("conversations")
            .select(
              [
                "id",
                "organization_id",
                "subject",
                "status",
                "created_by",
                "created_at",
                "updated_at",
                "last_message_at",
                "closed_at",
                "closed_by",
              ].join(","),
            )
            .eq(
              "id",
              threadId,
            )
            .is(
              "archived_at",
              null,
            )
            .maybeSingle();

        if (conversationError) {
          throw new AccessError(
            503,
            "Het gesprek kon tijdelijk niet worden geladen.",
          );
        }

        if (!conversation) {
          throw new AccessError(
            404,
            "Gesprek niet gevonden.",
          );
        }

        const conversationRow =
          conversation as unknown as CommunicationConversationRow;

        requireOrganization(
          identity,
          conversationRow.organization_id,
        );

        if (
          organizationId !== "all" &&
          conversationRow.organization_id !==
            organizationId
        ) {
          throw new AccessError(
            403,
            "Geen toegang tot dit gesprek.",
          );
        }

        const {
          data: messages,
          error: messagesError,
        } =
          await client
            .from("messages")
            .select(
              [
                "id",
                "conversation_id",
                "sender_id",
                "sender_side",
                "body",
                "created_at",
              ].join(","),
            )
            .eq(
              "conversation_id",
              threadId,
            )
            .eq(
              "visibility",
              "customer",
            )
            .order(
              "created_at",
              {
                ascending: true,
              },
            )
            .limit(500);

        if (messagesError) {
          throw new AccessError(
            503,
            "De berichten konden tijdelijk niet worden geladen.",
          );
        }

        const organization =
          identity.organizations.find(
            (item) =>
              item.id ===
              conversationRow.organization_id,
          );

        const messageRows =
          (messages ?? []) as unknown as CommunicationMessageRow[];

        return Response.json({
          conversation: {
            ...conversationRow,
            organization_name:
              organization?.name ??
              "Onderneming",
          },

          messages:
            messageRows,

          currentUserId:
            identity.profile.id,
        });
      }


      // =====================================================
      // GESPREKKENLIJST
      // =====================================================

      let query =
        client
          .from("conversations")
          .select(
            [
              "id",
              "organization_id",
              "subject",
              "status",
              "created_by",
              "created_at",
              "updated_at",
              "last_message_at",
              "closed_at",
              "closed_by",
            ].join(","),
          )
          .is(
            "archived_at",
            null,
          );

      if (
        scope === "active"
      ) {
        query =
          query.eq(
            "status",
            "open",
          );
      } else if (
        scope === "archive"
      ) {
        query =
          query.eq(
            "status",
            "closed",
          );
      }

      if (
        organizationId === "all"
      ) {
        query =
          query.in(
            "organization_id",
            identity.organizations.map(
              (item) => item.id,
            ),
          );
      } else {
        query =
          query.eq(
            "organization_id",
            organizationId,
          );
      }

      const {
        data: conversations,
        error: conversationsError,
      } =
        await query
          .order(
            "last_message_at",
            {
              ascending: false,
              nullsFirst: false,
            },
          )
          .order(
            "created_at",
            {
              ascending: false,
            },
          )
          .limit(100);

      if (conversationsError) {
        throw new AccessError(
          503,
          "Gesprekken konden tijdelijk niet worden geladen.",
        );
      }

      const rows =
        (conversations ?? []) as unknown as CommunicationConversationRow[];

      const conversationIds =
        rows.map(
          (item) => item.id,
        );

      const latestByConversation =
        new Map<
          string,
          {
            body: string;
            created_at: string;
            sender_side:
              | "customer"
              | "office";
          }
        >();

      if (
        conversationIds.length
      ) {
        const {
          data: recentMessages,
          error: recentError,
        } =
          await client
            .from("messages")
            .select(
              [
                "conversation_id",
                "body",
                "created_at",
                "sender_side",
              ].join(","),
            )
            .in(
              "conversation_id",
              conversationIds,
            )
            .eq(
              "visibility",
              "customer",
            )
            .order(
              "created_at",
              {
                ascending: false,
              },
            )
            .limit(500);

        if (recentError) {
          throw new AccessError(
            503,
            "Gesprekken konden tijdelijk niet volledig worden geladen.",
          );
        }

        const recentMessageRows =
          (recentMessages ?? []) as unknown as CommunicationRecentMessageRow[];

        for (
          const message of
            recentMessageRows
        ) {
          if (
            !latestByConversation.has(
              message.conversation_id,
            )
          ) {
            latestByConversation.set(
              message.conversation_id,
              message,
            );
          }
        }
      }

      return Response.json({
        conversations:
          rows.map(
            (conversation) => {
              const organization =
                identity.organizations.find(
                  (item) =>
                    item.id ===
                    conversation.organization_id,
                );

              const latest =
                latestByConversation.get(
                  conversation.id,
                );

              return {
                ...conversation,

                organization_name:
                  organization?.name ??
                  "Onderneming",

                latest_message:
                  latest
                    ? {
                        body:
                          latest.body,

                        created_at:
                          latest.created_at,

                        sender_side:
                          latest.sender_side,
                      }
                    : null,
              };
            },
          ),
      });
    },
  );
}


export async function POST(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePortalIdentity(
          client,
        );

      requireAal2(identity);

      const input =
        await readBody(
          request,
        );

      const action =
        requiredString(
          input.action,
          "Actie",
          40,
        );


      // =====================================================
      // NIEUW GESPREK
      // =====================================================

      if (
        action ===
        "create"
      ) {
        const organizationId =
          requireOrganization(
            identity,
            input.organizationId,
          );

        const subject =
          requiredString(
            input.subject,
            "Onderwerp",
            160,
          );

        const body =
          requiredString(
            input.body,
            "Bericht",
            5000,
          );

        const idempotencyKey =
          requiredUuid(
            input.idempotencyKey,
            "Bericht-ID",
          );

        const {
          data,
          error,
        } =
          await client.rpc(
            "communication_create_thread",
            {
              p_organization_id:
                organizationId,

              p_subject:
                subject,

              p_body:
                body,

              p_idempotency_key:
                idempotencyKey,
            },
          );

        if (error) {
          throw new AccessError(
            503,
            "Het gesprek kon niet worden gestart. Probeer het opnieuw.",
          );
        }

        return Response.json(
          data,
          {
            status: 201,
          },
        );
      }


      // =====================================================
      // BERICHT VERSTUREN
      // =====================================================

      if (
        action ===
        "message"
      ) {
        const threadId =
          requiredUuid(
            input.threadId,
            "Gesprek",
          );

        const body =
          requiredString(
            input.body,
            "Bericht",
            5000,
          );

        const idempotencyKey =
          requiredUuid(
            input.idempotencyKey,
            "Bericht-ID",
          );

        const {
          data: conversation,
          error:
            conversationError,
        } =
          await client
            .from("conversations")
            .select(
              "id,organization_id,status",
            )
            .eq(
              "id",
              threadId,
            )
            .is(
              "archived_at",
              null,
            )
            .maybeSingle();

        if (
          conversationError ||
          !conversation
        ) {
          throw new AccessError(
            404,
            "Gesprek niet gevonden.",
          );
        }

        const conversationRow =
          conversation as unknown as {
            id: string;
            organization_id: string;
            status: string;
          };

        requireOrganization(
          identity,
          conversationRow.organization_id,
        );

        if (
          conversationRow.status !==
          "open"
        ) {
          throw new AccessError(
            409,
            "Dit gesprek is gesloten.",
          );
        }

        const {
          data,
          error,
        } =
          await client.rpc(
            "communication_send_message",
            {
              p_conversation_id:
                threadId,

              p_body:
                body,

              p_idempotency_key:
                idempotencyKey,
            },
          );

        if (error) {
          throw new AccessError(
            503,
            "Het bericht kon niet worden verzonden. Probeer het opnieuw.",
          );
        }

        return Response.json(
          data,
        );
      }


      // =====================================================
      // GELEZEN
      // =====================================================

      if (
        action ===
        "read"
      ) {
        const threadId =
          requiredUuid(
            input.threadId,
            "Gesprek",
          );

        const {
          data: conversation,
          error:
            conversationError,
        } =
          await client
            .from("conversations")
            .select(
              "id,organization_id",
            )
            .eq(
              "id",
              threadId,
            )
            .is(
              "archived_at",
              null,
            )
            .maybeSingle();

        if (
          conversationError ||
          !conversation
        ) {
          throw new AccessError(
            404,
            "Gesprek niet gevonden.",
          );
        }

        const conversationRow =
          conversation as unknown as {
            id: string;
            organization_id: string;
          };

        requireOrganization(
          identity,
          conversationRow.organization_id,
        );

        const {
          data,
          error,
        } =
          await client.rpc(
            "communication_mark_read",
            {
              p_conversation_id:
                threadId,
            },
          );

        if (error) {
          throw new AccessError(
            503,
            "De leesstatus kon tijdelijk niet worden bijgewerkt.",
          );
        }

        return Response.json(
          data,
        );
      }


      throw new AccessError(
        400,
        "Ongeldige communicatieactie.",
      );
    },
  );
}
