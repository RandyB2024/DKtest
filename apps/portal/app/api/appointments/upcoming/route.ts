import {
  calcomRequest,
  getCalcomSyncKey,
} from "@/lib/calcom";

import {
  requireAppointmentIdentity,
} from "@/lib/appointment-access";

import {
  portalApi,
} from "@/lib/portal-api";

import {
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";


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


function normalizeStatus(
  booking: CalBooking,
) {
  const status =
    (
      booking.status ??
      ""
    )
      .trim()
      .toLowerCase();


  if (
    [
      "cancelled",
      "canceled",
      "rejected",
    ].includes(
      status,
    )
  ) {
    return "cancelled";
  }


  if (
    [
      "no_show",
      "no-show",
      "noshow",
    ].includes(
      status,
    )
  ) {
    return "no_show";
  }


  if (
    booking.start &&
    Date.parse(
      booking.start,
    ) < Date.now()
  ) {
    return "completed";
  }


  return "planned";
}


function isFutureActive(
  booking: CalBooking,
) {
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


  return normalizeStatus(
    booking,
  ) === "planned";
}


export async function GET(
  request: Request,
) {
  return portalApi(
    request,
    async ({
      client,
    }) => {

      const identity =
        await requireAppointmentIdentity(
          client,
        );


      const url =
        new URL(
          request.url,
        );


      const requestedOrganizationId =
        url.searchParams.get(
          "organizationId",
        );


      let organizationId:
        string |
        null =
        null;


      /*
       * Als de afspraakpagina vanuit Mijn Onderneming
       * wordt geopend, valideren we de onderneming
       * opnieuw server-side.
       */
      if (
        requestedOrganizationId
      ) {
        const businessIdentity =
          await requirePortalIdentity(
            client,
          );


        requireAal2(
          businessIdentity,
        );


        organizationId =
          requireOrganization(
            businessIdentity,
            requestedOrganizationId,
          );
      }


      try {

        const query =
          new URLSearchParams();


        query.set(
          "attendeeEmail",
          identity.email,
        );


        /*
         * Voor Mijn Onderneming halen we het gehele
         * huidige kalenderjaar op. Daarmee kunnen we
         * gesprek 1/2/3/4 reconstrueren.
         *
         * Zonder onderneming blijft de bestaande
         * persoonlijke afspraakroute gewoon werken.
         */
        if (organizationId) {

          const year =
            Number(
              new Intl.DateTimeFormat(
                "en",
                {
                  year:
                    "numeric",

                  timeZone:
                    "Europe/Amsterdam",
                },
              ).format(
                new Date(),
              ),
            );


          const yearStart =
            new Date(
              `${year}-01-01T00:00:00+01:00`,
            );


          query.set(
            "afterStart",
            yearStart.toISOString(),
          );

        } else {

          query.set(
            "afterStart",
            new Date().toISOString(),
          );
        }


        const response =
          await calcomRequest(
            `/bookings?${query.toString()}`,
          ) as CalBookingsResponse;


        const bookings =
          extractBookings(
            response,
          );


        /*
         * Alleen Mijn Onderneming:
         * Cal.com → wize_appointments.
         */
        if (organizationId) {

          const chronological =
            [...bookings]
              .filter(
                booking =>
                  Boolean(
                    booking.uid &&
                    booking.start &&
                    booking.end,
                  ),
              )
              .sort(
                (
                  a,
                  b,
                ) =>
                  Date.parse(
                    a.start!,
                  ) -
                  Date.parse(
                    b.start!,
                  ),
              );


          for (
            const booking of
            chronological
          ) {
            const {
              error:
                syncError,
            } =
              await client.rpc(
                "wize_sync_calcom_booking",
                {
                  p_organization_id:
                    organizationId,

                  p_calcom_uid:
                    booking.uid,

                  p_starts_at:
                    booking.start,

                  p_ends_at:
                    booking.end,

                  p_status:
                    normalizeStatus(
                      booking,
                    ),

                  p_sync_key:
                    getCalcomSyncKey(),
                },
              );


            if (syncError) {
              console.error(
                "Appointment Cal.com sync failed",
                {
                  organizationId,

                  bookingUid:
                    booking.uid,

                  message:
                    syncError.message,
                },
              );
            }
          }
        }


        const appointment =
          bookings
            .filter(
              isFutureActive,
            )
            .sort(
              (
                a,
                b,
              ) =>
                Date.parse(
                  a.start!,
                ) -
                Date.parse(
                  b.start!,
                ),
            )[0];


        let appointmentStatus:
          unknown =
          null;


        if (organizationId) {

          const {
            data,
            error,
          } =
            await client.rpc(
              "wize_get_appointment_status",
              {
                p_organization_id:
                  organizationId,
              },
            );


          if (error) {
            console.error(
              "Appointment program status failed",
              {
                organizationId,
                message:
                  error.message,
              },
            );
          } else {
            appointmentStatus =
              data;
          }
        }


        return Response.json(
          {
            appointment:
              appointment &&
              appointment.uid
                ? {
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
                      appointment
                        .eventType
                        ?.slug ??
                      "afspraak",
                  }
                : null,

            appointmentStatus,
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
