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

  meetingUrl?: string | null;

  eventType?: {
    slug?: string | null;
  } | null;
};


type CalBookingsResponse = {
  status?: string;

  data?:
    | CalBooking[]
    | {
        bookings?: CalBooking[];
      };
};


function extractBookings(
  response: CalBookingsResponse,
) {
  if (
    Array.isArray(
      response.data,
    )
  ) {
    return response.data;
  }

  if (
    response.data &&
    typeof response.data ===
      "object" &&
    Array.isArray(
      response.data.bookings,
    )
  ) {
    return response.data.bookings;
  }

  return [];
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

        const query =
          new URLSearchParams();


        query.set(
          "attendeeEmail",
          identity.email,
        );


        query.set(
          "afterStart",
          new Date().toISOString(),
        );


        const response =
          await calcomRequest(
            `/bookings?${query.toString()}`,
          ) as CalBookingsResponse;


        const bookings =
          extractBookings(
            response,
          );


        const appointment =
          bookings
            .filter(
              booking => {

                if (!booking.start) {
                  return false;
                }


                const start =
                  Date.parse(
                    booking.start,
                  );


                if (
                  !Number.isFinite(
                    start,
                  ) ||
                  start <= Date.now()
                ) {
                  return false;
                }


                const status =
                  (
                    booking.status ??
                    ""
                  ).toLowerCase();


                return ![
                  "cancelled",
                  "canceled",
                  "rejected",
                ].includes(
                  status,
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
