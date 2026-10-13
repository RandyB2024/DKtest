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

  attendees?: Array<{
    email?: string | null;
  }>;

  eventType?: {
    slug?: string | null;
  } | null;
};


function normalized(
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


async function getOwnedBooking(
  uid: string,
  userEmail: string,
) {
  const response =
    await calcomRequest(
      `/bookings/${encodeURIComponent(
        uid,
      )}`,
    ) as {
      data?: CalBooking;
    };


  const booking =
    response?.data;


  if (
    !booking ||
    booking.uid !== uid
  ) {
    return null;
  }


  const belongsToUser =
    (
      booking.attendees ??
      []
    ).some(
      attendee =>
        normalized(
          attendee.email,
        ) ===
        normalized(
          userEmail,
        ),
    );


  return belongsToUser
    ? booking
    : null;
}


export async function POST(
  request: Request,
) {
  return portalApi(
    request,
    async ({ client }) => {

      const identity =
        await requireAppointmentIdentity(
          client,
        );


      const body =
        await request.json()
          .catch(
            () =>
              null,
          ) as {
            uid?: string;
            action?: string;
          } | null;


      if (
        !body ||
        typeof body.uid !==
          "string" ||
        body.uid.length < 8 ||
        ![
          "cancel",
          "reschedule",
        ].includes(
          body.action ??
          "",
        )
      ) {
        return Response.json(
          {
            error:
              "Ongeldige afspraakactie.",
          },
          {
            status: 400,
          },
        );
      }


      try {
        const booking =
          await getOwnedBooking(
            body.uid,
            identity.email,
          );


        if (!booking) {
          return Response.json(
            {
              error:
                "Deze afspraak hoort niet bij jouw account.",
            },
            {
              status: 403,
            },
          );
        }


        if (
          body.action ===
          "cancel"
        ) {
          await calcomRequest(
            `/bookings/${encodeURIComponent(
              body.uid,
            )}`,
            {
              method:
                "DELETE",

              body:
                JSON.stringify({
                  cancellationReason:
                    "Geannuleerd via Mijn Onderneming",
                }),
            },
          );


          return Response.json(
            {
              ok: true,
              cancelled: true,
            },
          );
        }


        const slug =
          booking.eventType
            ?.slug ??
          "afspraak";


        const url =
          new URL(
            `https://cal.com/bestemd/${encodeURIComponent(
              slug,
            )}`,
          );


        url.searchParams.set(
          "rescheduleUid",
          body.uid,
        );


        return Response.json(
          {
            ok: true,
            url:
              url.toString(),
          },
        );

      } catch (error) {

        console.error(
          "Appointment management failed",
          error,
        );


        return Response.json(
          {
            error:
              "De afspraak kon niet worden aangepast.",
          },
          {
            status: 503,
          },
        );
      }
    },
  );
}
