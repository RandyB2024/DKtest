import {
  calcomRequest,
} from "@/lib/calcom";

import {
  requireAppointmentIdentity,
} from "@/lib/appointment-access";

import {
  portalApi,
} from "@/lib/portal-api";


export async function GET(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {

      await requireAppointmentIdentity(
        client,
      );


      try {
        const result =
          await calcomRequest(
            "/event-types",
          );


        return Response.json(
          {
            ok: true,
            connected: true,
            result,
          },
        );

      } catch (error) {
        console.error(
          "Cal.com connection test failed",
          error,
        );

        return Response.json(
          {
            ok: false,
            connected: false,
            error:
              "Cal.com verbinding is niet beschikbaar.",
          },
          {
            status: 503,
          },
        );
      }
    },
  );
}
