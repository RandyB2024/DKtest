import {
  AccessError,
  requireAal2,
} from "@/lib/portal-access";

import {
  requirePersonalIdentity,
} from "@/lib/personal-access";

import {
  portalApi,
} from "@/lib/portal-api";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  return portalApi(
    request,
    async ({ client }) => {
      const identity =
        await requirePersonalIdentity(
          client,
        );

      requireAal2(identity);

      const {
        id,
      } =
        await params;

      if (
        !uuidPattern.test(
          id,
        )
      ) {
        throw new AccessError(
          400,
          "Ongeldig document.",
        );
      }

      const {
        data: document,
        error: documentError,
      } =
        await client
          .from(
            "personal_documents",
          )
          .select(
            "id,acknowledgement_required"
          )
          .eq(
            "id",
            id,
          )
          .eq(
            "user_id",
            identity.profile.id,
          )
          .maybeSingle();

      if (documentError) {
        throw new AccessError(
          503,
          "Leesbevestiging kan tijdelijk niet worden opgeslagen.",
        );
      }

      if (!document) {
        throw new AccessError(
          404,
          "Document niet gevonden.",
        );
      }

      const now =
        new Date().toISOString();

      const {
        error: upsertError,
      } =
        await client
          .from(
            "personal_document_receipts",
          )
          .upsert(
            {
              document_id: id,
              user_id:
                identity.profile.id,
              opened_at: now,
              acknowledged_at:
                now,
            },
            {
              onConflict:
                "document_id,user_id",
            },
          );

      if (upsertError) {
        throw new AccessError(
          503,
          "Leesbevestiging kan tijdelijk niet worden opgeslagen.",
        );
      }

      return Response.json({
        result: {
          openedAt: now,
          acknowledgedAt: now,
        },
      });
    },
  );
}
