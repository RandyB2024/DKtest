import {
  requireAal2,
} from "@/lib/portal-access";

import {
  requirePersonalIdentity,
} from "@/lib/personal-access";

import {
  portalApi,
  readBody,
} from "@/lib/portal-api";


export async function GET(
  request: Request,
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
        data,
        error,
      } =
        await client.rpc(
          "personal_coaching_get",
        );


      if (error) {
        return Response.json(
          {
            error:
              "Lifecoaching kan tijdelijk niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }


      return Response.json(
        data,
      );
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
        await requirePersonalIdentity(
          client,
        );

      requireAal2(identity);

      const body =
        await readBody(
          request,
        );


      if (
        body.action ===
        "save"
      ) {
        const {
          error,
        } =
          await client.rpc(
            "personal_coaching_save",
            {
              p_entry_id:
                typeof body.entryId ===
                  "string"
                  ? body.entryId
                  : null,

              p_input:
                body.entry,
            },
          );


        if (error) {
          return Response.json(
            {
              error:
                "Het coachingmoment kon niet worden opgeslagen.",
            },
            {
              status: 400,
            },
          );
        }


        return Response.json({
          ok: true,
        });
      }


      if (
        body.action ===
        "delete" &&
        typeof body.entryId ===
          "string"
      ) {
        const {
          error,
        } =
          await client.rpc(
            "personal_coaching_delete",
            {
              p_entry_id:
                body.entryId,
            },
          );


        if (error) {
          return Response.json(
            {
              error:
                "Het coachingmoment kon niet worden verwijderd.",
            },
            {
              status: 400,
            },
          );
        }


        return Response.json({
          ok: true,
        });
      }


      return Response.json(
        {
          error:
            "Ongeldige actie.",
        },
        {
          status: 400,
        },
      );
    },
  );
}
