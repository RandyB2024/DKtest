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

  start?: string | null;
  end?: string | null;
  status?: string | null;

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
        await request
          .json()
          .catch(
            () =>
              null,
          ) as {
            uid?: string;
            action?: string;
            organizationId?: string;
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


      /*
       * organizationId wordt alleen gebruikt voor
       * Mijn Onderneming.
       *
       * We vertrouwen nooit blind op de waarde uit
       * de browser. De organisatie wordt opnieuw
       * tegen de ingelogde gebruiker gecontroleerd.
       */
      let businessOrganizationId:
        string |
        null =
        null;


      if (
        typeof body
          .organizationId ===
        "string"
      ) {
        const businessIdentity =
          await requirePortalIdentity(
            client,
          );


        requireAal2(
          businessIdentity,
        );


        businessOrganizationId =
          requireOrganization(
            businessIdentity,
            body.organizationId,
          );
      }


      try {

        /*
         * Eerst bij Cal.com controleren dat de
         * booking werkelijk van de ingelogde
         * gebruiker is.
         */
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


        /*
         * ANNULEREN
         */
        if (
          body.action ===
          "cancel"
        ) {
          await calcomRequest(
            `/bookings/${encodeURIComponent(
              body.uid,
            )}/cancel`,
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  cancellationReason:
                    "Geannuleerd via Mijn Onderneming",
                }),
            },
          );


          /*
           * Als dit Mijn Onderneming betreft,
           * synchroniseren we de annulering meteen
           * met Wize.
           *
           * Zonder geldige:
           * - sessie
           * - AAL2
           * - organisatie-toegang
           * - server sync key
           *
           * accepteert Supabase dit niet.
           */
          if (
            businessOrganizationId &&
            booking.start &&
            booking.end
          ) {
            const {
              error:
                syncError,
            } =
              await client.rpc(
                "wize_sync_calcom_booking",
                {
                  p_organization_id:
                    businessOrganizationId,

                  p_calcom_uid:
                    body.uid,

                  p_starts_at:
                    booking.start,

                  p_ends_at:
                    booking.end,

                  p_status:
                    "cancelled",

                  p_sync_key:
                    getCalcomSyncKey(),
                },
              );


            /*
             * Cal.com heeft de afspraak al
             * geannuleerd. Een tijdelijke Wize
             * sync-fout mag daarom niet doen alsof
             * de annulering zelf is mislukt.
             *
             * De volgende Cal.com-sync kan de
             * status opnieuw herstellen.
             */
            if (syncError) {
              console.error(
                "Cancelled appointment Wize sync failed",
                {
                  organizationId:
                    businessOrganizationId,

                  bookingUid:
                    body.uid,

                  message:
                    syncError.message,
                },
              );
            }
          }


          return Response.json(
            {
              ok: true,
              cancelled: true,
            },
          );
        }


        /*
         * VERPLAATSEN
         *
         * De feitelijke wijziging gebeurt in Cal.com.
         * Zodra Wize daarna de booking opnieuw
         * ophaalt, wordt dezelfde Cal.com UID
         * bijgewerkt in plaats van een tweede
         * Bestemd-afspraak aangemaakt.
         */
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
