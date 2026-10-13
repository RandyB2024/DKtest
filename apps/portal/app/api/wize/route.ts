import {
  AccessError,
  requireAal2,
  requireOrganization,
  requirePortalIdentity,
} from "@/lib/portal-access";

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

      const context =
        await loadCompanyContext(
          client,
          organizationId,
        );

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

          proactiveSignals:
            buildProactiveSignals(
              context,
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
        "escalate"
      ) {
        const question =
          requiredString(
            input.question,
            "Vraag",
            5000,
          );

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
