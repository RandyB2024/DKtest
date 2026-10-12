import {
  calcomRequest,
} from "@/lib/calcom";

import {
  requireAppointmentIdentity,
} from "@/lib/appointment-access";

import {
  portalApi,
} from "@/lib/portal-api";


type CalEventType = {
  id?: number;
  title?: string;
  slug?: string;
  lengthInMinutes?: number;
  length?: number;
  description?: string | null;
};


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
        const response =
          await calcomRequest(
            "/event-types",
          ) as {
            data?: CalEventType[];
          };


        const items =
          Array.isArray(
            response?.data,
          )
            ? response.data
            : [];


        return Response.json(
          {
            items:
              items.map(
                item => ({
                  id:
                    item.id,

                  title:
                    item.title ??
                    "Afspraak",

                  slug:
                    item.slug ??
                    null,

                  durationMinutes:
                    item.lengthInMinutes ??
                    item.length ??
                    null,

                  description:
                    item.description ??
                    null,
                }),
              ),
          },
        );

      } catch (error) {
        console.error(
          "Cal.com event types failed",
          error,
        );

        return Response.json(
          {
            error:
              "Afspraaktypen konden niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }
    },
  );
}
