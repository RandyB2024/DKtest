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
          "personal_abc_get",
        );


      if (error) {
        console.error(
          "personal_abc_get failed",
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
              "Mijn ABC kan tijdelijk niet worden geladen.",
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


      const {
        data,
        error,
      } =
        await client.rpc(
          "personal_abc_save",
          {
            p_input:
              body,
          },
        );


      if (error) {
        console.error(
          "personal_abc_save failed",
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
              "Mijn ABC kon niet worden opgeslagen.",
          },
          {
            status: 400,
          },
        );
      }


      return Response.json(
        data,
      );
    },
  );
}
