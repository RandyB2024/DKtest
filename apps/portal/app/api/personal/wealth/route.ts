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

      requireAal2(
        identity,
      );


      const {
        data,
        error,
      } =
        await client.rpc(
          "personal_wealth_get",
        );


      if (error) {
        console.error(
          "personal_wealth_get failed",
          {
            code:
              error.code,

            message:
              error.message,
          },
        );

        return Response.json(
          {
            error:
              "Jouw vermogen kan tijdelijk niet worden geladen.",
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

      requireAal2(
        identity,
      );


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
            "personal_wealth_item_save",
            {
              p_item_id:
                typeof body.itemId ===
                  "string"
                  ? body.itemId
                  : null,

              p_input:
                body.item,
            },
          );


        if (error) {
          console.error(
            "personal_wealth_item_save failed",
            {
              code:
                error.code,

              message:
                error.message,
            },
          );

          return Response.json(
            {
              error:
                "De vermogenspost kon niet worden opgeslagen.",
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
        typeof body.itemId ===
          "string"
      ) {
        const {
          error,
        } =
          await client.rpc(
            "personal_wealth_item_delete",
            {
              p_item_id:
                body.itemId,
            },
          );


        if (error) {
          return Response.json(
            {
              error:
                "De vermogenspost kon niet worden verwijderd.",
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
