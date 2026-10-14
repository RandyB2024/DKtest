import {
  AccessError,
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";

import {
  calcomRequest,
  getCalcomSyncKey,
} from "@/lib/calcom";

import {
  portalApi,
  readBody,
} from "@/lib/portal-api";

import {
  notifyOfficeOfCustomerMessage,
} from "@/lib/communication-email";


type OpenPositionsRow = {
  receivables_total_cents:
    | number
    | string
    | null;

  receivables_overdue_cents:
    | number
    | string
    | null;

  receivables_count:
    | number
    | string
    | null;

  payables_total_cents:
    | number
    | string
    | null;

  payables_overdue_cents:
    | number
    | string
    | null;

  payables_count:
    | number
    | string
    | null;
};


type FinancialSummary = {
  revenueCents: number;
  costsCents: number;
  resultCents: number;
};


type BankResponse = {
  summary?: {
    count?: number;
    unmatchedCount?: number;
    suggestedCount?: number;
    matchedCount?: number;
  };

  items?: Array<{
    id: string;
    bookedAt: string;
    amountCents: number;
    counterpartyName: string | null;
    description: string | null;
    reconciliationStatus: string;
  }>;
};


function numberValue(
  value:
    | number
    | string
    | null
    | undefined,
) {
  const parsed =
    Number(value ?? 0);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}


function money(
  cents: number,
) {
  return new Intl.NumberFormat(
    "nl-NL",
    {
      style:
        "currency",

      currency:
        "EUR",
    },
  ).format(
    cents / 100,
  );
}


function requiredString(
  value: unknown,
  label: string,
  maxLength: number,
) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length >
      maxLength
  ) {
    throw new AccessError(
      400,
      `${label} is ongeldig.`,
    );
  }

  return value.trim();
}


async function loadCompanyContext(
  client: any,
  organizationId: string,
) {
  const [
    openResult,
    periodResult,
    bankResult,
  ] =
    await Promise.all([
      client.rpc(
        "get_open_positions",
        {
          p_organization_id:
            organizationId,
        },
      ),

      client.rpc(
        "get_financial_period_summary",
        {
          p_organization_id:
            organizationId,

          p_period:
            "month",
        },
      ),

      client.rpc(
        "get_bank_transactions",
        {
          p_organization_id:
            organizationId,

          p_limit:
            100,
        },
      ),
    ]);

  if (
    openResult.error ||
    periodResult.error ||
    bankResult.error
  ) {
    throw new AccessError(
      503,
      "Wize kan de administratie tijdelijk niet volledig lezen.",
    );
  }

  const openRow =
    Array.isArray(
      openResult.data,
    )
      ? (
          openResult
            .data[0] as
            OpenPositionsRow
            | undefined
        )
      : (
          openResult.data as
            OpenPositionsRow
            | null
        );

  const financial =
    (
      periodResult.data ??
      {}
    ) as Partial<
      FinancialSummary
    >;

  const bank =
    (
      bankResult.data ??
      {}
    ) as BankResponse;

  return {
    receivables: {
      totalCents:
        numberValue(
          openRow
            ?.receivables_total_cents,
        ),

      overdueCents:
        numberValue(
          openRow
            ?.receivables_overdue_cents,
        ),

      count:
        numberValue(
          openRow
            ?.receivables_count,
        ),
    },

    payables: {
      totalCents:
        numberValue(
          openRow
            ?.payables_total_cents,
        ),

      overdueCents:
        numberValue(
          openRow
            ?.payables_overdue_cents,
        ),

      count:
        numberValue(
          openRow
            ?.payables_count,
        ),
    },

    month: {
      revenueCents:
        numberValue(
          financial
            .revenueCents,
        ),

      costsCents:
        numberValue(
          financial
            .costsCents,
        ),

      resultCents:
        numberValue(
          financial
            .resultCents,
        ),
    },

    bank: {
      transactionCount:
        numberValue(
          bank.summary
            ?.count,
        ),

      unmatchedCount:
        numberValue(
          bank.summary
            ?.unmatchedCount,
        ),

      suggestedCount:
        numberValue(
          bank.summary
            ?.suggestedCount,
        ),

      matchedCount:
        numberValue(
          bank.summary
            ?.matchedCount,
        ),

      unmatchedItems:
        (
          bank.items ??
          []
        )
          .filter(
            (item) =>
              item
                .reconciliationStatus !==
              "matched",
          )
          .slice(
            0,
            5,
          ),
    },
  };
}



type WizeCalBooking = {
  uid?: string;
  title?: string | null;
  start?: string | null;
  end?: string | null;
  status?: string | null;

  eventType?: {
    slug?: string | null;
  } | null;
};


function extractCalBookings(
  response: unknown,
): WizeCalBooking[] {
  const value =
    response as {
      data?:
        | WizeCalBooking[]
        | {
            bookings?:
              WizeCalBooking[];
          };
    };

  if (
    Array.isArray(
      value?.data,
    )
  ) {
    return value.data;
  }

  if (
    value?.data &&
    typeof value.data ===
      "object" &&
    Array.isArray(
      value.data.bookings,
    )
  ) {
    return value
      .data
      .bookings;
  }

  return [];
}



function normalizeCalBookingStatus(
  booking: WizeCalBooking,
) {
  const rawStatus =
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
      rawStatus,
    )
  ) {
    return "cancelled";
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


async function syncCalBooking(
  client: any,
  organizationId: string,
  booking: WizeCalBooking,
) {
  if (
    !booking.uid ||
    !booking.start ||
    !booking.end
  ) {
    return null;
  }

  const {
    data,
    error,
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
          normalizeCalBookingStatus(
            booking,
          ),

        p_sync_key:
          getCalcomSyncKey(),
      },
    );

  if (error) {
    console.error(
      "Wize Cal.com booking sync failed",
      {
        organizationId,
        bookingUid:
          booking.uid,
        message:
          error.message,
      },
    );

    return null;
  }

  return data;
}


async function loadAppointmentContext(
  client: any,
  organizationId: string,
  customerEmail: string,
) {
  let upcoming:
    WizeCalBooking |
    null =
    null;

  try {
    const query =
      new URLSearchParams();

    query.set(
      "attendeeEmail",
      customerEmail,
    );

    const now =
      new Date();

    const currentYear =
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
          now,
        ),
      );

    const yearStart =
      new Date(
        `${currentYear}-01-01T00:00:00+01:00`,
      );

    query.set(
      "afterStart",
      yearStart
        .toISOString(),
    );

    const response =
      await calcomRequest(
        `/bookings?${query.toString()}`,
      );

    const bookings =
      extractCalBookings(
        response,
      );

    const chronologicalBookings =
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
          (a, b) =>
            Date.parse(
              a.start!,
            ) -
            Date.parse(
              b.start!,
            ),
        );


    /*
     * Cal.com is hier de gecontroleerde externe bron.
     * We synchroniseren chronologisch zodat gesprek 1/2/3/4
     * consequent wordt toegekend.
     */
    for (
      const booking of
      chronologicalBookings
    ) {
      await syncCalBooking(
        client,
        organizationId,
        booking,
      );
    }


    upcoming =
      bookings
        .filter(
          booking => {
            if (
              !booking.start
            ) {
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
              start <=
                Date.now()
            ) {
              return false;
            }

            const status =
              (
                booking.status ??
                ""
              )
                .trim()
                .toLowerCase();

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
        )[0] ??
      null;

  } catch {
    // Wize mag niet volledig uitvallen
    // als Cal.com tijdelijk niet bereikbaar is.
  }


  const {
    data:
      appointmentStatus,
    error:
      appointmentStatusError,
  } =
    await client.rpc(
      "wize_get_appointment_status",
      {
        p_organization_id:
          organizationId,
      },
    );


  let appointmentEvent:
    unknown =
    null;


  /*
   * Alleen een detector uitvoeren wanneer:
   * - Bestemd de programmastatus kon lezen;
   * - Cal.com geen toekomstige afspraak teruggeeft.
   *
   * Zo voorkomt Wize onnodig vragen wanneer er live al
   * een afspraak bestaat.
   */
  if (
    !appointmentStatusError &&
    !upcoming
  ) {
    const {
      data,
      error,
    } =
      await client.rpc(
        "wize_detect_appointment_event",
        {
          p_organization_id:
            organizationId,
        },
      );

    if (!error) {
      appointmentEvent =
        data;
    }
  }


  /*
   * Administratieve event-engine.
   *
   * Detecteert o.a. uitgaande bankbetalingen waarvoor
   * nog een bon/factuur of definitieve verwerking ontbreekt.
   *
   * Dit gebeurt vóór wize_get_active_events, zodat een nieuw
   * signaal direct in dezelfde Wize-response zichtbaar is.
   */
  const {
    error:
      bankDocumentEventError,
  } =
    await client.rpc(
      "wize_detect_bank_document_events",
      {
        p_organization_id:
          organizationId,
      },
    );


  if (
    bankDocumentEventError
  ) {
    console.error(
      "Wize bank/document event detection failed",
      {
        organizationId,

        message:
          bankDocumentEventError
            .message,
      },
    );
  }


  const {
    data:
      activeEventResponse,
    error:
      activeEventError,
  } =
    await client.rpc(
      "wize_get_active_events",
      {
        p_organization_id:
          organizationId,
      },
    );


  const activeEvents =
    !activeEventError &&
    activeEventResponse &&
    typeof activeEventResponse ===
      "object" &&
    Array.isArray(
      (
        activeEventResponse as {
          events?: unknown[];
        }
      ).events,
    )
      ? (
          activeEventResponse as {
            events: Array<{
              id: string;
              eventType: string;
              status: string;
              priority: string;
              title: string;
              customerMessage: string;
            }>;
          }
        ).events
      : [];


  return {
    status:
      appointmentStatusError
        ? null
        : appointmentStatus,

    upcoming:
      upcoming
        ? {
            uid:
              upcoming.uid ??
              null,

            title:
              upcoming.title ??
              "Gesprek met Bestemd",

            start:
              upcoming.start ??
              null,

            end:
              upcoming.end ??
              null,

            eventSlug:
              upcoming
                .eventType
                ?.slug ??
              "afspraak",
          }
        : null,

    activeEvents,

    detector:
      appointmentEvent,
  };
}


function containsAny(
  value: string,
  words: string[],
) {
  return words.some(
    (word) =>
      value.includes(
        word,
      ),
  );
}


function buildProactiveSignals(
  context:
    Awaited<
      ReturnType<
        typeof loadCompanyContext
      >
    >,
) {
  const signals: Array<{
    id: string;

    type:
      | "missing_document"
      | "attention";

    message: string;

    action:
      string | null;

    actionLabel:
      string | null;
  }> = [];

  const firstUnmatched =
    context
      .bank
      .unmatchedItems[0];

  if (
    firstUnmatched
  ) {
    const amount =
      money(
        Math.abs(
          numberValue(
            firstUnmatched
              .amountCents,
          ),
        ),
      );

    const party =
      firstUnmatched
        .counterpartyName
        ?.trim();

    const outgoing =
      numberValue(
        firstUnmatched
          .amountCents,
      ) < 0;

    signals.push(
      {
        id:
          `bank-${firstUnmatched.id}`,

        type:
          "missing_document",

        message:
          outgoing
            ? `Hé, ik zie een betaling van ${amount}${
                party
                  ? ` aan ${party}`
                  : ""
              } die nog niet helemaal rond is. Volgens mij moet hier nog een factuur of bon bij. Wil je die even toevoegen? Dan kan de administratie weer verder.`
            : `Goed nieuws, er is ${amount}${
                party
                  ? ` van ${party}`
                  : ""
              } binnengekomen. Ik kan deze betaling nog niet helemaal netjes koppelen. Wil je even kijken of je weet bij welke factuur dit hoort?`,

        action:
          outgoing
            ? "Documenten"
            : "Bankieren",

        actionLabel:
          outgoing
            ? "Bon of factuur uploaden"
            : "Betaling bekijken",
      },
    );
  } else if (
    context
      .bank
      .unmatchedCount >
    0
  ) {
    signals.push(
      {
        id:
          "bank-unmatched",

        type:
          "attention",

        message:
          `Even een seintje: ik zie ${
            context
              .bank
              .unmatchedCount
          } bankmutatie${
            context
              .bank
              .unmatchedCount ===
            1
              ? ""
              : "s"
          } die nog aandacht nodig ${
            context
              .bank
              .unmatchedCount ===
            1
              ? "heeft"
              : "hebben"
          }. Zullen we die even nalopen?`,

        action:
          "Bankieren",

        actionLabel:
          "Even kijken",
      },
    );
  }

  if (
    context
      .receivables
      .overdueCents >
    0
  ) {
    signals.push(
      {
        id:
          "receivables-overdue",

        type:
          "attention",

        message:
          `Nog een klein seintje: er staat ${money(
            context
              .receivables
              .overdueCents,
          )} aan klantfacturen over de betaaltermijn. Niet per se iets om van te schrikken, maar wel goed om even in de gaten te houden.`,

        action:
          "Klanten",

        actionLabel:
          "Openstaande facturen bekijken",
      },
    );
  }

  return signals;
}


function answerQuestion(
  message: string,
  context:
    Awaited<
      ReturnType<
        typeof loadCompanyContext
      >
    >,
) {
  const question =
    message
      .toLowerCase()
      .trim();

  const taxQuestion =
    containsAny(
      question,
      [
        "belasting",
        "btw",
        "vpb",
        "vennootschapsbelasting",
        "inkomstenbelasting",
        "ib ",
        "fisc",
        "aftrek",
        "investeringsaftrek",
        "kia",
        "afschrijven",
        "belastingdienst",
        "wetgeving",
        "wet ",
        "regelgeving",
      ],
    );

  if (taxQuestion) {
    return {
      answer:
        "Deze wil ik liever niet uit de losse pols beantwoorden. Het gaat om fiscale of wettelijke regels en daar wil ik zeker weten dat je het goede antwoord krijgt. Zal ik Bestemd er even bij halen?",

      needsHuman:
        true,

      action:
        null,

      actionLabel:
        null,
    };
  }

  if (
    containsAny(
      question,
      [
        "omzet",
        "verkopen",
        "omzet deze maand",
      ],
    )
  ) {
    return {
      answer:
        `Zeker. Je omzet staat deze maand op ${money(
          context.month
            .revenueCents,
        )}.`,

      needsHuman:
        false,

      action:
        "Rapportages",

      actionLabel:
        "Rapport bekijken",
    };
  }

  if (
    containsAny(
      question,
      [
        "winst",
        "verlies",
        "resultaat",
        "hoe sta ik ervoor",
      ],
    )
  ) {
    const result =
      context.month
        .resultCents;

    return {
      answer:
        result >= 0
          ? `Je resultaat voor de huidige maand is ${money(
              result,
            )} winst. De omzet is ${money(
              context.month
                .revenueCents,
            )} en de kosten zijn ${money(
              context.month
                .costsCents,
            )}.`
          : `Je resultaat voor de huidige maand is ${money(
              Math.abs(
                result,
              ),
            )} verlies. De omzet is ${money(
              context.month
                .revenueCents,
            )} en de kosten zijn ${money(
              context.month
                .costsCents,
            )}.`,

      needsHuman:
        false,

      action:
        "Rapportages",

      actionLabel:
        "Rapport bekijken",
    };
  }

  if (
    containsAny(
      question,
      [
        "kosten",
        "uitgaven",
      ],
    )
  ) {
    return {
      answer:
        `Je kosten staan deze maand op ${money(
          context.month
            .costsCents,
        )}.`,

      needsHuman:
        false,

      action:
        "Rapportages",

      actionLabel:
        "Rapport bekijken",
    };
  }

  if (
    containsAny(
      question,
      [
        "openstaande klant",
        "openstaande factuur",
        "debiteur",
        "te ontvangen",
        "nog ontvangen",
      ],
    )
  ) {
    return {
      answer:
        `Er staat momenteel ${money(
          context.receivables
            .totalCents,
        )} open bij klanten, verdeeld over ${
          context.receivables
            .count
        } factuur${
          context.receivables
            .count === 1
            ? ""
            : "en"
        }. Daarvan is ${money(
          context.receivables
            .overdueCents,
        )} vervallen.`,

      needsHuman:
        false,

      action:
        "Klanten",

      actionLabel:
        "Facturen bekijken",
    };
  }

  if (
    containsAny(
      question,
      [
        "leverancier",
        "crediteur",
        "te betalen",
        "nog betalen",
      ],
    )
  ) {
    return {
      answer:
        `Er staat momenteel ${money(
          context.payables
            .totalCents,
        )} open bij leveranciers, verdeeld over ${
          context.payables
            .count
        } factuur${
          context.payables
            .count === 1
            ? ""
            : "en"
        }. Daarvan is ${money(
          context.payables
            .overdueCents,
        )} vervallen.`,

      needsHuman:
        false,

      action:
        "Leveranciers",

      actionLabel:
        "Leveranciers bekijken",
    };
  }

  if (
    containsAny(
      question,
      [
        "bon",
        "bonnetje",
        "document",
        "bank",
        "bankmutatie",
        "transactie",
      ],
    )
  ) {
    if (
      context.bank
        .unmatchedCount >
      0
    ) {
      return {
        answer:
          `Ik zie ${
            context.bank
              .unmatchedCount
          } bankmutatie${
            context.bank
              .unmatchedCount ===
            1
              ? ""
              : "s"
          } die nog niet volledig zijn gekoppeld. Controleer bij Bankieren of er voor deze betalingen nog een factuur of bon nodig is.`,

        needsHuman:
          false,

        action:
          "Bankieren",

        actionLabel:
          "Even kijken",
      };
    }

    return {
      answer:
        "Ziet er netjes uit 👍 Ik zie op dit moment geen bankmutaties die nog op een koppeling wachten. Wil je toch een bon of factuur toevoegen, dan kan dat natuurlijk gewoon bij Documenten.",

      needsHuman:
        false,

      action:
        "Documenten",

      actionLabel:
        "Document toevoegen",
    };
  }

  if (
    containsAny(
      question,
      [
        "overzicht",
        "samenvatting",
        "stand van zaken",
        "hoe gaat",
      ],
    )
  ) {
    return {
      answer:
        `Deze maand staat de omzet op ${money(
          context.month
            .revenueCents,
        )}, de kosten op ${money(
          context.month
            .costsCents,
        )} en het resultaat op ${money(
          context.month
            .resultCents,
        )}. Daarnaast staat ${money(
          context.receivables
            .totalCents,
        )} aan klantfacturen open.`,

      needsHuman:
        false,

      action:
        "Dashboard",

      actionLabel:
        "Dashboard bekijken",
    };
  }

  return {
    answer:
      "Deze weet ik niet zeker genoeg om zomaar iets te roepen. Ik zet liever geen verkeerde koers voor je uit. Zal ik Randy of Ed er even bij halen?",

    needsHuman:
      true,

    action:
      null,
  };
}


async function notifyOfficeBestEffort(
  client: any,
  input: {
    idempotencyKey: string;
    threadId: string;
    customerName: string;
    companyName: string;
    subject: string;
    message: string;
  },
) {
  try {
    const {
      data:
        storedMessage,
    } =
      await client
        .from(
          "messages",
        )
        .select(
          "id",
        )
        .eq(
          "idempotency_key",
          input
            .idempotencyKey,
        )
        .maybeSingle();

    if (
      !storedMessage
        ?.id
    ) {
      return;
    }

    await notifyOfficeOfCustomerMessage(
      {
        client,

        messageId:
          storedMessage.id,

        threadId:
          input.threadId,

        customerName:
          input.customerName,

        companyName:
          input.companyName,

        subject:
          input.subject,

        message:
          input.message,
      },
    );
  } catch {
    // Een e-mailmelding mag
    // de overdracht niet blokkeren.
  }
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
        await requirePortalIdentity(
          client,
        );

      requireAal2(
        identity,
      );

      const url =
        new URL(
          request.url,
        );

      const organizationId =
        requireOrganization(
          identity,
          url.searchParams.get(
            "organizationId",
          ),
        );

      const organization =
        identity
          .organizations
          .find(
            (item) =>
              item.id ===
              organizationId,
          );

      const [
        context,
        appointments,
      ] =
        await Promise.all([
          loadCompanyContext(
            client,
            organizationId,
          ),

          loadAppointmentContext(
            client,
            organizationId,
            identity
              .profile
              .email,
          ),
        ]);

      const eventSignals =
        appointments
          .activeEvents
          .slice(
            0,
            3,
          )
          .map(
            event => ({
              id:
                `event-${event.id}`,

              eventId:
                event.id,

              type:
                event
                  .eventType ===
                "bank_document_missing"
                  ? "missing_document"
                  : "attention",

              message:
                event
                  .customerMessage,

              action:
                event
                  .eventType ===
                "appointment_due"
                  ? "Afspraken"
                  : event
                      .eventType ===
                    "bank_document_missing"
                    ? "Documenten"
                    : null,

              actionLabel:
                event
                  .eventType ===
                "appointment_due"
                  ? "Afspraak plannen"
                  : event
                      .eventType ===
                    "bank_document_missing"
                    ? "Bon of factuur uploaden"
                    : null,
            }),
          );

      const hasPersistentBankDocumentSignal =
        appointments
          .activeEvents
          .some(
            event =>
              event
                .eventType ===
              "bank_document_missing",
          );


      const liveAppointmentSignal =
        appointments
          .upcoming
          ?.start
          ? [
              {
                id:
                  `appointment-${appointments.upcoming.uid ?? "upcoming"}`,

                type:
                  "attention",

                message:
                  `Je volgende afspraak met Bestemd staat op ${
                    new Intl.DateTimeFormat(
                      "nl-NL",
                      {
                        weekday:
                          "long",
                        day:
                          "numeric",
                        month:
                          "long",
                        hour:
                          "2-digit",
                        minute:
                          "2-digit",
                        timeZone:
                          "Europe/Amsterdam",
                      },
                    ).format(
                      new Date(
                        appointments
                          .upcoming
                          .start,
                      ),
                    )
                  }. Die staat dus al netjes gepland.`,

                action:
                  "Afspraken",

                actionLabel:
                  "Afspraak bekijken",
              },
            ]
          : [];

      return Response.json(
        {
          organization: {
            id:
              organizationId,

            name:
              organization
                ?.name ??
              "Onderneming",
          },

          ...context,

          appointments,

          proactiveSignals: [
            ...liveAppointmentSignal,
            ...eventSignals,
            ...buildProactiveSignals(
              context,
            ).filter(
              signal =>
                !(
                  hasPersistentBankDocumentSignal &&
                  signal.type ===
                    "missing_document"
                ),
            ),
          ].slice(
            0,
            4,
          ),
        },
      );
    },
  );
}


export async function POST(
  request: Request,
) {
  return portalApi(
    request,
    async ({
      client,
    }) => {
      const identity =
        await requirePortalIdentity(
          client,
        );

      requireAal2(
        identity,
      );

      const input =
        await readBody(
          request,
        );

      const organizationId =
        requireOrganization(
          identity,
          input
            .organizationId,
        );

      const organization =
        identity
          .organizations
          .find(
            (item) =>
              item.id ===
              organizationId,
          );

      const action =
        typeof input.action ===
          "string"
          ? input.action
          : "ask";


      if (
        action ===
        "markEventAsked"
      ) {
        const eventId =
          requiredString(
            input.eventId,
            "Wize-signaal",
            100,
          );


        const {
          data:
            activeEventResponse,
          error:
            activeEventError,
        } =
          await client.rpc(
            "wize_get_active_events",
            {
              p_organization_id:
                organizationId,
            },
          );


        if (activeEventError) {
          throw new AccessError(
            503,
            "Wize kon het signaal niet bijwerken.",
          );
        }


        const activeEvents =
          (
            activeEventResponse as {
              events?: Array<{
                id?: string;
              }>;
            } | null
          )
            ?.events ??
          [];


        const belongsToSelectedOrganization =
          activeEvents.some(
            event =>
              event.id ===
              eventId,
          );


        if (
          !belongsToSelectedOrganization
        ) {
          throw new AccessError(
            403,
            "Geen toegang tot dit Wize-signaal.",
          );
        }


        const {
          error:
            markError,
        } =
          await client.rpc(
            "wize_mark_event_asked",
            {
              p_event_id:
                eventId,
            },
          );


        if (markError) {
          throw new AccessError(
            503,
            "Wize kon het signaal niet bijwerken.",
          );
        }


        /*
         * Best effort activity logging.
         * Het tonen van het signaal mag niet stuklopen
         * als alleen de historie tijdelijk niet kan schrijven.
         */
        await client.rpc(
          "wize_log_event_activity",
          {
            p_event_id:
              eventId,

            p_activity_type:
              "shown",

            p_conversation_id:
              null,

            p_details: {
              source:
                "wize_chat",
            },
          },
        );


        return Response.json(
          {
            ok: true,
          },
        );
      }


      if (
        action ===
        "eventAction"
      ) {
        const eventId =
          requiredString(
            input.eventId,
            "Wize-signaal",
            100,
          );


        const target =
          typeof input.target ===
            "string"
            ? input.target
                .trim()
                .slice(
                  0,
                  80,
                )
            : null;


        const {
          data:
            activeEventResponse,
          error:
            activeEventError,
        } =
          await client.rpc(
            "wize_get_active_events",
            {
              p_organization_id:
                organizationId,
            },
          );


        /*
         * Ook een event dat zojuist op 'asked' is gezet,
         * kan door de reminder-filter niet meer terugkomen.
         * Daarom controleren we aanvullend via de event-id
         * binnen de databasefunctie die zelf tenant access afdwingt.
         */
        if (activeEventError) {
          throw new AccessError(
            503,
            "Wize kon de actie niet registreren.",
          );
        }


        const {
          error:
            activityError,
        } =
          await client.rpc(
            "wize_log_event_activity",
            {
              p_event_id:
                eventId,

              p_activity_type:
                "customer_action",

              p_conversation_id:
                null,

              p_details: {
                target,
                source:
                  "wize_chat",
              },
            },
          );


        if (activityError) {
          throw new AccessError(
            503,
            "Wize kon de actie niet registreren.",
          );
        }


        return Response.json(
          {
            ok: true,
          },
        );
      }


      if (
        action ===
        "escalate"
      ) {
        const question =
          requiredString(
            input.question,
            "Vraag",
            5000,
          );


        const eventId =
          typeof input.eventId ===
            "string" &&
          input.eventId.trim()
            ? input.eventId.trim()
            : null;


        const wizeAnswer =
          typeof input
            .wizeAnswer ===
            "string"
            ? input
                .wizeAnswer
                .trim()
                .slice(
                  0,
                  5000,
                )
            : "";

        const subject =
          `Vraag via Wize`;

        const body =
          [
            question,
            "",
            wizeAnswer
              ? `Wize gaf aan:\n${wizeAnswer}`
              : "",
            "",
            "Wize heeft dit gesprek doorgestuurd omdat menselijke beoordeling nodig is.",
          ]
            .filter(
              Boolean,
            )
            .join(
              "\n",
            );

        const idempotencyKey =
          crypto.randomUUID();

        const {
          data,
          error,
        } =
          await client.rpc(
            "communication_create_thread",
            {
              p_organization_id:
                organizationId,

              p_subject:
                subject,

              p_body:
                body,

              p_idempotency_key:
                idempotencyKey,
            },
          );

        if (error) {
          throw new AccessError(
            503,
            "Wize kon de vraag niet naar Bestemd doorzetten.",
          );
        }

        const {
          data:
            createdMessage,
        } =
          await client
            .from(
              "messages",
            )
            .select(
              "conversation_id",
            )
            .eq(
              "idempotency_key",
              idempotencyKey,
            )
            .maybeSingle();

        const conversationId =
          createdMessage
            ?.conversation_id ??
          (
            data as {
              conversationId?:
                string;
            } | null
          )
            ?.conversationId ??
          null;

        if (
          conversationId
        ) {

          /*
           * Wanneer deze overdracht bij een bestaand
           * Wize-event hoort, koppelen we dat event aan
           * dezelfde Communicatie-thread.
           *
           * Best effort: een bestaande klantvraag mag
           * niet verloren gaan als alleen de event-link
           * tijdelijk faalt.
           */
          if (
            eventId
          ) {
            const {
              error:
                escalationError,
            } =
              await client.rpc(
                "wize_escalate_event",
                {
                  p_event_id:
                    eventId,

                  p_conversation_id:
                    conversationId,
                },
              );


            if (
              escalationError
            ) {
              console.error(
                "Wize event escalation link failed",
                {
                  organizationId,
                  eventId,
                  conversationId,
                  message:
                    escalationError
                      .message,
                },
              );
            }
          }


          await notifyOfficeBestEffort(
            client,
            {
              idempotencyKey,

              threadId:
                conversationId,

              customerName:
                identity
                  .profile
                  .display_name,

              companyName:
                organization
                  ?.name ??
                "Onderneming",

              subject,

              message:
                question,
            },
          );
        }

        return Response.json(
          {
            conversationId,
          },
          {
            status:
              201,
          },
        );
      }


      if (
        action !==
        "ask"
      ) {
        throw new AccessError(
          400,
          "Ongeldige Wize-actie.",
        );
      }


      const message =
        requiredString(
          input.message,
          "Vraag",
          3000,
        );

      const context =
        await loadCompanyContext(
          client,
          organizationId,
        );

      const answer =
        answerQuestion(
          message,
          context,
        );

      return Response.json(
        answer,
      );
    },
  );
}
