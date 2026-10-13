import {
  calcomRequest,
} from "@/lib/calcom";

import {
  requireAppointmentIdentity,
} from "@/lib/appointment-access";

import {
  portalApi,
} from "@/lib/portal-api";


type CalBooking = {
  uid?: string;
  title?: string | null;
  start?: string | null;
  end?: string | null;
  status?: string | null;

  attendees?: Array<{
    email?: string | null;
    name?: string | null;
  }>;

  meetingUrl?: string | null;

  eventType?: {
    slug?: string | null;
  } | null;
};


function email(
  value:
    | string
    | null
    | undefined,
) {
  return (
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}


export async function GET(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {

      const identity =
        await requireAppointmentIdentity(
          client,
        );


      try {
        const response =
          await calcomRequest(
            "/bookings",
          ) as {
            data?: CalBooking[];
          };


        const items =
          Array.isArray(
            response?.data,
          )
            ? response.data
            : [];


        const now =
          Date.now();


        const appointment =
          items
            .filter(
              item => {
                const start =
                  item.start
                    ? Date.parse(
                        item.start,
                      )
                    : NaN;


                if (
                  !Number.isFinite(
                    start,
                  ) ||
                  start <= now
                ) {
                  return false;
                }


                const status =
                  (
                    item.status ??
                    ""
                  ).toLowerCase();


                if (
                  [
                    "cancelled",
                    "canceled",
                    "rejected",
                  ].includes(
                    status,
                  )
                ) {
                  return false;
                }


                return (
                  item.attendees ??
                  []
                ).some(
                  attendee =>
                    email(
                      attendee.email,
                    ) ===
                    email(
                      identity.email,
                    ),
                );
              },
            )
            .sort(
              (a, b) =>
                Date.parse(
                  a.start!,
                ) -
                Date.parse(
                  b.start!,
                ),
            )[0];


        if (
          !appointment ||
          !appointment.uid
        ) {
          return Response.json(
            {
              appointment:
                null,
            },
          );
        }


        return Response.json(
          {
            appointment: {
              uid:
                appointment.uid,

              title:
                appointment.title ??
                "Gesprek met Bestemd",

              start:
                appointment.start,

              end:
                appointment.end,

              status:
                appointment.status ??
                null,

              meetingUrl:
                appointment.meetingUrl ??
                null,

              eventSlug:
                appointment.eventType
                  ?.slug ??
                "afspraak",
            },
          },
        );

      } catch (error) {

        console.error(
          "Upcoming appointment failed",
          error,
        );


        return Response.json(
          {
            error:
              "De afspraak kon niet worden geladen.",
          },
          {
            status: 503,
          },
        );
      }
    },
  );
}
