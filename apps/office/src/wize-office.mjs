import {
  checkQuery,
  OfficeError,
} from "./auth/supabase.mjs";


const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function numberValue(value) {
  const number =
    Number(value ?? 0);

  return Number.isFinite(number)
    ? number
    : 0;
}


function money(cents) {
  return new Intl.NumberFormat(
    "nl-NL",
    {
      style: "currency",
      currency: "EUR",
    }
  ).format(
    cents / 100
  );
}


async function loadOfficeContext(
  client,
  organizationId
) {
  const organization =
    checkQuery(
      await client
        .from("organizations")
        .select(
          "id,name,legal_name,registration_number,customer_relationship_id"
        )
        .eq(
          "id",
          organizationId
        )
        .is(
          "archived_at",
          null
        )
        .maybeSingle()
    );

  if (!organization) {
    throw new OfficeError(
      404,
      "ORGANIZATION_NOT_FOUND",
      "Onderneming niet gevonden."
    );
  }

  const [
    openResult,
    periodResult,
    bankResult,
    documentsResult,
    conversationsResult,
  ] =
    await Promise.all([
      client.rpc(
        "get_open_positions",
        {
          p_organization_id:
            organizationId,
        }
      ),

      client.rpc(
        "get_financial_period_summary",
        {
          p_organization_id:
            organizationId,

          p_period:
            "month",
        }
      ),

      client.rpc(
        "get_bank_transactions",
        {
          p_organization_id:
            organizationId,

          p_limit:
            100,
        }
      ),

      client
        .from("documents")
        .select(
          "id,status,document_type,customer_action_required"
        )
        .eq(
          "organization_id",
          organizationId
        )
        .is(
          "archived_at",
          null
        )
        .limit(250),

      client
        .from("conversations")
        .select(
          "id,status"
        )
        .eq(
          "organization_id",
          organizationId
        )
        .is(
          "archived_at",
          null
        )
        .limit(250),
    ]);

  const open =
    checkQuery(
      openResult
    );

  const period =
    checkQuery(
      periodResult
    );

  const bank =
    checkQuery(
      bankResult
    );

  const documents =
    checkQuery(
      documentsResult
    ) ?? [];

  const conversations =
    checkQuery(
      conversationsResult
    ) ?? [];

  const openRow =
    Array.isArray(open)
      ? open[0] ?? {}
      : open ?? {};

  const bankSummary =
    bank?.summary ??
    {};

  return {
    organization: {
      id:
        organization.id,
      name:
        organization.name,
      legalName:
        organization.legal_name,
      registrationNumber:
        organization.registration_number,
    },

    month: {
      revenueCents:
        numberValue(
          period?.revenueCents
        ),
      costsCents:
        numberValue(
          period?.costsCents
        ),
      resultCents:
        numberValue(
          period?.resultCents
        ),
    },

    receivables: {
      totalCents:
        numberValue(
          openRow.receivables_total_cents
        ),
      overdueCents:
        numberValue(
          openRow.receivables_overdue_cents
        ),
      count:
        numberValue(
          openRow.receivables_count
        ),
    },

    payables: {
      totalCents:
        numberValue(
          openRow.payables_total_cents
        ),
      overdueCents:
        numberValue(
          openRow.payables_overdue_cents
        ),
      count:
        numberValue(
          openRow.payables_count
        ),
    },

    bank: {
      transactionCount:
        numberValue(
          bankSummary.count
        ),
      unmatchedCount:
        numberValue(
          bankSummary.unmatchedCount
        ),
      suggestedCount:
        numberValue(
          bankSummary.suggestedCount
        ),
      matchedCount:
        numberValue(
          bankSummary.matchedCount
        ),
    },

    documents: {
      total:
        documents.length,
      needingCustomerAction:
        documents.filter(
          item =>
            item.customer_action_required ===
            true
        ).length,
      newCount:
        documents.filter(
          item =>
            item.status ===
            "new"
        ).length,
    },

    communication: {
      openConversations:
        conversations.filter(
          item =>
            item.status ===
            "open"
        ).length,
    },
  };
}


function deterministicAnswer(
  question,
  context
) {
  const value =
    question
      .toLowerCase()
      .trim();

  if (
    value.includes(
      "financ"
    ) ||
    value.includes(
      "hoe staat"
    ) ||
    value.includes(
      "cijfers"
    )
  ) {
    return {
      answer:
        `${context.organization.name}: deze maand is de omzet ${money(context.month.revenueCents)}, zijn de kosten ${money(context.month.costsCents)} en is het resultaat ${money(context.month.resultCents)}. Er staat ${money(context.receivables.totalCents)} open bij klanten en ${money(context.payables.totalCents)} bij leveranciers. ${context.bank.unmatchedCount} banktransactie${context.bank.unmatchedCount === 1 ? "" : "s"} ${context.bank.unmatchedCount === 1 ? "is" : "zijn"} nog niet gekoppeld.`,
    };
  }

  if (
    value.includes(
      "openstaand"
    ) &&
    (
      value.includes(
        "klant"
      ) ||
      value.includes(
        "debiteur"
      )
    )
  ) {
    return {
      answer:
        `Bij ${context.organization.name} staat ${money(context.receivables.totalCents)} open bij klanten, verdeeld over ${context.receivables.count} openstaande factuur${context.receivables.count === 1 ? "" : "en"}. Daarvan is ${money(context.receivables.overdueCents)} over de betaaltermijn.`,
    };
  }

  if (
    value.includes(
      "leverancier"
    ) ||
    value.includes(
      "crediteur"
    )
  ) {
    return {
      answer:
        `Bij ${context.organization.name} staat ${money(context.payables.totalCents)} open bij leveranciers, verdeeld over ${context.payables.count} openstaande factuur${context.payables.count === 1 ? "" : "en"}. Daarvan is ${money(context.payables.overdueCents)} over de betaaltermijn.`,
    };
  }

  if (
    value.includes(
      "bank"
    )
  ) {
    return {
      answer:
        `Voor ${context.organization.name} zie ik ${context.bank.transactionCount} banktransacties in de beschikbare gegevens. Daarvan zijn er ${context.bank.unmatchedCount} nog niet gekoppeld en ${context.bank.matchedCount} gekoppeld.`,
    };
  }

  if (
    value.includes(
      "document"
    ) ||
    value.includes(
      "bon"
    )
  ) {
    return {
      answer:
        `Voor ${context.organization.name} zie ik ${context.documents.total} documenten. Daarvan staan er ${context.documents.newCount} als nieuw en vragen er ${context.documents.needingCustomerAction} om actie van de klant.`,
    };
  }

  return null;
}


async function askOllama(
  config,
  fetchImpl,
  question,
  context,
  history = []
) {
  const settings =
    config.wizeOffice;

  if (
    !settings?.url ||
    !settings?.key
  ) {
    throw new OfficeError(
      503,
      "WIZE_OFFICE_NOT_CONFIGURED",
      "Wize Office is nog niet gekoppeld aan de AI-service."
    );
  }

  const systemPrompt =
    [
      "Je bent Wize Office, de interne assistent van Bestemd B.V.",
      "Je wordt uitsluitend gebruikt door bevoegde medewerkers van Bestemd Office.",
      "Antwoord alleen over de geselecteerde onderneming en alleen met feiten uit de meegegeven context.",
      "Gebruik eerdere chatberichten alleen om vervolgvragen te begrijpen; actuele bedrijfscontext blijft altijd leidend.",
      "Verzin nooit bedragen, klanten, leveranciers, documenten, afspraken, statussen of acties.",
      "Trek geen fiscale of juridische conclusie als die niet rechtstreeks uit de gegevens volgt.",
      "Zeg nooit dat je een actie hebt uitgevoerd. Deze versie is alleen-lezen.",
      "Als de gegevens een vraag niet kunnen beantwoorden, zeg dat duidelijk.",
      "Schrijf natuurlijk, professioneel en kort in het Nederlands.",
      "Geen markdown-tabellen.",
      "Noem altijd de onderneming als dat verwarring voorkomt.",
      "Geef uitsluitend JSON terug: {\"answer\":\"tekst\"}.",
    ].join("\n");

  const userPrompt =
    [
      `Onderneming: ${context.organization.name}`,
      `KvK/registratie: ${context.organization.registrationNumber ?? "onbekend"}`,
      "",
      "Huidige maand:",
      `Omzet: ${money(context.month.revenueCents)}`,
      `Kosten: ${money(context.month.costsCents)}`,
      `Resultaat: ${money(context.month.resultCents)}`,
      "",
      "Openstaande posten:",
      `Klanten openstaand: ${money(context.receivables.totalCents)}`,
      `Klanten vervallen: ${money(context.receivables.overdueCents)}`,
      `Aantal openstaande klantfacturen: ${context.receivables.count}`,
      `Leveranciers openstaand: ${money(context.payables.totalCents)}`,
      `Leveranciers vervallen: ${money(context.payables.overdueCents)}`,
      `Aantal openstaande leveranciersfacturen: ${context.payables.count}`,
      "",
      "Bank:",
      `Transacties: ${context.bank.transactionCount}`,
      `Niet gekoppeld: ${context.bank.unmatchedCount}`,
      `Voorgestelde koppelingen: ${context.bank.suggestedCount}`,
      `Gekoppeld: ${context.bank.matchedCount}`,
      "",
      "Documenten:",
      `Totaal: ${context.documents.total}`,
      `Nieuw: ${context.documents.newCount}`,
      `Actie klant nodig: ${context.documents.needingCustomerAction}`,
      "",
      "Communicatie:",
      `Open gesprekken: ${context.communication.openConversations}`,
      "",
      `Vraag: ${question}`,
    ].join("\n");

  const response =
    await fetchImpl(
      `${settings.url.replace(/\/+$/, "")}/api/chat`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${settings.key}`,
        },

        body:
          JSON.stringify({
            model:
              settings.model ||
              "qwen2.5:3b",

            stream:
              false,

            format:
              "json",

            keep_alive:
              "30m",

            options: {
              temperature:
                0.1,
              num_predict:
                180,
              num_ctx:
                2048,
            },

            messages: [
              {
                role:
                  "system",
                content:
                  systemPrompt,
              },
              ...history
                .filter(
                  item =>
                    item &&
                    ["user","assistant"].includes(
                      item.role
                    ) &&
                    typeof item.content ===
                      "string"
                )
                .slice(-8)
                .map(
                  item => ({
                    role:
                      item.role,
                    content:
                      item.content.slice(
                        0,
                        3000
                      ),
                  })
                ),
              {
                role:
                  "user",
                content:
                  userPrompt,
              },
            ],
          }),

        signal:
          AbortSignal.timeout(
            45000
          ),
      }
    );

  if (!response.ok) {
    throw new OfficeError(
      503,
      "WIZE_OFFICE_AI_UNAVAILABLE",
      "Wize Office kon de AI-service niet bereiken."
    );
  }

  const data =
    await response.json();

  const raw =
    data?.message?.content;

  if (
    typeof raw !==
      "string" ||
    !raw.trim()
  ) {
    throw new OfficeError(
      503,
      "WIZE_OFFICE_AI_INVALID",
      "Wize Office ontving geen bruikbaar antwoord."
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(
        raw
      );
  } catch {
    throw new OfficeError(
      503,
      "WIZE_OFFICE_AI_INVALID",
      "Wize Office ontving geen bruikbaar antwoord."
    );
  }

  if (
    typeof parsed.answer !==
      "string" ||
    !parsed.answer.trim() ||
    parsed.answer.length >
      5000
  ) {
    throw new OfficeError(
      503,
      "WIZE_OFFICE_AI_INVALID",
      "Wize Office ontving geen bruikbaar antwoord."
    );
  }

  return {
    answer:
      parsed.answer.trim(),
  };
}


export async function wizeOfficeRoute(
  req,
  url,
  client,
  user,
  readBody,
  config,
  fetchImpl
) {
  if (
    url.pathname !==
      "/api/wize-office"
  ) {
    return null;
  }

  const allowedRoles =
    new Set([
      "owner",
      "admin",
    ]);

  if (
    !allowedRoles.has(
      user?.roleCode
    )
  ) {
    throw new OfficeError(
      403,
      "WIZE_OFFICE_DENIED",
      "Geen rechten voor Wize Office."
    );
  }

  if (
    req.method !==
      "POST"
  ) {
    throw new OfficeError(
      405,
      "METHOD_NOT_ALLOWED",
      "Methode niet toegestaan."
    );
  }

  const input =
    await readBody(req);

  const history =
    Array.isArray(input.history)
      ? input.history
      : [];

  const organizationId =
    typeof input.organizationId ===
      "string"
      ? input.organizationId
      : "";

  if (
    !uuid.test(
      organizationId
    )
  ) {
    throw new OfficeError(
      400,
      "ORGANIZATION_REQUIRED",
      "Kies eerst een onderneming."
    );
  }

  const question =
    typeof input.question ===
      "string"
      ? input.question.trim()
      : "";

  if (
    !question ||
    question.length >
      3000
  ) {
    throw new OfficeError(
      400,
      "INVALID_WIZE_QUESTION",
      "Vul een geldige vraag in."
    );
  }

  const context =
    await loadOfficeContext(
      client,
      organizationId
    );

  const direct =
    deterministicAnswer(
      question,
      context,
      history
    );

  const result =
    direct ??
    await askOllama(
      config,
      fetchImpl,
      question,
      context
    );

  return {
    status:
      200,

    data: {
      answer:
        result.answer,

      organization: {
        id:
          context.organization.id,
        name:
          context.organization.name,
      },

      readOnly:
        true,
    },
  };
}
